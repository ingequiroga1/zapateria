-- Mi tienda: ejecutar una vez en el editor SQL de Supabase.
-- Modelo: un propietario autenticado por inventario. Sin colaboración entre cuentas.
begin;
create table public.suppliers (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 name text not null check(length(trim(name)) between 1 and 160), created_at timestamptz not null default now()
);
create table public.products (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 kind text not null, name text not null, color text not null, size text not null,
 variant_key text generated always as (lower(trim(kind)) || chr(31) || lower(trim(name)) || chr(31) || lower(trim(color)) || chr(31) || lower(trim(size))) stored,
 stock integer not null default 0 check(stock>=0),cost numeric(12,2) not null check(cost>=0),price numeric(12,2) not null check(price>=0),image_path text,
 updated_at timestamptz not null default now(),unique(owner_id,variant_key)
);
create table public.entries (
 id uuid primary key, owner_id uuid not null references auth.users(id), sequence_number bigint generated always as identity,
 folio text generated always as ('ENT-' || lpad(sequence_number::text,8,'0')) stored,
 supplier_id uuid not null references public.suppliers(id),entry_date date not null,
 reference text not null default '',notes text not null default '',total numeric(16,2) not null default 0,
 created_at timestamptz not null default now()
);
create table public.entry_items (
 id uuid primary key default gen_random_uuid(),entry_id uuid not null references public.entries(id),owner_id uuid not null references auth.users(id),
 product_id uuid not null references public.products(id),kind text not null,name text not null,color text not null,size text not null,
 quantity integer not null check(quantity between 1 and 9999),cost numeric(12,2) not null check(cost>=0),price numeric(12,2) not null check(price>=0),image_path text
);
create index suppliers_owner_idx on public.suppliers(owner_id);
create index products_owner_idx on public.products(owner_id);
create index entries_owner_idx on public.entries(owner_id,created_at desc);
create index entry_items_entry_idx on public.entry_items(entry_id);
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.entries enable row level security;
alter table public.entry_items enable row level security;
create policy suppliers_select on public.suppliers for select to authenticated using(owner_id=(select auth.uid()));
create policy suppliers_insert on public.suppliers for insert to authenticated with check(owner_id=(select auth.uid()));
create policy products_select on public.products for select to authenticated using(owner_id=(select auth.uid()));
create policy entries_select on public.entries for select to authenticated using(owner_id=(select auth.uid()));
create policy entry_items_select on public.entry_items for select to authenticated using(owner_id=(select auth.uid()));
revoke all on public.suppliers,public.products,public.entries,public.entry_items from anon,authenticated;
grant select,insert on public.suppliers to authenticated;
grant select on public.products,public.entries,public.entry_items to authenticated;

