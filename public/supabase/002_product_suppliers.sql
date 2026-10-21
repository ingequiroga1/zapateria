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
