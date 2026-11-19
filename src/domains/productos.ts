import { store, removeProducto } from '../lib/db';
import { Sesion } from '../lib/session';
import { escapeHTML, toast, swalError, swalConfirm, openModal, registerRenderer, exposeGlobal } from '../lib/ui';
import { fmtL } from '../lib/format';
import { formProducto } from './producto-editor';
import { coincideBusqueda } from '../lib/search';
import { waLink } from '../config';
import { dinero } from './precios';
import type { Producto } from '../types';

let busqueda = '', categoria = '', vista = 'lista';
const presentaciones = (p: Producto) => p.tipo === 'accesorio'
  ? [{ nombre: 'Unidad', litros: 0, precioVenta: p.precioVenta, precioMayorista: p.precioMayorista }]
  : [...p.presentaciones].sort((a, b) => a.litros - b.litros);
const stock = (p: Producto) => p.tipo === 'accesorio' ? p.stockUnidades : p.stockLitros;
const minimo = (p: Producto) => p.tipo === 'accesorio' ? p.stockMinUnidades : p.stockMinLitros;

export function renderCatalogo() {
  const el = document.querySelector('#page-catalogo');
  if (!el) return;
  document.querySelector('#topbarActions')!.innerHTML = `
    <button class="btn btn-secondary btn-sm" onclick="listaMayoristaModal()">Mayorista</button>
    <button class="btn btn-secondary btn-sm" onclick="exportarCatalogo()">Exportar</button>
    ${Sesion.esAdmin() ? '<button class="btn btn-primary btn-sm" onclick="formProducto(null)">+ Artículo</button>' : ''}`;
  const categorias = [...new Set(store.productos.map((p) => p.categoria).filter(Boolean))].sort();
  el.innerHTML = `<div class="catalog-toolbar">
    <input type="search" aria-label="Buscar artículos" id="catSearch" value="${escapeHTML(busqueda)}" placeholder="Buscar nombre, código o medida">
    <select aria-label="Filtrar categoría" id="catFiltro"><option value="">Todas las categorías</option>${categorias.map((c) =>
      `<option value="${escapeHTML(c)}" ${c === categoria ? 'selected' : ''}>${escapeHTML(c)}</option>`).join('')}</select>
    <div class="catalog-views"><button class="btn btn-sm" data-vista="lista">Lista</button>
    <button class="btn btn-sm" data-vista="tarjetas">Tarjetas</button></div>
  </div><p class="catalog-count" aria-live="polite"></p><div id="catRes"></div>`;
  el.querySelector<HTMLInputElement>('#catSearch')!.oninput = (e) => { busqueda = (e.target as HTMLInputElement).value; actualizar(); };
  el.querySelector<HTMLSelectElement>('#catFiltro')!.onchange = (e) => { categoria = (e.target as HTMLSelectElement).value; actualizar(); };
  el.querySelectorAll<HTMLButtonElement>('[data-vista]').forEach((b) => b.onclick = () => { vista = b.dataset.vista!; actualizar(); });
  el.querySelector<HTMLElement>('#catRes')!.onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-id]');
    if (!b?.dataset.id) return;
    if (b.dataset.accion === 'editar') formProducto(b.dataset.id);
    if (b.dataset.accion === 'compartir') wspProducto(b.dataset.id);
    if (b.dataset.accion === 'eliminar') void eliminarProducto(b.dataset.id);
  };
  actualizar();

  function actualizar() {
    const prods = store.productos.filter((p) => (!categoria || p.categoria === categoria) &&
      coincideBusqueda(busqueda, p.nombre, p.codigo, p.categoria, p.descripcion, ...p.presentaciones.flatMap((pr) =>
        [pr.nombre, pr.nombre.replace(/\s/g, ''), pr.litros * 1000 + ' ml', pr.litros + ' L'])))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    el!.querySelector('.catalog-count')!.textContent = `${prods.length} ${prods.length === 1 ? 'artículo' : 'artículos'}`;
    el!.querySelectorAll<HTMLButtonElement>('[data-vista]').forEach((b) => {
      b.classList.toggle('btn-secondary', b.dataset.vista === vista);
      b.setAttribute('aria-pressed', String(b.dataset.vista === vista));
    });
    el!.querySelector('#catRes')!.innerHTML = !prods.length ? '<p class="empty-state">No se encontraron artículos.</p>' :
      vista === 'lista' ? `<div class="table-wrap"><table><thead><tr><th>Artículo</th><th>Categoría</th><th>Precios</th><th>Stock</th><th>Acciones</th></tr></thead><tbody>${
        prods.map((p) => `<tr><td>${identidad(p)}</td><td>${escapeHTML(p.categoria || '—')}</td><td>${precios(p)}</td><td>${estado(p)}</td><td>${acciones(p)}</td></tr>`).join('')
      }</tbody></table></div>` : `<div class="product-grid">${prods.map((p) => `<article class="card catalog-card">
        <div>${identidad(p)}<small>${escapeHTML(p.categoria)}</small></div>${precios(p)}
        <div class="catalog-card-footer">${estado(p)}${acciones(p)}</div></article>`).join('')}</div>`;
  }
}

