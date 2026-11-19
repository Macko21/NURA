-- NURA — 0004: elimina el modelo legacy jsonb (con sus políticas de acceso público).
-- Cierra la exposición de los hashes de contraseña de `nura_usuarios`.
-- (Los datos ya están migrados y verificados; existe backup JSON en /backup.)

drop function if exists public.nura_descontar_stock(text, numeric, boolean);
drop function if exists public.nura_restaurar_stock(uuid, numeric, boolean);

drop table if exists public.nura_usuarios;
drop table if exists public.nura_ventas;
drop table if exists public.nura_compras;
drop table if exists public.nura_combos;
drop table if exists public.nura_productos;
drop table if exists public.nura_clientes;
