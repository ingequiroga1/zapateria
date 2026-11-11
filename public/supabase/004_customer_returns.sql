-- Ejecutar después de 003_sales.sql. No elimina ni modifica ventas existentes.
begin;
create table if not exists public.returns (
 id uuid primary key, owner_id uuid not null references auth.users(id),sale_id uuid not null references public.sales(id),
 sequence_number bigint generated always as identity,
 folio text generated always as ('DEV-'||lpad(sequence_number::text,8,'0')) stored,
 return_date date not null,reason text not null,refund_method text not null check(refund_method in ('Efectivo','Tarjeta','Transferencia','Otro')),
 notes text not null default '',total numeric(16,2) not null default 0,created_at timestamptz not null default now()
);
create table if not exists public.return_items (
 id uuid primary key default gen_random_uuid(),return_id uuid not null references public.returns(id),owner_id uuid not null references auth.users(id),
 sale_item_id uuid not null references public.sale_items(id),product_id uuid not null references public.products(id),
 kind text not null,name text not null,color text not null,size text not null,
 quantity integer not null check(quantity between 1 and 9999),price numeric(12,2) not null check(price>=0),restock boolean not null,
 unique(return_id,sale_item_id)
);
create index if not exists returns_owner_date_idx on public.returns(owner_id,return_date);
create index if not exists returns_sale_idx on public.returns(sale_id);
create index if not exists return_items_sale_line_idx on public.return_items(sale_item_id);
create index if not exists return_items_return_idx on public.return_items(return_id);
alter table public.returns enable row level security;
alter table public.return_items enable row level security;
drop policy if exists returns_read on public.returns;
create policy returns_read on public.returns for select to authenticated using(owner_id=(select auth.uid()));
drop policy if exists return_items_read on public.return_items;
create policy return_items_read on public.return_items for select to authenticated using(owner_id=(select auth.uid()));
revoke all on public.returns,public.return_items from anon,authenticated;
grant select on public.returns,public.return_items to authenticated;
create or replace function public.register_return(p_id uuid,p_sale_id uuid,p_date date,p_reason text,p_refund_method text,p_notes text,p_items jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_uid uuid:=auth.uid();v_sale public.sales%rowtype;v_line public.sale_items%rowtype;v_item jsonb;v_qty integer;v_returned integer;v_total numeric:=0;v_restock boolean;v_result jsonb;
begin
 if v_uid is null then raise exception 'Inicia sesión para registrar devoluciones';end if;
 if p_id is null then raise exception 'Identificador requerido';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 if exists(select 1 from public.returns where id=p_id) then
  if not exists(select 1 from public.returns where id=p_id and owner_id=v_uid and sale_id=p_sale_id) then raise exception 'Solicitud no disponible';end if;
 else
  -- Serializa TODAS las devoluciones de una venta, incluso con ids diferentes.
  select * into v_sale from public.sales where id=p_sale_id and owner_id=v_uid for update;
  if not found then raise exception 'Venta no disponible para esta cuenta';end if;
  if p_date is null or p_date<v_sale.sale_date then raise exception 'La devolución no puede ser anterior a la venta';end if;
  if coalesce(length(trim(p_reason)),0) not between 1 and 200 or length(coalesce(p_notes,''))>2000 then raise exception 'Revisa motivo y observaciones';end if;
  if p_refund_method is null or p_refund_method not in ('Efectivo','Tarjeta','Transferencia','Otro') then raise exception 'Forma de reembolso no válida';end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Artículos no válidos';end if;
  if jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Selecciona entre 1 y 100 renglones';end if;
  if (select count(distinct value->>'sale_item_id') from jsonb_array_elements(p_items))<>jsonb_array_length(p_items) then raise exception 'Renglón no válido o repetido';end if;
  insert into public.returns(id,owner_id,sale_id,return_date,reason,refund_method,notes) values(p_id,v_uid,p_sale_id,p_date,trim(p_reason),p_refund_method,coalesce(p_notes,''));
  -- Bloquear productos en el mismo orden usado por ventas para evitar interbloqueos.
  for v_item in select j.value from jsonb_array_elements(p_items) j left join public.sale_items i on i.id=(j.value->>'sale_item_id')::uuid order by i.product_id,i.id loop
   select * into v_line from public.sale_items where id=(v_item->>'sale_item_id')::uuid and sale_id=p_sale_id and owner_id=v_uid;
   if not found then raise exception 'El artículo no pertenece a la venta';end if;
   if jsonb_typeof(v_item->'quantity') is distinct from 'number' or jsonb_typeof(v_item->'restock') is distinct from 'boolean' then raise exception 'Cantidad o estado no válido';end if;
   if (v_item->>'quantity')::numeric<>trunc((v_item->>'quantity')::numeric) then raise exception 'Cantidad debe ser entera';end if;
   v_qty:=(v_item->>'quantity')::integer;v_restock:=(v_item->>'restock')::boolean;
   select coalesce(sum(quantity),0) into v_returned from public.return_items where sale_item_id=v_line.id and owner_id=v_uid;
   if v_qty<1 or v_qty>v_line.quantity-v_returned then raise exception 'La cantidad supera lo pendiente de devolver: % %',v_line.kind,v_line.name;end if;
   if v_restock then
    update public.products set stock=stock+v_qty,updated_at=now() where id=v_line.product_id and owner_id=v_uid;
    if not found then raise exception 'Producto no disponible para reintegrar';end if;
   end if;
   insert into public.return_items(return_id,owner_id,sale_item_id,product_id,kind,name,color,size,quantity,price,restock)
   values(p_id,v_uid,v_line.id,v_line.product_id,v_line.kind,v_line.name,v_line.color,v_line.size,v_qty,v_line.price,v_restock);
   v_total:=v_total+v_qty*v_line.price;
  end loop;
  update public.returns set total=v_total where id=p_id;
 end if;
 select to_jsonb(r)||jsonb_build_object('items',(select jsonb_agg(to_jsonb(i)) from public.return_items i where i.return_id=r.id)) into v_result from public.returns r where r.id=p_id and r.owner_id=v_uid;
 return v_result;
end;
$$;
revoke all on function public.register_return(uuid,uuid,date,text,text,text,jsonb) from public,anon;
grant execute on function public.register_return(uuid,uuid,date,text,text,text,jsonb) to authenticated;
commit;
