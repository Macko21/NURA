import { sb } from './supabase';
import type {
  Cliente, Combo, ComboItem, Compra, Perfil, Presentacion, Producto,
  Venta, VentaItem, VentaPago,
} from '../types';
import { toast } from './ui';

// ── Store en memoria (mismo patrón que la versión original, con tipos) ─
export const store = {
  perfiles: [] as Perfil[],
  productos: [] as Producto[],
  clientes: [] as Cliente[],
  ventas: [] as Venta[],
  compras: [] as Compra[],
  combos: [] as Combo[],
};

let _lastUpdate: number | null = null;

export function notifyUpdate(col?: string) {
  _lastUpdate = Date.now();
  document.dispatchEvent(new CustomEvent('nura:datachange', { detail: { collection: col, timestamp: _lastUpdate } }));
}

export function getLastUpdateStr(): string {
  if (!_lastUpdate) return 'Nunca';
  const diff = Math.floor((Date.now() - _lastUpdate) / 1000);
  if (diff < 5) return 'Ahora mismo';
  if (diff < 60) return `Hace ${diff}s`;
  return `Hace ${Math.floor(diff / 60)}m`;
}

export function syncUI(s: 'ok' | 'saving' | 'off') {
  const dot = document.getElementById('syncDot');
  const txt = document.getElementById('syncTxt');
  const bar = document.getElementById('syncBar');
  if (!dot || !txt) return;
  if (s === 'ok') { dot.style.background = '#52dad2'; txt.textContent = 'Sincronizado' + (_lastUpdate ? ' · ' + getLastUpdateStr() : ''); if (bar) bar.style.display = 'none'; }
  if (s === 'saving') { dot.style.background = '#f59e0b'; txt.textContent = 'Guardando...'; if (bar) bar.style.display = 'block'; }
  if (s === 'off') { dot.style.background = '#f43f5e'; txt.textContent = 'Sin conexión'; }
}

// ── Mappers snake_case → camelCase ─────────────────────────────────────
function num(v: unknown): number { return Number(v) || 0; }

function mapPresentacion(r: Record<string, unknown>): Presentacion {
  return {
    id: String(r.id), nombre: String(r.nombre ?? ''), litros: num(r.litros),
    costoEnvase: num(r.costo_envase), costoEtiqueta: num(r.costo_etiqueta),
    ganancia: num(r.ganancia), descMayorista: num(r.desc_mayorista),
    precioVenta: num(r.precio_venta), precioMayorista: num(r.precio_mayorista),
  };
}

function mapProducto(r: Record<string, unknown>, pres: Presentacion[]): Producto {
  return {
    id: String(r.id), nombre: String(r.nombre ?? ''), codigo: r.codigo ? String(r.codigo) : undefined,
    categoria: String(r.categoria ?? ''), tipo: r.tipo === 'accesorio' ? 'accesorio' : 'liquido',
    descripcion: String(r.descripcion ?? ''),
    stockLitros: num(r.stock_litros), stockMinLitros: num(r.stock_min_litros), costoLitro: num(r.costo_litro),
    stockUnidades: num(r.stock_unidades), stockMinUnidades: num(r.stock_min_unidades), costoUnidad: num(r.costo_unidad),
    gananciaAcc: num(r.ganancia_acc), descMayorista: num(r.desc_mayorista_acc),
    precioVenta: num(r.precio_venta), precioMayorista: num(r.precio_mayorista),
    presentaciones: pres,
  };
}

function mapCliente(r: Record<string, unknown>): Cliente {
  return {
    id: String(r.id), nombre: String(r.nombre ?? ''), telefono: String(r.telefono ?? ''),
    email: String(r.email ?? ''), direccion: String(r.direccion ?? ''), notas: String(r.notas ?? ''),
    esMayorista: Boolean(r.es_mayorista), vendedorId: r.vendedor_id ? String(r.vendedor_id) : null,
  };
}

function mapVentaItem(r: Record<string, unknown>): VentaItem {
  return {
    productoId: r.producto_id ? String(r.producto_id) : null,
    presId: r.presentacion_id ? String(r.presentacion_id) : null,
    comboId: r.combo_id ? String(r.combo_id) : null,
    nombre: String(r.nombre ?? ''), detalle: String(r.detalle ?? ''),
    cantidad: num(r.cantidad), precio: num(r.precio), precioAplicado: num(r.precio_aplicado),
    precioMayorista: num(r.precio_mayorista), costoUnitario: num(r.costo_unitario),
    litrosPorUnidad: num(r.litros_por_unidad), subtotal: num(r.subtotal),
    esAcc: Boolean(r.es_acc), esCombo: Boolean(r.es_combo),
  };
}

