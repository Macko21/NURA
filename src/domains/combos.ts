import { store, saveCombo, removeCombo } from '../lib/db';
import { Sesion } from '../lib/session';
import { escapeHTML, fmt, toast, swalConfirm, swalError, swalSuccess, openModal, closeModal, moneyInput, unitInput, registerRenderer, exposeGlobal } from '../lib/ui';
import { buildVendibles } from './ventas';
import { genId } from '../lib/id';
import html2canvas from 'html2canvas';
import { waLink } from '../config';
import type { Combo, ComboItem, Producto, Presentacion } from '../types';

export function renderCombos() {
  const el = document.getElementById('page-combos');
  if (!el) return;

  const combos = store.combos.filter((c) => Sesion.esAdmin() || c.vendedorId === Sesion.uid());

  document.getElementById('topbarActions')!.innerHTML = Sesion.esAdmin()
    ? `<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
         <button class="btn btn-primary" onclick="formCombo(null)">+ Combo</button>
         <button class="btn btn-secondary" onclick="imprimirCombos(false)">📄 Actual</button>
         <button class="btn btn-wsp-sm" onclick="imagenCombosWsp(false)">📲 Actual</button>
         <button class="btn btn-secondary" onclick="imprimirCombos(true)">📄 Mayorista</button>
         <button class="btn btn-wsp-sm" onclick="imagenCombosWsp(true)">📲 Mayorista</button>
       </div>`
    : `<button class="btn btn-primary" onclick="formCombo(null)">+ Combo</button>`;

  if (!combos.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🎁</div><p>No hay combos creados aún</p><button class="btn btn-primary mt-8" onclick="formCombo(null)">Crear primer combo</button></div>`;
    return;
  }

  const cards = combos.map((c) => {
    const itemsList = (c.items || [])
      .map((i) => `<span class="badge badge-violet" style="margin:2px;">${escapeHTML(i.nombre)} x${i.cantidad}</span>`)
      .join('');
    return `<div class="m-card" style="border-left:4px solid var(--accent);">
      <div class="m-card-header">
        <div>
          <div class="m-card-title">🎁 ${escapeHTML(c.nombre)}</div>
          ${c.descripcion ? `<div class="m-card-subtitle">${escapeHTML(c.descripcion)}</div>` : ''}
        </div>
        <div style="text-align:right;">
          <div style="font-family:var(--font-display);font-size:22px;font-weight:800;" class="text-gradient">${fmt(c.precio)}</div>
          ${c.precioMayorista ? `<div style="font-size:12px;color:var(--accent-dark);">Mayor: ${fmt(c.precioMayorista)}</div>` : ''}
        </div>
      </div>
      <div style="margin:8px 0; flex-wrap:wrap; display:flex; gap:4px;">${itemsList}</div>
      <div class="m-card-footer">
        <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="formCombo('${c.id}')">✏️ Editar</button>
        <button class="btn btn-wsp-sm btn-sm" style="flex:1;" onclick="wspCombo('${c.id}')">📲 WhatsApp</button>
        <button class="btn btn-danger btn-sm btn-icon" onclick="eliminarCombo('${c.id}')">🗑</button>
      </div>
    </div>`;
  }).join('');

  el.innerHTML = `<div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:16px;">${cards}</div>`;
}

let _comboItems: any[] = [];
let _comboEditId: string | null = null;

export function formCombo(id: string | null) {
  const c = id ? store.combos.find((x) => x.id === id) ?? null : null;
  _comboItems = c ? c.items.map((x) => ({ ...x })) : [];
  _comboEditId = id;

  const vendibles = buildVendibles();
  const esVendedor = Sesion.esVendedor();
  const precioMayHTML = esVendedor
    ? `<div style="padding:10px 12px;background:var(--surface2);border-radius:var(--radius-sm);border:1px solid var(--border);"><span id="cbCostoMay" style="font-weight:700;color:var(--accent-dark);">${fmt(c ? c.precioMayorista || 0 : 0)}</span></div>`
    : moneyInput('cbPrecioMay', c ? c.precioMayorista || '' : '');

  const html = `<div style="display:flex;flex-direction:column;gap:14px;">
    <div class="form-grid">
      <div class="form-group full"><label>Nombre del combo</label><input id="cbNombre" value="${c ? escapeHTML(c.nombre) : ''}" placeholder="Ej: Kit Baño Completo" /></div>
      <div class="form-group full"><label>Descripción (opcional)</label><input id="cbDesc" value="${c ? escapeHTML(c.descripcion || '') : ''}" /></div>
      <div class="form-group full"><label>Precio de lista</label>${moneyInput('cbPrecio', c ? c.precio || '' : '')}</div>
      <div class="form-group"><label>Precio mayorista</label>${precioMayHTML}</div>
    </div>
    <div class="form-group full"><label>Items del combo</label>
      <div class="flex gap-8 mb-8"><select id="cbItemSel" style="flex:1;"><option value="">Seleccioná producto...</option>${buildVendibles().filter((v) => !v.esCombo).map((v) => `<option value="${v.id}">${escapeHTML(v.nombre)} ${v.detalle ? ' — ' + escapeHTML(v.detalle) : ''} — ${fmt(v.precio)}</option>`).join('')}</select><button class="btn btn-primary" style="flex-shrink:0;" onclick="agregarComboItem()">+ Agregar</button></div>
      <div id="comboItemsWrap">${renderComboItems()}</div>
    </div>`;

  openModal(c ? 'Editar Combo' : 'Nuevo Combo', html, guardarCombo, true);
}

function renderComboItems(): string {
  if (!_comboItems.length) {
    return `<div class="empty-state" style="padding:16px;"><p>Sin items</p></div>`;
  }
  return _comboItems.map((item, i) => `<div style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px;margin-bottom:8px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
    <div class="flex-1"><div class="fw-700" style="font-size:13px;">${escapeHTML(item.nombre)}</div></div>
    <div class="flex gap-8 flex-wrap">
      <div class="form-group" style="min-width:80px;"><label>Cant.</label>${unitInput(`ciCant${i}`, String(item.cantidad), 'un', '1', `setComboItemCant(${i}, this.value)`)}</div>
      <button class="btn btn-danger btn-sm btn-icon" onclick="eliminarComboItem(${i})">✕</button>
    </div></div>`).join('');
}

export function setComboItemCant(i: number, val: string) {
  if (_comboItems[i]) _comboItems[i].cantidad = parseFloat(val) || 1;
}

export function eliminarComboItem(i: number) {
  _comboItems.splice(i, 1);
  const wrap = document.getElementById('comboItemsWrap');
  if (wrap) wrap.innerHTML = renderComboItems();
}

export function agregarComboItem() {
  const prodId = (document.getElementById('cbItemSel') as HTMLSelectElement).value;
  if (!prodId) { toast('Seleccioná un producto', 'info'); return; }
  if (_comboItems.find((x) => x.id === prodId)) { toast('Ya está en el combo', 'info'); return; }
  const v = buildVendibles().find((x) => x.id === prodId);
  if (!v) return;
  _comboItems.push({ id: v.id, nombre: v.nombre, detalle: v.detalle, cantidad: 1, precio: v.precio, precioMayorista: v.precioMayorista, productoId: v.productoId, presId: v.presId, litrosPorUnidad: v.litrosPorUnidad, esAcc: v.esAcc, esCombo: false });
  const wrap = document.getElementById('comboItemsWrap');
  if (wrap) wrap.innerHTML = renderComboItems();
}

async function guardarCombo() {
  const nombre = (document.getElementById('cbNombre') as HTMLInputElement).value.trim();
  if (!nombre) { await swalError('El nombre es obligatorio'); return; }
  if (!_comboItems.length) { await swalError('Agregá al menos un producto al combo'); return; }
  const c = _comboEditId ? store.combos.find((x) => x.id === _comboEditId) ?? null : null;
  const esVendedor = Sesion.esVendedor();
  const precio = parseFloat((document.getElementById('cbPrecio') as HTMLInputElement).value) || 0;
  if (!precio) { await swalError('Ingresá el precio del combo'); return; }
  const costoMayorista = _comboItems.reduce((s, i) => s + ((i.precioMayorista || i.precio) || 0) * (i.cantidad || 1), 0);
  if (esVendedor && precio < costoMayorista) {
    await swalError(`El precio no puede ser menor que el costo del combo (${fmt(costoMayorista)})`);
    return;
  }
  const combo: any = {
    id: c ? c.id : genId(),
    nombre,
    descripcion: (document.getElementById('cbDesc') as HTMLInputElement).value.trim(),
    precio,
    precioMayorista: esVendedor ? costoMayorista : parseFloat((document.getElementById('cbPrecioMay') as HTMLInputElement).value) || 0,
    vendedorId: esVendedor ? Sesion.uid() : null,
    items: _comboItems.map((x) => ({ ...x })),
  };
  closeModal();
  await saveCombo(combo);
  swalSuccess('¡Combo guardado!', c ? 'Combo actualizado' : 'Combo creado');
}

async function eliminarCombo(id: string) {
  const res = await swalConfirm('¿Eliminar combo?', 'No se puede deshacer.');
  if (!res.isConfirmed) return;
  await removeCombo(id);
  toast('Combo eliminado');
}

export function wspCombo(id: string) {
  const c = store.combos.find((x) => x.id === id);
  if (!c) return;
  let msg = `*🎁 ${escapeHTML(c.nombre)}*\n`;
  if (c.descripcion) msg += `${escapeHTML(c.descripcion)}\n`;
  (c.items || []).forEach((i) => { msg += `  • ${escapeHTML(i.nombre)} x${i.cantidad}\n`; });
  msg += `\nPrecio: ${fmt(c.precio)}`;
  if (c.precioMayorista) msg += ` / Mayor: ${fmt(c.precioMayorista)}`;
  msg += `\n\n${waLink('', '2262240512')}`;
  window.open(waLink(msg), '_blank');
}

function imprimirCombos(esMayorista = false) {
  const html = store.combos.map((c) => `<div style="page-break-inside:avoid;margin-bottom:16px;padding:16px;border:1px solid #ddd;border-radius:8px;"><h3>${escapeHTML(c.nombre)}</h3>${c.descripcion ? `<p>${escapeHTML(c.descripcion)}</p>` : ''}<ul>${(c.items || []).map((i) => `<li>${escapeHTML(i.nombre)} x${i.cantidad}</li>`).join('')}</ul><p style="font-weight:700;font-size:18px;">Precio: ${fmt(esMayorista ? (c.precioMayorista || c.precio) : c.precio)}</p></div>`).join('');
  const win = window.open('', '_blank');
  if (win) win.document.write(`<!DOCTYPE html><html><head><title>Combos ${esMayorista ? 'Mayorista' : 'Actual'}</title><style>body{font-family:sans-serif;padding:20px;}@media print{.no-print{display:none;}}</style></head><body><h1>NURA — Combos ${esMayorista ? 'Mayorista' : 'Actual'}</h1>${html}<div class="no-print" style="margin-top:20px;"><button onclick="window.print()">🖨 Imprimir</button></div></body></html>`);
}

function imagenCombosWsp(esMayorista = false) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:sans-serif;background:#fff;padding:20px;color:#000;}h3{margin:8px 0;}ul{margin:4px 0;padding-left:18px;}.card{border:1px solid #ddd;border-radius:8px;padding:16px;margin-bottom:16px;page-break-inside:avoid;}</style></head><body>${store.combos.map((c) => `<div class="card"><h3>${escapeHTML(c.nombre)}</h3>${c.descripcion ? `<p>${escapeHTML(c.descripcion)}</p>` : ''}<ul>${(c.items || []).map((i) => `<li>${escapeHTML(i.nombre)} x${i.cantidad}</li>`).join('')}</ul><p style="font-weight:700;font-size:18px;">Precio: ${fmt(esMayorista ? (c.precioMayorista || c.precio) : c.precio)}</p></div>`).join('')}</body></html>`;
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  setTimeout(() => {
    html2canvas(win.document.body).then((canvas) => {
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          win.document.body.innerHTML += `<a href="${url}" download="combos-${esMayorista ? 'mayorista' : 'actual'}.png" style="display:block;margin:20px auto;padding:10px 20px;background:#1ab8af;color:#fff;border-radius:8px;text-align:center;text-decoration:none;font-weight:700;">📥 Descargar imagen</a>`;
        }
      }, 'image/png');
    });
  }, 500);
}

registerRenderer('combos', renderCombos);
exposeGlobal({ formCombo, agregarComboItem, setComboItemCant, eliminarComboItem, wspCombo, imprimirCombos, imagenCombosWsp, eliminarCombo });