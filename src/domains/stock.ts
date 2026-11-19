import { store, ajustarStock } from '../lib/db';
import { Sesion } from '../lib/session';
import { escapeHTML, toast, openModal, closeModal, unitInput, EMOJIS_CAT, registerRenderer, exposeGlobal } from '../lib/ui';
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
  minActual: number;
  nuevoStock: number;
  nuevoMin: number;
}
let ajusteItems: AjusteItem[] = [];
let guardandoAjuste = false;

export function abrirAjusteStock() {
  if (!Sesion.esAdmin() || guardandoAjuste) return;
  ajusteItems = [];
  openModal(
    '⚖️ Ajuste de Stock múltiple',
    `<div class="form-group mb-12"><label>Buscar y agregar producto</label><div class="flex gap-8"><select id="ajProdSel" data-buscar="Buscar artículo" style="flex:1;"><option value="">Seleccioná...</option>${store.productos.map((p) => `<option value="${p.id}">${escapeHTML(p.nombre)}${p.codigo ? ' #' + escapeHTML(p.codigo) : ''} — ${p.tipo === 'accesorio' ? (p.stockUnidades || 0) + ' un' : fmtL(p.stockLitros || 0) + ' L'}</option>`).join('')}</select><button class="btn btn-primary" style="flex-shrink:0;" onclick="agregarAjusteItem()">+ Agregar</button></div></div><div id="ajusteListaWrap"><div class="empty-state" style="padding:20px;"><div class="empty-icon" style="font-size:28px;">⚖️</div><p>Agregá productos para ajustar</p></div></div>`,
    guardarAjusteStock,
  );
}

export function agregarAjusteItem() {
  if (guardandoAjuste) return;
  const prodId = (document.getElementById('ajProdSel') as HTMLSelectElement).value;
  if (!prodId) { toast('Seleccioná un producto', 'info'); return; }
  if (ajusteItems.find((x) => x.productoId === prodId)) { toast('Ya está en la lista', 'info'); return; }
  const p = store.productos.find((x) => x.id === prodId);
  if (!p) return;
  const esAcc = p.tipo === 'accesorio';
  ajusteItems.push({
    productoId: prodId,
    nombre: p.nombre,
    codigo: p.codigo || '',
    tipo: p.tipo,
    esAcc,
    stockActual: esAcc ? p.stockUnidades || 0 : p.stockLitros || 0,
    nuevoStock: esAcc ? p.stockUnidades || 0 : p.stockLitros || 0,
    minActual: esAcc ? p.stockMinUnidades || 0 : p.stockMinLitros || 0,
    nuevoMin: esAcc ? p.stockMinUnidades || 0 : p.stockMinLitros || 0,
  });
  renderAjusteItems();
}