function mapVentaPago(r: Record<string, unknown>): VentaPago {
  return {
    id: String(r.id), fecha: num(r.fecha), monto: num(r.monto),
    medio: r.medio === 'transferencia' ? 'transferencia' : 'efectivo',
  };
}

function mapVenta(r: Record<string, unknown>, items: VentaItem[], pagos: VentaPago[]): Venta {
  return {
    id: String(r.id), fecha: num(r.fecha), clienteId: r.cliente_id ? String(r.cliente_id) : null,
    clienteNombre: String(r.cliente_nombre ?? ''), vendedorId: r.vendedor_id ? String(r.vendedor_id) : null,
    vendedorNombre: String(r.vendedor_nombre ?? ''), esMayorista: Boolean(r.es_mayorista),
    subtotal: num(r.subtotal), descuento: num(r.descuento), envio: num(r.envio), total: num(r.total),
    estado: (r.estado as Venta['estado']) ?? 'pendiente', obs: String(r.obs ?? ''),
    items, pagos,
  };
}

function mapCompra(r: Record<string, unknown>): Compra {
  return {
    id: String(r.id), fecha: num(r.fecha), productoId: r.producto_id ? String(r.producto_id) : null,
    productoNombre: String(r.producto_nombre ?? ''), tipo: r.tipo === 'accesorio' ? 'accesorio' : 'liquido',
    proveedor: String(r.proveedor ?? ''), cantidad: num(r.cantidad), precioUnit: num(r.precio_unit),
    total: num(r.total), notas: String(r.notas ?? ''),
  };
}

function mapComboItem(r: Record<string, unknown>): ComboItem {
  return {
    productoId: r.producto_id ? String(r.producto_id) : null,
    presId: r.presentacion_id ? String(r.presentacion_id) : null,
    nombre: String(r.nombre ?? ''), detalle: String(r.detalle ?? ''), cantidad: num(r.cantidad),
    precio: num(r.precio), precioMayorista: num(r.precio_mayorista),
    litrosPorUnidad: num(r.litros_por_unidad), esAcc: Boolean(r.es_acc),
  };
}

function mapCombo(r: Record<string, unknown>, items: ComboItem[]): Combo {
  return {
    id: String(r.id), nombre: String(r.nombre ?? ''), descripcion: String(r.descripcion ?? ''),
    precio: num(r.precio), precioMayorista: num(r.precio_mayorista),
    vendedorId: r.vendedor_id ? String(r.vendedor_id) : null, items,
  };
}

function mapPerfil(r: Record<string, unknown>): Perfil {
  return {
    id: String(r.id), username: String(r.username ?? ''), nombre: String(r.nombre ?? ''),
    rol: r.rol === 'admin' ? 'admin' : 'vendedor', activo: Boolean(r.activo),
  };
}

// ── Carga ──────────────────────────────────────────────────────────────
async function loadPerfiles() {
  const { data, error } = await sb().from('perfiles').select('*');
  if (error) { console.error('perfiles', error.message); return; }
  store.perfiles = (data ?? []).map(mapPerfil);
}

async function loadProductos() {
  const [p, pr] = await Promise.all([
    sb().from('productos').select('*'),
    sb().from('producto_presentaciones').select('*'),
  ]);
  if (p.error) { console.error('productos', p.error.message); return; }
  const byProducto = new Map<string, Presentacion[]>();
  for (const row of pr.data ?? []) {
    const pid = String((row as Record<string, unknown>).producto_id);
    if (!byProducto.has(pid)) byProducto.set(pid, []);
    byProducto.get(pid)!.push(mapPresentacion(row as Record<string, unknown>));
  }
  store.productos = (p.data ?? []).map((r) => mapProducto(r, byProducto.get(String((r as Record<string, unknown>).id)) ?? []));
}

async function loadClientes() {
  const { data, error } = await sb().from('clientes').select('*');
  if (error) { console.error('clientes', error.message); return; }
  store.clientes = (data ?? []).map(mapCliente);
}

