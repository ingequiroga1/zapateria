-- Ejecutar después del esquema inicial y la migración 002. Conserva datos.
begin;
create table if not exists public.sales (
 id uuid primary key,owner_id uuid not null references auth.users(id),sequence_number bigint generated always as identity,
 folio text generated always as ('VTA-'||lpad(sequence_number::text,8,'0')) stored,
 sale_date date not null,payment_method text not null check(payment_method in ('Efectivo','Tarjeta','Transferencia','Otro')),
 total numeric(16,2) not null default 0,created_at timestamptz not null default now()
);
create table if not exists public.sale_items (
 id uuid primary key default gen_random_uuid(),sale_id uuid not null references public.sales(id),owner_id uuid not null references auth.users(id),
 product_id uuid not null references public.products(id),kind text not null,name text not null,color text not null,size text not null,
 quantity integer not null check(quantity between 1 and 9999),price numeric(12,2) not null check(price>=0),cost numeric(12,2) not null
);
create index if not exists sales_owner_idx on public.sales(owner_id,created_at desc);
create index if not exists sale_items_sale_idx on public.sale_items(sale_id);
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
drop policy if exists sales_read on public.sales;
create policy sales_read on public.sales for select to authenticated using(owner_id=(select auth.uid()));
drop policy if exists sale_items_read on public.sale_items;
create policy sale_items_read on public.sale_items for select to authenticated using(owner_id=(select auth.uid()));
revoke all on public.sales,public.sale_items from anon,authenticated;
grant select on public.sales,public.sale_items to authenticated;
create or replace function public.register_sale(p_id uuid,p_date date,p_payment text,p_items jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_uid uuid:=auth.uid();v_item jsonb;v_product public.products%rowtype;v_qty integer;v_price numeric;v_total numeric:=0;v_result jsonb;
begin
 if v_uid is null then raise exception 'Inicia sesión para registrar ventas';end if;
 if p_id is null then raise exception 'Identificador requerido';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 if exists(select 1 from public.sales where id=p_id) then
  if not exists(select 1 from public.sales where id=p_id and owner_id=v_uid) then raise exception 'Solicitud no disponible';end if;
  select to_jsonb(s)||jsonb_build_object('items',(select jsonb_agg(to_jsonb(i)) from public.sale_items i where i.sale_id=s.id)) into v_result from public.sales s where s.id=p_id and s.owner_id=v_uid;
  return v_result;
 end if;
 if p_date is null or p_payment is null or p_payment not in ('Efectivo','Tarjeta','Transferencia','Otro') then raise exception 'Revisa fecha y forma de pago';end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Productos no válidos';end if;
 if jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Registra entre 1 y 100 productos';end if;
 insert into public.sales(id,owner_id,sale_date,payment_method) values(p_id,v_uid,p_date,p_payment);
 -- Bloqueo por producto en orden estable: ventas simultáneas no pueden sobrepasar stock.
 for v_item in select value from jsonb_array_elements(p_items) order by value->>'product_id' loop
  if jsonb_typeof(v_item->'quantity') is distinct from 'number' or jsonb_typeof(v_item->'price') is distinct from 'number' then raise exception 'Cantidad y precio deben ser números';end if;
  if (v_item->>'quantity')::numeric<>trunc((v_item->>'quantity')::numeric) then raise exception 'Cantidad debe ser entera';end if;
  v_qty:=(v_item->>'quantity')::integer;v_price:=round((v_item->>'price')::numeric,2);
  if v_qty not between 1 and 9999 or v_price not between 0 and 9999999 then raise exception 'Cantidad o precio fuera de rango';end if;
  select * into v_product from public.products where id=(v_item->>'product_id')::uuid and owner_id=v_uid for update;
  if not found then raise exception 'Producto no disponible para esta cuenta';end if;
  if v_product.stock<v_qty then raise exception 'Existencias insuficientes: % % % % (% disponibles)',v_product.kind,v_product.name,v_product.size,v_product.color,v_product.stock;end if;
  update public.products set stock=stock-v_qty,updated_at=now() where id=v_product.id and owner_id=v_uid;
  insert into public.sale_items(sale_id,owner_id,product_id,kind,name,color,size,quantity,price,cost)
  values(p_id,v_uid,v_product.id,v_product.kind,v_product.name,v_product.color,v_product.size,v_qty,v_price,v_product.cost);
  v_total:=v_total+v_qty*v_price;
 end loop;
 update public.sales set total=v_total where id=p_id and owner_id=v_uid;
 select to_jsonb(s)||jsonb_build_object('items',(select jsonb_agg(to_jsonb(i)) from public.sale_items i where i.sale_id=s.id)) into v_result from public.sales s where s.id=p_id and s.owner_id=v_uid;
 return v_result;
end;
$$;
revoke all on function public.register_sale(uuid,date,text,jsonb) from public,anon;
grant execute on function public.register_sale(uuid,date,text,jsonb) to authenticated;
commit;