function identidad(p: Producto) {
  return `<div class="catalog-identity"><strong>${escapeHTML(p.nombre)}</strong><small>${escapeHTML(p.codigo)}</small></div>`;
}
function precios(p: Producto) {
  return `<div class="catalog-prices">${presentaciones(p).map((pr) => `<span>${escapeHTML(pr.nombre)} <strong>${dinero.format(pr.precioVenta)}</strong></span>`).join('') || 'Sin presentaciones'}</div>`;
}
function estado(p: Producto) {
  const bajo = stock(p) <= minimo(p);
  return `<span class="badge badge-${bajo ? 'red' : 'gray'}">${p.tipo === 'accesorio' ? stock(p) + ' un.' : fmtL(stock(p)) + ' L'}${bajo ? ' · Bajo' : ''}</span>`;
}
function acciones(p: Producto) {
  const boton = (accion: string, titulo: string) => `<button class="btn btn-secondary btn-sm" type="button" data-id="${escapeHTML(p.id)}" data-accion="${accion}">${titulo}</button>`;
  return `<div class="catalog-actions">${Sesion.esAdmin() ? boton('editar', 'Editar') : ''}${boton('compartir', 'Compartir')}${Sesion.esAdmin() ? boton('eliminar', 'Eliminar') : ''}</div>`;
}

async function eliminarProducto(id: string) {
  if (!Sesion.esAdmin()) return;
  if (!(await swalConfirm('¿Eliminar artículo?', 'Se eliminará el artículo con sus presentaciones.')).isConfirmed) return;
  try { await removeProducto(id); toast('Artículo eliminado'); renderCatalogo(); }
  catch { await swalError('No se pudo eliminar el artículo.'); }
}

function wspProducto(id: string) {
  const p = store.productos.find((x) => x.id === id);
  if (!p) return;
  const lineas = presentaciones(p).map((pr) => `${pr.nombre}: ${dinero.format(pr.precioVenta)}`);
  window.open(waLink([`*${p.nombre}*`, ...lineas].join('\n')), '_blank', 'noopener');
}

function filas(mayor: boolean) {
  const productos = [...store.productos].sort((a, b) => a.categoria.localeCompare(b.categoria, 'es') || a.nombre.localeCompare(b.nombre, 'es'));
  return [
    ...productos.flatMap((p) => presentaciones(p).map((pr) => ({
      nombre: p.nombre, medida: pr.nombre, precio: mayor ? pr.precioMayorista || pr.precioVenta : pr.precioVenta,
      agotado: stock(p) <= 0 || stock(p) < pr.litros,
    }))),
    ...store.combos.map((c) => ({ nombre: c.nombre, medida: 'Combo', precio: mayor ? c.precioMayorista || c.precio : c.precio, agotado: false })),
  ];
}

function abrirLista(mayor: boolean) {
  openModal(mayor ? 'Lista mayorista' : 'Catálogo minorista', `<div class="catalog-actions mb-16">
    <button class="btn btn-primary" onclick="descargarLista(${mayor})">Descargar PDF</button>
    <button class="btn btn-secondary" onclick="compartirLista(${mayor})">Compartir por WhatsApp</button>
  </div><div class="table-wrap"><table><thead><tr><th>Artículo</th><th>Medida</th><th>Precio</th></tr></thead><tbody>${
    filas(mayor).map((f) => `<tr><td>${escapeHTML(f.nombre)}${f.agotado ? ' <span class="badge badge-red">Sin stock</span>' : ''}</td><td>${escapeHTML(f.medida)}</td><td>${dinero.format(f.precio)}</td></tr>`).join('')
    || '<tr><td colspan="3">Sin presentaciones</td></tr>'
  }</tbody></table></div>`, null, true);
}

async function descargarLista(mayor: boolean) {
  try {
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF();
    pdf.setFontSize(18);
    pdf.text(mayor ? 'NURA | Lista mayorista' : 'NURA | Catálogo minorista', 15, 18);
    pdf.setFontSize(10);
    let y = 29;
    for (const f of filas(mayor)) {
      const texto = pdf.splitTextToSize(`${f.nombre} · ${f.medida}${f.agotado ? ' (sin stock)' : ''}`, 139) as string[];
      if (y + texto.length * 5 > 280) { pdf.addPage(); y = 18; }
      pdf.text(texto, 15, y);
      pdf.text(dinero.format(f.precio).replace(/\s/g, ' '), 195, y, { align: 'right' });
      y += texto.length * 5 + 3;
    }
    pdf.save(mayor ? 'Nura-Mayorista.pdf' : 'Nura-Catalogo.pdf');
  } catch { await swalError('No se pudo generar el PDF.'); }
}

function compartirLista(mayor: boolean) {
  const lista = filas(mayor).map((f) => `${f.nombre} · ${f.medida}: ${dinero.format(f.precio)}${f.agotado ? ' (sin stock)' : ''}`);
  window.open(waLink([mayor ? '*NURA | Lista mayorista*' : '*NURA | Catálogo*', ...lista].join('\n')), '_blank', 'noopener');
}

registerRenderer('catalogo', renderCatalogo);
exposeGlobal({ formProducto, descargarLista, compartirLista, wspCatalogoPDF: () => compartirLista(false),
  listaMayoristaModal: () => abrirLista(true), exportarCatalogo: () => abrirLista(false) });
