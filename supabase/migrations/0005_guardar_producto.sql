-- Guarda el artículo y sus presentaciones en una sola transacción.
-- Mantiene RLS y conserva el stock actual al editar.
create or replace function public.guardar_producto(p_producto jsonb, p_presentaciones jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  producto public.productos := jsonb_populate_record(null::public.productos, p_producto);
begin
  if exists (
    select 1
    from public.productos p
    where p.id = producto.id and p.tipo <> producto.tipo
  ) then
    raise exception 'El tipo del artículo existente no puede modificarse';
  end if;

  insert into public.productos (
    id, nombre, codigo, categoria, tipo, descripcion, stock_litros, stock_min_litros, costo_litro,
    stock_unidades, stock_min_unidades, costo_unidad, ganancia_acc, desc_mayorista_acc, precio_venta, precio_mayorista
  ) values (
    producto.id, producto.nombre, producto.codigo, producto.categoria, producto.tipo, producto.descripcion,
    producto.stock_litros, producto.stock_min_litros, producto.costo_litro, producto.stock_unidades,
    producto.stock_min_unidades, producto.costo_unidad, producto.ganancia_acc, producto.desc_mayorista_acc,
    producto.precio_venta, producto.precio_mayorista
  )
  on conflict (id) do update set
    nombre = excluded.nombre, codigo = excluded.codigo, categoria = excluded.categoria,
    descripcion = excluded.descripcion, stock_min_litros = excluded.stock_min_litros, costo_litro = excluded.costo_litro,
    stock_min_unidades = excluded.stock_min_unidades, costo_unidad = excluded.costo_unidad,
    ganancia_acc = excluded.ganancia_acc, desc_mayorista_acc = excluded.desc_mayorista_acc,
    precio_venta = excluded.precio_venta, precio_mayorista = excluded.precio_mayorista, updated_at = now();

  if exists (
    select 1 from public.producto_presentaciones pr
    where pr.producto_id = producto.id
      and not exists (select 1 from jsonb_array_elements(p_presentaciones) fila where fila->>'id' = pr.id)
      and exists (select 1 from public.combo_items ci where ci.presentacion_id = pr.id)
  ) then
    raise exception 'Hay una presentación que todavía se usa en un combo';
  end if;

  if exists (
    select 1 from jsonb_populate_recordset(null::public.producto_presentaciones, p_presentaciones) fila
    where fila.litros <= 0 or fila.costo_envase < 0 or fila.costo_etiqueta < 0
       or fila.ganancia < 0 or fila.desc_mayorista not between 0 and 100
       or fila.precio_venta < 0 or fila.precio_mayorista < 0 or btrim(fila.nombre) = ''
  ) then
    raise exception 'Hay una presentación con datos inválidos';
  end if;

  insert into public.producto_presentaciones as pr (
    id, producto_id, nombre, litros, costo_envase, costo_etiqueta, ganancia, desc_mayorista, precio_venta, precio_mayorista
  )
  select fila.id, producto.id, fila.nombre, fila.litros, fila.costo_envase, fila.costo_etiqueta,
         fila.ganancia, fila.desc_mayorista, fila.precio_venta, fila.precio_mayorista
  from jsonb_populate_recordset(null::public.producto_presentaciones, p_presentaciones) fila
  on conflict (id) do update set
    nombre = excluded.nombre, litros = excluded.litros, costo_envase = excluded.costo_envase,
    costo_etiqueta = excluded.costo_etiqueta, ganancia = excluded.ganancia, desc_mayorista = excluded.desc_mayorista,
    precio_venta = excluded.precio_venta, precio_mayorista = excluded.precio_mayorista
  where pr.producto_id = excluded.producto_id;

  delete from public.producto_presentaciones pr
  where pr.producto_id = producto.id
    and not exists (select 1 from jsonb_array_elements(p_presentaciones) fila where fila->>'id' = pr.id);
end;
$$;

revoke execute on function public.guardar_producto(jsonb, jsonb) from public, anon;
grant execute on function public.guardar_producto(jsonb, jsonb) to authenticated;
