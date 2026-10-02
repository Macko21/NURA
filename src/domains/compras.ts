import { store, saveCompra, removeCompra, reponerStock } from '../lib/db';
import { Sesion } from '../lib/session';
import { escapeHTML, toast, swalConfirm, swalError, swalSuccess, openModal, closeModal, moneyInput, unitInput, registerRenderer, exposeGlobal } from '../lib/ui';
import { fmt, fmtL, fmtDate } from '../lib/format';
import { genId } from '../lib/id';
import type { Compra, TipoProducto } from '../types';

export function renderCompras() {
  const el = document.getElementById('page-compras');
  if (!el) return;
  document.getElementById('topbarActions')!.innerHTML = `<button class="btn btn-primary" onclick="formCompra()">+ Compra</button>`;
  
  const compras = [...store.compras]
    .sort((a, b) => a.fecha - b.fecha)
    .map((c, i) => ({ ...c, num: i + 1 }))
    .sort((a, b) => b.fecha - a.fecha);

  const tbl = `<div class="table-wrap hide-mobile"><table><thead><tr>
    <th>Trans.</th><th>Fecha</th><th>Producto</th><th>Proveedor</th><th>Cantidad</th><th>Costo unit.</th><th>Total</th><th></th>
  </tr></thead><tbody>${
    compras.length === 0
      ? `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">🚚</div><p>Sin compras</p></div></td></tr>`
      : compras.map((c) => `<tr>
          <td><span class="badge badge-green">#${c.num}</span></td>
          <td>${fmtDate(c.fecha)}</td>
          <td class="fw-700">${escapeHTML(c.productoNombre)}</td>
          <td>${escapeHTML(c.proveedor || '—')}</td>
          <td>${c.tipo === 'accesorio' ? c.cantidad + ' un' : fmtL(c.cantidad) + ' L'}</td>
          <td>${fmt(c.precioUnit)}/${c.tipo === 'accesorio' ? 'un' : 'L'}</td>
          <td class="fw-700">${fmt(c.total)}</td>
          <td><button class="btn btn-danger btn-sm btn-icon" onclick="eliminarCompra('${c.id}')">🗑</button></td>
        </tr>`).join('')
  }</tbody></table></div>`;

  const cards = `<div class="mobile-card-list">${compras.map((c) => `
    <div class="m-card">
      <div class="m-card-header">
        <div>
          <div class="m-card-title"><span class="badge badge-green" style="margin-right:6px;">#${c.num}</span> ${escapeHTML(c.productoNombre)}</div>
          <div class="m-card-subtitle">${fmtDate(c.fecha)}${c.proveedor ? ' · ' + escapeHTML(c.proveedor) : ''}</div>
        </div>
        <span class="fw-700 text-gradient" style="font-family:var(--font-display);font-size:18px;">${fmt(c.total)}</span>
      </div>
      <div class="m-card-body">
        <div class="m-card-row"><span class="m-card-row-label">Cantidad</span><span class="m-card-row-value">${c.tipo === 'accesorio' ? c.cantidad + ' un' : fmtL(c.cantidad) + ' L'}</span></div>
        <div class="m-card-row"><span class="m-card-row-label">Costo/unit.</span><span class="m-card-row-value">${fmt(c.precioUnit)}</span></div>
      </div>
      <div class="m-card-footer">
        <button class="btn btn-danger btn-sm" onclick="eliminarCompra('${c.id}')">🗑 Eliminar</button>
      </div>
    </div>`).join('')}</div>`;

  el.innerHTML = compras.length === 0 ? `<div class="empty-state"><div class="empty-icon">🚚</div><p>No hay compras registradas</p></div>` : tbl + cards;
}

export function formCompra() {
  openModal('Nueva Compra', `<div class="form-grid">
    <div class="form-group full"><label>Producto</label><select id="cpProducto" onchange="onCpProdChange()"><option value="">Seleccioná...</option>${store.productos.map((p) => `<option value="${p.id}">${escapeHTML(p.nombre)} (${p.tipo === 'accesorio' ? 'accesorio' : 'líquido'})${p.codigo ? ' #' + escapeHTML(p.codigo) : ''}</option>`).join('')}</select></div>
    <div class="form-group"><label>Proveedor</label><input id="cpProveedor" placeholder="Nombre del proveedor" /></div>
    <div class="form-group"><label>Fecha</label><input id="cpFecha" type="date" value="${new Date().toISOString().slice(0, 10)}" /></div>
    <div class="form-group"><label id="cpCantLabel">Cantidad (L)</label>${unitInput('cpCantidad', '1', 'L', '0.001', 'calcCompra()')}</div>
    <div class="form-group"><label id="cpPrecioLabel">Precio por L ($)</label>${moneyInput('cpPrecioUnit', '', 'calcCompra()')}</div>
    <div class="cost-calc-box"><h4>Total</h4><div class="cost-row total"><span>Total</span><span id="cpTotal">$ 0</span></div></div>
    <div class="form-group full"><label>Notas</label><textarea id="cpNotas" rows="2"></textarea></div>
  </div>`, guardarCompra);
}

export function calcCompra() {
  const c = parseFloat((document.getElementById('cpCantidad') as HTMLInputElement)?.value) || 0;
  const p = parseFloat((document.getElementById('cpPrecioUnit') as HTMLInputElement)?.value) || 0;
  const t = document.getElementById('cpTotal');
  if (t) t.textContent = fmt(c * p);
}

export function onCpProdChange() {
  const p = store.productos.find((x) => x.id === (document.getElementById('cpProducto') as HTMLSelectElement).value);
  if (!p) return;
  const esAcc = p.tipo === 'accesorio';
  const cantLbl = document.getElementById('cpCantLabel');
  const precLbl = document.getElementById('cpPrecioLabel');
  if (cantLbl) cantLbl.textContent = esAcc ? 'Cantidad (un)' : 'Cantidad (L)';
  if (precLbl) precLbl.textContent = esAcc ? 'Precio por unidad ($)' : 'Precio por litro ($)';
  const inp = document.getElementById('cpCantidad') as HTMLInputElement;
  const suf = inp?.closest('.input-unit-wrap')?.querySelector('.unit-label');
  if (suf) suf.textContent = esAcc ? 'un' : 'L';
  if (inp) inp.step = esAcc ? '1' : '0.001';
  calcCompra();
}

async function guardarCompra() {
  const prodId = (document.getElementById('cpProducto') as HTMLSelectElement).value;
  if (!prodId) { await swalError('Seleccioná un producto'); return; }
  const p = store.productos.find((x) => x.id === prodId);
  const cant = parseFloat((document.getElementById('cpCantidad') as HTMLInputElement).value) || 0;
  const pu = parseFloat((document.getElementById('cpPrecioUnit') as HTMLInputElement).value) || 0;
  if (!cant || !pu || !p) { await swalError('Completá cantidad y precio'); return; }

  const esAcc = p.tipo === 'accesorio';
  const compra: Compra = {
    id: genId(),
    fecha: new Date((document.getElementById('cpFecha') as HTMLInputElement).value).getTime() || Date.now(),
    productoId: prodId,
    productoNombre: p.nombre,
    tipo: p.tipo as TipoProducto,
    proveedor: (document.getElementById('cpProveedor') as HTMLInputElement).value.trim(),
    cantidad: cant,
    precioUnit: pu,
    total: cant * pu,
    notas: (document.getElementById('cpNotas') as HTMLTextAreaElement).value.trim(),
  };

  closeModal();
  await Promise.all([
    reponerStock(prodId, cant, esAcc),
    saveCompra(compra),
  ]);
  swalSuccess('¡Compra registrada!', `Stock de <strong>${escapeHTML(p.nombre)}</strong> actualizado.`);
}

export async function eliminarCompra(id: string) {
  const res = await swalConfirm('¿Eliminar compra?', 'No se puede deshacer.');
  if (!res.isConfirmed) return;
  await removeCompra(id);
  toast('Compra eliminada');
}

registerRenderer('compras', renderCompras);
exposeGlobal({ formCompra, calcCompra, onCpProdChange, eliminarCompra });