function renderAjusteItems() {
  const wrap = document.getElementById('ajusteListaWrap');
  if (!wrap) return;
  if (!ajusteItems.length) {
    wrap.innerHTML = `<div class="empty-state" style="padding:20px;"><div class="empty-icon" style="font-size:28px;">⚖️</div><p>Agregá productos</p></div>`;
    return;
  }
  wrap.innerHTML = `<div style="border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden;">${ajusteItems.map((item, i) => `<div style="padding:12px 14px;background:${i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)'};display:flex;align-items:center;gap:12px;flex-wrap:wrap;"><div style="flex:1;min-width:140px;"><div class="fw-700" style="font-size:13px;">${escapeHTML(item.nombre)}${item.codigo ? ` <span class="badge badge-gray">#${escapeHTML(item.codigo)}</span>` : ''}</div><div style="font-size:11px;color:var(--text-muted);">Actual: <strong>${item.esAcc ? item.stockActual + ' un' : fmtL(item.stockActual) + ' L'}</strong></div></div><div class="flex gap-8 flex-wrap" style="flex-shrink:0;"><div class="form-group" style="min-width:110px;"><label>Nuevo stock</label>${item.esAcc ? unitInput(`ajS${i}`, Number.isFinite(item.nuevoStock) ? item.nuevoStock : '', 'un', '1') : unitInput(`ajS${i}`, Number.isFinite(item.nuevoStock) ? item.nuevoStock : '', 'L', '0.001')}</div><div class="form-group" style="min-width:110px;"><label>Stock mín.</label>${item.esAcc ? unitInput(`ajM${i}`, Number.isFinite(item.nuevoMin) ? item.nuevoMin : '', 'un', '1') : unitInput(`ajM${i}`, Number.isFinite(item.nuevoMin) ? item.nuevoMin : '', 'L', '0.001')}</div><button class="btn btn-danger btn-sm btn-icon" style="align-self:flex-end;" type="button" data-quitar-ajuste="${i}" aria-label="Quitar producto" title="Quitar producto">✕</button></div></div>`).join('')}</div><div style="margin-top:8px;font-size:12px;color:var(--text-muted);">${ajusteItems.length} producto(s) a ajustar.</div>`;
  ajusteItems.forEach((item, i) => {
    const stock = document.getElementById(`ajS${i}`) as HTMLInputElement;
    const minimo = document.getElementById(`ajM${i}`) as HTMLInputElement;
    stock.oninput = () => { item.nuevoStock = stock.valueAsNumber; };
    minimo.oninput = () => { item.nuevoMin = minimo.valueAsNumber; };
  });
  wrap.querySelectorAll<HTMLButtonElement>('[data-quitar-ajuste]').forEach((button) => {
    button.onclick = () => {
      if (guardandoAjuste) return;
      ajusteItems.splice(Number(button.dataset.quitarAjuste), 1);
      renderAjusteItems();
    };
  });
}

async function guardarAjusteStock() {
  if (guardandoAjuste) return;
  if (!ajusteItems.length) { toast('Agregá al menos un producto', 'error'); return; }
  const invalido = ajusteItems.find((item) => [item.nuevoStock, item.nuevoMin].some((valor) =>
    !Number.isFinite(valor) || valor < 0 || (item.esAcc && !Number.isInteger(valor))));
  if (invalido) { toast(`Revisá las cantidades de ${invalido.nombre}`, 'error'); return; }
  guardandoAjuste = true;
  const guardar = document.querySelector<HTMLButtonElement>('#btnModalSave');
  if (guardar) guardar.disabled = true;
  const pendientes: AjusteItem[] = [];
  let detalleError = '';
  const cambios = ajusteItems.filter((item) => item.nuevoStock !== item.stockActual || item.nuevoMin !== item.minActual);

  try {
    for (const item of cambios) {
      try {
        await ajustarStock(item.productoId, item.nuevoStock, item.nuevoMin, item.stockActual, item.minActual, item.esAcc);
      } catch (err) {
        pendientes.push(item);
        detalleError = err instanceof Error ? err.message : 'No se pudo guardar el ajuste';
      }
    }
    ajusteItems = pendientes;
    if (document.getElementById('page-stock')?.classList.contains('active')) renderStock();
    if (!pendientes.length) {
      closeModal();
      toast(cambios.length ? `Stock actualizado: ${cambios.length} producto(s)` : 'No hubo cambios de stock', cambios.length ? 'success' : 'info');
    } else {
      renderAjusteItems();
      const confirmados = cambios.length - pendientes.length;
      const guardados = confirmados ? `Se guardaron ${confirmados}. ` : '';
      toast(`${guardados}Pendiente: ${pendientes[0].nombre}${pendientes.length > 1 ? ` y ${pendientes.length - 1} más` : ''}. ${detalleError}`, 'error');
    }
  } finally {
    guardandoAjuste = false;
    if (guardar) guardar.disabled = false;
  }
}

registerRenderer('stock', renderStock);
exposeGlobal({ abrirAjusteStock, agregarAjusteItem });
