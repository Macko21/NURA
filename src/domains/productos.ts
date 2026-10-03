import { store, saveProducto, removeProducto, descontarStock, reponerStock } from '../lib/db';
import { Sesion } from '../lib/session';
import { escapeHTML, toast, swalError, swalConfirm, swalSuccess, openModal, closeModal, moneyInput, unitInput, EMOJIS_CAT, PRES_RAPIDAS, CATEGORIAS, registerRenderer, exposeGlobal, fmt } from '../lib/ui';
import { fmtL } from '../lib/format';
import { genId } from '../lib/id';
import { waLink } from '../config';
import { wspReporte } from './reportes';
import type { Producto } from '../types';

let catalogoSearch = '', catalogoFiltro = '', catalogoView = 'grid';

export function renderCatalogo() {
  const el = document.getElementById('page-catalogo');
  if (!el) return;
  document.getElementById('topbarActions')!.innerHTML = Sesion.esAdmin()
    ? `<button class="btn btn-outline btn-sm" onclick="listaMayoristaModal()">🏪 Mayorista</button>
       <button class="btn btn-outline btn-sm" onclick="exportarCatalogo()">📄 Exportar</button>
       <button class="btn btn-primary" onclick="formProducto(null)">+ Producto</button>`
    : `<button class="btn btn-outline btn-sm" onclick="listaMayoristaModal()">🏪 Mayorista</button>`;

  el.innerHTML = `
    <div class="flex flex-center gap-8 mb-16 flex-wrap">
      <div class="search-bar" style="max-width:100%;"><span class="search-icon">🔍</span><input type="text" placeholder="Buscar nombre, código..." id="catSearch" value="${escapeHTML(catalogoSearch)}" /></div>
      <select id="catFiltro" style="max-width:180px;"><option value="">Todas</option>${CATEGORIAS.map((c) => `<option value="${c}" ${catalogoFiltro === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
      <div class="flex gap-6" style="margin-left:auto;">
        <button class="btn btn-${catalogoView === 'grid' ? 'primary' : 'secondary'} btn-sm" onclick="setCatalogoView('grid')">⊞</button>
        <button class="btn btn-${catalogoView === 'list' ? 'primary' : 'secondary'} btn-sm" onclick="setCatalogoView('list')">☰</button>
      </div>
    </div>
    <div id="catRes">${catHTML()}</div>`;

  document.getElementById('catSearch')!.oninput = (e) => { catalogoSearch = (e.target as HTMLInputElement).value; refreshCat(); };
  document.getElementById('catFiltro')!.onchange = (e) => { catalogoFiltro = (e.target as HTMLSelectElement).value; refreshCat(); };
}

function refreshCat() { const r = document.getElementById('catRes'); if (r) r.innerHTML = catHTML(); }

export function setCatalogoView(v: string) { catalogoView = v; refreshCat(); }

function filtrarProds() {
  return store.productos.filter((p) =>
    (!catalogoSearch || p.nombre.toLowerCase().includes(catalogoSearch.toLowerCase()) || (p.codigo || '').toLowerCase().includes(catalogoSearch.toLowerCase()) || p.categoria.toLowerCase().includes(catalogoSearch.toLowerCase())) &&
    (!catalogoFiltro || p.categoria === catalogoFiltro)
  );
}

function catHTML() { return catalogoView === 'grid' ? catGrid(filtrarProds()) : catList(filtrarProds()); }

function catGrid(prods: Producto[]) {
  if (!prods.length) return `<div class="empty-state"><div class="empty-icon">📦</div><p>No hay productos. ¡Agregá el primero!</p></div>`;
  return `<div class="product-grid">${prods.map((p) => {
    const esAcc = p.tipo === 'accesorio';
    const sv = esAcc ? (p.stockUnidades || 0) : (p.stockLitros || 0);
    const sm = esAcc ? (p.stockMinUnidades || 0) : (p.stockMinLitros || 0);
    const bajo = sv <= sm;
    const pres = !esAcc ? (p.presentaciones || []) : [];
    const pMin = esAcc ? p.precioVenta : (pres.length ? Math.min(...pres.map((x) => x.precioVenta)) : 0);
    const pMax = esAcc ? p.precioVenta : (pres.length ? Math.max(...pres.map((x) => x.precioVenta)) : 0);
    const pMayMin = esAcc ? (p.precioMayorista || 0) : (pres.length ? Math.min(...pres.map((x) => x.precioMayorista || x.precioVenta)) : 0);
    const pMayMax = esAcc ? (p.precioMayorista || 0) : (pres.length ? Math.max(...pres.map((x) => x.precioMayorista || x.precioVenta)) : 0);
    const ganMin = esAcc ? (p.precioVenta - (p.precioMayorista || 0)) : (pres.length ? Math.min(...pres.map((x) => x.precioVenta - (x.precioMayorista || x.precioVenta))) : 0);
    const ganMax = esAcc ? (p.precioVenta - (p.precioMayorista || 0)) : (pres.length ? Math.max(...pres.map((x) => x.precioVenta - (x.precioMayorista || x.precioVenta))) : 0);
    return `<div class="product-card">
      <div class="product-card-img">${(EMOJIS_CAT as Record<string, string>)[p.categoria] || '🧴'}<div class="product-card-badge">${bajo ? '⚠️ BAJO' : ''}</div></div>
      <div class="product-card-info">
        <div class="product-card-title">${escapeHTML(p.nombre)}${p.codigo ? ' <span class="badge badge-gray">#' + escapeHTML(p.codigo) + '</span>' : ''}</div>
        <div class="product-card-sub">${escapeHTML(p.categoria)}${p.descripcion ? ' · ' + escapeHTML(p.descripcion) : ''}</div>
        <div class="product-card-prices">
          ${esAcc
            ? `<span class="price">${fmt(p.precioVenta)}</span>${p.precioMayorista ? `<span class="price-mayor">${fmt(p.precioMayorista)}</span>` : ''}`
            : pres.length
            ? pres.map((pr) => `<span class="price-pres">${escapeHTML(pr.nombre)}: ${fmt(pr.precioVenta)}</span>`).join('')
            : '<span class="price-muted">Sin presentaciones</span>'}
        </div>
      </div>
      <div class="product-card-actions">
        <button class="btn btn-secondary btn-sm" onclick="formProducto('${p.id}')">✏️</button>
        <button class="btn btn-wsp-sm btn-sm" onclick="wspProducto('${p.id}')">📲</button>
        ${Sesion.esAdmin() ? `<button class="btn btn-danger btn-sm btn-icon" onclick="eliminarProducto('${p.id}')">🗑</button>` : ''}
      </div>
    </div>`;
  }).join('')}</div>`;
}

function catList(prods: Producto[]) {
  if (!prods.length) return `<div class="empty-state"><div class="empty-icon">📦</div><p>No hay productos. ¡Agregá el primero!</p></div>`;
  return `<div class="mobile-card-list">${prods.map((p) => {
    const esAcc = p.tipo === 'accesorio';
    const sv = esAcc ? (p.stockUnidades || 0) : (p.stockLitros || 0);
    const sm = esAcc ? (p.stockMinUnidades || 0) : (p.stockMinLitros || 0);
    const bajo = sv <= sm;
    const pres = !esAcc ? (p.presentaciones || []) : [];
    const pMin = esAcc ? p.precioVenta : (pres.length ? Math.min(...pres.map((x) => x.precioVenta)) : 0);
    const pMax = esAcc ? p.precioVenta : (pres.length ? Math.max(...pres.map((x) => x.precioVenta)) : 0);
    const pMayMin = esAcc ? (p.precioMayorista || 0) : (pres.length ? Math.min(...pres.map((x) => x.precioMayorista || x.precioVenta)) : 0);
    const pMayMax = esAcc ? (p.precioMayorista || 0) : (pres.length ? Math.max(...pres.map((x) => x.precioMayorista || x.precioVenta)) : 0);
    return `<div class="m-card" style="border-left:4px solid ${bajo ? 'var(--danger)' : 'var(--border)'};">
      <div class="m-card-header">
        <div>
          <div class="m-card-title">${(EMOJIS_CAT as Record<string, string>)[p.categoria] || '🧴'} ${escapeHTML(p.nombre)}${p.codigo ? ' <span class="badge badge-gray">#' + escapeHTML(p.codigo) + '</span>' : ''}</div>
          <div class="m-card-subtitle">${escapeHTML(p.categoria)} · ${pres.length ? pres.map((pr) => escapeHTML(pr.nombre) + ': ' + fmt(pr.precioVenta)).join(', ') : 'Accesorio'}</div>
        </div>
        <span class="badge badge-${!bajo ? 'green' : 'red'}">${esAcc ? (p.stockUnidades || 0) + ' un' : fmtL(p.stockLitros || 0) + ' L'}</span>
      </div>
      <div class="m-card-body">
        <div class="m-card-row"><span class="m-card-row-label">Stock</span><span class="m-card-row-value">${esAcc ? (p.stockUnidades || 0) + ' un' : fmtL(p.stockLitros || 0) + ' L'}</span></div>
        <div class="m-card-row"><span class="m-card-row-label">Mínimo</span><span class="m-card-row-value">${esAcc ? (p.stockMinUnidades || 0) + ' un' : fmtL(p.stockMinLitros || 0) + ' L'}</span></div>
        <div class="m-card-row"><span class="m-card-row-label">Precio</span><span class="m-card-row-value">${esAcc ? fmt(p.precioVenta) : pres.length ? fmt(pres[0].precioVenta) + '...' : '—'}</span></div>
      </div>
      <div class="m-card-footer">
        <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="formProducto('${p.id}')">✏️ Editar</button>
        <button class="btn btn-wsp-sm btn-sm" style="flex:1;" onclick="wspProducto('${p.id}')">📲</button>
        <button class="btn btn-danger btn-sm btn-icon" onclick="eliminarProducto('${p.id}')">🗑</button>
      </div>
    </div>`;
  }).join('')}</div>`;
}

let _presList: any[] = [];
export function formProducto(id: string | null) {
  const p = id ? store.productos.find((x) => x.id === id) ?? null : null;
  _presList = p ? [...p.presentaciones] : [];
  openModal(p ? 'Editar Producto' : 'Nuevo Producto', `<div class="form-grid">
    <div class="form-group full"><label>Nombre</label><input id="pNombre" value="${escapeHTML(id ? (store.productos.find((x) => x.id === id)?.nombre || '') : '')}" required /></div>
    <div class="form-group"><label>Código</label><input id="pCodigo" value="${id ? store.productos.find((x) => x.id === id)?.codigo || '' : ''}" /></div>
    <div class="form-group"><label>Categoría</label><select id="pCategoria">${CATEGORIAS.map((c) => `<option value="${c}" ${c === (id ? store.productos.find((x) => x.id === id)?.categoria : '') ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    <div class="form-group"><label>Tipo</label><select id="pTipo" onchange="onTipoChange()"><option value="liquido" ${!id || store.productos.find((x) => x.id === id)?.tipo === 'liquido' ? 'selected' : ''}>Líquido</option><option value="accesorio" ${id && store.productos.find((x) => x.id === id)?.tipo === 'accesorio' ? 'selected' : ''}>Accesorio</option></select></div>
    <div class="form-group full"><label>Descripción</label><textarea id="pDescripcion" rows="2">${id ? escapeHTML(store.productos.find((x) => x.id === id)?.descripcion || '') : ''}</textarea></div>
    <div id="pAccFields" style="display:${id && store.productos.find((x) => x.id === id)?.tipo === 'accesorio' ? 'block' : 'none'};"></div>
    <div id="pLiqFields" style="display:${!id || store.productos.find((x) => x.id === id)?.tipo !== 'accesorio' ? 'block' : 'none'};"></div>
  </div>`, async () => {
    const nombre = (document.getElementById('pNombre') as HTMLInputElement).value.trim();
    if (!nombre) { await swalError('El nombre es obligatorio'); return; }
    const tipo = (document.getElementById('pTipo') as HTMLSelectElement).value;
    const esAcc = tipo === 'accesorio';
    const producto: any = {
      id: id || genId(),
      nombre: (document.getElementById('pNombre') as HTMLInputElement).value.trim(),
      codigo: (document.getElementById('pCodigo') as HTMLInputElement).value.trim() || undefined,
      categoria: (document.getElementById('pCategoria') as HTMLSelectElement).value,
      tipo,
      descripcion: (document.getElementById('pDescripcion') as HTMLTextAreaElement).value.trim(),
    };
    if (esAcc) {
      producto.stockUnidades = parseInt((document.getElementById('pStockUnidades') as HTMLInputElement).value) || 0;
      producto.stockMinUnidades = parseInt((document.getElementById('pStockMinUnidades') as HTMLInputElement).value) || 0;
      producto.costoUnidad = parseFloat((document.getElementById('pCostoUnidad') as HTMLInputElement).value) || 0;
      producto.gananciaAcc = parseFloat((document.getElementById('pGananciaAcc') as HTMLInputElement).value) || 0;
      producto.descMayorista = parseFloat((document.getElementById('pDescMayorista') as HTMLInputElement).value) || 0;
      producto.precioVenta = Math.round(producto.costoUnidad * (1 + (producto.gananciaAcc || 0) / 100));
      producto.precioMayorista = Math.round(producto.precioVenta * (1 - (producto.descMayorista || 0) / 100));
    } else {
      const costoLitro = parseFloat((document.getElementById('pCostoLitro') as HTMLInputElement).value) || 0;
      producto.presentaciones = _presList.map((pr) => {
        const base = Math.round(costoLitro * pr.litros * (1 + (pr.ganancia || 0) / 100) + (pr.costoEnvase || 0) + (pr.costoEtiqueta || 0));
        return { ...pr, precioVenta: base, precioMayorista: Math.round(base * (1 - (pr.descMayorista || 0) / 100)) };
      });
    }
    closeModal();
    await saveProducto(producto);
    toast(id ? 'Producto actualizado ✅' : 'Producto creado ✅');
  });
}

export function onTipoChange() {
  const tipo = (document.getElementById('pTipo') as HTMLSelectElement).value;
  const esAcc = tipo === 'accesorio';
  const acc = document.getElementById('pAccFields');
  const liq = document.getElementById('pLiqFields');
  if (acc) acc.style.display = esAcc ? 'block' : 'none';
  if (liq) liq.style.display = esAcc ? 'none' : 'block';
  if (esAcc) {
    if (acc && !acc.querySelector('input')) {
      acc.innerHTML = `
        <div class="form-group"><label>Stock unidades</label>${unitInput('pStockUnidades', '0', 'un', '1')}</div>
        <div class="form-group"><label>Stock mín. unidades</label>${unitInput('pStockMinUnidades', '0', 'un', '1')}</div>
        <div class="form-group"><label>Costo unidad</label>${moneyInput('pCostoUnidad', '0')}</div>
        <div class="form-group"><label>Ganancia %</label>${moneyInput('pGananciaAcc', '0')}</div>
        <div class="form-group"><label>Desc. mayorista %</label>${moneyInput('pDescMayorista', '0')}</div>
      `;
    }
  } else {
    if (liq && !liq.querySelector('input')) {
      liq.innerHTML = `
        <div class="form-group"><label>Stock litros</label>${unitInput('pStockLitros', '0', 'L', '0.001')}</div>
        <div class="form-group"><label>Stock mín. litros</label>${unitInput('pStockMinLitros', '0', 'L', '0.001')}</div>
        <div class="form-group"><label>Costo por litro</label>${moneyInput('pCostoLitro', '0', 'recalcTodasPres()')}</div>
        <div class="form-group"><label>Presentaciones</label><div id="presListWrap"></div><div class="flex gap-8 mt-8"><button class="btn btn-primary" onclick="agregarPresRapida()">+ Rápida</button><button class="btn btn-secondary" onclick="agregarPresPersonalizada()">+ Personalizada</button></div>`;
      renderPresList();
    }
  }
}

function renderPresList() {
  const wrap = document.getElementById('presListWrap');
  if (!wrap) return;
  if (!_presList.length) { wrap.innerHTML = `<div class="empty-state" style="padding:16px;"><p>Sin presentaciones</p></div>`; return; }
  wrap.innerHTML = _presList.map((pr, i) => `<div style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;margin-bottom:8px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
    <div class="fw-700" style="font-size:13px;">${escapeHTML(pr.nombre)}</div>
    <div class="flex gap-8 flex-wrap">
      <div class="form-group" style="min-width:80px;"><label>Litros</label>${unitInput(`prLitros${i}`, String(pr.litros), 'L', '0.001', `setPresCampo(${i}, 'litros', this.value)`)}</div>
      <div class="form-group" style="min-width:120px;"><label>Costo envase</label>${moneyInput(`prCostoEnvase${i}`, String(pr.costoEnvase || 0), `setPresCampo(${i}, 'costoEnvase', this.value)`)}</div>
      <div class="form-group" style="min-width:120px;"><label>Costo etiqueta</label>${moneyInput(`prCostoEtiqueta${i}`, String(pr.costoEtiqueta || 0), `setPresCampo(${i}, 'costoEtiqueta', this.value)`)}</div>
      <div class="form-group" style="min-width:100px;"><label>Ganancia %</label>${moneyInput(`prGanancia${i}`, String(pr.ganancia || 0), `setPresCampo(${i}, 'ganancia', this.value)`)}</div>
      <div class="form-group" style="min-width:100px;"><label>Desc. mayorista %</label>${moneyInput(`prDescMayorista${i}`, String(pr.descMayorista || 0), `setPresCampo(${i}, 'descMayorista', this.value)`)}</div>
      <button class="btn btn-danger btn-sm btn-icon" onclick="eliminarPresItem(${i})">✕</button>
    </div></div>`).join('');
}

export function agregarPresRapida() {
  PRES_RAPIDAS.forEach((pr) => _presList.push({ id: genId(), nombre: pr.nombre, litros: pr.litros, costoEnvase: 0, costoEtiqueta: 0, ganancia: 30, descMayorista: 0 }));
  renderPresList();
  recalcTodasPres();
}

export function agregarPresPersonalizada() {
  _presList.push({ id: genId(), nombre: 'Personalizada', litros: 1, costoEnvase: 0, costoEtiqueta: 0, ganancia: 30, descMayorista: 0 });
  renderPresList();
}

function costoLitroActual(): number {
  return parseFloat((document.getElementById('pCostoLitro') as HTMLInputElement)?.value || '0') || 0;
}

function recalcPres(i: number) {
  const pr = _presList[i];
  if (!pr) return;
  const cl = pr.costoLitro ?? costoLitroActual();
  pr.precioVenta = Math.round(cl * pr.litros * (1 + (pr.ganancia || 0) / 100) + (pr.costoEnvase || 0) + (pr.costoEtiqueta || 0));
  pr.precioMayorista = Math.round(pr.precioVenta * (1 - (pr.descMayorista || 0) / 100));
}

function recalcTodasPres() {
  _presList.forEach((_, i) => recalcPres(i));
}

export function setPresCampo(i: number, campo: 'litros' | 'costoEnvase' | 'costoEtiqueta' | 'ganancia' | 'descMayorista', val: string) {
  const pr = _presList[i];
  if (!pr) return;
  (pr as any)[campo] = parseFloat(val) || 0;
  recalcPres(i);
}

export function eliminarPresItem(i: number) {
  _presList.splice(i, 1);
  renderPresList();
  recalcTodasPres();
}

export async function eliminarProducto(id: string) {
  const res = await swalConfirm('¿Eliminar producto?', `Se eliminará el producto y sus presentaciones.`);
  if (!res.isConfirmed) return;
  await removeProducto(id);
  toast('Producto eliminado');
}

export function wspProducto(id: string) {
  const p = store.productos.find((x) => x.id === id);
  if (!p) return;
  let msg = `*${p.nombre}*${p.codigo ? ' #' + p.codigo : ''}\n`;
  if (p.descripcion) msg += `${p.descripcion}\n`;
  if (p.tipo === 'accesorio') msg += `Precio: ${fmt(p.precioVenta)}`;
  else (p.presentaciones || []).forEach((pr) => { msg += `${pr.nombre}: ${fmt(pr.precioVenta)}\n`; });
  msg += `\n${waLink('', '2262240512')}`;
  window.open(waLink(msg), '_blank');
}

function wspCatalogoPDF() { wspReporte(); }
async function exportarCatalogo() { toast('Exportar PDF — pendiente', 'info'); }
function listaMayoristaModal() { openModal('🏪 Lista Mayorista', '<div class="empty-state" style="padding:20px;">Función pendiente</div>', null, true); }

registerRenderer('catalogo', renderCatalogo);
exposeGlobal({
  formProducto, onTipoChange, eliminarProducto, wspProducto,
  agregarPresRapida, agregarPresPersonalizada, renderPresList,
  setPresCampo, eliminarPresItem, setCatalogoView,
  wspCatalogoPDF, listaMayoristaModal, exportarCatalogo,
});