async function loadVentas() {
  const [v, it, pg] = await Promise.all([
    sb().from('ventas').select('*'),
    sb().from('venta_items').select('*'),
    sb().from('venta_pagos').select('*'),
  ]);
  if (v.error) { console.error('ventas', v.error.message); return; }
  const itemsByVenta = new Map<string, VentaItem[]>();
  for (const row of it.data ?? []) {
    const vid = String((row as Record<string, unknown>).venta_id);
    if (!itemsByVenta.has(vid)) itemsByVenta.set(vid, []);
    itemsByVenta.get(vid)!.push(mapVentaItem(row as Record<string, unknown>));
  }
  const pagosByVenta = new Map<string, VentaPago[]>();
  for (const row of pg.data ?? []) {
    const vid = String((row as Record<string, unknown>).venta_id);
    if (!pagosByVenta.has(vid)) pagosByVenta.set(vid, []);
    pagosByVenta.get(vid)!.push(mapVentaPago(row as Record<string, unknown>));
  }
  store.ventas = (v.data ?? []).map((r) => mapVenta(
    r as Record<string, unknown>,
    itemsByVenta.get(String((r as Record<string, unknown>).id)) ?? [],
    pagosByVenta.get(String((r as Record<string, unknown>).id)) ?? [],
  ));
}

async function loadCompras() {
  const { data, error } = await sb().from('compras').select('*');
  if (error) { console.error('compras', error.message); return; }
  store.compras = (data ?? []).map(mapCompra);
}

async function loadCombos() {
  const [c, ci] = await Promise.all([
    sb().from('combos').select('*'),
    sb().from('combo_items').select('*'),
  ]);
  if (c.error) { console.error('combos', c.error.message); return; }
  const itemsByCombo = new Map<string, ComboItem[]>();
  for (const row of ci.data ?? []) {
    const cid = String((row as Record<string, unknown>).combo_id);
    if (!itemsByCombo.has(cid)) itemsByCombo.set(cid, []);
    itemsByCombo.get(cid)!.push(mapComboItem(row as Record<string, unknown>));
  }
  store.combos = (c.data ?? []).map((r) => mapCombo(r as Record<string, unknown>, itemsByCombo.get(String((r as Record<string, unknown>).id)) ?? []));
}

export async function loadAll() {
  await Promise.all([loadPerfiles(), loadProductos(), loadClientes(), loadVentas(), loadCompras(), loadCombos()]);
  notifyUpdate();
}

// ── Persistencia ───────────────────────────────────────────────────────
export async function saveCliente(c: Cliente) {
  const { error } = await sb().from('clientes').upsert({
    id: c.id, nombre: c.nombre, telefono: c.telefono, email: c.email, direccion: c.direccion,
    notas: c.notas, es_mayorista: c.esMayorista, vendedor_id: c.vendedorId,
  }, { onConflict: 'id' });
  if (error) toast('Error al guardar cliente', 'error');
}

export async function removeCliente(id: string) {
  const { error } = await sb().from('clientes').delete().eq('id', id);
  if (error) console.error('removeCliente', error.message);
}

export async function saveProducto(p: Producto) {
  const { error } = await sb().from('productos').upsert({
    id: p.id, nombre: p.nombre, codigo: p.codigo ?? null, categoria: p.categoria, tipo: p.tipo,
    descripcion: p.descripcion ?? '', stock_litros: p.stockLitros, stock_min_litros: p.stockMinLitros,
    costo_litro: p.costoLitro, stock_unidades: p.stockUnidades, stock_min_unidades: p.stockMinUnidades,
    costo_unidad: p.costoUnidad, ganancia_acc: p.gananciaAcc, desc_mayorista_acc: p.descMayorista,
    precio_venta: p.precioVenta, precio_mayorista: p.precioMayorista,
  }, { onConflict: 'id' });
  if (error) { toast('Error al guardar producto', 'error'); return; }
  await sb().from('producto_presentaciones').delete().eq('producto_id', p.id);
  const rows = p.presentaciones.map((pr) => ({
    id: pr.id, producto_id: p.id, nombre: pr.nombre, litros: pr.litros, costo_envase: pr.costoEnvase,
    costo_etiqueta: pr.costoEtiqueta, ganancia: pr.ganancia, desc_mayorista: pr.descMayorista,
    precio_venta: pr.precioVenta, precio_mayorista: pr.precioMayorista,
  }));
  if (rows.length) await sb().from('producto_presentaciones').upsert(rows, { onConflict: 'id' });
}

export async function removeProducto(id: string) {
  const { error } = await sb().from('productos').delete().eq('id', id);
  if (error) console.error('removeProducto', error.message);
}

export async function saveCompra(c: Compra) {
  const { error } = await sb().from('compras').upsert({
    id: c.id, fecha: c.fecha, producto_id: c.productoId, producto_nombre: c.productoNombre,
    tipo: c.tipo, proveedor: c.proveedor, cantidad: c.cantidad, precio_unit: c.precioUnit,
    total: c.total, notas: c.notas,
  }, { onConflict: 'id' });
  if (error) toast('Error al guardar compra', 'error');
}

export async function removeCompra(id: string) {
  const { error } = await sb().from('compras').delete().eq('id', id);
  if (error) console.error('removeCompra', error.message);
}

