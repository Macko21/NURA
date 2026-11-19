-- NURA — 0002: helpers de rol, RLS por usuario y RPCs de stock
-- Modelo de acceso:
--   * admin    -> ve y edita todo.
--   * vendedor -> lee catálogo/stock; crea/edita SUS clientes, ventas y combos;
--                 no puede editar productos ni compras ni ajustar stock (eso es del admin).

-- ─────────────────────────────────────────────────────────────────────
-- Helpers de rol (security definer para evitar recursión de RLS)
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.current_rol()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.rol from public.perfiles p where p.id = auth.uid()), 'anon');
$$;

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_rol() = 'admin';
$$;

grant execute on function public.current_rol() to public;
grant execute on function public.es_admin() to public;

-- ─────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────
alter table public.perfiles enable row level security;
alter table public.productos enable row level security;
alter table public.producto_presentaciones enable row level security;
alter table public.clientes enable row level security;
alter table public.ventas enable row level security;
alter table public.venta_items enable row level security;
alter table public.venta_pagos enable row level security;
alter table public.compras enable row level security;
alter table public.combos enable row level security;
alter table public.combo_items enable row level security;

-- perfiles ------------------------------------------------------------------
drop policy if exists "perfiles_select" on public.perfiles;
create policy "perfiles_select" on public.perfiles
  for select to authenticated using (true);

drop policy if exists "perfiles_admin_write" on public.perfiles;
create policy "perfiles_admin_write" on public.perfiles
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- productos ------------------------------------------------------------------
drop policy if exists "productos_select" on public.productos;
create policy "productos_select" on public.productos
  for select to authenticated using (true);

drop policy if exists "productos_admin_write" on public.productos;
create policy "productos_admin_write" on public.productos
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- producto_presentaciones ----------------------------------------------------
drop policy if exists "presentaciones_select" on public.producto_presentaciones;
create policy "presentaciones_select" on public.producto_presentaciones
  for select to authenticated using (true);

drop policy if exists "presentaciones_admin_write" on public.producto_presentaciones;
create policy "presentaciones_admin_write" on public.producto_presentaciones
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- clientes -------------------------------------------------------------------
drop policy if exists "clientes_select" on public.clientes;
create policy "clientes_select" on public.clientes
  for select to authenticated
  using (public.es_admin() or vendedor_id = auth.uid() or vendedor_id is null);

drop policy if exists "clientes_insert" on public.clientes;
create policy "clientes_insert" on public.clientes
  for insert to authenticated
  with check (public.es_admin() or vendedor_id = auth.uid());

drop policy if exists "clientes_update" on public.clientes;
create policy "clientes_update" on public.clientes
  for update to authenticated
  using (public.es_admin() or vendedor_id = auth.uid())
  with check (public.es_admin() or vendedor_id = auth.uid());

drop policy if exists "clientes_delete" on public.clientes;
create policy "clientes_delete" on public.clientes
  for delete to authenticated using (public.es_admin());

-- ventas ---------------------------------------------------------------------
drop policy if exists "ventas_select" on public.ventas;
create policy "ventas_select" on public.ventas
  for select to authenticated
  using (public.es_admin() or vendedor_id = auth.uid());

drop policy if exists "ventas_insert" on public.ventas;
create policy "ventas_insert" on public.ventas
  for insert to authenticated
  with check (public.es_admin() or vendedor_id = auth.uid());

drop policy if exists "ventas_update" on public.ventas;
create policy "ventas_update" on public.ventas
  for update to authenticated
  using (public.es_admin() or vendedor_id = auth.uid())
  with check (public.es_admin() or vendedor_id = auth.uid());

drop policy if exists "ventas_delete" on public.ventas;
create policy "ventas_delete" on public.ventas
  for delete to authenticated using (public.es_admin());

-- venta_items -----------------------------------------------------------------
drop policy if exists "venta_items_select" on public.venta_items;
create policy "venta_items_select" on public.venta_items
  for select to authenticated
  using (exists (
    select 1 from public.ventas v
    where v.id = venta_items.venta_id
      and (public.es_admin() or v.vendedor_id = auth.uid())
  ));

drop policy if exists "venta_items_insert" on public.venta_items;
create policy "venta_items_insert" on public.venta_items
  for insert to authenticated
  with check (exists (
    select 1 from public.ventas v
    where v.id = venta_items.venta_id
      and (public.es_admin() or v.vendedor_id = auth.uid())
  ));

drop policy if exists "venta_items_admin_write" on public.venta_items;
create policy "venta_items_admin_write" on public.venta_items
  for update to authenticated using (public.es_admin()) with check (public.es_admin());

drop policy if exists "venta_items_admin_delete" on public.venta_items;
create policy "venta_items_admin_delete" on public.venta_items
  for delete to authenticated using (public.es_admin());

-- venta_pagos -----------------------------------------------------------------
drop policy if exists "venta_pagos_select" on public.venta_pagos;
create policy "venta_pagos_select" on public.venta_pagos
  for select to authenticated
  using (exists (
    select 1 from public.ventas v
    where v.id = venta_pagos.venta_id
      and (public.es_admin() or v.vendedor_id = auth.uid())
  ));

