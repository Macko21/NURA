-- NURA — 0001: esquema normalizado (reemplaza el modelo jsonb `nura_*`)
-- Los IDs de entidades de negocio se conservan como `text` (compatibles con el data existente).
-- `perfiles` enlaza con Supabase Auth (auth.users) y aporta el `rol`.

-- ─────────────────────────────────────────────────────────────────────
-- Perfiles de usuario (enlazados a Supabase Auth)
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.perfiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   text not null unique,
  nombre     text not null default '',
  rol        text not null default 'vendedor' check (rol in ('admin', 'vendedor')),
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────
-- Productos
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.productos (
  id                 text primary key,
  nombre             text not null,
  codigo             text,
  categoria          text not null default '',
  tipo               text not null default 'liquido' check (tipo in ('liquido', 'accesorio')),
  descripcion        text not null default '',
  -- líquido / granel
  stock_litros       numeric not null default 0,
  stock_min_litros   numeric not null default 0,
  costo_litro        numeric not null default 0,
  -- accesorio / unidad
  stock_unidades     numeric not null default 0,
  stock_min_unidades numeric not null default 0,
  costo_unidad       numeric not null default 0,
  ganancia_acc       numeric not null default 0,
  desc_mayorista_acc numeric not null default 0,
  precio_venta       numeric not null default 0,
  precio_mayorista   numeric not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.producto_presentaciones (
  id               text primary key,
  producto_id      text not null references public.productos (id) on delete cascade,
  nombre           text not null,
  litros           numeric not null default 0,
  costo_envase     numeric not null default 0,
  costo_etiqueta   numeric not null default 0,
  ganancia         numeric not null default 0,
  desc_mayorista   numeric not null default 0,
  precio_venta     numeric not null default 0,
  precio_mayorista numeric not null default 0,
  created_at       timestamptz not null default now()
);
create index if not exists idx_producto_presentaciones_producto on public.producto_presentaciones (producto_id);

-- ─────────────────────────────────────────────────────────────────────
-- Clientes
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.clientes (
  id           text primary key,
  nombre       text not null,
  telefono     text not null default '',
  email        text not null default '',
  direccion    text not null default '',
  notas        text not null default '',
  es_mayorista boolean not null default false,
  vendedor_id  uuid references public.perfiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_clientes_vendedor on public.clientes (vendedor_id);

-- ─────────────────────────────────────────────────────────────────────
-- Ventas (cabecera + items + pagos)
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.ventas (
  id             text primary key,
  fecha          bigint not null default 0,          -- epoch ms
  cliente_id     text,                                -- ref blanda (legacy permite huérfanos/nulos)
  cliente_nombre text not null default '',
  vendedor_id    uuid references public.perfiles (id) on delete set null,
  vendedor_nombre text not null default '',
  es_mayorista   boolean not null default false,
  subtotal       numeric not null default 0,
  descuento      numeric not null default 0,
  envio          numeric not null default 0,
  total          numeric not null default 0,
  estado         text not null default 'pendiente' check (estado in ('pagado', 'pendiente', 'cancelado')),
  obs            text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_ventas_cliente on public.ventas (cliente_id);
create index if not exists idx_ventas_vendedor on public.ventas (vendedor_id);
create index if not exists idx_ventas_fecha on public.ventas (fecha);

create table if not exists public.venta_items (
  id                uuid primary key default gen_random_uuid(),
  venta_id          text not null references public.ventas (id) on delete cascade,
  producto_id       text,
  presentacion_id   text,
  combo_id          text,
  nombre            text not null,
  detalle           text not null default '',
  cantidad          numeric not null default 1,
  precio            numeric not null default 0,
  precio_aplicado   numeric not null default 0,
  precio_mayorista  numeric not null default 0,
  costo_unitario    numeric not null default 0,
  litros_por_unidad numeric not null default 0,
  subtotal          numeric not null default 0,
  es_acc            boolean not null default false,
  es_combo          boolean not null default false
);
create index if not exists idx_venta_items_venta on public.venta_items (venta_id);

create table if not exists public.venta_pagos (
  id       text primary key,
  venta_id text not null references public.ventas (id) on delete cascade,
  fecha    bigint not null default 0,
  monto    numeric not null default 0,
  medio    text not null default 'efectivo'
);
create index if not exists idx_venta_pagos_venta on public.venta_pagos (venta_id);

-- ─────────────────────────────────────────────────────────────────────
-- Compras
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.compras (
  id             text primary key,
  fecha          bigint not null default 0,
  producto_id    text,
  producto_nombre text not null default '',
  tipo           text not null default 'liquido',
  proveedor      text not null default '',
  cantidad       numeric not null default 0,
  precio_unit    numeric not null default 0,
  total          numeric not null default 0,
  notas          text not null default '',
  created_at     timestamptz not null default now()
);
create index if not exists idx_compras_fecha on public.compras (fecha);

-- ─────────────────────────────────────────────────────────────────────
-- Combos (cabecera + items)
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.combos (
  id               text primary key,
  nombre           text not null,
  descripcion      text not null default '',
  precio           numeric not null default 0,
  precio_mayorista numeric not null default 0,
  vendedor_id      uuid references public.perfiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_combos_vendedor on public.combos (vendedor_id);

create table if not exists public.combo_items (
  id                uuid primary key default gen_random_uuid(),
  combo_id          text not null references public.combos (id) on delete cascade,
  producto_id       text,
  presentacion_id   text,
  nombre            text not null,
  detalle           text not null default '',
  cantidad          numeric not null default 1,
  precio            numeric not null default 0,
  precio_mayorista  numeric not null default 0,
  litros_por_unidad numeric not null default 0,
  es_acc            boolean not null default false
);
create index if not exists idx_combo_items_combo on public.combo_items (combo_id);

-- ─────────────────────────────────────────────────────────────────────
-- Triggers updated_at (reutiliza la función existente public.update_updated_at)
-- ─────────────────────────────────────────────────────────────────────
drop trigger if exists trg_perfiles_updated_at on public.perfiles;
create trigger trg_perfiles_updated_at before update on public.perfiles
  for each row execute function public.update_updated_at();

drop trigger if exists trg_productos_updated_at on public.productos;
create trigger trg_productos_updated_at before update on public.productos
  for each row execute function public.update_updated_at();

drop trigger if exists trg_clientes_updated_at on public.clientes;
create trigger trg_clientes_updated_at before update on public.clientes
  for each row execute function public.update_updated_at();

drop trigger if exists trg_ventas_updated_at on public.ventas;
create trigger trg_ventas_updated_at before update on public.ventas
  for each row execute function public.update_updated_at();

drop trigger if exists trg_combos_updated_at on public.combos;
create trigger trg_combos_updated_at before update on public.combos
  for each row execute function public.update_updated_at();