export async function saveCombo(c: Combo) {
  const { error } = await sb().from('combos').upsert({
    id: c.id, nombre: c.nombre, descripcion: c.descripcion, precio: c.precio,
    precio_mayorista: c.precioMayorista, vendedor_id: c.vendedorId,
  }, { onConflict: 'id' });
  if (error) { toast('Error al guardar combo', 'error'); return; }
  await sb().from('combo_items').delete().eq('combo_id', c.id);
  const rows = c.items.map((it) => ({
    combo_id: c.id, producto_id: it.productoId, presentacion_id: it.presId, nombre: it.nombre,
    detalle: it.detalle, cantidad: it.cantidad, precio: it.precio, precio_mayorista: it.precioMayorista,
    litros_por_unidad: it.litrosPorUnidad, es_acc: it.esAcc,
  }));
  if (rows.length) await sb().from('combo_items').insert(rows);
}

export async function removeCombo(id: string) {
  const { error } = await sb().from('combos').delete().eq('id', id);
  if (error) console.error('removeCombo', error.message);
}

export async function saveVenta(v: Venta) {
  const { error } = await sb().from('ventas').upsert({
    id: v.id, fecha: v.fecha, cliente_id: v.clienteId, cliente_nombre: v.clienteNombre,
    vendedor_id: v.vendedorId, vendedor_nombre: v.vendedorNombre, es_mayorista: v.esMayorista,
    subtotal: v.subtotal, descuento: v.descuento, envio: v.envio, total: v.total,
    estado: v.estado, obs: v.obs,
  }, { onConflict: 'id' });
  if (error) { toast('Error al guardar venta', 'error'); return; }
  await sb().from('venta_items').delete().eq('venta_id', v.id);
  const rows = v.items.map((it) => ({
    venta_id: v.id, producto_id: it.productoId, presentacion_id: it.presId, combo_id: it.comboId,
    nombre: it.nombre, detalle: it.detalle, cantidad: it.cantidad, precio: it.precio,
    precio_aplicado: it.precioAplicado, precio_mayorista: it.precioMayorista, costo_unitario: it.costoUnitario,
    litros_por_unidad: it.litrosPorUnidad, subtotal: it.subtotal, es_acc: it.esAcc, es_combo: it.esCombo,
  }));
  if (rows.length) await sb().from('venta_items').insert(rows);
  await sb().from('venta_pagos').delete().eq('venta_id', v.id);
  const pagos = v.pagos.map((pg) => ({ id: pg.id, venta_id: v.id, fecha: pg.fecha, monto: pg.monto, medio: pg.medio }));
  if (pagos.length) await sb().from('venta_pagos').insert(pagos);
}

export async function removeVenta(id: string) {
  const { error } = await sb().from('ventas').delete().eq('id', id);
  if (error) console.error('removeVenta', error.message);
}

// ── RPCs de stock ──────────────────────────────────────────────────────
export async function descontarStock(productoId: string, cantidad: number, esAcc: boolean): Promise<boolean> {
  const { data, error } = await sb().rpc('descontar_stock', { p_producto_id: productoId, p_cantidad: cantidad, p_es_acc: esAcc });
  if (error) { console.error('descontar_stock', error.message); return false; }
  return data === true;
}

export async function reponerStock(productoId: string, cantidad: number, esAcc: boolean): Promise<void> {
  const { error } = await sb().rpc('reponer_stock', { p_producto_id: productoId, p_cantidad: cantidad, p_es_acc: esAcc });
  if (error) { console.error('reponer_stock', error.message); toast('Error al reponer stock', 'error'); }
}

export async function ajustarStock(productoId: string, nuevoStock: number, nuevoMin: number, esAcc: boolean): Promise<void> {
  const { error } = await sb().rpc('ajustar_stock', { p_producto_id: productoId, p_nuevo_stock: nuevoStock, p_nuevo_min: nuevoMin, p_es_acc: esAcc });
  if (error) { console.error('ajustar_stock', error.message); toast('Error al ajustar stock', 'error'); }
}

// ── Realtime ───────────────────────────────────────────────────────────
const TABLES = ['perfiles', 'productos', 'producto_presentaciones', 'clientes', 'ventas', 'venta_items', 'venta_pagos', 'compras', 'combos', 'combo_items'];

export function suscribirRealtime(onChange: () => void) {
  const channel = sb().channel('nura-changes');
  TABLES.forEach((t) => {
    channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => onChange());
  });
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') syncUI('ok');
    else if (status === 'CHANNEL_ERROR') syncUI('off');
  });
}
