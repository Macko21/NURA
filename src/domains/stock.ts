import { store, ajustarStock } from '../lib/db';
import { Sesion } from '../lib/session';
import { escapeHTML, toast, swalError, swalSuccess, openModal, closeModal, unitInput, EMOJIS_CAT, registerRenderer, exposeGlobal } from '../lib/ui';
import { fmtL } from '../lib/format';
import type { Producto } from '../types';

export function renderStock() {
  const el = document.getElementById('page-stock');
  if (!el) return;
  const isAdmin = Sesion.esAdmin();
  document.getElementById('topbarActions')!.innerHTML = isAdmin
    ? `<button class="btn btn-primary" onclick="abrirAjusteStock()">⚖️ Ajustar Stock</button>`
    : '';

  const criticos = store.productos.filter((p) =>
    p.tipo === 'accesorio' ? (p.stockUnidades || 0) <= (p.stockMinUnidades || 0) : (p.stockLitros || 0) <= (p.stockMinLitros || 0),
  );

  const rows = store.productos.map((p) => {
    const esAcc = p.tipo === 'accesorio';
    const sv = esAcc ? p.stockUnidades || 0 : p.stockLitros || 0;
    const sm = esAcc ? p.stockMinUnidades || 0 : p.stockMinLitros || 0;
    const bajo = sv <= sm;
    const pct = Math.min(100, sm > 0 ? (sv / (sm * 3)) * 100 : 100);
    const nivel = sv > sm * 2 ? 'high' : sv > sm ? 'med' : 'low';
    const presStr = esAcc
      ? 'Unidad'
      : (p.presentaciones || []).map((pr) => {
          const mu = pr.litros > 0 ? Math.floor(sv / pr.litros) : 0;
          return `${pr.nombre}:~${mu}`;
        }).join(' | ') || 'Sin pres.';
    return {
      p, esAcc, sv, sm, bajo, pct, nivel,
      stockStr: esAcc ? `${sv} un` : `${fmtL(sv)} L`,
      stockMinStr: esAcc ? `${sm} un` : `${fmtL(sm)} L`,
      presStr,
    };
  });

  const tbl = `<div class="table-wrap hide-mobile"><table><thead><tr><th></th><th>Nombre</th><th>Categoría</th><th>Stock</th><th>Mínimo</th><th>Nivel</th><th>Unidades posibles</th></tr></thead><tbody>${
    rows.length === 0
      ? `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📦</div><p>Sin productos</p></div></td></tr>`
      : rows.map((r) => `<tr>
          <td style="font-size:20px;">${EMOJIS_CAT[r.p.categoria] || '🧴'}</td>
          <td><div class="fw-700">${escapeHTML(r.p.nombre)}</div>${r.p.codigo ? `<div class="text-muted">#${escapeHTML(r.p.codigo)}</div>` : ''}</td>
          <td>${escapeHTML(r.p.categoria)}</td>
          <td><strong>${r.stockStr}</strong></td>
          <td>${r.stockMinStr}</td>
          <td style="min-width:130px;"><div class="stock-bar-wrap"><div class="stock-bar"><div class="stock-bar-fill ${r.nivel}" style="width:${r.pct}%"></div></div><span class="stock-qty" style="color:${r.nivel === 'low' ? 'var(--danger)' : r.nivel === 'med' ? 'var(--warning)' : 'var(--accent-dark)'}">${r.nivel === 'low' ? '⚠️' : 'OK'}</span></div></td>
          <td style="font-size:11.5px;color:var(--text-muted);">${escapeHTML(r.presStr)}</td>
        </tr>`).join('')
  }</tbody></table></div>`;

  const cards = `<div class="mobile-card-list">${rows.map((r) => `
    <div class="m-card">
      <div class="m-card-header">
        <div>
          ${r.p.codigo ? `<div class="text-muted">#${escapeHTML(r.p.codigo)}</div>` : ''}
          <div class="m-card-title">${EMOJIS_CAT[r.p.categoria] || '🧴'} ${escapeHTML(r.p.nombre)}</div>
          <div class="m-card-subtitle">${escapeHTML(r.p.categoria)}</div>
        </div>
        <span class="badge badge-${!r.bajo ? 'green' : 'red'}">${r.stockStr}</span>
      </div>
      <div class="stock-bar-wrap mb-8"><div class="stock-bar" style="flex:1;"><div class="stock-bar-fill ${r.nivel}" style="width:${r.pct}%"></div></div><span class="stock-qty" style="color:${r.nivel === 'low' ? 'var(--danger)' : r.nivel === 'med' ? 'var(--warning)' : 'var(--accent-dark)'}">${r.nivel === 'low' ? '⚠️ Crítico' : 'OK'}</span></div>
      <div class="text-muted">${escapeHTML(r.presStr)}</div>
    </div>`).join('')}</div>`;

  el.innerHTML = `${
    criticos.length > 0
      ? `<div class="card mb-16" style="border-left:4px solid var(--danger);"><div class="section-title mb-8">⚠️ Stock crítico</div><div class="flex gap-8 flex-wrap">${criticos.map((p) => `<div style="background:rgba(244,63,94,0.08);border:1px solid rgba(244,63,94,0.2);border-radius:var(--radius-sm);padding:8px 12px;"><div class="fw-700" style="font-size:12px;">${escapeHTML(p.nombre)}</div><div style="font-size:11px;color:var(--danger);">${p.tipo === 'accesorio' ? (p.stockUnidades || 0) + ' un' : fmtL(p.stockLitros || 0) + ' L'}</div></div>`).join('')}</div></div>`
      : ''
  }<div class="card"><div class="section-header"><div class="section-title">Inventario completo</div></div>${rows.length === 0 ? `<div class="empty-state"><div class="empty-icon">📦</div><p>Sin productos</p></div>` : tbl + cards}</div>`;
}

