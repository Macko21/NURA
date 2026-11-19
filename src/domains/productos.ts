import { getSettings, whatsappMessage } from '../lib/settings';
import { catalogPreference, saveCatalogPreference } from '../lib/appearance';
import { categoryArt } from '../lib/category-art';
import { navIcon } from '../lib/nav-icons';
import { store, removeProducto } from '../lib/db';
import { Sesion } from '../lib/session';
import { escapeHTML, toast, swalError, swalConfirm, openModal, registerRenderer, exposeGlobal } from '../lib/ui';
import { fmtL } from '../lib/format';
import { formProducto } from './producto-editor';
import { coincideBusqueda } from '../lib/search';
import { contactFooter, waLink } from '../config';
import { dinero } from './precios';
import type { Producto } from '../types';

let busqueda = '', categoria = '', vista = catalogPreference();
const ordenCatalogo: Record<string, string> = {
  nombre: 'Nombre A–Z', nombreDesc: 'Nombre Z–A', categoria: 'Categoría',
  precio: 'Menor precio', precioDesc: 'Mayor precio',
};
let orden = 'nombre';
try {
  const guardado = localStorage.getItem('nura.catalog.order');
  if (guardado && Object.hasOwn(ordenCatalogo, guardado)) orden = guardado;
} catch { /* Se conserva el orden por nombre. */ }
const presentaciones = (p: Producto) => p.tipo === 'accesorio'
  ? [{ nombre: 'Unidad', litros: 0, precioVenta: p.precioVenta, precioMayorista: p.precioMayorista }]
  : [...p.presentaciones].sort((a, b) => a.litros - b.litros);
const stock = (p: Producto) => p.tipo === 'accesorio' ? p.stockUnidades : p.stockLitros;
const minimo = (p: Producto) => p.tipo === 'accesorio' ? p.stockMinUnidades : p.stockMinLitros;

function compararProductos(a: Producto, b: Producto) {
  const porNombre = a.nombre.localeCompare(b.nombre, 'es');
  if (orden === 'nombreDesc') return -porNombre;
  if (orden === 'categoria') return a.categoria.localeCompare(b.categoria, 'es') || porNombre;
  if (orden === 'precio' || orden === 'precioDesc') {
    const primero = presentaciones(a);
    const segundo = presentaciones(b);
    if (!primero.length || !segundo.length) return segundo.length - primero.length || porNombre;
    const diferencia = Math.min(...primero.map((p) => p.precioVenta)) - Math.min(...segundo.map((p) => p.precioVenta));
    return (orden === 'precio' ? diferencia : -diferencia) || porNombre;
  }
  return porNombre;
}