create function public.receive_merchandise(p_id uuid,p_supplier_id uuid,p_date date,p_reference text,p_notes text,p_items jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_uid uuid:=auth.uid(); v_item jsonb; v_qty integer; v_cost numeric; v_price numeric; v_product uuid;
 v_kind text;v_name text;v_color text;v_size text;v_path text;v_total numeric:=0; v_result jsonb;
begin
 if v_uid is null then raise exception 'Inicia sesión para registrar mercancía';end if;
 if p_id is null then raise exception 'Identificador de solicitud requerido';end if;
 -- Serializa reintentos del mismo id, incluso desde distintas pestañas.
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 if exists(select 1 from public.entries where id=p_id) then
  if not exists(select 1 from public.entries where id=p_id and owner_id=v_uid) then raise exception 'Solicitud no disponible';end if;
  select to_jsonb(e)||jsonb_build_object('items',(select coalesce(jsonb_agg(to_jsonb(i)),'[]'::jsonb) from public.entry_items i where i.entry_id=e.id)) into v_result from public.entries e where e.id=p_id and e.owner_id=v_uid;
  return v_result;
 end if;
 if p_date is null then raise exception 'La fecha es obligatoria';end if;
 if not exists(select 1 from public.suppliers where id=p_supplier_id and owner_id=v_uid) then raise exception 'Proveedor no válido';end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Artículos no válidos';end if;
 if jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Registra entre 1 y 100 variantes';end if;
 if length(coalesce(p_reference,''))>100 or length(coalesce(p_notes,''))>2000 then raise exception 'Referencia u observaciones demasiado largas';end if;
 insert into public.entries(id,owner_id,supplier_id,entry_date,reference,notes) values(p_id,v_uid,p_supplier_id,p_date,coalesce(p_reference,''),coalesce(p_notes,''));
 -- Orden estable de bloqueo por variante para reducir interbloqueos concurrentes.
 for v_item in select value from jsonb_array_elements(p_items) order by lower(value->>'kind'),lower(value->>'name'),lower(value->>'color'),lower(value->>'size') loop
  v_kind:=trim(v_item->>'kind');v_name:=trim(v_item->>'name');v_color:=trim(v_item->>'color');v_size:=trim(v_item->>'size');
  if coalesce(length(v_kind),0) not between 1 and 100 or coalesce(length(v_name),0) not between 1 and 100 or coalesce(length(v_color),0) not between 1 and 100 or coalesce(length(v_size),0) not between 1 and 100 then raise exception 'Completa tipo, nombre, color y tamaño';end if;
  if position(chr(31) in v_kind||v_name||v_color||v_size)>0 then raise exception 'Caracteres no válidos';end if;
  if jsonb_typeof(v_item->'quantity') is distinct from 'number' or jsonb_typeof(v_item->'cost') is distinct from 'number' or jsonb_typeof(v_item->'price') is distinct from 'number' then raise exception 'Cantidad, costo y precio deben ser números';end if;
  if (v_item->>'quantity')::numeric <> trunc((v_item->>'quantity')::numeric) then raise exception 'La cantidad debe ser entera';end if;
  v_qty:=(v_item->>'quantity')::integer;v_cost:=round((v_item->>'cost')::numeric,2);v_price:=round((v_item->>'price')::numeric,2);
  if v_qty not between 1 and 9999 or v_cost not between 0 and 9999999 or v_price not between 0 and 9999999 then raise exception 'Cantidad o precio fuera de rango';end if;
  v_path:=nullif(v_item->>'image_path','');
  if v_path is not null and (split_part(v_path,'/',1)<>v_uid::text or not exists(select 1 from storage.objects where bucket_id='product-images' and name=v_path)) then raise exception 'Imagen no válida para esta cuenta';end if;
  insert into public.products(owner_id,kind,name,color,size,stock,cost,price,image_path) values(v_uid,v_kind,v_name,v_color,v_size,v_qty,v_cost,v_price,v_path)
  on conflict(owner_id,variant_key) do update set stock=products.stock+excluded.stock,cost=excluded.cost,price=excluded.price,image_path=coalesce(excluded.image_path,products.image_path),updated_at=now() returning id into v_product;
  insert into public.entry_items(entry_id,owner_id,product_id,kind,name,color,size,quantity,cost,price,image_path) values(p_id,v_uid,v_product,v_kind,v_name,v_color,v_size,v_qty,v_cost,v_price,v_path);
  v_total:=v_total+v_qty*v_cost;
 end loop;
 update public.entries set total=v_total where id=p_id and owner_id=v_uid;
 select to_jsonb(e)||jsonb_build_object('items',(select jsonb_agg(to_jsonb(i)) from public.entry_items i where i.entry_id=e.id)) into v_result from public.entries e where e.id=p_id and e.owner_id=v_uid;
 return v_result;
end;
$$;
revoke all on function public.receive_merchandise(uuid,uuid,date,text,text,jsonb) from public,anon;
grant execute on function public.receive_merchandise(uuid,uuid,date,text,text,jsonb) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('product-images','product-images',false,5242880,array['image/jpeg','image/png']);
create policy product_images_read on storage.objects for select to authenticated using(bucket_id='product-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy product_images_insert on storage.objects for insert to authenticated with check(bucket_id='product-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
commit;
-- Actualización 002: catálogo y relación de productos con varios proveedores.
-- Ejecutar sobre la versión anterior. Conserva productos, existencias e historial.
begin;
create table if not exists public.product_suppliers (
 product_id uuid not null references public.products(id) on delete cascade,
 supplier_id uuid not null references public.suppliers(id),
 owner_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 primary key(product_id,supplier_id)
);
create index if not exists product_suppliers_owner_idx on public.product_suppliers(owner_id);
create index if not exists product_suppliers_supplier_idx on public.product_suppliers(supplier_id);
alter table public.product_suppliers enable row level security;
drop policy if exists product_suppliers_select on public.product_suppliers;
create policy product_suppliers_select on public.product_suppliers for select to authenticated using(owner_id=(select auth.uid()));
revoke all on public.product_suppliers from anon,authenticated;
grant select on public.product_suppliers to authenticated;

-- Recupera asociaciones de entradas existentes sin alterar stock ni snapshots.
insert into public.product_suppliers(product_id,supplier_id,owner_id)
select distinct i.product_id,e.supplier_id,e.owner_id
from public.entry_items i join public.entries e on e.id=i.entry_id
join public.products p on p.id=i.product_id and p.owner_id=e.owner_id
join public.suppliers s on s.id=e.supplier_id and s.owner_id=e.owner_id
where i.owner_id=e.owner_id on conflict do nothing;

create or replace function public.link_received_product_supplier()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_supplier uuid;v_owner uuid;
begin
 select supplier_id,owner_id into v_supplier,v_owner from public.entries where id=new.entry_id;
 if v_owner is null or new.owner_id<>v_owner or not exists(select 1 from public.products where id=new.product_id and owner_id=v_owner)
 or not exists(select 1 from public.suppliers where id=v_supplier and owner_id=v_owner) then raise exception 'Relación de producto y proveedor no válida';end if;
 insert into public.product_suppliers(product_id,supplier_id,owner_id) values(new.product_id,v_supplier,v_owner) on conflict do nothing;
 return new;
end;
$$;
revoke all on function public.link_received_product_supplier() from public,anon,authenticated;
drop trigger if exists entry_items_link_supplier on public.entry_items;
create trigger entry_items_link_supplier after insert on public.entry_items for each row execute function public.link_received_product_supplier();

-- Registrar y editar un producto nunca modifica sus existencias.
create or replace function public.register_product(p_id uuid,p_product jsonb,p_supplier_ids uuid[])
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_uid uuid:=auth.uid();v_kind text;v_name text;v_color text;v_size text;v_path text;
 v_cost numeric;v_price numeric;v_result jsonb;v_supplier uuid;
begin
 if v_uid is null then raise exception 'Inicia sesión para registrar productos';end if;
 if p_id is null then raise exception 'Identificador de producto requerido';end if;
 if p_product is null or jsonb_typeof(p_product)<>'object' then raise exception 'Producto no válido';end if;
 if p_supplier_ids is null or coalesce(cardinality(p_supplier_ids),0) not between 1 and 100 then raise exception 'Selecciona entre 1 y 100 proveedores';end if;
 if exists(select 1 from unnest(p_supplier_ids) as t(id) where id is null or not exists(select 1 from public.suppliers s where s.id=t.id and s.owner_id=v_uid)) then raise exception 'Uno de los proveedores no pertenece a tu cuenta';end if;
 -- Mismo producto y reintentos se serializan. La fila se bloquea al actualizar.
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 if exists(select 1 from public.products where id=p_id and owner_id<>v_uid) then raise exception 'Producto no disponible';end if;
 v_kind:=trim(p_product->>'kind');v_name:=trim(p_product->>'name');v_color:=trim(p_product->>'color');v_size:=trim(p_product->>'size');
 if coalesce(length(v_kind),0) not between 1 and 100 or coalesce(length(v_name),0) not between 1 and 100 or coalesce(length(v_color),0) not between 1 and 100 or coalesce(length(v_size),0) not between 1 and 100 then raise exception 'Completa tipo, nombre, color y tamaño';end if;
 if position(chr(31) in v_kind||v_name||v_color||v_size)>0 then raise exception 'Caracteres no válidos';end if;
 if jsonb_typeof(p_product->'cost') is distinct from 'number' or jsonb_typeof(p_product->'price') is distinct from 'number' then raise exception 'Costo y precio deben ser números';end if;
 v_cost:=round((p_product->>'cost')::numeric,2);v_price:=round((p_product->>'price')::numeric,2);
 if v_cost not between 0 and 9999999 or v_price not between 0 and 9999999 then raise exception 'Costo o precio fuera de rango';end if;
 v_path:=nullif(p_product->>'image_path','');
 if v_path is not null and (split_part(v_path,'/',1)<>v_uid::text or not exists(select 1 from storage.objects where bucket_id='product-images' and name=v_path)) then raise exception 'Imagen no válida para esta cuenta';end if;
 begin
 insert into public.products(id,owner_id,kind,name,color,size,stock,cost,price,image_path) values(p_id,v_uid,v_kind,v_name,v_color,v_size,0,v_cost,v_price,v_path)
 on conflict(id) do update set kind=excluded.kind,name=excluded.name,color=excluded.color,size=excluded.size,cost=excluded.cost,price=excluded.price,image_path=excluded.image_path,updated_at=now()
 where products.owner_id=v_uid;
 exception when unique_violation then raise exception 'Esta variante ya existe. Edítala para agregar sus proveedores.';
 end;
 delete from public.product_suppliers where product_id=p_id and owner_id=v_uid;
 insert into public.product_suppliers(product_id,supplier_id,owner_id) select p_id,id,v_uid from (select distinct unnest(p_supplier_ids) as id) s;
 select to_jsonb(p)||jsonb_build_object('supplier_ids',to_jsonb(p_supplier_ids)) into v_result from public.products p where id=p_id and owner_id=v_uid;
 return v_result;
end;
$$;
revoke all on function public.register_product(uuid,jsonb,uuid[]) from public,anon;
grant execute on function public.register_product(uuid,jsonb,uuid[]) to authenticated;
commit;
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
