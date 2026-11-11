-- Ejecutar después de 002. Conserva productos e historial.
begin;
create or replace function public.delete_supplier(p_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_uid uuid:=auth.uid();
begin
 if v_uid is null then raise exception 'Inicia sesión para eliminar proveedores';end if;
 if p_id is null then raise exception 'Proveedor requerido';end if;
 -- Bloquea también las nuevas referencias FK mientras se comprueba y elimina.
 perform 1 from public.suppliers where id=p_id and owner_id=v_uid for update;
 if not found then raise exception 'Proveedor no disponible';end if;
 if exists(select 1 from public.entries where supplier_id=p_id) then
  raise exception 'No se puede eliminar: el proveedor tiene entradas registradas.';
 end if;
 if exists(select 1 from public.product_suppliers where supplier_id=p_id) then
  raise exception 'No se puede eliminar: el proveedor tiene productos asociados.';
 end if;
 delete from public.suppliers where id=p_id and owner_id=v_uid;
exception when foreign_key_violation then
 raise exception 'No se puede eliminar: el proveedor tiene registros asociados.';
end;
$$;
revoke all on function public.delete_supplier(uuid) from public,anon;
grant execute on function public.delete_supplier(uuid) to authenticated;
commit;
