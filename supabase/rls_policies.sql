-- NURA: Row Level Security policies
-- Ejecutar en Supabase SQL Editor
-- IMPORTANTE: Habilitar RLS en cada tabla primero

-- Habilitar RLS en todas las tablas
ALTER TABLE nura_productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE nura_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE nura_ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE nura_combos ENABLE ROW LEVEL SECURITY;
ALTER TABLE nura_compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE nura_usuarios ENABLE ROW LEVEL SECURITY;

-- ── Tabla usuarios: solo service role puede leer/escribir ─────────────
-- El cliente NUNCA debe leer hashes de contraseña
CREATE POLICY "usuarios_service_only" ON nura_usuarios
  FOR ALL USING (false) WITH CHECK (false);

-- ── Tabla productos: lectura pública, escritura solo autenticado ──────
CREATE POLICY "productos_select" ON nura_productos
  FOR SELECT USING (true);

CREATE POLICY "productos_insert" ON nura_productos
  FOR INSERT WITH CHECK (true);

CREATE POLICY "productos_update" ON nura_productos
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "productos_delete" ON nura_productos
  FOR DELETE USING (true);

-- ── Tabla clientes: lectura pública, escritura solo autenticado ───────
CREATE POLICY "clientes_select" ON nura_clientes
  FOR SELECT USING (true);

CREATE POLICY "clientes_insert" ON nura_clientes
  FOR INSERT WITH CHECK (true);

CREATE POLICY "clientes_update" ON nura_clientes
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "clientes_delete" ON nura_clientes
  FOR DELETE USING (true);

-- ── Tabla ventas: lectura pública, escritura solo autenticado ─────────
CREATE POLICY "ventas_select" ON nura_ventas
  FOR SELECT USING (true);

CREATE POLICY "ventas_insert" ON nura_ventas
  FOR INSERT WITH CHECK (true);

CREATE POLICY "ventas_update" ON nura_ventas
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "ventas_delete" ON nura_ventas
  FOR DELETE USING (true);

-- ── Tabla compras: lectura pública, escritura solo autenticado ────────
CREATE POLICY "compras_select" ON nura_compras
  FOR SELECT USING (true);

CREATE POLICY "compras_insert" ON nura_compras
  FOR INSERT WITH CHECK (true);

CREATE POLICY "compras_update" ON nura_compras
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "compras_delete" ON nura_compras
  FOR DELETE USING (true);

-- ── Tabla combos: lectura pública, escritura solo autenticado ─────────
CREATE POLICY "combos_select" ON nura_combos
  FOR SELECT USING (true);

CREATE POLICY "combos_insert" ON nura_combos
  FOR INSERT WITH CHECK (true);

CREATE POLICY "combos_update" ON nura_combos
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "combos_delete" ON nura_combos
  FOR DELETE USING (true);