drop policy if exists "venta_pagos_insert" on public.venta_pagos;
create policy "venta_pagos_insert" on public.venta_pagos
  for insert to authenticated
  with check (exists (
    select 1 from public.ventas v
    where v.id = venta_pagos.venta_id
      and (public.es_admin() or v.vendedor_id = auth.uid())
  ));

drop policy if exists "venta_pagos_admin_delete" on public.venta_pagos;
create policy "venta_pagos_admin_delete" on public.venta_pagos
  for delete to authenticated using (public.es_admin());

-- compras (solo admin) --------------------------------------------------------
drop policy if exists "compras_admin_all" on public.compras;
create policy "compras_admin_all" on public.compras
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- combos ----------------------------------------------------------------------
drop policy if exists "combos_select" on public.combos;
create policy "combos_select" on public.combos
  for select to authenticated
  using (public.es_admin() or vendedor_id = auth.uid() or vendedor_id is null);

drop policy if exists "combos_insert" on public.combos;
create policy "combos_insert" on public.combos
  for insert to authenticated
  with check (public.es_admin() or vendedor_id = auth.uid());

drop policy if exists "combos_update" on public.combos;
create policy "combos_update" on public.combos
  for update to authenticated
  using (public.es_admin() or vendedor_id = auth.uid())
  with check (public.es_admin() or vendedor_id = auth.uid());

drop policy if exists "combos_delete" on public.combos;
create policy "combos_delete" on public.combos
  for delete to authenticated using (public.es_admin() or vendedor_id = auth.uid());

-- combo_items -----------------------------------------------------------------
drop policy if exists "combo_items_select" on public.combo_items;
create policy "combo_items_select" on public.combo_items
  for select to authenticated
  using (exists (
    select 1 from public.combos c
    where c.id = combo_items.combo_id
      and (public.es_admin() or c.vendedor_id = auth.uid() or c.vendedor_id is null)
  ));

drop policy if exists "combo_items_insert" on public.combo_items;
create policy "combo_items_insert" on public.combo_items
  for insert to authenticated
  with check (exists (
    select 1 from public.combos c
    where c.id = combo_items.combo_id
      and (public.es_admin() or c.vendedor_id = auth.uid() or c.vendedor_id is null)
  ));

drop policy if exists "combo_items_owner_write" on public.combo_items;
create policy "combo_items_owner_write" on public.combo_items
  for update to authenticated
  using (exists (
    select 1 from public.combos c
    where c.id = combo_items.combo_id and (public.es_admin() or c.vendedor_id = auth.uid())
  ))
  with check (exists (
    select 1 from public.combos c
    where c.id = combo_items.combo_id and (public.es_admin() or c.vendedor_id = auth.uid())
  ));

drop policy if exists "combo_items_owner_delete" on public.combo_items;
create policy "combo_items_owner_delete" on public.combo_items
  for delete to authenticated
  using (exists (
    select 1 from public.combos c
    where c.id = combo_items.combo_id and (public.es_admin() or c.vendedor_id = auth.uid())
  ));

-- ─────────────────────────────────────────────────────────────────────
-- RPCs de stock (atómicos, security definer)
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.descontar_stock(p_producto_id text, p_cantidad numeric, p_es_acc boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_ok boolean;
begin
  if p_es_acc then
    update public.productos set stock_unidades = stock_unidades - p_cantidad
      where id = p_producto_id and stock_unidades >= p_cantidad;
  else
    update public.productos set stock_litros = stock_litros - p_cantidad
      where id = p_producto_id and stock_litros >= p_cantidad;
  end if;
  get diagnostics v_ok = row_count;
  return v_ok > 0;
end;
$$;

create or replace function public.reponer_stock(p_producto_id text, p_cantidad numeric, p_es_acc boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_admin() then
    raise exception 'permiso denegado';
  end if;
  if p_es_acc then
    update public.productos set stock_unidades = stock_unidades + p_cantidad where id = p_producto_id;
  else
    update public.productos set stock_litros = stock_litros + p_cantidad where id = p_producto_id;
  end if;
end;
$$;

create or replace function public.ajustar_stock(p_producto_id text, p_nuevo_stock numeric, p_nuevo_min numeric, p_es_acc boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_admin() then
    raise exception 'permiso denegado';
  end if;
  if p_es_acc then
    update public.productos set stock_unidades = p_nuevo_stock, stock_min_unidades = p_nuevo_min where id = p_producto_id;
  else
    update public.productos set stock_litros = p_nuevo_stock, stock_min_litros = p_nuevo_min where id = p_producto_id;
  end if;
end;
$$;

revoke all on function public.descontar_stock(text, numeric, boolean) from public;
revoke all on function public.reponer_stock(text, numeric, boolean) from public;
revoke all on function public.ajustar_stock(text, numeric, numeric, boolean) from public;
grant execute on function public.descontar_stock(text, numeric, boolean) to authenticated;
grant execute on function public.reponer_stock(text, numeric, boolean) to authenticated;
grant execute on function public.ajustar_stock(text, numeric, numeric, boolean) to authenticated;
