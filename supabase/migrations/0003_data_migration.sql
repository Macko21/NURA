-- NURA — 0003: migración de datos del modelo jsonb `nura_*` al esquema normalizado.
-- Idempotente: limpia tablas hijas y hace upsert en cabeceras.
-- Nota: el data legacy no tiene vendedor_id en ventas/clientes/combos (todas son de admin),
-- por lo que esas columnas quedan NULL. Los perfiles se mapean por email = username || '@nura.app'.

-- hijos: limpiar para permitir re-ejecución
delete from public.venta_items;
delete from public.venta_pagos;
delete from public.combo_items;

-- ── perfiles (dedupe de los 113 'admin' duplicados) ──────────────────
insert into public.perfiles (id, username, nombre, rol, activo)
select au.id, lu.username, lu.nombre, lu.rol, lu.activo
from (
  select distinct on (datos->>'username')
    datos->>'username' as username,
    coalesce(datos->>'nombre', '') as nombre,
    datos->>'rol' as rol,
    coalesce((datos->>'activo')::boolean, true) as activo
  from nura_usuarios
  where (datos->>'activo')::boolean is not false
  order by datos->>'username', updated_at desc nulls last
) lu
join auth.users au on au.email = lu.username || '@nura.app'
on conflict (id) do update
  set username = excluded.username,
      nombre = excluded.nombre,
      rol = excluded.rol,
      activo = excluded.activo;

-- ── productos ─────────────────────────────────────────────────────────
insert into public.productos
  (id, nombre, codigo, categoria, tipo, descripcion,
   stock_litros, stock_min_litros, costo_litro,
   stock_unidades, stock_min_unidades, costo_unidad,
   ganancia_acc, desc_mayorista_acc, precio_venta, precio_mayorista)
select
  datos->>'id',
  coalesce(datos->>'nombre', ''),
  nullif(datos->>'codigo', ''),
  coalesce(datos->>'categoria', ''),
  coalesce(datos->>'tipo', 'liquido'),
  coalesce(datos->>'descripcion', ''),
  coalesce((datos->>'stockLitros')::numeric, 0),
  coalesce((datos->>'stockMinLitros')::numeric, 0),
  coalesce((datos->>'costoLitro')::numeric, 0),
  coalesce((datos->>'stockUnidades')::numeric, 0),
  coalesce((datos->>'stockMinUnidades')::numeric, 0),
  coalesce((datos->>'costoUnidad')::numeric, 0),
  coalesce((datos->>'gananciaAcc')::numeric, 0),
  coalesce((datos->>'descMayorista')::numeric, 0),
  coalesce((datos->>'precioVenta')::numeric, 0),
  coalesce((datos->>'precioMayorista')::numeric, 0)
from nura_productos
on conflict (id) do update set
  nombre = excluded.nombre, codigo = excluded.codigo, categoria = excluded.categoria,
  tipo = excluded.tipo, descripcion = excluded.descripcion,
  stock_litros = excluded.stock_litros, stock_min_litros = excluded.stock_min_litros, costo_litro = excluded.costo_litro,
  stock_unidades = excluded.stock_unidades, stock_min_unidades = excluded.stock_min_unidades, costo_unidad = excluded.costo_unidad,
  ganancia_acc = excluded.ganancia_acc, desc_mayorista_acc = excluded.desc_mayorista_acc,
  precio_venta = excluded.precio_venta, precio_mayorista = excluded.precio_mayorista;

-- ── presentaciones ────────────────────────────────────────────────────
insert into public.producto_presentaciones
  (id, producto_id, nombre, litros, costo_envase, costo_etiqueta, ganancia, desc_mayorista, precio_venta, precio_mayorista)
select
  pr->>'id',
  p.datos->>'id',
  coalesce(pr->>'nombre', ''),
  coalesce((pr->>'litros')::numeric, 0),
  coalesce((pr->>'costoEnvase')::numeric, 0),
  coalesce((pr->>'costoEtiqueta')::numeric, 0),
  coalesce((pr->>'ganancia')::numeric, 0),
  coalesce((pr->>'descMayorista')::numeric, 0),
  coalesce((pr->>'precioVenta')::numeric, 0),
  coalesce((pr->>'precioMayorista')::numeric, 0)
from nura_productos p,
     jsonb_array_elements(coalesce(p.datos->'presentaciones', '[]'::jsonb)) pr
where p.datos->>'tipo' is distinct from 'accesorio'
on conflict (id) do update set
  producto_id = excluded.producto_id, nombre = excluded.nombre, litros = excluded.litros,
  costo_envase = excluded.costo_envase, costo_etiqueta = excluded.costo_etiqueta, ganancia = excluded.ganancia,
  desc_mayorista = excluded.desc_mayorista, precio_venta = excluded.precio_venta, precio_mayorista = excluded.precio_mayorista;

-- ── clientes ──────────────────────────────────────────────────────────
insert into public.clientes (id, nombre, telefono, email, direccion, notas, es_mayorista, vendedor_id)
select
  datos->>'id',
  coalesce(datos->>'nombre', ''),
  coalesce(datos->>'telefono', ''),
  coalesce(datos->>'email', ''),
  coalesce(datos->>'direccion', ''),
  coalesce(datos->>'notas', ''),
  coalesce((datos->>'esMayorista')::boolean, false),
  null
from nura_clientes
on conflict (id) do update set
  nombre = excluded.nombre, telefono = excluded.telefono, email = excluded.email,
  direccion = excluded.direccion, notas = excluded.notas, es_mayorista = excluded.es_mayorista;