export function renderCatalogo() {
  const el = document.querySelector('#page-catalogo');
  if (!el) return;
  document.querySelector('#topbarActions')!.innerHTML = `
    <button class="btn icon-action is-violet" type="button" title="Lista mayorista" aria-label="Lista mayorista" onclick="listaMayoristaModal()">${navIcon('wholesale')}</button>
    <button class="btn icon-action is-teal" type="button" title="Exportar catálogo" aria-label="Exportar catálogo" onclick="exportarCatalogo()">${navIcon('export')}</button>
    ${Sesion.esAdmin() ? `<button class="btn btn-primary btn-sm catalog-add" type="button" title="Nuevo artículo" aria-label="Nuevo artículo" onclick="formProducto(null)">${navIcon('add')}<span>Artículo</span></button>` : ''}`;
  const categorias = [...new Set(store.productos.map((p) => p.categoria).filter(Boolean))].sort();
  el.innerHTML = `<div class="catalog-toolbar">
    <input type="search" aria-label="Buscar artículos" id="catSearch" value="${escapeHTML(busqueda)}" placeholder="Buscar nombre, código o medida">
    <select aria-label="Filtrar categoría" id="catFiltro"><option value="">Todas las categorías</option>${categorias.map((c) =>
      `<option value="${escapeHTML(c)}" ${c === categoria ? 'selected' : ''}>${escapeHTML(c)}</option>`).join('')}</select>
    <select aria-label="Ordenar catálogo" id="catOrden">${Object.entries(ordenCatalogo).map(([valor, texto]) =>
      `<option value="${valor}" ${orden === valor ? 'selected' : ''}>${texto}</option>`).join('')}</select>
    <div class="catalog-views" role="group" aria-label="Vista del catálogo">
      <button class="btn icon-action" type="button" data-vista="lista" title="Vista de lista" aria-label="Vista de lista">${navIcon('list')}</button>
      <button class="btn icon-action" type="button" data-vista="tarjetas" title="Vista de tarjetas" aria-label="Vista de tarjetas">${navIcon('grid')}</button></div>
  </div><p class="catalog-count" aria-live="polite"></p><div id="catRes"></div>`;
  el.querySelector<HTMLInputElement>('#catSearch')!.oninput = (e) => { busqueda = (e.target as HTMLInputElement).value; actualizar(); };
  el.querySelector<HTMLSelectElement>('#catFiltro')!.onchange = (e) => { categoria = (e.target as HTMLSelectElement).value; actualizar(); };
  el.querySelector<HTMLSelectElement>('#catOrden')!.onchange = (e) => {
    orden = (e.target as HTMLSelectElement).value;
    try { localStorage.setItem('nura.catalog.order', orden); } catch { /* Se aplica durante la sesión. */ }
    actualizar();
  };
  el.querySelectorAll<HTMLButtonElement>('[data-vista]').forEach((b) => b.onclick = () => { vista = b.dataset.vista === 'tarjetas' ? 'tarjetas' : 'lista'; saveCatalogPreference(vista); actualizar(); });
  el.querySelector<HTMLElement>('#catRes')!.onclick = (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-id]');
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
      .sort(compararProductos);
    el!.querySelector('.catalog-count')!.textContent = `${prods.length} ${prods.length === 1 ? 'artículo' : 'artículos'}`;
    el!.querySelectorAll<HTMLButtonElement>('[data-vista]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.vista === vista));
    });
    el!.querySelector('#catRes')!.innerHTML = !prods.length ? '<p class="empty-state">No se encontraron artículos.</p>' :
      vista === 'lista' ? `<div class="table-wrap"><table><thead><tr><th>Artículo</th><th>Categoría</th><th>Precios</th><th>Stock</th><th class="actions-col">Acciones</th></tr></thead><tbody>${
        prods.map((p) => `<tr><td><div class="catalog-list-heading">${categoryArt(p.categoria)}${identidad(p)}</div></td><td>${escapeHTML(p.categoria || '—')}</td><td>${precios(p)}</td><td>${estado(p)}</td><td class="actions-col">${acciones(p)}</td></tr>`).join('')
      }</tbody></table></div>` : `<div class="product-grid catalog-grid">${prods.map((p) => `<article class="card catalog-card">
        <div class="catalog-card-heading">${categoryArt(p.categoria)}<div>${identidad(p)}<small class="catalog-category">${escapeHTML(p.categoria)}</small></div></div>${precios(p)}
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
  const boton = (accion: string, titulo: string, icono: string, tono: string) => `<button class="btn icon-action ${tono}" type="button"
    data-id="${escapeHTML(p.id)}" data-accion="${accion}" title="${titulo}" aria-label="${titulo}">${navIcon(icono)}</button>`;
  return `<div class="catalog-actions">${Sesion.esAdmin() ? boton('editar', 'Editar artículo', 'edit', 'is-violet') : ''}
    ${boton('compartir', 'Compartir por WhatsApp', 'share', 'is-teal')}${Sesion.esAdmin() ? boton('eliminar', 'Eliminar artículo', 'trash', 'is-danger') : ''}</div>`;
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

export function compartirLista(mayor: boolean) {
  const lista = filas(mayor).map((f) => `${f.nombre} · ${f.medida}: ${dinero.format(f.precio)}${f.agotado ? ' (sin stock)' : ''}`);
  if (!lista.length) { toast('No hay artículos para compartir', 'info'); return; }
  const detalle = [`*${getSettings().nombre} | ${mayor ? 'Lista mayorista' : 'Catálogo'}*`, ...lista, '', contactFooter()].join('\n');
  window.open(waLink(whatsappMessage('catalogo', detalle)), '_blank', 'noopener');
}

registerRenderer('catalogo', renderCatalogo);
exposeGlobal({ formProducto, descargarLista, compartirLista, wspCatalogoPDF: () => compartirLista(false),
  listaMayoristaModal: () => abrirLista(true), exportarCatalogo: () => abrirLista(false) });
