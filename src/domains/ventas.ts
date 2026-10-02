import { store, saveVenta, removeVenta, descontarStock, reponerStock, loadAll } from '../lib/db';
import { Sesion } from '../lib/session';
import { escapeHTML, fmt, fmtL, fmtDate, toast, swalConfirm, swalError, swalSuccess, openModal, closeModal, moneyInput, unitInput, registerRenderer, navigate, exposeGlobal, currentPage, buildVendibles } from '../lib/ui';
import { genId } from '../lib/id';
import { waLink } from '../config';
import type { Venta, VentaItem, VentaPago, Cliente, Combo, Producto, Presentacion } from '../types';

let ventaItems: VentaItem[] = [];

export function renderVentas() {
  const el = document.getElementById('page-ventas');
  if (!el) return;
  document.getElementById('topbarActions')!.innerHTML = `
    ${Sesion.esAdmin() ? `<button class="btn btn-outline btn-sm" onclick="resumenPendientesModal()">📋 Pendientes</button>` : ''}
    <button class="btn btn-primary" onclick="formVenta()">+ Venta</button>`;

  const ventas = [...store.ventas]
    .sort((a, b) => a.fecha - b.fecha)
    .map((v, i) => ({ ...v, num: i + 1 }))
    .filter((v) => Sesion.esAdmin() || v.vendedorId === Sesion.uid())
    .sort((a, b) => b.fecha - a.fecha);

  const tbl = `<div class="table-wrap hide-mobile"><table><thead><tr>
    <th>Trans.</th><th>Fecha</th><th>Cliente</th>${Sesion.esAdmin() ? '<th>Vendedor</th>' : ''}<th>Items</th><th>Total</th><th>Estado</th><th>Acciones</th>
  </tr></thead><tbody>${
    ventas.length === 0
      ? `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">🛒</div><p>Sin ventas</p></div></td></tr>`
      : ventas.map((v) => {
          const cl = store.clientes.find((c) => c.id === v.clienteId);
          const gananciaVendedor = Sesion.esVendedor()
            ? (v.items.reduce((s, i) => s + (i.precioAplicado - (i.precioMayorista || 0)) * i.cantidad, 0) + (v.envio || 0))
            : null;
          return `<tr>
            <td><span class="badge badge-blue">#${v.num}</span></td>
            <td>${fmtDate(v.fecha)}</td>
            <td>${cl ? escapeHTML(cl.nombre) : escapeHTML(v.clienteNombre || '—')} ${cl?.esMayorista ? '<span class="badge badge-violet" style="font-size:10px;">Mayor.</span>' : ''}</td>
            ${Sesion.esAdmin() ? `<td>${escapeHTML(v.vendedorNombre || '—')}</td>` : ''}
            <td>${v.items.length}</td>
            <td class="fw-700">${fmt(v.total)}</td>
            <td>${estadoSelect(v)}</td>
            <td><div class="table-actions">
              <button class="btn btn-secondary btn-sm" onclick="verVenta('${v.id}')">👁</button>
              <button class="btn btn-wsp-sm btn-sm" onclick="wspVenta('${v.id}')">📲</button>
              ${Sesion.esAdmin() ? `<button class="btn btn-danger btn-sm btn-icon" onclick="eliminarVenta('${v.id}')">🗑</button>` : ''}
            </div></td>
          </tr>`;
        }).join('')
  }</tbody></table></div>`;

  const cards = `<div class="mobile-card-list">${ventas.map((v) => {
    const cl = store.clientes.find((c) => c.id === v.clienteId);
    const gananciaVendedor = Sesion.esVendedor()
      ? (v.items.reduce((s, i) => s + (i.precioAplicado - (i.precioMayorista || 0)) * i.cantidad, 0) + (v.envio || 0))
      : null;
    return `<div class="m-card">
      <div class="m-card-header">
        <div>
          <div class="m-card-title"><span class="badge badge-blue" style="margin-right:6px;">#${v.num}</span> ${cl ? escapeHTML(cl.nombre) : escapeHTML(v.clienteNombre || 'Sin cliente')}${cl?.esMayorista ? ' <span class="badge badge-violet" style="font-size:10px;">Mayorista</span>' : ''}</div>
          <div class="m-card-subtitle">${fmtDate(v.fecha)} · ${v.items.length} ítem(s)</div>
        </div>
        ${estadoSelect(v)}
      </div>
      <div style="font-family:var(--font-display);font-size:22px;font-weight:800;" class="text-gradient">${fmt(v.total)}</div>
      ${gananciaVendedor !== null ? `<div style="font-size:12px;color:var(--violet-dark);margin-top:4px;">Ganancia: ${fmt(gananciaVendedor)}</div>` : ''}
      <div class="m-card-footer mt-8">
        <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="verVenta('${v.id}')">👁 Ver</button>
        <button class="btn btn-wsp-sm btn-sm" style="flex:1;" onclick="wspVenta('${v.id}')">📲</button>
        ${Sesion.esAdmin() ? `<button class="btn btn-danger btn-sm btn-icon" onclick="eliminarVenta('${v.id}')">🗑</button>` : ''}
      </div>
    </div>`;
  }).join('')}</div>`;

  el.innerHTML = `<div class="card"><div class="section-header"><div class="section-title">Ventas</div></div>${ventas.length === 0 ? `<div class="empty-state"><div class="empty-icon">🛒</div><p>Sin ventas</p></div>` : tbl + cards}</div>`;
}

export function estadoSelect(v: any) {
  const estados = ['pendiente', 'pagado', 'cancelado'];
  return `<select onchange="cambiarEstadoVenta('${v.id}', this.value)" style="font-size:12px;padding:4px 8px;border-radius:var(--r-sm);border:1px solid var(--border);background:var(--surface);">${estados.map((e) => `<option value="${e}" ${v.estado === e ? 'selected' : ''}>${e.charAt(0).toUpperCase() + e.slice(1)}</option>`).join('')}</select>`;
}

export async function cambiarEstadoVenta(id: string, estado: string) {
  const v = store.ventas.find((x) => x.id === id);
  if (!v) return;
  v.estado = estado;
  await saveVenta(v);
  if (estado === 'pagado') {
    await loadAll();
    renderPage(currentPage);
  }
  toast('Estado actualizado');
}

export function buildVendibles(): any[] {
  const vendibles: any[] = [];
  store.productos.forEach((p) => {
    if (p.tipo === 'accesorio') {
      vendibles.push({ id: p.id, nombre: p.nombre, precio: p.precioVenta, precioMayorista: p.precioMayorista, esAcc: true, esCombo: false, stock: p.stockUnidades, costoUnitario: p.costoUnidad, detalle: 'Unidad' });
    } else {
      (p.presentaciones || []).forEach((pr) => {
        vendibles.push({ id: pr.id, productoId: p.id, nombre: p.nombre, precio: pr.precioVenta, precioMayorista: pr.precioMayorista, esAcc: false, esCombo: false, stock: Math.floor((p.stockLitros || 0) / pr.litros), costoUnitario: (p.costoLitro || 0) * pr.litros + (pr.costoEnvase || 0) + (pr.costoEtiqueta || 0), detalle: pr.nombre, litrosPorUnidad: pr.litros, presId: pr.id });
      });
    }
  });
  store.combos.forEach((c) => {
    vendibles.push({ comboId: c.id, nombre: c.nombre, precio: c.precio, precioMayorista: c.precioMayorista, esAcc: false, esCombo: true, stock: 1, costoUnitario: 0, detalle: 'Combo' });
  });
  return vendibles;
}

function buildVentaModalContent(vendibles: any[]) {
  return `<div style="display:flex;flex-direction:column;gap:12px;">
    <div class="form-group full"><label>Cliente</label><select id="vCliente" onchange="onClienteChange()"><option value="">Seleccioná...</option>${store.clientes.map((c) => `<option value="${c.id}">${escapeHTML(c.nombre)}${c.esMayorista ? ' (Mayorista)' : ''}</option>`).join('')}</select></div>
    <div class="form-group"><label>Envío</label>${moneyInput('vEnvio', '0')}</div>
    <div class="form-group"><label>Descuento</label>${moneyInput('vDescuento', '0')}</div>
    <div class="form-group"><label>Observaciones</label><textarea id="vObs" rows="2"></textarea></div>
    <div class="form-group full"><label>Items</label>
      <div id="ventaItemsWrap" style="max-height:300px;overflow:auto;border:1px solid var(--border);border-radius:var(--r-sm);padding:8px;">
        ${renderVentaItems()}
      </div>
      <div class="flex gap-8 mt-8">
        <button class="btn btn-primary" onclick="agregarItemVenta()">+ Agregar item</button>
        <button class="btn btn-secondary" onclick="agregarComboVenta()">+ Combo</button>
      </div>
    </div>
    <div class="cost-calc-box" style="margin-top:12px;">
      <h4>Totales</h4>
      <div class="cost-row"><span>Subtotal</span><span id="vSubtotal">${fmt(0)}</span></div>
      <div class="cost-row"><span>Descuento</span><span>${moneyInput('vDescuento', '0', 'updateVentaTotals()')}</div>
      <div class="cost-row"><span>Envío</span><span>${moneyInput('vEnvio', '0', 'updateVentaTotals()')}</div>
      <div class="cost-row total"><span>Total</span><span id="vTotal" class="fw-700">${fmt(0)}</span></div>
    </div>
  </div>`;
}

function renderVentaItems() {
  if (!ventaItems.length) return `<div class="empty-state" style="padding:16px;"><p>Sin items</p></div>`;
  return ventaItems.map((it, i) => `<div style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px;margin-bottom:8px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
    <div class="flex-1"><div class="fw-700" style="font-size:13px;">${escapeHTML(it.nombre)}</div><div style="font-size:11px;color:var(--text-muted);">${escapeHTML(it.detalle)} · x${it.cantidad} · ${fmt(it.precioAplicado)} c/u</div></div>
    <div class="flex gap-8 flex-wrap">
      <div class="form-group" style="min-width:80px;"><label>Cant.</label>${unitInput(`viCant${i}`, String(it.cantidad), it.esAcc ? 'un' : 'L', it.esAcc ? '1' : '0.001', `ventaItems[${i}].cantidad=+this.value;updateVentaTotals()`)}</div>
      <div class="form-group" style="min-width:120px;"><label>Precio</label>${moneyInput(`viPrecio${i}`, String(it.precioAplicado), `ventaItems[${i}].precioAplicado=+this.value;updateVentaTotals()`)}</div>
      <button class="btn btn-danger btn-sm btn-icon" onclick="ventaItems.splice(${i},1);document.getElementById('ventaItemsWrap')!.innerHTML=renderVentaItems();updateVentaTotals()">✕</button>
    </div>
  </div>`).join('');
}

export function formVenta() {
  ventaItems = [];
  openModal('🛒 Nueva Venta', buildVentaModalContent(buildVendibles()), guardarVenta, true);
}

export function agregarItemVenta() {
  const vendibles = buildVendibles();
  openModal('Agregar item', `<div class="form-group full"><label>Producto / Presentación</label><select id="viProducto" style="width:100%;"><option value="">Seleccioná...</option>${buildVendibles().filter((v) => !v.esCombo).map((v) => `<option value="${v.id}">${escapeHTML(v.nombre)} ${v.detalle ? ' — ' + escapeHTML(v.detalle) : ''} — ${fmt(v.precio)} (Stock: ${v.stock})</option>`).join('')}</select></div><div class="form-group"><label>Cantidad</label>${unitInput('viCant', '1', 'L', '0.001')}</div>`, async () => {
    const prodId = (document.getElementById('viProducto') as HTMLSelectElement).value;
    const cant = parseFloat((document.getElementById('viCant') as HTMLInputElement).value) || 0;
    if (!prodId || !cant) { await swalError('Completá todo'); return; }
    const v = buildVendibles().find((x) => x.id === prodId);
    if (!v) return;
    ventaItems.push({ ...v, cantidad: cant, subtotal: v.precio * cant });
    closeModal();
    document.getElementById('ventaItemsWrap')!.innerHTML = renderVentaItems();
    updateVentaTotals();
  });
}

export function agregarComboVenta() {
  const combos = buildVendibles().filter((v) => v.esCombo);
  if (!combos.length) { toast('No hay combos', 'info'); return; }
  openModal('Agregar combo', `<div class="form-group full"><label>Combo</label><select id="viCombo" style="width:100%;"><option value="">Seleccioná...</option>${combos.map((c) => `<option value="${c.id}">${escapeHTML(c.nombre)} — ${fmt(c.precio)}</option>`).join('')}</select></div><div class="form-group"><label>Cantidad</label>${unitInput('viCant', '1', 'un', '1')}</div>`, () => {
    const comboId = (document.getElementById('viCombo') as HTMLSelectElement).value;
    const cant = parseFloat((document.getElementById('viCant') as HTMLInputElement).value) || 0;
    if (!comboId || !cant) { toast('Completá todo', 'info'); return; }
    const c = buildVendibles().find((x) => x.id === comboId);
    if (!c) return;
    ventaItems.push({ ...c, cantidad: cant, subtotal: c.precio * cant, esCombo: true });
    document.getElementById('ventaItemsWrap')!.innerHTML = renderVentaItems();
    updateVentaTotals();
    closeModal();
  });
}

export function updateVentaTotals() {
  ventaItems.forEach((it, i) => {
    const c = parseFloat((document.getElementById(`viCant${i}`) as HTMLInputElement)?.value) || 0;
    const p = parseFloat((document.getElementById(`viPrecio${i}`) as HTMLInputElement)?.value) || 0;
    it.cantidad = c;
    it.precioAplicado = p;
    it.subtotal = c * p;
  });
  const subtotal = ventaItems.reduce((s, it) => s + it.subtotal, 0);
  const desc = parseFloat((document.getElementById('vDescuento') as HTMLInputElement)?.value) || 0;
  const envio = parseFloat((document.getElementById('vEnvio') as HTMLInputElement)?.value) || 0;
  const total = subtotal - desc + envio;
  (document.getElementById('vSubtotal') as HTMLElement).textContent = fmt(subtotal);
  (document.getElementById('vTotal') as HTMLElement).textContent = fmt(total);
}

async function guardarVenta() {
  const clienteId = (document.getElementById('vCliente') as HTMLSelectElement).value;
  if (!clienteId) { await swalError('Seleccioná un cliente'); return; }
  if (!ventaItems.length) { await swalError('Agregá al menos un item'); return; }

  const cliente = store.clientes.find((c) => c.id === clienteId);
  const esMayorista = cliente?.esMayorista || false;
  const vendedorId = Sesion.esVendedor() ? Sesion.uid() : null;
  const vendedorNombre = Sesion.esVendedor() ? Sesion.user?.nombre || '' : '';

  const subtotal = ventaItems.reduce((s, it) => s + it.subtotal, 0);
  const descuento = parseFloat((document.getElementById('vDescuento') as HTMLInputElement)?.value) || 0;
  const envio = parseFloat((document.getElementById('vEnvio') as HTMLInputElement)?.value) || 0;
  const total = subtotal - descuento + envio;

  const venta: any = {
    id: genId(), fecha: Date.now(), clienteId, clienteNombre: cliente?.nombre || '',
    vendedorId, vendedorNombre, esMayorista,
    subtotal, descuento, envio, total, estado: 'pendiente', obs: (document.getElementById('vObs') as HTMLTextAreaElement).value.trim(),
    items: ventaItems.map((it) => ({
      productoId: it.productoId, presId: it.presId, comboId: it.comboId,
      nombre: it.nombre, detalle: it.detalle, cantidad: it.cantidad,
      precio: it.precio, precioAplicado: it.precioAplicado, precioMayorista: it.precioMayorista,
      costoUnitario: it.costoUnitario, litrosPorUnidad: it.litrosPorUnidad,
      subtotal: it.subtotal, esAcc: it.esAcc, esCombo: it.esCombo,
    })),
    pagos: [],
  };

  for (const it of venta.items) {
    const ok = await descontarStock(it.productoId || it.comboId || '', it.cantidad, it.esAcc);
    if (!ok) { await swalError(`Stock insuficiente para ${it.nombre}`); return; }
  }

  closeModal();
  await saveVenta(venta);
  swalSuccess('¡Venta registrada!', `Total: <strong>${fmt(total)}</strong>`);
  ventaItems = [];
}

export async function verVenta(id: string) {
  const v = store.ventas.find((x) => x.id === id);
  if (!v) return;
  const cl = store.clientes.find((c) => c.id === v.clienteId);
  openModal(`👁 Venta #${v.num || '?'}`, `<div style="display:flex;flex-direction:column;gap:8px;">
    <div class="m-card-row"><span class="m-card-row-label">Cliente</span><span class="m-card-row-value">${escapeHTML(cl?.nombre || v.clienteNombre || '—')}</span></div>
    <div class="m-card-row"><span class="m-card-row-label">Fecha</span><span class="m-card-row-value">${fmtDate(v.fecha)}</span></div>
    <div class="m-card-row"><span class="m-card-row-label">Estado</span><span class="m-card-row-value">${v.estado}</span></div>
    <div class="m-card-row"><span class="m-card-row-label">Total</span><span class="m-card-row-value">${fmt(v.total)}</span></div>
    <div style="margin-top:8px;border-top:1px solid var(--border);padding-top:8px;">${v.items.map((i) => `<div style="display:flex;justify-content:space-between;padding:4px 0;"><span>${escapeHTML(i.nombre)}${i.detalle && i.detalle !== 'Unidad' ? ' ' + i.detalle : ''} x${i.cantidad}</span><span>${fmt(i.subtotal)}</span></div>`).join('')}</div>
    <div style="font-weight:700;font-family:var(--font-display);font-size:18px;text-align:right;">Total: ${fmt(v.total)}</div>
  </div>`, null);
}

export function wspVenta(id: string) {
  const v = store.ventas.find((x) => x.id === id);
  if (!v) return;
  const cl = store.clientes.find((c) => c.id === v.clienteId);
  let msg = `*NURA — Detalle de venta*\n\n👤 ${cl?.nombre || v.clienteNombre || '—'}\n📅 ${fmtDate(v.fecha)}\n`;
  v.items.forEach((i) => { msg += `  • ${i.nombre}${i.detalle && i.detalle !== 'Unidad' ? ' ' + i.detalle : ''} x${i.cantidad} = ${fmt(i.subtotal)}\n`; });
  if (v.descuento) msg += `🔖 Desc: -${fmt(v.descuento)}\n`;
  msg += `\n💰 *Total: ${fmt(v.total)}*`;
  if (v.pagos?.length) { msg += `\nPagos: ${v.pagos.map((p) => `${fmt(p.monto)} (${p.medio})`).join(', ')}`; }
  if (cl?.telefono) window.open(waLink(msg, cl.telefono), '_blank');
}

export async function eliminarVenta(id: string) {
  const res = await swalConfirm('¿Eliminar venta?', 'Se restaurará el stock y no se puede deshacer.');
  if (!res.isConfirmed) return;
  const v = store.ventas.find((x) => x.id === id);
  if (v && v.items) {
    for (const it of v.items) {
      await reponerStock(it.productoId || it.comboId || '', it.cantidad, it.esAcc);
    }
  }
  await removeVenta(id);
  toast('Venta eliminada y stock restaurado');
}

export function resumenPendientesModal() {
  const pendientes = store.ventas.filter((v) => v.estado === 'pendiente');
  if (!pendientes.length) { swalInfo('Sin pendientes', 'No hay ventas pendientes.'); return; }
  openModal('📋 Ventas pendientes', `<div class="mobile-card-list">${pendientes.map((v) => `<div class="m-card"><div class="m-card-title">${escapeHTML(v.clienteNombre || '—')} · ${fmt(v.total)}</div><div class="m-card-subtitle">${fmtDate(v.fecha)}</div><div class="m-card-footer"><button class="btn btn-primary btn-sm" onclick="cambiarEstadoVenta('${v.id}', 'pagado')">✅ Marcar pagado</button><button class="btn btn-secondary btn-sm" onclick="verVenta('${v.id}')">👁</button></div></div>`).join('')}</div>`, null, true);
}

export function verPendientesCliente(key: string) { /* ... */ }
export function wspPendientesCliente(key: string) { /* ... */ }
export function estadoSelect(v: any) { /* ... */ }
export function cambiarEstadoVenta(id: string, estado: string) { /* ... */ }

registerRenderer('ventas', renderVentas);
exposeGlobal({
  formVenta, agregarItemVenta, agregarComboVenta, updateVentaTotals,
  guardarVenta, verVenta, wspVenta, eliminarVenta,
  resumenPendientesModal, verPendientesCliente, wspPendientesCliente,
  estadoSelect, cambiarEstadoVenta,
});