-- ── ventas + items + pagos ────────────────────────────────────────────
insert into public.ventas
  (id, fecha, cliente_id, cliente_nombre, vendedor_id, vendedor_nombre,
   es_mayorista, subtotal, descuento, envio, total, estado, obs)
select
  datos->>'id',
  coalesce((datos->>'fecha')::bigint, 0),
  nullif(datos->>'clienteId', ''),
  coalesce(datos->>'clienteNombre', ''),
  null,
  coalesce(datos->>'vendedorNombre', ''),
  coalesce((datos->>'esMayorista')::boolean, false),
  coalesce((datos->>'subtotal')::numeric, 0),
  coalesce((datos->>'descuento')::numeric, 0),
  coalesce((datos->>'envio')::numeric, 0),
  coalesce((datos->>'total')::numeric, 0),
  coalesce(datos->>'estado', 'pendiente'),
  coalesce(datos->>'obs', '')
from nura_ventas
on conflict (id) do update set
  fecha = excluded.fecha, cliente_id = excluded.cliente_id, cliente_nombre = excluded.cliente_nombre,
  vendedor_nombre = excluded.vendedor_nombre, es_mayorista = excluded.es_mayorista,
  subtotal = excluded.subtotal, descuento = excluded.descuento, envio = excluded.envio,
  total = excluded.total, estado = excluded.estado, obs = excluded.obs;

insert into public.venta_items
  (venta_id, producto_id, presentacion_id, combo_id, nombre, detalle, cantidad,
   precio, precio_aplicado, precio_mayorista, costo_unitario, litros_por_unidad, subtotal, es_acc, es_combo)
select
  v.datos->>'id',
  nullif(it->>'productoId', ''),
  nullif(it->>'presId', ''),
  nullif(it->>'comboId', ''),
  coalesce(it->>'nombre', ''),
  coalesce(it->>'detalle', ''),
  coalesce((it->>'cantidad')::numeric, 1),
  coalesce((it->>'precio')::numeric, 0),
  coalesce((it->>'precioAplicado')::numeric, (it->>'precio')::numeric, 0),
  coalesce((it->>'precioMayorista')::numeric, 0),
  coalesce((it->>'costoUnitario')::numeric, 0),
  coalesce((it->>'litrosPorUnidad')::numeric, 0),
  coalesce((it->>'subtotal')::numeric, 0),
  coalesce((it->>'esAcc')::boolean, false),
  coalesce((it->>'esCombo')::boolean, false)
from nura_ventas v,
     jsonb_array_elements(coalesce(v.datos->'items', '[]'::jsonb)) it;

insert into public.venta_pagos (id, venta_id, fecha, monto, medio)
select
  pg->>'id',
  v.datos->>'id',
  coalesce((pg->>'fecha')::bigint, 0),
  coalesce((pg->>'monto')::numeric, 0),
  coalesce(pg->>'medio', 'efectivo')
from nura_ventas v,
     jsonb_array_elements(coalesce(v.datos->'pagos', '[]'::jsonb)) pg;

-- ── compras ───────────────────────────────────────────────────────────
insert into public.compras
  (id, fecha, producto_id, producto_nombre, tipo, proveedor, cantidad, precio_unit, total, notas)
select
  datos->>'id',
  coalesce((datos->>'fecha')::bigint, 0),
  nullif(datos->>'productoId', ''),
  coalesce(datos->>'productoNombre', ''),
  coalesce(datos->>'tipo', 'liquido'),
  coalesce(datos->>'proveedor', ''),
  coalesce((datos->>'cantidad')::numeric, 0),
  coalesce((datos->>'precioUnit')::numeric, 0),
  coalesce((datos->>'total')::numeric, 0),
  coalesce(datos->>'notas', '')
from nura_compras
on conflict (id) do update set
  fecha = excluded.fecha, producto_id = excluded.producto_id, producto_nombre = excluded.producto_nombre,
  tipo = excluded.tipo, proveedor = excluded.proveedor, cantidad = excluded.cantidad,
  precio_unit = excluded.precio_unit, total = excluded.total, notas = excluded.notas;

-- ── combos + items ────────────────────────────────────────────────────
insert into public.combos (id, nombre, descripcion, precio, precio_mayorista, vendedor_id)
select
  datos->>'id',
  coalesce(datos->>'nombre', ''),
  coalesce(datos->>'descripcion', ''),
  coalesce((datos->>'precio')::numeric, 0),
  coalesce((datos->>'precioMayorista')::numeric, 0),
  null
from nura_combos
on conflict (id) do update set
  nombre = excluded.nombre, descripcion = excluded.descripcion,
  precio = excluded.precio, precio_mayorista = excluded.precio_mayorista;

insert into public.combo_items
  (combo_id, producto_id, presentacion_id, nombre, detalle, cantidad,
   precio, precio_mayorista, litros_por_unidad, es_acc)
select
  c.datos->>'id',
  nullif(it->>'productoId', ''),
  nullif(it->>'presId', ''),
  coalesce(it->>'nombre', ''),
  coalesce(it->>'detalle', ''),
  coalesce((it->>'cantidad')::numeric, 1),
  coalesce((it->>'precio')::numeric, 0),
  coalesce((it->>'precioMayorista')::numeric, 0),
  coalesce((it->>'litrosPorUnidad')::numeric, 0),
  coalesce((it->>'esAcc')::boolean, false)
from nura_combos c,
     jsonb_array_elements(coalesce(c.datos->'items', '[]'::jsonb)) it;