interface AjusteItem {
  productoId: string;
  nombre: string;
  codigo: string;
  tipo: string;
  esAcc: boolean;
  stockActual: number;
  nuevoStock: number;
  nuevoMin: number;
}
let _ajusteItems: AjusteItem[] = [];

export function abrirAjusteStock() {
  if (!Sesion.esAdmin()) return;
  _ajusteItems = [];
  openModal(
    '⚖️ Ajuste de Stock múltiple',
    `<div class="form-group mb-12"><label>Buscar y agregar producto</label><div class="flex gap-8"><select id="ajProdSel" style="flex:1;"><option value="">Seleccioná...</option>${store.productos.map((p) => `<option value="${p.id}">${escapeHTML(p.nombre)}${p.codigo ? ' #' + escapeHTML(p.codigo) : ''} — ${p.tipo === 'accesorio' ? (p.stockUnidades || 0) + ' un' : fmtL(p.stockLitros || 0) + ' L'}</option>`).join('')}</select><button class="btn btn-primary" style="flex-shrink:0;" onclick="agregarAjusteItem()">+ Agregar</button></div></div><div id="ajusteListaWrap"><div class="empty-state" style="padding:20px;"><div class="empty-icon" style="font-size:28px;">⚖️</div><p>Agregá productos para ajustar</p></div></div>`,
    guardarAjusteStock,
  );
}

export function agregarAjusteItem() {
  const prodId = (document.getElementById('ajProdSel') as HTMLSelectElement).value;
  if (!prodId) { toast('Seleccioná un producto', 'info'); return; }
  if (_ajusteItems.find((x) => x.productoId === prodId)) { toast('Ya está en la lista', 'info'); return; }
  const p = store.productos.find((x) => x.id === prodId);
  if (!p) return;
  const esAcc = p.tipo === 'accesorio';
  _ajusteItems.push({
    productoId: prodId,
    nombre: p.nombre,
    codigo: p.codigo || '',
    tipo: p.tipo,
    esAcc,
    stockActual: esAcc ? p.stockUnidades || 0 : p.stockLitros || 0,
    nuevoStock: esAcc ? p.stockUnidades || 0 : p.stockLitros || 0,
    nuevoMin: esAcc ? p.stockMinUnidades || 0 : p.stockMinLitros || 0,
  });
  renderAjusteItems();
}

function renderAjusteItems() {
  const wrap = document.getElementById('ajusteListaWrap');
  if (!wrap) return;
  if (!_ajusteItems.length) {
    wrap.innerHTML = `<div class="empty-state" style="padding:20px;"><div class="empty-icon" style="font-size:28px;">⚖️</div><p>Agregá productos</p></div>`;
    return;
  }
  wrap.innerHTML = `<div style="border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden;">${_ajusteItems.map((item, i) => `<div style="padding:12px 14px;background:${i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)'};display:flex;align-items:center;gap:12px;flex-wrap:wrap;"><div style="flex:1;min-width:140px;"><div class="fw-700" style="font-size:13px;">${escapeHTML(item.nombre)}${item.codigo ? ` <span class="badge badge-gray">#${escapeHTML(item.codigo)}</span>` : ''}</div><div style="font-size:11px;color:var(--text-muted);">Actual: <strong>${item.esAcc ? item.stockActual + ' un' : fmtL(item.stockActual) + ' L'}</strong></div></div><div class="flex gap-8 flex-wrap" style="flex-shrink:0;"><div class="form-group" style="min-width:110px;"><label>Nuevo stock</label>${item.esAcc ? unitInput(`ajS${i}`, item.nuevoStock, 'un', '1', `_ajusteItems[${i}].nuevoStock=+this.value;`) : unitInput(`ajS${i}`, item.nuevoStock, 'L', '0.001', `_ajusteItems[${i}].nuevoStock=+this.value;`)}</div><div class="form-group" style="min-width:110px;"><label>Stock mín.</label>${item.esAcc ? unitInput(`ajM${i}`, item.nuevoMin, 'un', '1', `_ajusteItems[${i}].nuevoMin=+this.value;`) : unitInput(`ajM${i}`, item.nuevoMin, 'L', '0.001', `_ajusteItems[${i}].nuevoMin=+this.value;`)}</div><button class="btn btn-danger btn-sm btn-icon" style="align-self:flex-end;" onclick="_ajusteItems.splice(${i},1);renderAjusteItems()">✕</button></div></div>`).join('')}</div><div style="margin-top:8px;font-size:12px;color:var(--text-muted);">${_ajusteItems.length} producto(s) a ajustar.</div>`;
}

async function guardarAjusteStock() {
  if (!_ajusteItems.length) { await swalError('Agregá al menos un producto'); return; }
  const promises = _ajusteItems.map((item) => ajustarStock(item.productoId, item.nuevoStock, item.nuevoMin, item.esAcc));
  closeModal();
  await Promise.all(promises);
  swalSuccess('Stock actualizado', `Se actualizaron <strong>${_ajusteItems.length}</strong> producto(s).`);
  _ajusteItems = [];
}

registerRenderer('stock', renderStock);
exposeGlobal({ abrirAjusteStock, agregarAjusteItem, renderAjusteItems });
