// ===== NURA APP.JS — Firebase Realtime Database =====
'use strict';

// ── Firebase refs ─────────────────────────────────────────────────────────────
const { db, ref, set, onValue, remove } = window._FB;
const r = path => ref(db, 'nura/' + path);
const DB = { productos:[], clientes:[], ventas:[], compras:[], combos:[] };

// ── Sync UI ───────────────────────────────────────────────────────────────────
let _writes = 0;
function syncUI(s) {
  const dot = document.getElementById('syncDot');
  const txt = document.getElementById('syncTxt');
  const bar = document.getElementById('syncBar');
  if (!dot) return;
  if (s==='ok')     { dot.style.background='#52dad2'; txt.textContent='Sincronizado'; if(bar) bar.style.display='none'; }
  if (s==='saving') { dot.style.background='#f59e0b'; txt.textContent='Guardando...'; if(bar) bar.style.display='block'; }
  if (s==='off')    { dot.style.background='#f43f5e'; txt.textContent='Sin conexión'; }
}

async function fbSet(path, data) {
  _writes++; syncUI('saving');
  try   { await set(r(path), data); }
  catch (e) { console.error('fbSet', path, e); toast('Error al guardar', 'error'); }
  finally   { if (--_writes <= 0) { _writes=0; syncUI('ok'); } }
}
async function fbDel(path) {
  _writes++; syncUI('saving');
  try   { await remove(r(path)); }
  catch (e) { console.error('fbDel', path, e); }
  finally   { if (--_writes <= 0) { _writes=0; syncUI('ok'); } }
}
async function fbSave(col, item)     { await fbSet(`${col}/${item.id}`, item); }
async function fbRemove(col, id)     { await fbDel(`${col}/${id}`); }
async function fbSaveMany(col, items){ const obj={}; items.forEach(it=>{ obj[it.id]=it; }); await fbSet(col, obj); }

// ── Suscribir colecciones en tiempo real ──────────────────────────────────────
const COLS = ['productos','clientes','ventas','compras','combos'];
const RELOAD_PAGES = {
  productos: ['catalogo','stock','dashboard','reportes'],
  clientes:  ['clientes','dashboard','ventas','deudas'],
  ventas:    ['ventas','dashboard','reportes','deudas'],
  compras:   ['compras','dashboard','reportes'],
  combos:    ['combos','catalogo','ventas'],
};

let _splashOk = false;
function hideSplash() {
  if (_splashOk) return; _splashOk = true;
  document.getElementById('app').style.display = '';
  const s = document.getElementById('splash');
  if (s) { s.style.opacity='0'; setTimeout(()=>s.remove(), 420); }
  syncUI('ok');
}
setTimeout(hideSplash, 5000);

COLS.forEach(col => {
  onValue(r(col), snap => {
    const val = snap.val();
    DB[col] = val ? Object.values(val) : [];
    hideSplash();
    if (RELOAD_PAGES[col]?.includes(currentPage)) renderPage(currentPage);
  }, () => syncUI('off'));
});

// ── Utils ─────────────────────────────────────────────────────────────────────
function genId()    { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function fmt(n)     { return '$ ' + Math.ceil(Number(n||0)).toLocaleString('es-AR'); }
function fmtL(n)    { return Number(n||0).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:3}); }
function fmtDate(d) { return new Date(d).toLocaleDateString('es-AR'); }

// ── SweetAlert2 ───────────────────────────────────────────────────────────────
function swalConfirm(title, text) {
  return Swal.fire({ title, html:text, icon:'warning', showCancelButton:true, confirmButtonText:'Sí, eliminar', cancelButtonText:'Cancelar', reverseButtons:true, focusCancel:true });
}
function swalError(msg)          { return Swal.fire({ title:'Error', html:msg, icon:'error', confirmButtonText:'Entendido' }); }
function swalSuccess(title, msg) { return Swal.fire({ title, html:msg, icon:'success', timer:2200, timerProgressBar:true, confirmButtonText:'OK' }); }
function swalInfo(title, html)   { return Swal.fire({ title, html, icon:'info', confirmButtonText:'OK' }); }

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type='success') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast show '+type;
  setTimeout(()=>t.className='toast', 2800);
}

// ── Datos constantes ──────────────────────────────────────────────────────────
const CATEGORIAS = ['Desengrasante','Desinfectante','Limpiavidrios','Lavandina','Detergente','Suavizante','Limpiador multiuso','Jabón líquido','Quitamanchas','Perfumina','Accesorio'];
const EMOJIS_CAT = {'Desengrasante':'🧴','Desinfectante':'🦠','Limpiavidrios':'🪟','Lavandina':'💧','Detergente':'🫧','Suavizante':'🌸','Limpiador multiuso':'✨','Jabón líquido':'🧼','Quitamanchas':'🔵','Perfumina':'🌹','Accesorio':'🧹'};
const PRES_RAPIDAS = [{nombre:'250ml',litros:.25},{nombre:'500ml',litros:.5},{nombre:'750ml',litros:.75},{nombre:'1L',litros:1},{nombre:'2L',litros:2},{nombre:'5L',litros:5},{nombre:'10L',litros:10}];

// ── Modal — NO se cierra con click afuera ni Escape ───────────────────────────
function openModal(title, bodyHTML, onSave, wide=false) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHTML;
  const overlay = document.getElementById('modalOverlay');
  const modal   = document.getElementById('modal');
  modal.style.maxWidth = wide ? '820px' : '600px';
  overlay.classList.add('active');
  let footer = modal.querySelector('.modal-footer');
  if (onSave) {
    if (!footer) { footer=document.createElement('div'); footer.className='modal-footer'; modal.appendChild(footer); }
    footer.innerHTML = `<button class="btn btn-secondary" id="btnModalCancel">Cancelar</button><button class="btn btn-primary" id="btnModalSave">💾 Guardar</button>`;
    document.getElementById('btnModalSave').onclick   = onSave;
    document.getElementById('btnModalCancel').onclick = closeModal;
  } else { if(footer) footer.remove(); }
}
function closeModal() { document.getElementById('modalOverlay').classList.remove('active'); }

// ── Navegación ────────────────────────────────────────────────────────────────
let currentPage = 'dashboard';
function navigate(page) {
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
  document.querySelectorAll('.page').forEach(el=>el.classList.toggle('active',el.id==='page-'+page));
  document.getElementById('pageTitle').textContent =
    {dashboard:'Dashboard',catalogo:'Catálogo',clientes:'Clientes',ventas:'Ventas',compras:'Compras',stock:'Stock',reportes:'Reportes',combos:'Combos',deudas:'💳 Deudas'}[page];
  currentPage=page;
  document.getElementById('topbarActions').innerHTML='';
  renderPage(page);
  document.getElementById('sidebar').classList.remove('open');
}
function renderPage(page) {
  ({dashboard:renderDashboard,catalogo:renderCatalogo,clientes:renderClientes,ventas:renderVentas,compras:renderCompras,stock:renderStock,reportes:renderReportes,combos:renderCombos,deudas:renderDeudas})[page]?.();
}

// ── Input helpers ─────────────────────────────────────────────────────────────
function moneyInput(id, value='', onInput='') {
  return `<div class="input-money-wrap"><span class="money-sign">$</span><input id="${id}" type="number" min="0" step="0.01" value="${value}" placeholder="0.00" ${onInput?`oninput="${onInput}"`:''}></div>`;
}
function unitInput(id, value='', unit='L', step='0.001', onInput='') {
  return `<div class="input-unit-wrap"><input id="${id}" type="number" min="0" step="${step}" value="${value}" placeholder="0" ${onInput?`oninput="${onInput}"`:''}><span class="unit-label">${unit}</span></div>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
function renderDashboard() {
  const el=document.getElementById('page-dashboard');
  const tv=DB.ventas.reduce((s,v)=>s+v.total,0);
  const tc=DB.compras.reduce((s,c)=>s+c.total,0);
  const sb=DB.productos.filter(p=>p.tipo==='accesorio'?(p.stockUnidades||0)<=(p.stockMinUnidades||0):(p.stockLitros||0)<=(p.stockMinLitros||0)).length;
  const meses=[];
  for(let i=5;i>=0;i--){const d=new Date();d.setMonth(d.getMonth()-i);meses.push({label:d.toLocaleString('es-AR',{month:'short'}),year:d.getFullYear(),month:d.getMonth()});}
  const vm=meses.map(m=>({label:m.label,val:DB.ventas.filter(v=>{const d=new Date(v.fecha);return d.getMonth()===m.month&&d.getFullYear()===m.year;}).reduce((s,v)=>s+v.total,0)}));
  const maxV=Math.max(...vm.map(m=>m.val),1);
  const ult=[...DB.ventas].sort((a,b)=>b.fecha-a.fecha).slice(0,5);
  el.innerHTML=`
    <div class="grid-4 mb-16">
      <div class="stat-card"><div class="stat-icon green">💰</div><div class="stat-info"><div class="stat-label">Ventas totales</div><div class="stat-value">${fmt(tv)}</div><div class="stat-sub">${DB.ventas.length} transacc.</div></div></div>
      <div class="stat-card"><div class="stat-icon violet">📦</div><div class="stat-info"><div class="stat-label">Productos</div><div class="stat-value">${DB.productos.length}</div></div></div>
      <div class="stat-card"><div class="stat-icon blue">👥</div><div class="stat-info"><div class="stat-label">Clientes</div><div class="stat-value">${DB.clientes.length}</div></div></div>
      <div class="stat-card"><div class="stat-icon ${sb>0?'red':'green'}">${sb>0?'⚠️':'✅'}</div><div class="stat-info"><div class="stat-label">Stock bajo</div><div class="stat-value">${sb}</div></div></div>
    </div>
    <div class="grid-2 mb-16">
      <div class="card"><div class="section-header"><div class="section-title">Ventas por mes</div></div>
        <div class="mini-chart">${vm.map(m=>`<div class="bar-wrap"><div class="bar" style="height:${Math.round((m.val/maxV)*90)}px" title="${fmt(m.val)}"></div><div class="bar-label">${m.label}</div></div>`).join('')}</div>
      </div>
      <div class="card"><div class="section-header"><div class="section-title">Financiero</div></div>
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:6px;">
          <div class="cost-row"><span>Ventas</span><span class="fw-700" style="color:var(--accent-dark)">${fmt(tv)}</span></div>
          <div class="cost-row"><span>Compras</span><span class="fw-700" style="color:var(--danger)">${fmt(tc)}</span></div>
          <div class="cost-row total"><span>Ganancia est.</span><span>${fmt(tv-tc)}</span></div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="section-header"><div class="section-title">Últimas ventas</div><button class="btn btn-secondary btn-sm" onclick="navigate('ventas')">Ver todas →</button></div>
      ${ult.length===0?`<div class="empty-state"><div class="empty-icon">🛒</div><p>Sin ventas aún</p></div>`:dashVentas(ult)}
    </div>`;
}

function dashVentas(items) {
  const tbl=`<div class="table-wrap hide-mobile" style="margin-top:10px;"><table><thead><tr><th>Fecha</th><th>Cliente</th><th>Total</th><th>Estado</th></tr></thead><tbody>
    ${items.map(v=>{const cl=DB.clientes.find(c=>c.id===v.clienteId);return`<tr><td>${fmtDate(v.fecha)}</td><td>${cl?cl.nombre:v.clienteNombre||'—'}</td><td class="fw-700">${fmt(v.total)}</td><td><span class="badge badge-${v.estado==='pagado'?'green':v.estado==='pendiente'?'orange':'red'}">${v.estado}</span></td></tr>`;}).join('')}
    </tbody></table></div>`;
  const cards=`<div class="mobile-card-list" style="margin-top:10px;">
    ${items.map(v=>{const cl=DB.clientes.find(c=>c.id===v.clienteId);return`<div class="m-card"><div class="m-card-header"><div><div class="m-card-title">${cl?cl.nombre:v.clienteNombre||'Sin cliente'}</div><div class="m-card-subtitle">${fmtDate(v.fecha)}</div></div><span class="badge badge-${v.estado==='pagado'?'green':v.estado==='pendiente'?'orange':'red'}">${v.estado}</span></div><div style="font-family:var(--font-display);font-size:20px;font-weight:800;" class="text-gradient">${fmt(v.total)}</div></div>`;}).join('')}
  </div>`;
  return tbl+cards;
}

// ══════════════════════════════════════════════════════════════════════════════
// CATÁLOGO
// ══════════════════════════════════════════════════════════════════════════════
let catalogoSearch='', catalogoFiltro='', catalogoView='grid';

function renderCatalogo() {
  const el=document.getElementById('page-catalogo');
  document.getElementById('topbarActions').innerHTML=`<button class="btn btn-outline btn-sm" onclick="listaMayoristaModal()">🏪 Mayorista</button><button class="btn btn-outline btn-sm" onclick="exportarCatalogo()">📄 Exportar</button><button class="btn btn-primary" onclick="formProducto(null)">+ Producto</button>`;
  el.innerHTML=`
    <div class="flex flex-center gap-8 mb-16 flex-wrap">
      <div class="search-bar" style="max-width:100%;"><span class="search-icon">🔍</span><input type="text" placeholder="Buscar nombre, código..." id="catSearch" value="${catalogoSearch.replace(/"/g,'&quot;')}" /></div>
      <select id="catFiltro" style="max-width:180px;"><option value="">Todas</option>${CATEGORIAS.map(c=>`<option value="${c}" ${catalogoFiltro===c?'selected':''}>${c}</option>`).join('')}</select>
      <div class="flex gap-6" style="margin-left:auto;">
        <button class="btn btn-${catalogoView==='grid'?'primary':'secondary'} btn-sm" onclick="catalogoView='grid';refreshCat()">⊞</button>
        <button class="btn btn-${catalogoView==='list'?'primary':'secondary'} btn-sm" onclick="catalogoView='list';refreshCat()">☰</button>
      </div>
    </div>
    <div id="catRes">${catHTML()}</div>`;
  document.getElementById('catSearch').oninput=e=>{catalogoSearch=e.target.value;refreshCat();};
  document.getElementById('catFiltro').onchange=e=>{catalogoFiltro=e.target.value;refreshCat();};
}
function refreshCat(){const r=document.getElementById('catRes');if(r)r.innerHTML=catHTML();}
function filtrarProds(){return DB.productos.filter(p=>(!catalogoSearch||p.nombre.toLowerCase().includes(catalogoSearch.toLowerCase())||(p.codigo||'').toLowerCase().includes(catalogoSearch.toLowerCase())||p.categoria.toLowerCase().includes(catalogoSearch.toLowerCase()))&&(!catalogoFiltro||p.categoria===catalogoFiltro));}
function catHTML(){return catalogoView==='grid'?catGrid(filtrarProds()):catList(filtrarProds());}

function catGrid(prods) {
  if(!prods.length)return`<div class="empty-state"><div class="empty-icon">📦</div><p>No hay productos. ¡Agregá el primero!</p></div>`;
  return`<div class="product-grid">${prods.map(p=>{
    const esAcc=p.tipo==='accesorio',sv=esAcc?p.stockUnidades||0:p.stockLitros||0,sm=esAcc?p.stockMinUnidades||0:p.stockMinLitros||0;
    const bajo=sv<=sm,pres=!esAcc?(p.presentaciones||[]):[];
    const pMin=esAcc?p.precioVenta:pres.length?Math.min(...pres.map(x=>x.precioVenta)):0;
    const pMax=esAcc?p.precioVenta:pres.length?Math.max(...pres.map(x=>x.precioVenta)):0;
    const pMayMin=esAcc?p.precioMayorista||0:pres.length?Math.min(...pres.map(x=>x.precioMayorista||x.precioVenta)):0;
    const pMayMax=esAcc?p.precioMayorista||0:pres.length?Math.max(...pres.map(x=>x.precioMayorista||x.precioVenta)):0;
    return`<div class="product-card">
      <div class="product-card-img">${EMOJIS_CAT[p.categoria]||'🧴'}<div class="product-card-badge">${bajo?'<span class="badge badge-red">⚠️</span>':''}</div></div>
      <div class="product-card-body">
        ${p.codigo?`<div class="product-card-code">#${p.codigo}</div>`:''}
        <div class="product-card-name">${p.nombre}</div>
        <div class="product-card-cat">${p.categoria}</div>
        ${esAcc
          ? `<div class="product-card-price">${fmt(p.precioVenta)}</div>
             <div class="product-card-unit">por unidad</div>
             ${p.precioMayorista?`<div style="font-size:11px;color:var(--accent-dark);margin-top:2px;">Mayor: ${fmt(p.precioMayorista)}</div>`:''}`
          : pres.length
            ?`<div class="product-card-price">${pMin===pMax?fmt(pMin):`${fmt(pMin)}–${fmt(pMax)}`}</div>
              <div class="product-card-unit">${pres.length} presentación(es)</div>
              ${pMayMin>0?`<div style="font-size:11px;color:var(--accent-dark);margin-top:2px;">Mayor: ${pMayMin===pMayMax?fmt(pMayMin):`${fmt(pMayMin)}–${fmt(pMayMax)}`}</div>`:''}`
            :`<div class="product-card-unit" style="color:var(--warning);">Sin presentaciones</div>`}
        <div class="flex-center gap-8 mt-8"><div class="stock-bar-wrap" style="flex:1;">
          <div class="stock-bar"><div class="stock-bar-fill ${sv>sm*2?'high':sv>sm?'med':'low'}" style="width:${Math.min(100,sm>0?(sv/(sm*3))*100:100)}%"></div></div>
          <span class="stock-qty">${esAcc?`${sv} un`:`${fmtL(sv)} L`}</span>
        </div></div>
      </div>
      <div class="product-card-footer">
        <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="formProducto('${p.id}')">✏️</button>
        <button class="btn btn-outline btn-sm" style="flex:1;" onclick="duplicarProducto('${p.id}')">📋</button>
        <button class="btn btn-wsp-sm btn-sm" onclick="wspProducto('${p.id}')">📲</button>
        <button class="btn btn-danger btn-sm btn-icon" onclick="eliminarProducto('${p.id}')">🗑</button>
      </div>
    </div>`;
  }).join('')}</div>`;
}

function catList(prods) {
  if(!prods.length)return`<div class="empty-state"><div class="empty-icon">📦</div><p>No hay productos.</p></div>`;
  const tbl=`<div class="table-wrap hide-mobile"><table>
    <thead><tr><th>Cód.</th><th>Nombre</th><th>Categoría</th><th>Stock</th><th>Precio Actual</th><th>Precio mayorista</th><th>Acciones</th></tr></thead>
    <tbody>${prods.map(p=>{const esAcc=p.tipo==='accesorio',sv=esAcc?p.stockUnidades||0:p.stockLitros||0,sm=esAcc?p.stockMinUnidades||0:p.stockMinLitros||0,pres=!esAcc?(p.presentaciones||[]):[];
      const miniPv=esAcc?fmt(p.precioVenta)+'/un':pres.map(pr=>`${pr.nombre}: <strong>${fmt(pr.precioVenta)}</strong>`).join(' · ');
      const miniMay=esAcc?(p.precioMayorista?fmt(p.precioMayorista)+'/un':'—'):pres.map(pr=>`${pr.nombre}: <strong>${fmt(pr.precioMayorista||pr.precioVenta)}</strong>`).join(' · ');
      return`<tr>
        <td><span class="badge badge-gray">${p.codigo||'—'}</span></td><td class="fw-700">${p.nombre}</td><td>${p.categoria}</td>
        <td><span class="badge badge-${sv>sm?'green':'red'}">${esAcc?`${sv} un`:`${fmtL(sv)} L`}</span></td>
        <td style="font-size:12px;">${miniPv}</td>
        <td style="font-size:12px;color:var(--accent-dark);">${miniMay}</td>
        <td><div class="table-actions">
          <button class="btn btn-secondary btn-sm" onclick="formProducto('${p.id}')">✏️</button>
          <button class="btn btn-outline btn-sm" onclick="duplicarProducto('${p.id}')">📋</button>
          <button class="btn btn-wsp-sm btn-sm" onclick="wspProducto('${p.id}')">📲</button>
          <button class="btn btn-danger btn-sm btn-icon" onclick="eliminarProducto('${p.id}')">🗑</button>
        </div></td>
      </tr>`;}).join('')}</tbody></table></div>`;
  const cards=`<div class="mobile-card-list">${prods.map(p=>{const esAcc=p.tipo==='accesorio',pres=!esAcc?(p.presentaciones||[]):[];const sv=esAcc?p.stockUnidades||0:p.stockLitros||0,sm=esAcc?p.stockMinUnidades||0:p.stockMinLitros||0;return`<div class="m-card">
    <div class="m-card-header"><div>${p.codigo?`<div class="text-muted">#${p.codigo}</div>`:''}
      <div class="m-card-title">${EMOJIS_CAT[p.categoria]||'🧴'} ${p.nombre}</div><div class="m-card-subtitle">${p.categoria}</div></div>
      <span class="badge badge-${sv>sm?'green':'red'}">${esAcc?`${sv} un`:`${fmtL(sv)} L`}</span></div>
    <div class="m-card-body">${esAcc
      ?`<div class="m-card-row"><span class="m-card-row-label">Actual</span><span class="m-card-row-value fw-700 text-gradient">${fmt(p.precioVenta)}</span></div>${p.precioMayorista?`<div class="m-card-row"><span class="m-card-row-label">Mayorista</span><span class="m-card-row-value fw-700" style="color:var(--accent-dark)">${fmt(p.precioMayorista)}</span></div>`:''}`
      :pres.map(pr=>`<div class="m-card-row"><span class="m-card-row-label">${pr.nombre}</span><span class="m-card-row-value fw-700 text-gradient">${fmt(pr.precioVenta)}${pr.precioMayorista?` <span style="color:var(--accent-dark);font-size:10px;">(M:${fmt(pr.precioMayorista)})</span>`:''}</span></div>`).join('')}</div>
    <div class="m-card-footer" style="display:flex; gap: 4px; margin-top: 10px;"><button class="btn btn-secondary btn-sm" style="flex:1;" onclick="formProducto('${p.id}')">✏️</button><button class="btn btn-outline btn-sm" style="flex:1;" onclick="duplicarProducto('${p.id}')">📋</button><button class="btn btn-wsp-sm btn-sm" onclick="wspProducto('${p.id}')">📲</button><button class="btn btn-danger btn-sm btn-icon" onclick="eliminarProducto('${p.id}')">🗑</button></div>
  </div>`;}).join('')}</div>`;
  return tbl+cards;
}

// ── Lista de precios mayorista ─────────────────────────────────────────────────
function listaMayoristaModal() {
  if (!DB.productos.length) { swalInfo('Sin productos', 'No hay productos en el catálogo.'); return; }

  openModal('🏪 Lista de precios mayorista', `
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">
      Mostrá solo precios mayoristas. Los productos sin stock aparecen marcados.
    </p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      <button class="btn btn-primary" style="flex:1;" onclick="generarPDFMayorista()">📄 Descargar PDF</button>
      <button class="btn btn-wsp-sm" style="flex:1;" onclick="wspMayorista()">📲 Enviar por WhatsApp</button>
      <button class="btn btn-secondary" style="width:100%;" onclick="closeModal()">Cerrar</button>
    </div>
    <div style="margin-top:18px;border-top:1px solid var(--border);padding-top:14px;">
      <div style="font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:10px;">VISTA PREVIA</div>
      <div style="max-height:340px;overflow-y:auto;">
        ${(() => {
          const cats = [...new Set(DB.productos.map(p => p.categoria))];
          return cats.map(cat => {
            const prods = DB.productos.filter(p => p.categoria === cat);
            const filas = prods.map(p => {
              const esAcc = p.tipo === 'accesorio';
              const sinStock = esAcc ? (p.stockUnidades||0) === 0 : (p.stockLitros||0) === 0;
              if (esAcc) {
                const precio = p.precioMayorista || p.precioVenta;
                return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-radius:6px;background:${sinStock?'rgba(244,63,94,0.06)':'transparent'};margin-bottom:3px;">
                  <span style="font-size:13px;color:${sinStock?'var(--danger)':'var(--text)'}">${p.nombre}${sinStock?' <em style="font-size:10px;">(sin stock)</em>':''}</span>
                  <span style="font-weight:800;font-size:13px;color:var(--accent-dark);white-space:nowrap;margin-left:12px;">${fmt(precio)}/un</span>
                </div>`;
              } else {
                return (p.presentaciones||[]).map(pr => {
                  const precio = pr.precioMayorista || pr.precioVenta;
                  return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-radius:6px;background:${sinStock?'rgba(244,63,94,0.06)':'transparent'};margin-bottom:3px;">
                    <span style="font-size:13px;color:${sinStock?'var(--danger)':'var(--text)'}">  ${p.nombre} <span style="opacity:.6;font-size:11px;">${pr.nombre}</span>${sinStock?' <em style="font-size:10px;">(sin stock)</em>':''}</span>
                    <span style="font-weight:800;font-size:13px;color:var(--accent-dark);white-space:nowrap;margin-left:12px;">${fmt(precio)}</span>
                  </div>`;
                }).join('');
              }
            }).join('');
            return `<div style="margin-bottom:12px;">
              <div style="font-size:11px;font-weight:800;color:var(--text-muted);letter-spacing:1px;text-transform:uppercase;padding:4px 8px;margin-bottom:4px;">${EMOJIS_CAT[cat]||'•'} ${cat}</div>
              ${filas}
            </div>`;
          }).join('');
        })()}
        ${DB.combos.length ? `
        <div style="margin-bottom:12px;">
          <div style="font-size:11px;font-weight:800;color:var(--text-muted);letter-spacing:1px;text-transform:uppercase;padding:4px 8px;margin-bottom:4px;">🎁 Combos</div>
          ${DB.combos.map(c => {
            const precio = c.precioMayorista || c.precio;
            return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-radius:6px;margin-bottom:3px;">
              <span style="font-size:13px;">🎁 ${c.nombre}</span>
              <span style="font-weight:800;font-size:13px;color:var(--accent-dark);white-space:nowrap;margin-left:12px;">${fmt(precio)}</span>
            </div>`;
          }).join('')}
        </div>` : ''}
      </div>
    </div>
  `, null, true);
}

window.generarPDFMayorista = async function() {
  toast('Generando PDF...', 'info');
  const fecha = new Date().toLocaleDateString('es-AR');
  const cats = [...new Set(DB.productos.map(p => p.categoria))];

  let rowsHTML = '';
  cats.forEach(cat => {
    const prods = DB.productos.filter(p => p.categoria === cat);
    let catRows = '';
    prods.forEach(p => {
      const esAcc = p.tipo === 'accesorio';
      const sinStock = esAcc ? (p.stockUnidades||0) === 0 : (p.stockLitros||0) === 0;
      if (esAcc) {
        const precio = p.precioMayorista || p.precioVenta;
        catRows += `<tr style="${sinStock?'background:#fff5f5;':''}">
          <td style="padding:7px 10px;font-size:12px;color:${sinStock?'#ef4444':'#1e293b'};">${p.nombre}${p.codigo?` <span style="color:#94a3b8;font-size:10px;">#${p.codigo}</span>`:''}</td>
          <td style="padding:7px 10px;font-size:11px;color:#64748b;">Unidad</td>
          <td style="padding:7px 10px;font-size:12px;font-weight:800;color:#1ab8af;text-align:right;">${fmt(precio)}</td>
          <td style="padding:7px 10px;font-size:11px;color:#7c3aed;text-align:right;">${fmt(p.precioVenta)}</td>
          <td style="padding:7px 10px;text-align:center;">${sinStock?'<span style="color:#ef4444;font-size:10px;font-weight:700;">SIN STOCK</span>':'<span style="color:#22c55e;font-size:10px;">✓</span>'}</td>
        </tr>`;
      } else {
        (p.presentaciones||[]).forEach((pr, pi) => {
          const precio = pr.precioMayorista || pr.precioVenta;
          catRows += `<tr style="${sinStock?'background:#fff5f5;':''}">
            <td style="padding:7px 10px;font-size:12px;color:${sinStock?'#ef4444':'#1e293b'};">${pi===0?p.nombre+(p.codigo?` <span style="color:#94a3b8;font-size:10px;">#${p.codigo}</span>`:''):''}${pi>0?'<span style="color:#94a3b8">└</span>':''}</td>
            <td style="padding:7px 10px;font-size:11px;color:#64748b;">${pr.nombre}</td>
            <td style="padding:7px 10px;font-size:12px;font-weight:800;color:#1ab8af;text-align:right;">${fmt(precio)}</td>
            <td style="padding:7px 10px;font-size:11px;color:#7c3aed;text-align:right;">${fmt(pr.precioVenta)}</td>
            <td style="padding:7px 10px;text-align:center;">${sinStock&&pi===0?'<span style="color:#ef4444;font-size:10px;font-weight:700;">SIN STOCK</span>':'<span style="color:#22c55e;font-size:10px;">✓</span>'}</td>
          </tr>`;
        });
      }
    });
    if (catRows) {
      rowsHTML += `<tr><td colspan="5" style="padding:10px 10px 4px;background:#f1f5f9;font-size:11px;font-weight:800;color:#475569;letter-spacing:1px;text-transform:uppercase;">${EMOJIS_CAT[cat]||'•'} ${cat}</td></tr>${catRows}`;
    }
  });

  // Combos
  if (DB.combos.length) {
    rowsHTML += `<tr><td colspan="5" style="padding:10px 10px 4px;background:#f1f5f9;font-size:11px;font-weight:800;color:#475569;letter-spacing:1px;text-transform:uppercase;">🎁 Combos</td></tr>`;
    DB.combos.forEach(c => {
      const precio = c.precioMayorista || c.precio;
      rowsHTML += `<tr>
        <td style="padding:7px 10px;font-size:12px;color:#1e293b;">🎁 ${c.nombre}${c.descripcion?`<div style="font-size:10px;color:#94a3b8;">${c.descripcion}</div>`:''}</td>
        <td style="padding:7px 10px;font-size:11px;color:#64748b;">Combo</td>
        <td style="padding:7px 10px;font-size:12px;font-weight:800;color:#1ab8af;text-align:right;">${fmt(precio)}</td>
        <td style="padding:7px 10px;font-size:11px;color:#7c3aed;text-align:right;">${fmt(c.precio)}</td>
        <td style="padding:7px 10px;text-align:center;"><span style="color:#22c55e;font-size:10px;">✓</span></td>
      </tr>`;
    });
  }

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#1e293b;}
    .header{background:linear-gradient(135deg,#0f172a,#1e293b);color:#fff;padding:24px 28px;display:flex;align-items:center;gap:18px;}
    .logo{width:60px;height:60px;object-fit:contain;}
    .brand{font-size:26px;font-weight:900;letter-spacing:6px;}.letra-a{color:#a78bfa;}
    .sub{font-size:9px;color:rgba(255,255,255,.4);letter-spacing:2px;text-transform:uppercase;margin-top:2px;}
    .badge-may{display:inline-block;background:#7c3aed;color:#fff;font-size:10px;font-weight:800;padding:3px 10px;border-radius:99px;letter-spacing:1px;margin-left:10px;vertical-align:middle;}
    .meta{margin-left:auto;text-align:right;font-size:11px;color:rgba(255,255,255,.4);}
    table{width:100%;border-collapse:collapse;}
    thead tr{background:#0f172a;color:#fff;}
    th{padding:9px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;}
    tr:nth-child(even){background:#f8fafc;}
    tr:hover{background:#f1f5f9;}
    .footer{margin-top:20px;padding:14px 18px;border-top:2px solid #e2e8f0;text-align:center;font-size:11px;color:#94a3b8;}
    .nota{background:#fef3c7;border-left:3px solid #f59e0b;padding:8px 12px;font-size:11px;color:#92400e;margin:14px 0;border-radius:0 4px 4px 0;}
  </style>
  </head><body>
  <div class="header">
    <img src="logo.png" class="logo" />
    <div>
      <div class="brand">NUR<span class="letra-a">A</span> <span class="badge-may">MAYORISTA</span></div>
      <div class="sub">lista de precios para distribuidores</div>
    </div>
    <div class="meta">Válido al<br><strong style="color:#fff;font-size:13px;">${fecha}</strong></div>
  </div>
  <div class="nota">⚠️ Lista exclusiva para vendedores y distribuidores. No compartir con clientes finales.</div>
  <table>
    <thead><tr><th style="text-align:left;">Producto</th><th style="text-align:left;">Presentación</th><th style="text-align:right;color:#52dad2;">P. Mayorista</th><th style="text-align:right;color:#a78bfa;">P. Recomendado</th><th style="text-align:center;">Stock</th></tr></thead>
    <tbody>${rowsHTML}</tbody>
  </table>
  <div class="footer">
    📷 @nura.neco &nbsp;·&nbsp; 📲 2262 240512 &nbsp;·&nbsp; 📲 2262 638838<br>
    <span style="margin-top:4px;display:block;">Precios sujetos a cambios sin previo aviso · NURA Artículos de Limpieza</span>
  </div>
  </body></html>`;

  try {
    const el = document.createElement('div');
    el.innerHTML = html;
    document.body.appendChild(el);
    await html2pdf().set({
      margin: [0.3, 0.3, 0.3, 0.3],
      filename: `nura-mayorista-${new Date().toISOString().slice(0,10)}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    }).from(el).save();
    document.body.removeChild(el);
    toast('PDF mayorista descargado ✅');
  } catch(e) {
    swalError('Error al generar el PDF.');
  }
};

window.wspMayorista = function() {
  const fecha = new Date().toLocaleDateString('es-AR');
  const cats = [...new Set(DB.productos.map(p => p.categoria))];
  let msg = `*🏪 NURA — Lista Mayorista*\n📅 ${fecha}\n`;
  msg += `_Precios exclusivos para vendedores_\n`;
  msg += `--------------------------\n\n`;

  cats.forEach(cat => {
    const prods = DB.productos.filter(p => p.categoria === cat);
    let bloque = '';
    prods.forEach(p => {
      const esAcc = p.tipo === 'accesorio';
      const sinStock = esAcc ? (p.stockUnidades||0) === 0 : (p.stockLitros||0) === 0;
      const tag = sinStock ? ' ❌ _sin stock_' : '';
      if (esAcc) {
        const precio = p.precioMayorista || p.precioVenta;
        bloque += `  • ${p.nombre} — Mayor: *${fmt(precio)}* · Rec: ${fmt(p.precioVenta)}/un${tag}\n`;
      } else {
        (p.presentaciones||[]).forEach((pr, i) => {
          const precio = pr.precioMayorista || pr.precioVenta;
          bloque += `  • ${p.nombre} ${pr.nombre} — Mayor: *${fmt(precio)}* · Rec: ${fmt(pr.precioVenta)}${i===0?tag:''}\n`;
        });
      }
    });
    if (bloque) {
      msg += `*${EMOJIS_CAT[cat]||'•'} ${cat}*\n${bloque}\n`;
    }
  });

  if (DB.combos.length) {
    msg += `*🎁 Combos*\n`;
    DB.combos.forEach(c => {
      const precio = c.precioMayorista || c.precio;
      msg += `  • ${c.nombre} — Mayor: *${fmt(precio)}* · Rec: ${fmt(c.precio)}\n`;
    });
    msg += '\n';
  }

  msg += `--------------------------\n`;
  msg += `📷 @nura.neco\n📲 2262 240512 / 2262 638838\n`;
  msg += `_Precios sujetos a cambios sin aviso previo_`;

  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
  toast('Adjuntá el PDF si lo descargaste 📎');
};

// ── Export catálogo Actual ──────────────────────────────────────────────────
function exportarCatalogo() {
  if(!DB.productos.length){swalInfo('Sin productos','No hay productos en el catálogo.');return;}
  let html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;padding:30px;color:#0f172a}.header{text-align:center;margin-bottom:28px;padding-bottom:18px;border-bottom:2px solid #52dad2}.logo{width:90px;height:90px;object-fit:contain}.brand{font-size:28px;font-weight:900;letter-spacing:8px}.a{color:#7c3aed}.sub{font-size:9px;color:#94a3b8;letter-spacing:3px;text-transform:uppercase;margin-top:4px}.fecha{color:#64748b;font-size:11px;margin-top:8px}.cat{margin-top:22px;margin-bottom:10px;padding-bottom:7px;border-bottom:1.5px solid #e2eaf2}.cat-title{font-size:16px;font-weight:800;color:#1ab8af}.prod{padding-left:18px;margin-bottom:10px}.prod-name{font-weight:700;font-size:13px}.prod-code{font-size:10px;color:#94a3b8;margin-left:6px}.pres{display:flex;justify-content:space-between;padding:2px 0 2px 18px;font-size:12px;color:#475569}.precio{font-weight:800;color:#1ab8af}.mayorista{color:#7c3aed;font-size:10px;}.footer{margin-top:36px;padding-top:18px;border-top:1px solid #e2eaf2;text-align:center;font-size:12px}.contactos{margin-top:10px;display:flex;justify-content:center;gap:24px;flex-wrap:wrap;color:#1ab8af;font-size:12px}hr{border:none;border-top:1px dashed #e2eaf2;margin:10px 0}</style></head><body>
    <div class="header"><img src="logo.png" class="logo" /><div class="brand">NUR<span class="a">A</span></div><div class="sub">artículos de limpieza</div><div class="fecha">Catálogo al ${new Date().toLocaleDateString('es-AR')}</div></div>`;
  const cats=[...new Set(DB.productos.map(p=>p.categoria))];
  cats.forEach(cat=>{
    html+=`<div class="cat"><div class="cat-title">${EMOJIS_CAT[cat]||'•'} ${cat}</div></div>`;
    DB.productos.filter(p=>p.categoria===cat).forEach(p=>{
      html+=`<div class="prod"><div class="prod-name">${p.nombre}${p.codigo?`<span class="prod-code">#${p.codigo}</span>`:''}</div>`;
      if(p.tipo==='accesorio'){html+=`<div class="pres"><span>Unidad</span><span class="precio">${fmt(p.precioVenta)}${p.precioMayorista?` <span class="mayorista">(Mayor: ${fmt(p.precioMayorista)})</span>`:''}</span></div>`;}
      else{(p.presentaciones||[]).forEach(pr=>{html+=`<div class="pres"><span>${pr.nombre}</span><span class="precio">${fmt(pr.precioVenta)}${pr.precioMayorista?` <span class="mayorista">(Mayor: ${fmt(pr.precioMayorista)})</span>`:''}</span></div>`;});}
      if(p.descripcion)html+=`<div style="padding-left:18px;font-size:10px;color:#94a3b8;">📝 ${p.descripcion}</div>`;
      html+=`</div>`;
    });html+=`<hr>`;
  });
  // Combos
  if(DB.combos.length){html+=`<div class="cat"><div class="cat-title">🎁 Combos</div></div>`;DB.combos.forEach(c=>{html+=`<div class="prod"><div class="prod-name">🎁 ${c.nombre}</div><div class="pres"><span>${c.descripcion||c.items?.map(i=>i.nombre).join(', ')}</span><span class="precio">${fmt(c.precio)}</span></div></div>`;});html+=`<hr>`;}
  html+=`<div class="footer"><div style="font-weight:700;margin-bottom:8px;">📞 ¡Consultanos para hacer tu pedido!</div><div class="contactos"><span>📷 @nura.neco</span><span>📲 2262 240512</span><span>📲 2262 638838</span></div><div style="margin-top:12px;font-size:10px;color:#94a3b8;">🌿 NURA — Productos de limpieza de alta calidad</div></div></body></html>`;
  openModal('📄 Exportar Catálogo',`
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">Vista previa del catálogo PDF.</p>
    <iframe id="pdfPreview" style="width:100%;height:340px;border:1px solid var(--border);border-radius:var(--radius-sm);"></iframe>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
      <button class="btn btn-primary" onclick="descargarPDF()">📄 Descargar PDF</button>
      <button class="btn btn-wsp-sm" onclick="wspCatalogoPDF()">📲 WhatsApp</button>
      <button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>
    </div>`,null,true);
  window._pdfHTML=html;
  setTimeout(()=>{const f=document.getElementById('pdfPreview');if(f)f.srcdoc=html;},50);
}
window.descargarPDF=async function(){if(!window._pdfHTML)return;toast('Generando PDF...','info');try{const el=document.createElement('div');el.innerHTML=window._pdfHTML;document.body.appendChild(el);await html2pdf().set({margin:[0.5,0.5,0.5,0.5],filename:`nura-catalogo-${new Date().toISOString().slice(0,10)}.pdf`,image:{type:'jpeg',quality:0.98},html2canvas:{scale:2,useCORS:true},jsPDF:{unit:'in',format:'a4',orientation:'portrait'}}).from(el).save();document.body.removeChild(el);toast('PDF descargado ✅');}catch(e){swalError('Error al generar el PDF.');}};
window.wspCatalogoPDF=function(){window.open(`https://wa.me/?text=${encodeURIComponent('*NURA — Artículos de Limpieza*\n\n¡Hola! Te compartimos nuestro catálogo de precios actualizado.\n\n📷 @nura.neco\n📲 2262 240512 / 2262 638838\n\n¡Gracias por elegirnos!')}`,'_blank');toast('Adjuntá el PDF descargado 📎');};

// ── Form Producto ─────────────────────────────────────────────────────────────
let _presTemp=[];

function formProducto(id) {
  const p=id?DB.productos.find(x=>x.id===id):null;
  _presTemp=p?.presentaciones?p.presentaciones.map(x=>({...x})):[];
  const esAcc=p?.tipo==='accesorio';
  const html=`<div style="display:flex;flex-direction:column;gap:16px;">
    <div class="form-grid">
      <div class="form-group full"><label>Nombre</label><input id="pNombre" value="${p?p.nombre:''}" placeholder="Ej: Lavandina Premium..." /></div>
      <div class="form-group"><label>Código</label><input id="pCodigo" value="${p?p.codigo||'':''}" placeholder="Ej: LAV-001" /></div>
      <div class="form-group"><label>Categoría</label><select id="pCategoria">${CATEGORIAS.map(c=>`<option value="${c}" ${p?.categoria===c?'selected':''}>${c}</option>`).join('')}</select></div>
      <div class="form-group"><label>Tipo</label><select id="pTipo" onchange="onTipoChange()"><option value="liquido" ${!esAcc?'selected':''}>💧 Líquido / Granel</option><option value="accesorio" ${esAcc?'selected':''}>🧹 Accesorio / Unidad</option></select></div>
      <div class="form-group full"><label>Descripción</label><textarea id="pDesc" rows="2">${p?p.descripcion||'':''}</textarea></div>
    </div>
    <div id="panelLiquido" style="${esAcc?'display:none':''}">
      <div style="background:var(--surface2);border-radius:var(--radius);padding:16px;border:1px solid var(--border);">
        <div class="section-title mb-12">🫙 Stock a granel</div>
        <div class="form-grid">
          <div class="form-group"><label>Stock actual (L)</label>${unitInput('pStockLitros',p?p.stockLitros||0:0,'L','0.001')}</div>
          <div class="form-group"><label>Stock mínimo (L)</label>${unitInput('pStockMinLitros',p?p.stockMinLitros||5:5,'L','0.001')}</div>
          <div class="form-group full"><label>Costo por litro ($)</label>${moneyInput('pCostoLitro',p?p.costoLitro||'':'','recalcTodasPres()')}<span class="form-note">Lo que pagás por litro a granel</span></div>
        </div>
      </div>
      <div style="background:var(--surface2);border-radius:var(--radius);padding:16px;border:1px solid var(--border);margin-top:12px;">
        <div class="section-header"><div class="section-title">📐 Presentaciones</div></div>
        <div style="margin-bottom:12px;"><label style="display:block;margin-bottom:6px;">Agregar rápido</label>
          <div class="flex gap-6 flex-wrap">${PRES_RAPIDAS.map(pr=>`<button class="btn btn-secondary btn-sm" type="button" onclick="agregarPresRapida('${pr.nombre}',${pr.litros})">${pr.nombre}</button>`).join('')}
            <button class="btn btn-violet btn-sm" type="button" onclick="agregarPresPersonalizada()">+ Personalizada</button></div>
        </div>
        <div id="presContainer"></div>
      </div>
    </div>
    <div id="panelAccesorio" style="${!esAcc?'display:none':''}">
      <div style="background:var(--surface2);border-radius:var(--radius);padding:16px;border:1px solid var(--border);">
        <div class="section-title mb-12">🧹 Accesorio</div>
        <div class="form-grid">
          <div class="form-group"><label>Stock actual (un)</label><input id="pStockUnidades" type="number" min="0" step="1" value="${p?p.stockUnidades||0:0}" /></div>
          <div class="form-group"><label>Stock mínimo (un)</label><input id="pStockMinUnidades" type="number" min="0" step="1" value="${p?p.stockMinUnidades||2:2}" /></div>
          <div class="form-group"><label>Costo unitario ($)</label>${moneyInput('pCostoUnidad',p?p.costoUnidad||'':'','calcAccesorio()')}</div>
          <div class="form-group"><label>% Ganancia</label><input id="pGananciaAcc" type="number" min="0" max="999" step="1" value="${p?p.gananciaAcc||40:40}" oninput="calcAccesorio()" /></div>
          <div class="cost-calc-box"><h4>💰 Cálculo Actual</h4>
            <div class="cost-row"><span>Costo</span><span id="accCostoU">$0.00</span></div>
            <div class="cost-row"><span id="accGanLabel">Ganancia</span><span id="accGan">$0.00</span></div>
            <div class="cost-row total"><span>Precio sugerido</span><span id="accPrecio">$0.00</span></div></div>
          <div class="form-group"><label>Precio Actual ($)</label>${moneyInput('pPrecioVentaAcc',p?p.precioVenta||'':'')}<span class="form-note">Podés sobreescribir</span></div>
          <div class="form-group"><label>% Descuento mayorista</label><input id="pDescMayAcc" type="number" min="0" max="100" step="1" value="${p?p.descMayorista||20:20}" oninput="calcAccesorio()" /></div>
          <div class="form-group"><label>Precio mayorista ($)</label>${moneyInput('pPrecioMayAcc',p?p.precioMayorista||'':'')}<span class="form-note">Para vendedores/distribuidores</span></div>
        </div>
      </div>
    </div>
  </div>`;
  openModal(p?'Editar Producto':'Nuevo Producto',html,guardarProducto.bind(null,id),true);
  setTimeout(()=>{renderPresContainer();recalcTodasPres();calcAccesorio();},30);
}

window.onTipoChange=function(){const t=document.getElementById('pTipo')?.value;document.getElementById('panelLiquido').style.display=t==='liquido'?'':'none';document.getElementById('panelAccesorio').style.display=t==='accesorio'?'':'none';};
window.calcAccesorio=function(){
  const c=parseFloat(document.getElementById('pCostoUnidad')?.value)||0,g=parseFloat(document.getElementById('pGananciaAcc')?.value)||0,p=c*(1+g/100);
  const descMay=parseFloat(document.getElementById('pDescMayAcc')?.value)||20;
  const pMay=p*(1-descMay/100);
  const s=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=fmt(v);};
  s('accCostoU',c);s('accGan',c*g/100);s('accPrecio',p);
  const gl=document.getElementById('accGanLabel');if(gl)gl.textContent=`Ganancia (${g}%)`;
  const pv=document.getElementById('pPrecioVentaAcc');if(pv&&p>0&&!pv.dataset.manual)pv.value=p.toFixed(2);
  const pm=document.getElementById('pPrecioMayAcc');if(pm&&pMay>0&&!pm.dataset.manual)pm.value=pMay.toFixed(2);
};

function renderPresContainer(){
  const cont=document.getElementById('presContainer');if(!cont)return;
  if(!_presTemp.length){cont.innerHTML=`<div class="empty-state" style="padding:20px;"><div class="empty-icon" style="font-size:28px;">📐</div><p>Agregá una presentación</p></div>`;return;}
  cont.innerHTML=_presTemp.map((pr,i)=>`
    <div class="pres-card" id="presCard${i}">
      <div class="pres-card-header"><div class="fw-700" style="font-size:13px;">📦 <span id="presTitle${i}">${pr.nombre}</span></div><button class="btn btn-danger btn-sm btn-icon" onclick="eliminarPres(${i})">✕</button></div>
      <div class="form-grid-3">
        <div class="form-group"><label>Nombre</label><input type="text" value="${pr.nombre}" oninput="_presTemp[${i}].nombre=this.value;const t=document.getElementById('presTitle${i}');if(t)t.textContent=this.value;" /></div>
        <div class="form-group"><label>Litros</label>${unitInput(`pL${i}`,pr.litros,'L','0.001',`_presTemp[${i}].litros=+this.value;recalcPres(${i});`)}</div>
        <div class="form-group"><label>Costo envase ($)</label>${moneyInput(`pCE${i}`,pr.costoEnvase||0,`_presTemp[${i}].costoEnvase=+this.value;recalcPres(${i});`)}</div>
        <div class="form-group"><label>Costo etiqueta ($)</label>${moneyInput(`pCEt${i}`,pr.costoEtiqueta||0,`_presTemp[${i}].costoEtiqueta=+this.value;recalcPres(${i});`)}</div>
        <div class="form-group"><label>% Ganancia</label><input type="number" min="0" max="999" step="1" value="${pr.ganancia||40}" oninput="_presTemp[${i}].ganancia=+this.value;recalcPres(${i});" /></div>
        <div class="form-group"><label style="color:var(--accent-dark);">Precio Actual ($)</label>${moneyInput(`pvPres${i}`,(pr.precioVenta||0).toFixed(2),`_presTemp[${i}].precioVenta=+this.value;document.getElementById('pvPres${i}').dataset.manual='1';`)}</div>
        <div class="form-group"><label>% Desc. mayorista</label><input type="number" min="0" max="100" step="1" value="${pr.descMayorista||20}" oninput="_presTemp[${i}].descMayorista=+this.value;recalcPres(${i});" /></div>
        <div class="form-group"><label style="color:#7c3aed;">Precio mayorista ($)</label>${moneyInput(`pvMay${i}`,(pr.precioMayorista||0).toFixed(2),`_presTemp[${i}].precioMayorista=+this.value;document.getElementById('pvMay${i}').dataset.manual='1';`)}</div>
      </div>
      <div class="pres-calc-row">
        <span>Producto: <strong id="pcCP${i}">—</strong></span><span>Env+Etiq: <strong id="pcEE${i}">—</strong></span>
        <span>Total: <strong id="pcCT${i}">—</strong></span><span>Gan.: <strong id="pcG${i}">—</strong></span>
        <span style="color:var(--accent-dark);font-weight:700;">Actual: <strong id="pcPV${i}">—</strong></span>
        <span style="color:#7c3aed;font-weight:700;">Mayorista: <strong id="pcMay${i}">—</strong></span>
      </div>
    </div>`).join('');
  _presTemp.forEach((_,i)=>recalcPres(i));
}
window.recalcPres=function(i){
  const cl=parseFloat(document.getElementById('pCostoLitro')?.value)||0;
  const pr=_presTemp[i];if(!pr)return;
  const cp=cl*pr.litros,ee=(pr.costoEnvase||0)+(pr.costoEtiqueta||0),ct=cp+ee,g=ct*((pr.ganancia||40)/100),pv=ct+g;
  const descMay=pr.descMayorista||20,pmay=pv*(1-descMay/100);
  const s=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=fmt(v);};
  s(`pcCP${i}`,cp);s(`pcEE${i}`,ee);s(`pcCT${i}`,ct);s(`pcG${i}`,g);s(`pcPV${i}`,pv);s(`pcMay${i}`,pmay);
  const pvEl=document.getElementById(`pvPres${i}`);if(pvEl&&!pvEl.dataset.manual){pvEl.value=pv.toFixed(2);_presTemp[i].precioVenta=pv;}
  const pmEl=document.getElementById(`pvMay${i}`);if(pmEl&&!pmEl.dataset.manual){pmEl.value=pmay.toFixed(2);_presTemp[i].precioMayorista=pmay;}
};
window.recalcTodasPres=function(){_presTemp.forEach((_,i)=>recalcPres(i));};
window.agregarPresRapida=function(nombre,litros){if(_presTemp.find(p=>p.nombre===nombre)){toast(`Ya existe ${nombre}`,'info');return;}_presTemp.push({id:genId(),nombre,litros,costoEnvase:0,costoEtiqueta:0,ganancia:40,descMayorista:20,precioVenta:0,precioMayorista:0});renderPresContainer();};
window.agregarPresPersonalizada=function(){_presTemp.push({id:genId(),nombre:'Nueva',litros:1,costoEnvase:0,costoEtiqueta:0,ganancia:40,descMayorista:20,precioVenta:0,precioMayorista:0});renderPresContainer();};
window.eliminarPres=function(i){_presTemp.splice(i,1);renderPresContainer();};

async function guardarProducto(id){
  const nombre=document.getElementById('pNombre').value.trim();
  if(!nombre){await swalError('El nombre es obligatorio');return;}
  const tipo=document.getElementById('pTipo').value,cat=document.getElementById('pCategoria').value;
  const desc=document.getElementById('pDesc').value.trim(),codigo=document.getElementById('pCodigo').value.trim();
  let prod;
  if(tipo==='liquido'){
    if(!_presTemp.length){await swalError('Agregá al menos una presentación');return;}
    const cl=parseFloat(document.getElementById('pCostoLitro').value)||0;
    if(!cl){await swalError('Ingresá el costo por litro');return;}
    prod={id:id||genId(),nombre,codigo,tipo,categoria:cat,descripcion:desc,stockLitros:parseFloat(document.getElementById('pStockLitros').value)||0,stockMinLitros:parseFloat(document.getElementById('pStockMinLitros').value)||5,costoLitro:cl,presentaciones:_presTemp.map(pr=>({id:pr.id||genId(),nombre:pr.nombre,litros:pr.litros||0,costoEnvase:pr.costoEnvase||0,costoEtiqueta:pr.costoEtiqueta||0,ganancia:pr.ganancia||40,descMayorista:pr.descMayorista||20,precioVenta:pr.precioVenta||0,precioMayorista:pr.precioMayorista||0}))};
  } else {
    prod={id:id||genId(),nombre,codigo,tipo,categoria:cat,descripcion:desc,stockUnidades:parseFloat(document.getElementById('pStockUnidades').value)||0,stockMinUnidades:parseFloat(document.getElementById('pStockMinUnidades').value)||2,costoUnidad:parseFloat(document.getElementById('pCostoUnidad').value)||0,gananciaAcc:parseFloat(document.getElementById('pGananciaAcc').value)||40,descMayorista:parseFloat(document.getElementById('pDescMayAcc').value)||20,precioVenta:parseFloat(document.getElementById('pPrecioVentaAcc').value)||0,precioMayorista:parseFloat(document.getElementById('pPrecioMayAcc').value)||0};
  }
  closeModal();
  await fbSave('productos',prod);
  toast(id?'Producto actualizado ✅':'Producto creado ✅');
}

async function eliminarProducto(id){const p=DB.productos.find(x=>x.id===id);const res=await swalConfirm('¿Eliminar producto?',`Se eliminará <strong>${p?.nombre}</strong>`);if(!res.isConfirmed)return;await fbRemove('productos',id);toast('Producto eliminado');}
async function duplicarProducto(id){const orig=DB.productos.find(x=>x.id===id);if(!orig)return;const copia=JSON.parse(JSON.stringify(orig));copia.id=genId();copia.nombre=`${orig.nombre} (copia)`;if(copia.presentaciones)copia.presentaciones=copia.presentaciones.map(pr=>({...pr,id:genId()}));await fbSave('productos',copia);toast('Producto duplicado ✅');}
function wspProducto(id){const p=DB.productos.find(x=>x.id===id);if(!p)return;let msg=`*🌿 NURA — ${p.nombre}*\n📦 ${p.categoria}${p.codigo?' | #'+p.codigo:''}\n\n`;if(p.tipo==='accesorio')msg+=`💲 ${fmt(p.precioVenta)} por unidad\n`;else(p.presentaciones||[]).forEach(pr=>{msg+=`• ${pr.nombre} → ${fmt(pr.precioVenta)}\n`;});if(p.descripcion)msg+=`\n📝 ${p.descripcion}\n`;msg+='\n¡Consultanos! 🌿';window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank');}

// ══════════════════════════════════════════════════════════════════════════════
// COMBOS
// ══════════════════════════════════════════════════════════════════════════════
function renderCombos() {
  const el = document.getElementById('page-combos');
  if (!el) return;

  document.getElementById('topbarActions').innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">

      <button class="btn btn-primary"
        onclick="formCombo(null)">
        + Combo
      </button>

      <button class="btn btn-secondary"
        onclick="imprimirCombos(false)">
        📄 Actual
      </button>

      <button class="btn btn-wsp-sm"
        onclick="imagenCombosWsp(false)">
        📲 Actual
      </button>

      <button class="btn btn-secondary"
        onclick="imprimirCombos(true)">
        📄 Mayorista
      </button>

      <button class="btn btn-wsp-sm"
        onclick="imagenCombosWsp(true)">
        📲 Mayorista
      </button>

    </div>
  `;

  if (!DB.combos.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎁</div>
        <p>No hay combos creados aún</p>
        <button class="btn btn-primary mt-8" onclick="formCombo(null)">
          Crear primer combo
        </button>
      </div>
    `;
    return;
  }

  const cards = DB.combos.map(c => {

    const itemsList = (c.items || [])
      .map(i => `
        <span class="badge badge-violet" style="margin:2px;">
          ${i.nombre} x${i.cantidad}
        </span>
      `).join('');

    return `
      <div class="m-card" style="border-left:4px solid var(--accent);">

        <div class="m-card-header">

          <div>
            <div class="m-card-title">🎁 ${c.nombre}</div>

            ${c.descripcion
              ? `<div class="m-card-subtitle">${c.descripcion}</div>`
              : ''}
          </div>

          <div style="text-align:right;">

            <div
              style="font-family:var(--font-display);font-size:22px;font-weight:800;"
              class="text-gradient"
            >
              ${fmt(c.precio)}
            </div>

            ${c.precioMayorista
              ? `
                <div style="
                  font-size:12px;
                  color:var(--accent-dark);
                ">
                  Mayor: ${fmt(c.precioMayorista)}
                </div>
              `
              : ''}

          </div>

        </div>

        <div style="
          margin:8px 0;
          flex-wrap:wrap;
          display:flex;
          gap:4px;
        ">
          ${itemsList}
        </div>

        <div class="m-card-footer">

          <button
            class="btn btn-secondary btn-sm"
            style="flex:1;"
            onclick="formCombo('${c.id}')"
          >
            ✏️ Editar
          </button>

          <button
            class="btn btn-wsp-sm btn-sm"
            style="flex:1;"
            onclick="wspCombo('${c.id}')"
          >
            📲 WhatsApp
          </button>

          <button
            class="btn btn-danger btn-sm btn-icon"
            onclick="eliminarCombo('${c.id}')"
          >
            🗑
          </button>

        </div>

      </div>
    `;

  }).join('');

  el.innerHTML = `
    <div
      style="
        display:grid;
        grid-template-columns:repeat(auto-fill,minmax(320px,1fr));
        gap:16px;
      "
    >
      ${cards}
    </div>
  `;
}

let _comboItems = [];
function formCombo(id) {
  const c = id ? DB.combos.find(x => x.id === id) : null;
  _comboItems = c ? c.items.map(x=>({...x})) : [];

  // construir lista de vendibles (productos y presentaciones)
  const vendibles = buildVendibles();

  const html = `<div style="display:flex;flex-direction:column;gap:14px;">
    <div class="form-grid">
      <div class="form-group full"><label>Nombre del combo</label><input id="cbNombre" value="${c?c.nombre:''}" placeholder="Ej: Kit Baño Completo" /></div>
      <div class="form-group full"><label>Descripción (opcional)</label><input id="cbDesc" value="${c?c.descripcion||'':''}" placeholder="Ej: Lavandina + Desengrasante + Limpiavidrios" /></div>
    </div>
    <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:12px;border:1px solid var(--border);">
      <label style="display:block;margin-bottom:8px;font-weight:700;">Agregar productos al combo</label>
      <div class="flex gap-8 flex-wrap">
        <select id="cbItemSel" style="flex:2;min-width:0;"><option value="">Seleccioná producto...</option>${vendibles.map(v=>`<option value="${v.key}">${v.label}</option>`).join('')}</select>
        <input id="cbCantidad" type="number" min="1" step="1" value="1" style="width:70px;flex-shrink:0;" />
        <button class="btn btn-primary" style="flex-shrink:0;" onclick="agregarItemCombo()">+ Agregar</button>
      </div>
    </div>
    <div id="comboItemsWrap">${renderComboItems()}</div>
    <div class="form-grid">
      <div class="form-group"><label>Precio combo Actual ($)</label>${moneyInput('cbPrecio',c?c.precio||'':'')}<span class="form-note">Precio especial del combo</span></div>
      <div class="form-group"><label>Precio combo mayorista ($)</label>${moneyInput('cbPrecioMay',c?c.precioMayorista||'':'')}<span class="form-note">Para vendedores/distribuidores</span></div>
    </div>
    <div id="cbSugerido" style="font-size:12px;color:var(--text-muted);"></div>
  </div>`;
  openModal(c?'Editar Combo':'Nuevo Combo', html, guardarCombo.bind(null,id), true);
  setTimeout(actualizarSugeridoCombo, 100);
}

function renderComboItems() {
  if (!_comboItems.length) return `<div class="empty-state" style="padding:12px;"><div class="empty-icon">📦</div><p>Agregá productos</p></div>`;
  return `<div style="border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden;">
    ${_comboItems.map((item,i) => `
      <div style="padding:10px 14px;background:${i%2===0?'var(--surface)':'var(--surface2)'};display:flex;align-items:center;gap:10px;">
        <span style="flex:1;font-weight:600;font-size:13px;">${item.nombre}</span>
        <span class="badge badge-violet">${item.detalle}</span>
        <input type="number" min="1" value="${item.cantidad}" style="width:55px;padding:4px 6px;" onchange="_comboItems[${i}].cantidad=+this.value;actualizarSugeridoCombo();" />
        <button class="btn btn-danger btn-sm btn-icon" onclick="_comboItems.splice(${i},1);document.getElementById('comboItemsWrap').innerHTML=renderComboItems();actualizarSugeridoCombo();">✕</button>
      </div>`).join('')}
  </div>`;
}

window.agregarItemCombo = function() {
  const key = document.getElementById('cbItemSel').value;
  const cant = parseInt(document.getElementById('cbCantidad').value) || 1;
  if (!key) { toast('Seleccioná un producto','info'); return; }
  const v = buildVendibles().find(x => x.key === key);
  if (!v) return;
  const exist = _comboItems.find(x => x.key === key);
  if (exist) { exist.cantidad += cant; }
  else _comboItems.push({...v, cantidad:cant});
  document.getElementById('comboItemsWrap').innerHTML = renderComboItems();
  actualizarSugeridoCombo();
};

function actualizarSugeridoCombo() {
  const total = _comboItems.reduce((s,i) => s + i.precio * i.cantidad, 0);
  const totalMay = _comboItems.reduce((s,i) => s + (i.precioMayorista||i.precio) * i.cantidad, 0);
  const el = document.getElementById('cbSugerido');
  if (el) el.innerHTML = total > 0
    ? `💡 Suma Actual: <strong>${fmt(total)}</strong> · Suma mayorista: <strong>${fmt(totalMay)}</strong> — el combo puede tener precio menor al total.`
    : '';
}

async function guardarCombo(id) {
  const nombre = document.getElementById('cbNombre').value.trim();
  if (!nombre) { await swalError('El nombre es obligatorio'); return; }
  if (!_comboItems.length) { await swalError('Agregá al menos un producto al combo'); return; }
  const precio = parseFloat(document.getElementById('cbPrecio').value) || 0;
  if (!precio) { await swalError('Ingresá el precio del combo'); return; }
  const combo = {
    id: id || genId(),
    nombre,
    descripcion: document.getElementById('cbDesc').value.trim(),
    items: _comboItems.map(i => ({ key:i.key, nombre:i.nombre, detalle:i.detalle, precio:i.precio, precioMayorista:i.precioMayorista||i.precio, cantidad:i.cantidad, litrosPorUnidad:i.litrosPorUnidad||0, productoId:i.productoId, presId:i.presId||null, esAcc:i.esAcc })),
    precio,
    precioMayorista: parseFloat(document.getElementById('cbPrecioMay').value) || 0,
  };
  closeModal();
  // Actualizar DB local inmediatamente para que renderCombos lo vea al navegar
  if (id) {
    const idx = DB.combos.findIndex(x => x.id === id);
    if (idx >= 0) DB.combos[idx] = combo; else DB.combos.push(combo);
  } else {
    DB.combos.push(combo);
  }
  navigate('combos');
  toast(id ? 'Combo actualizado ✅' : 'Combo creado ✅');
  // Guardar en Firebase en paralelo (el listener sincronizará si hay diferencias)
  fbSave('combos', combo);
}

async function eliminarCombo(id) {
  const c = DB.combos.find(x => x.id === id);
  const res = await swalConfirm('¿Eliminar combo?', `Se eliminará <strong>${c?.nombre}</strong>`);
  if (!res.isConfirmed) return;
  // Actualizar local inmediatamente
  DB.combos = DB.combos.filter(x => x.id !== id);
  navigate('combos');
  toast('Combo eliminado');
  fbRemove('combos', id);
}

function wspCombo(id) {
  const c = DB.combos.find(x => x.id === id);
  if (!c) return;
  let msg = `*🎁 NURA — ${c.nombre}*\n`;
  if (c.descripcion) msg += `📝 ${c.descripcion}\n`;
  msg += `\nIncluye:\n`;
  c.items.forEach(i => { msg += `  • ${i.nombre} x${i.cantidad}\n`; });
  msg += `\n💰 Precio combo: *${fmt(c.precio)}*\n\n¡Consultanos! 🌿`;
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
}

function generarHTMLCombos(esMayorista = false) {

  const combos = [...DB.combos]
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const fecha = new Date().toLocaleDateString('es-AR');

  return `
    <div style="
      font-family:Arial,sans-serif;
      background:#fff;
      color:#111;
      padding:30px;
    ">

      <div style="text-align:center;margin-bottom:30px;">

        <img
          src="logo.png"
          style="
            width:90px;
            height:90px;
            object-fit:contain;
          "
        >

        <h1 style="
          margin:10px 0 0;
          color:#1ab8af;
          font-size:34px;
        ">
          NURA
        </h1>

        <div style="
          color:#777;
          font-size:13px;
          letter-spacing:2px;
          text-transform:uppercase;
        ">
          artículos de limpieza
        </div>

        <div style="
          margin-top:15px;
          font-weight:700;
          font-size:16px;
        ">
          Lista de Combos
          ${esMayorista ? 'Mayorista' : 'Actual'}
        </div>

        <div style="
          font-size:12px;
          color:#777;
        ">
          ${fecha}
        </div>

      </div>

      <div style="
        display:grid;
        grid-template-columns:repeat(auto-fill,minmax(260px,1fr));
        gap:18px;
      ">

        ${combos.map(c => {

          const precio = esMayorista
            ? (c.precioMayorista || c.precio)
            : c.precio;

          return `
            <div style="
              border:2px solid #e5e7eb;
              border-radius:18px;
              padding:18px;
              break-inside:avoid;
            ">

              <div style="
                font-size:22px;
                font-weight:800;
                margin-bottom:8px;
              ">
                🎁 ${c.nombre}
              </div>

              ${c.descripcion ? `
                <div style="
                  font-size:13px;
                  color:#666;
                  margin-bottom:12px;
                ">
                  ${c.descripcion}
                </div>
              ` : ''}

              <div style="
                display:flex;
                flex-wrap:wrap;
                gap:6px;
                margin-bottom:14px;
              ">
                ${(c.items || []).map(i => `
                  <span style="
                    background:#f3f4f6;
                    border-radius:999px;
                    padding:4px 10px;
                    font-size:12px;
                  ">
                    ${i.nombre} x${i.cantidad}
                  </span>
                `).join('')}
              </div>

              <div style="
                font-size:30px;
                font-weight:900;
                color:#1ab8af;
                text-align:right;
              ">
                ${fmt(precio)}
              </div>

            </div>
          `;

        }).join('')}

      </div>

    </div>
  `;
}

async function imprimirCombos(esMayorista = false) {

  try {

    const html = generarHTMLCombos(esMayorista);

    const wrapper = document.createElement('div');

    wrapper.innerHTML = html;

 wrapper.style.position = 'fixed';
wrapper.style.left = '-100000px';
wrapper.style.top = '0';
wrapper.style.width = '1200px';
wrapper.style.background = '#ffffff';
wrapper.style.padding = '20px';
wrapper.style.pointerEvents = 'none';
wrapper.style.opacity = '1';
wrapper.style.zIndex = '-1';

    document.body.appendChild(wrapper);

    // esperar render completo
    await new Promise(r => setTimeout(r, 1500));

    // esperar imágenes
    const images = wrapper.querySelectorAll('img');

    await Promise.all(
      [...images].map(img => {

        if (img.complete) return Promise.resolve();

        return new Promise(res => {
          img.onload = res;
          img.onerror = res;
        });

      })
    );

    // convertir HTML → canvas
    const canvas = await html2canvas(wrapper, {

      scale: 2,

      useCORS: true,

      backgroundColor: '#ffffff',

      logging: false

    });

    document.body.removeChild(wrapper);

    // crear PDF manualmente
    const pdf = new jspdf.jsPDF('p', 'mm', 'a4');

    const pageWidth = 210;

    const pageHeight = 297;

    const imgWidth = pageWidth;

    const imgHeight =
      (canvas.height * imgWidth) / canvas.width;

    const imgData = canvas.toDataURL(
      'image/jpeg',
      1.0
    );

    let heightLeft = imgHeight;

    let position = 0;

    pdf.addImage(
      imgData,
      'JPEG',
      0,
      position,
      imgWidth,
      imgHeight
    );

    heightLeft -= pageHeight;

    while (heightLeft > 0) {

      position = heightLeft - imgHeight;

      pdf.addPage();

      pdf.addImage(
        imgData,
        'JPEG',
        0,
        position,
        imgWidth,
        imgHeight
      );

      heightLeft -= pageHeight;
    }

    pdf.save(
      esMayorista
        ? 'NURA-Combos-Mayorista.pdf'
        : 'NURA-Combos-Actual.pdf'
    );

  } catch(err) {

    console.error(err);

    alert('Error generando PDF');

  }
}

async function imagenCombosWsp(esMayorista = false) {

  const html = generarHTMLCombos(esMayorista);

  const wrapper = document.createElement('div');

  wrapper.innerHTML = html;

  wrapper.style.position = 'fixed';
  wrapper.style.inset = '0';
  wrapper.style.zIndex = '-1';
  wrapper.style.background = '#ffffff';
  wrapper.style.width = '1200px';
  wrapper.style.overflow = 'auto';

  document.body.appendChild(wrapper);

  await new Promise(r => setTimeout(r, 800));

  const imgs = wrapper.querySelectorAll('img');

  await Promise.all(
    [...imgs].map(img => {

      if (img.complete) return Promise.resolve();

      return new Promise(res => {
        img.onload = res;
        img.onerror = res;
      });

    })
  );

  const canvas = await html2canvas(wrapper, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff'
  });

  wrapper.remove();

  canvas.toBlob(async blob => {

    const file = new File(
      [blob],
      esMayorista
        ? 'combos-mayorista.png'
        : 'combos-Actual.png',
      { type: 'image/png' }
    );

    if (navigator.canShare && navigator.share) {

      try {

        await navigator.share({
          files: [file],
          title: 'Combos NURA',
          text: esMayorista
            ? 'Lista Mayorista'
            : 'Lista Actual'
        });

      } catch(e){}

    } else {

      const a = document.createElement('a');

      a.href = URL.createObjectURL(blob);

      a.download = file.name;

      a.click();

      window.open(
        'https://wa.me/?text=' +
        encodeURIComponent(
          esMayorista
            ? 'Lista de combos mayoristas'
            : 'Lista de combos Actuals'
        ),
        '_blank'
      );
    }

  }, 'image/png');
}

function wspCombos(esMayorista = false) {

  const combos = [...DB.combos]
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  let msg = '';

  msg += '*NURA - COMBOS*\n';

  msg += esMayorista
    ? '*PRECIOS MAYORISTAS*\n\n'
    : '*PRECIOS LISTA*\n\n';

  combos.forEach(c => {

    const precio = esMayorista
      ? (c.precioMayorista || c.precio)
      : c.precio;

    msg += '--------------------------\n';

    msg += `*${c.nombre}*\n`;

    if (c.descripcion)
      msg += `${c.descripcion}\n`;

    (c.items || []).forEach(i => {
      msg += `- ${i.nombre} x${i.cantidad}\n`;
    });

    msg += `Precio: ${fmt(precio)}\n\n`;

  });

  msg += 'Consultanos por pedidos';

  window.open(
    `https://wa.me/?text=${encodeURIComponent(msg)}`,
    '_blank'
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CLIENTES
// ══════════════════════════════════════════════════════════════════════════════
let clienteSearch='';
function renderClientes(){
  const el=document.getElementById('page-clientes');
  document.getElementById('topbarActions').innerHTML=`<button class="btn btn-primary" onclick="formCliente(null)">+ Cliente</button>`;
  const lista=DB.clientes.filter(c=>!clienteSearch||c.nombre.toLowerCase().includes(clienteSearch.toLowerCase())||(c.telefono||'').includes(clienteSearch));
  const tbl=`<div class="table-wrap hide-mobile"><table><thead><tr><th>Nombre</th><th>Teléfono</th><th>Email</th><th>Dirección</th><th>Tipo</th><th>Acciones</th></tr></thead><tbody>${lista.length===0?`<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">👥</div><p>Sin clientes</p></div></td></tr>`:lista.map(c=>`<tr><td class="fw-700">${c.nombre}</td><td>${c.telefono||'—'}</td><td>${c.email||'—'}</td><td>${c.direccion||'—'}</td><td><span class="badge badge-${c.esMayorista?'violet':'gray'}">${c.esMayorista?'Mayorista':'Actual'}</span></td><td><div class="table-actions"><button class="btn btn-secondary btn-sm" onclick="formCliente('${c.id}')">✏️</button>${c.telefono?`<button class="btn btn-wsp-sm btn-sm" onclick="wspCliente('${c.id}')">📲</button>`:''}<button class="btn btn-danger btn-sm btn-icon" onclick="eliminarCliente('${c.id}')">🗑</button></div></td></tr>`).join('')}</tbody></table></div>`;
  const cards=`<div class="mobile-card-list">${lista.map(c=>`<div class="m-card"><div class="m-card-header"><div><div class="m-card-title">👤 ${c.nombre}</div>${c.email?`<div class="m-card-subtitle">${c.email}</div>`:''}</div><span class="badge badge-${c.esMayorista?'violet':'gray'}">${c.esMayorista?'Mayorista':'Actual'}</span></div><div class="m-card-body">${c.telefono?`<div class="m-card-row"><span class="m-card-row-label">Teléfono</span><span class="m-card-row-value">${c.telefono}</span></div>`:''} ${c.direccion?`<div class="m-card-row"><span class="m-card-row-label">Dirección</span><span class="m-card-row-value">${c.direccion}</span></div>`:''}</div><div class="m-card-footer"><button class="btn btn-secondary btn-sm" style="flex:1;" onclick="formCliente('${c.id}')">✏️ Editar</button>${c.telefono?`<button class="btn btn-wsp-sm btn-sm" style="flex:1;" onclick="wspCliente('${c.id}')">📲</button>`:''}<button class="btn btn-danger btn-sm btn-icon" onclick="eliminarCliente('${c.id}')">🗑</button></div></div>`).join('')}</div>`;
  el.innerHTML=`<div class="flex flex-center gap-8 mb-16"><div class="search-bar" style="max-width:100%;"><span class="search-icon">🔍</span><input type="text" placeholder="Buscar cliente..." id="clienteSearch" value="${clienteSearch}" /></div></div>${lista.length===0&&!clienteSearch?`<div class="empty-state"><div class="empty-icon">👥</div><p>No hay clientes</p></div>`:tbl+cards}`;
  document.getElementById('clienteSearch').oninput=e=>{clienteSearch=e.target.value;renderClientes();};
}
function formCliente(id){
  const c=id?DB.clientes.find(x=>x.id===id):null;
  openModal(c?'Editar Cliente':'Nuevo Cliente',`<div class="form-grid">
    <div class="form-group full"><label>Nombre completo</label><input id="cNombre" value="${c?c.nombre:''}" placeholder="Nombre y apellido" /></div>
    <div class="form-group"><label>Teléfono / WhatsApp</label><input id="cTelefono" value="${c?c.telefono||'':''}" placeholder="+54 9 ..." /></div>
    <div class="form-group"><label>Email</label><input id="cEmail" type="email" value="${c?c.email||'':''}" /></div>
    <div class="form-group full"><label>Dirección</label><input id="cDireccion" value="${c?c.direccion||'':''}" /></div>
    <div class="form-group full">
      <label>Tipo de cliente</label>
      <select id="cEsMayorista">
        <option value="0" ${!c?.esMayorista?'selected':''}>🛍️ Actual (precio de lista)</option>
        <option value="1" ${c?.esMayorista?'selected':''}>🏪 Mayorista / Vendedor (precio mayorista)</option>
      </select>
      <span class="form-note">Los mayoristas ven precio mayorista automáticamente en ventas</span>
    </div>
    <div class="form-group full"><label>Notas</label><textarea id="cNotas">${c?c.notas||'':''}</textarea></div>
  </div>`,async()=>{
    const nombre=document.getElementById('cNombre').value.trim();if(!nombre){await swalError('El nombre es obligatorio');return;}
    const cl={id:c?c.id:genId(),nombre,telefono:document.getElementById('cTelefono').value.trim(),email:document.getElementById('cEmail').value.trim(),direccion:document.getElementById('cDireccion').value.trim(),notas:document.getElementById('cNotas').value.trim(),esMayorista:document.getElementById('cEsMayorista').value==='1'};
    closeModal();await fbSave('clientes',cl);toast(c?'Cliente actualizado ✅':'Cliente creado ✅');
  });
}
async function eliminarCliente(id){const c=DB.clientes.find(x=>x.id===id);const res=await swalConfirm('¿Eliminar cliente?',`Se eliminará a <strong>${c?.nombre}</strong>`);if(!res.isConfirmed)return;await fbRemove('clientes',id);toast('Cliente eliminado');}
function wspCliente(id){const c=DB.clientes.find(x=>x.id===id);if(!c?.telefono)return;window.open('https://wa.me/'+c.telefono.replace(/\D/g,''),'_blank');}

// ══════════════════════════════════════════════════════════════════════════════
// VENTAS
// ══════════════════════════════════════════════════════════════════════════════
let ventaItems=[];
function renderVentas(){
  const el=document.getElementById('page-ventas');
  document.getElementById('topbarActions').innerHTML=`<button class="btn btn-outline btn-sm" onclick="resumenPendientesModal()">📋 Pendientes</button><button class="btn btn-primary" onclick="formVenta()">+ Venta</button>`;
  const ventas=[...DB.ventas].sort((a,b)=>b.fecha-a.fecha);
  const tbl=`<div class="table-wrap hide-mobile"><table><thead><tr><th>Fecha</th><th>Cliente</th><th>Items</th><th>Total</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${ventas.length===0?`<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">🛒</div><p>Sin ventas</p></div></td></tr>`:ventas.map(v=>{const cl=DB.clientes.find(c=>c.id===v.clienteId);return`<tr><td>${fmtDate(v.fecha)}</td><td>${cl?cl.nombre:v.clienteNombre||'—'} ${cl?.esMayorista?'<span class="badge badge-violet" style="font-size:10px;">Mayor.</span>':''}</td><td>${v.items.length}</td><td class="fw-700">${fmt(v.total)}</td><td>${estadoSelect(v)}</td><td><div class="table-actions"><button class="btn btn-secondary btn-sm" onclick="verVenta('${v.id}')">👁</button><button class="btn btn-wsp-sm btn-sm" onclick="wspVenta('${v.id}')">📲</button><button class="btn btn-danger btn-sm btn-icon" onclick="eliminarVenta('${v.id}')">🗑</button></div></td></tr>`;}).join('')}</tbody></table></div>`;
  const cards=`<div class="mobile-card-list">${ventas.map(v=>{const cl=DB.clientes.find(c=>c.id===v.clienteId);return`<div class="m-card"><div class="m-card-header"><div><div class="m-card-title">${cl?cl.nombre:v.clienteNombre||'Sin cliente'}${cl?.esMayorista?' <span class="badge badge-violet" style="font-size:10px;">Mayorista</span>':''}</div><div class="m-card-subtitle">${fmtDate(v.fecha)} · ${v.items.length} ítem(s)</div></div>${estadoSelect(v)}</div><div style="font-family:var(--font-display);font-size:22px;font-weight:800;" class="text-gradient">${fmt(v.total)}</div><div class="m-card-footer mt-8"><button class="btn btn-secondary btn-sm" style="flex:1;" onclick="verVenta('${v.id}')">👁 Ver</button><button class="btn btn-wsp-sm btn-sm" style="flex:1;" onclick="wspVenta('${v.id}')">📲</button><button class="btn btn-danger btn-sm btn-icon" onclick="eliminarVenta('${v.id}')">🗑</button></div></div>`;}).join('')}</div>`;
  el.innerHTML=ventas.length===0?`<div class="empty-state"><div class="empty-icon">🛒</div><p>No hay ventas registradas</p></div>`:tbl+cards;
}
// ── Resumen de pendientes multi-venta por cliente ─────────────────────────────
function resumenPendientesModal() {
  const pendientes = DB.ventas.filter(v => v.estado === 'pendiente');
  if (!pendientes.length) { swalInfo('Sin pendientes', 'No hay ventas pendientes.'); return; }

  // Agrupar por cliente
  const porCliente = {};
  pendientes.forEach(v => {
    const key = v.clienteId || v.clienteNombre || '—';
    if (!porCliente[key]) porCliente[key] = [];
    porCliente[key].push(v);
  });

  const clientes = Object.keys(porCliente).map(key => {
    const cl = DB.clientes.find(c => c.id === key);
    return { key, nombre: cl ? cl.nombre : (porCliente[key][0].clienteNombre || '—'), ventas: porCliente[key], cl };
  }).sort((a,b) => a.nombre.localeCompare(b.nombre));

  openModal('📋 Resumen pendientes por cliente', `
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:14px;">
      Seleccioná un cliente para ver y enviar todas sus ventas pendientes juntas.
    </p>
    <div style="display:flex;flex-direction:column;gap:8px;">
      ${clientes.map(c => {
        const total = c.ventas.reduce((s,v) => s + v.total, 0);
        return `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <div>
            <div style="font-weight:800;font-size:14px;">${c.nombre}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${c.ventas.length} venta(s) pendiente(s)</div>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div style="font-family:var(--font-display);font-weight:800;font-size:18px;color:var(--accent-dark);">${fmt(total)}</div>
            <div style="display:flex;gap:6px;margin-top:6px;justify-content:flex-end;">
              <button class="btn btn-secondary btn-sm" onclick="verPendientesCliente('${c.key}')">👁 Ver</button>
              <button class="btn btn-wsp-sm btn-sm" onclick="wspPendientesCliente('${c.key}')">📲 WS</button>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>
  `, null, true);
}

window.verPendientesCliente = function(clienteKey) {
  const pendientes = DB.ventas.filter(v => v.estado === 'pendiente' && (v.clienteId === clienteKey || v.clienteNombre === clienteKey));
  const cl = DB.clientes.find(c => c.id === clienteKey);
  const nombre = cl ? cl.nombre : (pendientes[0]?.clienteNombre || '—');
  const totalGral = pendientes.reduce((s,v) => s + v.total, 0);

  const ventasHTML = pendientes.map(v => {
    const itemsRows = v.items.map(i =>
      `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;border-bottom:1px solid var(--border);">
        <span style="color:var(--text-muted);">${i.nombre} <span style="font-size:10px;">${i.detalle||''}</span> × ${i.cantidad}</span>
        <span style="font-weight:700;">${fmt(i.subtotal)}</span>
      </div>`
    ).join('');
    return `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div style="font-size:11px;color:var(--text-muted);">📅 ${fmtDate(v.fecha)}</div>
        <div style="font-family:var(--font-display);font-weight:800;color:var(--accent-dark);">${fmt(v.total)}</div>
      </div>
      ${itemsRows}
      ${v.descuento ? `<div style="font-size:11px;color:var(--danger);margin-top:4px;">Descuento: -${fmt(v.descuento)}</div>` : ''}
      ${v.obs ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">📝 ${v.obs}</div>` : ''}
    </div>`;
  }).join('');

  openModal(`📋 Pendientes — ${nombre}`, `
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
      <button class="btn btn-wsp-sm" style="flex:1;" onclick="wspPendientesCliente('${clienteKey}')">📲 Enviar por WhatsApp</button>
      <button class="btn btn-secondary btn-sm" onclick="resumenPendientesModal()">← Volver</button>
    </div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-size:12px;color:var(--text-muted);">${pendientes.length} venta(s) pendiente(s)</div>
        <div style="font-size:11px;color:var(--text-muted);">${cl?.telefono ? '📲 '+cl.telefono : ''}</div>
      </div>
      <div style="font-family:var(--font-display);font-weight:900;font-size:24px;" class="text-gradient">
        ${fmt(totalGral)}
      </div>
    </div>
    <div style="max-height:380px;overflow-y:auto;">
      ${ventasHTML}
    </div>
  `, null, true);
};

window.wspPendientesCliente = function(clienteKey) {
  const pendientes = DB.ventas.filter(v => v.estado === 'pendiente' && (v.clienteId === clienteKey || v.clienteNombre === clienteKey));
  const cl = DB.clientes.find(c => c.id === clienteKey);
  const nombre = cl ? cl.nombre : (pendientes[0]?.clienteNombre || '—');
  const totalGral = pendientes.reduce((s,v) => s + v.total, 0);

  let msg = `*🧾 NURA — Resumen de cuenta*\n`;
  msg += `👤 ${nombre}\n`;
  msg += `📅 ${new Date().toLocaleDateString('es-AR')}\n`;
  msg += `--------------------------\n\n`;

  pendientes.forEach((v, idx) => {
    msg += `*Pedido ${idx + 1}* — ${fmtDate(v.fecha)}\n`;
    v.items.forEach(i => {
      msg += `  • ${i.nombre}${i.detalle && i.detalle !== 'Unidad' ? ' ' + i.detalle : ''} × ${i.cantidad} = ${fmt(i.subtotal)}\n`;
    });
    if (v.descuento) msg += `  🔖 Descuento: -${fmt(v.descuento)}\n`;
    if (v.obs) msg += `  📝 ${v.obs}\n`;
    msg += `  💰 *Subtotal: ${fmt(v.total)}*\n`;
    if (idx < pendientes.length - 1) msg += `\n`;
  });

  msg += `\n--------------------------\n`;
  msg += `💰 *TOTAL A PAGAR: ${fmt(totalGral)}*\n`;
  msg += `_${pendientes.length} pedido(s) pendiente(s)_\n\n`;
  msg += `¡Gracias por elegirnos! 🌿\n📷 @nura.neco`;

  const tel = cl?.telefono?.replace(/\D/g,'');
  window.open(`https://wa.me/${tel||''}?text=${encodeURIComponent(msg)}`, '_blank');
};
function estadoSelect(v){const col=v.estado==='pagado'?'rgba(82,218,210,0.14)':v.estado==='pendiente'?'rgba(245,158,11,0.12)':'rgba(244,63,94,0.1)';const tc=v.estado==='pagado'?'var(--accent-dark)':v.estado==='pendiente'?'#b45309':'var(--danger)';return`<select class="badge" onchange="cambiarEstadoVenta('${v.id}',this.value)" style="border:none;font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;cursor:pointer;background:${col};color:${tc};"><option value="pagado" ${v.estado==='pagado'?'selected':''}>Pagado</option><option value="pendiente" ${v.estado==='pendiente'?'selected':''}>Pendiente</option><option value="cancelado" ${v.estado==='cancelado'?'selected':''}>Cancelado</option></select>`;}
window.cambiarEstadoVenta = async function(id, estado) {
  const v = DB.ventas.find(x => x.id === id);
  if (!v) return;

  // 1. Actualizar estado
  v.estado = estado;

  // 2. Si se marca como pagado, opcionalmente podrías asegurar que el saldo quede en 0
  // esto ayuda si el usuario marca "pagado" manualmente en lugar de registrar pagos parciales
  if (estado === 'pagado') {
    // Si tienes pagos parciales, esto los mantiene; si no, podrías setear v.pagos = ...
  }

  // 3. Guardar en Firebase
  await fbSave('ventas', v);
  toast('Estado actualizado');

  // 4. REFRESCAR LA VISTA
  // Esto es lo que faltaba: si el usuario está viendo la página de deudas, se renderiza de nuevo
  if (currentPage === 'deudas') {
    renderDeudas();
  }
  
  // Opcional: si también quieres que el dashboard se actualice
  if (currentPage === 'dashboard') {
    renderDashboard();
  }
};

// Construye lista de vendibles incluyendo combos
function buildVendibles(){
  const items=[];
  DB.productos.forEach(p=>{
    if(p.tipo==='accesorio'){
      items.push({key:`${p.id}|acc`,label:`${EMOJIS_CAT[p.categoria]||'🧴'} ${p.nombre} — unidad — ${fmt(p.precioVenta)} (Mayor: ${fmt(p.precioMayorista||p.precioVenta)})`,productoId:p.id,presId:null,nombre:p.nombre,detalle:'Unidad',precio:p.precioVenta,precioMayorista:p.precioMayorista||p.precioVenta,litrosPorUnidad:0,stockDisp:p.stockUnidades||0,esAcc:true,esCombo:false});
    } else {
      (p.presentaciones||[]).forEach(pr=>{
        const mu=pr.litros>0?Math.floor((p.stockLitros||0)/pr.litros):999;
        items.push({key:`${p.id}|${pr.id}`,label:`${EMOJIS_CAT[p.categoria]||'🧴'} ${p.nombre} ${pr.nombre} — ${fmt(pr.precioVenta)} (Mayor: ${fmt(pr.precioMayorista||pr.precioVenta)}) stock:${mu}`,productoId:p.id,presId:pr.id,nombre:`${p.nombre} ${pr.nombre}`,detalle:pr.nombre,precio:pr.precioVenta,precioMayorista:pr.precioMayorista||pr.precioVenta,litrosPorUnidad:pr.litros,stockDisp:mu,esAcc:false,esCombo:false});
      });
    }
  });
  // Agregar combos
  DB.combos.forEach(c=>{
    items.push({key:`combo|${c.id}`,label:`🎁 COMBO: ${c.nombre} — ${fmt(c.precio)} (Mayor: ${fmt(c.precioMayorista||c.precio)})`,productoId:null,presId:null,nombre:`🎁 ${c.nombre}`,detalle:'Combo',precio:c.precio,precioMayorista:c.precioMayorista||c.precio,litrosPorUnidad:0,stockDisp:999,esAcc:false,esCombo:true,comboId:c.id,comboItems:c.items});
  });
  return items;
}

function formVenta(){ventaItems=[];renderModalVenta();}
function renderModalVenta(){
  const vendibles=buildVendibles();
  openModal('Nueva Venta',`
    <div class="form-group mb-12">
      <label>Cliente <span style="color:var(--danger)">*</span></label>
      <select id="vCliente" style="border-color:var(--danger);">
        <option value="">— Seleccioná un cliente (obligatorio) —</option>
        ${DB.clientes.map(c=>`<option value="${c.id}">${c.nombre}${c.esMayorista?' 🏪':''}</option>`).join('')}
      </select>
    </div>
    <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px;border:1px solid var(--border);">
      <label style="display:block;margin-bottom:8px;">Agregar producto o combo</label>
      <div class="flex gap-8 flex-wrap">
        <select id="vItemSel" style="flex:2;min-width:0;"><option value="">Seleccioná...</option>${vendibles.map(v=>`<option value="${v.key}">${v.label}</option>`).join('')}</select>
        <input id="vCantidad" type="number" min="1" step="1" value="1" style="width:70px;flex-shrink:0;" />
        <button class="btn btn-primary" style="flex-shrink:0;" onclick="agregarItemVenta()">+ Agregar</button>
      </div>
    </div>
    <div id="ventaCartWrap">${renderVentaCart()}</div>
    <div class="form-grid keep-2 mt-12">
      <div class="form-group"><label>Descuento ($)</label>${moneyInput('vDescuento','0','updateVentaTotals()')}</div>
      <div class="form-group"><label>Observaciones</label><input id="vObs" type="text" placeholder="Notas..." /></div>
    </div>
    <div class="form-group mt-8">
      <label style="font-weight:800;">Tipo de precio</label>
      <div style="display:flex;gap:10px;margin-top:6px;">
        <label style="flex:1;display:flex;align-items:center;gap:8px;background:var(--surface2);border:2px solid var(--border);border-radius:var(--radius-sm);padding:10px 12px;cursor:pointer;">
          <input type="radio" name="vTipoPrecio" value="Actual" checked onchange="recalcPreciosVenta()" style="accent-color:var(--accent);" />
          <span>🛍️ <strong>Actual</strong></span>
        </label>
        <label style="flex:1;display:flex;align-items:center;gap:8px;background:var(--surface2);border:2px solid var(--border);border-radius:var(--radius-sm);padding:10px 12px;cursor:pointer;">
          <input type="radio" name="vTipoPrecio" value="mayorista" onchange="recalcPreciosVenta()" style="accent-color:var(--accent);" />
          <span>🏪 <strong>Mayorista</strong></span>
        </label>
      </div>
    </div>
    <div id="ventaTotalBox"></div>`,guardarVenta,true);
  setTimeout(updateVentaTotals,30);
}

// Lee si es mayorista del radio button (no del cliente)
function esVentaMayorista() {
  return document.querySelector('input[name="vTipoPrecio"]:checked')?.value === 'mayorista';
}

window.recalcPreciosVenta = function() {
  const esMay = esVentaMayorista();
  ventaItems.forEach(item => {
    item.precioAplicado = esMay ? (item.precioMayorista || item.precio) : item.precio;
    item.subtotal = item.precioAplicado * item.cantidad;
  });
  document.getElementById('ventaCartWrap').innerHTML = renderVentaCart();
  updateVentaTotals();
};

function renderVentaCart(){
  if(!ventaItems.length)return`<div class="empty-state" style="padding:16px;"><div class="empty-icon">🛒</div><p>Agregá productos</p></div>`;
  const esMay = esVentaMayorista();
  const tbl=`<div class="table-wrap hide-mobile"><table class="cart-table"><thead><tr><th>Producto</th><th>Pres.</th><th>Cant.</th><th>Precio</th><th>Subtotal</th><th></th></tr></thead><tbody>${ventaItems.map((item,i)=>`<tr><td class="fw-600">${item.nombre}</td><td><span class="badge ${item.esCombo?'badge-green':'badge-violet'}">${item.detalle}</span>${esMay?'<span class="badge badge-violet" style="font-size:9px;margin-left:3px;">Mayor.</span>':''}</td><td><input type="number" min="1" value="${item.cantidad}" style="width:55px;padding:4px 6px;" onchange="_updVI(${i},+this.value)" /></td><td>${fmt(item.precioAplicado||item.precio)}</td><td class="fw-700">${fmt(item.subtotal)}</td><td><button class="btn btn-danger btn-sm btn-icon" onclick="_rmVI(${i})">✕</button></td></tr>`).join('')}</tbody></table></div>`;
  const cards=`<div class="mobile-card-list" style="gap:7px;">${ventaItems.map((item,i)=>`<div class="m-card" style="padding:10px 12px;"><div class="m-card-header" style="margin-bottom:7px;"><div><div class="m-card-title" style="font-size:13px;">${item.nombre}</div><span class="badge ${item.esCombo?'badge-green':'badge-violet'}">${item.detalle}</span>${esMay?'<span class="badge badge-violet" style="font-size:9px;margin-left:3px;">Mayor.</span>':''}</div><button class="btn btn-danger btn-sm btn-icon" onclick="_rmVI(${i})">✕</button></div><div class="flex-center gap-8"><label style="font-size:11px;color:var(--text-muted);">Cant.</label><input type="number" min="1" value="${item.cantidad}" style="width:60px;padding:5px 8px;" onchange="_updVI(${i},+this.value)" /><span style="flex:1;text-align:right;font-family:var(--font-display);font-weight:800;font-size:16px;" class="text-gradient">${fmt(item.subtotal)}</span></div></div>`).join('')}</div>`;
  return tbl+cards;
}

window._updVI=function(i,v){
  const esMay = esVentaMayorista();
  ventaItems[i].cantidad=v;
  const precio = esMay ? (ventaItems[i].precioMayorista || ventaItems[i].precio) : ventaItems[i].precio;
  ventaItems[i].precioAplicado = precio;
  ventaItems[i].subtotal=v*precio;
  document.getElementById('ventaCartWrap').innerHTML=renderVentaCart();
  updateVentaTotals();
};
window._rmVI=function(i){ventaItems.splice(i,1);document.getElementById('ventaCartWrap').innerHTML=renderVentaCart();updateVentaTotals();};

window.agregarItemVenta=async function(){
  const key=document.getElementById('vItemSel').value;
  const cant=parseInt(document.getElementById('vCantidad').value)||1;
  if(!key){await swalError('Seleccioná un producto o combo');return;}
  const esMay = esVentaMayorista();
  const v=buildVendibles().find(x=>x.key===key);
  if(!v)return;
  if(!v.esCombo && v.stockDisp<cant){await swalError(`Stock insuficiente. Disponible: <strong>${v.stockDisp} un</strong>`);return;}
  const precioAplicado = esMay ? (v.precioMayorista || v.precio) : v.precio;
  const exist=ventaItems.find(x=>x.key===key);
  if(exist){exist.cantidad+=cant;exist.precioAplicado=precioAplicado;exist.subtotal=exist.cantidad*precioAplicado;}
  else ventaItems.push({...v,cantidad:cant,precioAplicado,subtotal:precioAplicado*cant});
  document.getElementById('ventaCartWrap').innerHTML=renderVentaCart();
  updateVentaTotals();
};

window.updateVentaTotals=function(){const sub=ventaItems.reduce((s,i)=>s+i.subtotal,0),desc=parseFloat(document.getElementById('vDescuento')?.value)||0,total=Math.max(0,sub-desc);const box=document.getElementById('ventaTotalBox');if(box)box.innerHTML=`<div class="cost-calc-box mt-12"><div class="cost-row"><span>Subtotal</span><span>${fmt(sub)}</span></div><div class="cost-row"><span>Descuento</span><span style="color:var(--danger)">-${fmt(desc)}</span></div><div class="cost-row total"><span>Total</span><span>${fmt(total)}</span></div></div>`;};

async function guardarVenta(){
  const clienteId=document.getElementById('vCliente')?.value||'';
  if(!clienteId){ await swalError('⚠️ Debés seleccionar un cliente antes de confirmar la venta.'); return; }
  if(!ventaItems.length){await swalError('Agregá al menos un producto');return;}
  const esMay = esVentaMayorista();
  const sub=ventaItems.reduce((s,i)=>s+i.subtotal,0),desc=parseFloat(document.getElementById('vDescuento')?.value)||0,total=Math.max(0,sub-desc);
  const cl=DB.clientes.find(c=>c.id===clienteId);
  const prodsUpd={};
  ventaItems.forEach(item=>{
    if(item.esCombo){
      (item.comboItems||[]).forEach(ci=>{
        const p=DB.productos.find(x=>x.id===ci.productoId);
        if(!p)return;
        if(ci.esAcc)p.stockUnidades=Math.max(0,(p.stockUnidades||0)-ci.cantidad*item.cantidad);
        else p.stockLitros=Math.max(0,(p.stockLitros||0)-(ci.litrosPorUnidad||0)*ci.cantidad*item.cantidad);
        prodsUpd[p.id]=p;
      });
    } else {
      const p=DB.productos.find(x=>x.id===item.productoId);
      if(!p)return;
      if(item.esAcc)p.stockUnidades=Math.max(0,(p.stockUnidades||0)-item.cantidad);
      else p.stockLitros=Math.max(0,(p.stockLitros||0)-item.litrosPorUnidad*item.cantidad);
      prodsUpd[p.id]=p;
    }
  });
  const venta={id:genId(),fecha:Date.now(),clienteId,clienteNombre:cl?cl.nombre:'',esMayorista:esMay,items:ventaItems.map(i=>({...i})),subtotal:sub,descuento:desc,total,estado:'pendiente',obs:document.getElementById('vObs')?.value.trim()||''};
  closeModal();
  await Promise.all([...Object.values(prodsUpd).map(p=>fbSave('productos',p)),fbSave('ventas',venta)]);
  swalSuccess('¡Venta registrada!',`Total: <strong>${fmt(total)}</strong>${esMay?' <span class="badge badge-violet">Precio mayorista</span>':''}`);
}

function verVenta(id){const v=DB.ventas.find(x=>x.id===id);if(!v)return;const cl=DB.clientes.find(c=>c.id===v.clienteId);openModal('Detalle de Venta',`<p class="mb-8"><strong>Fecha:</strong> ${fmtDate(v.fecha)}</p><p class="mb-8"><strong>Cliente:</strong> ${cl?cl.nombre:v.clienteNombre||'—'}${v.esMayorista?' <span class="badge badge-violet">Mayorista</span>':''}</p>${v.obs?`<p class="mb-12"><strong>Obs:</strong> ${v.obs}</p>`:''}<p class="mb-12"><strong>Estado:</strong> <span class="badge badge-${v.estado==='pagado'?'green':v.estado==='pendiente'?'orange':'red'}">${v.estado}</span></p><div class="table-wrap mb-12"><table class="cart-table"><thead><tr><th>Producto</th><th>Pres.</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr></thead><tbody>${v.items.map(i=>`<tr><td class="fw-600">${i.nombre}</td><td><span class="badge badge-violet">${i.detalle}</span></td><td>${i.cantidad}</td><td>${fmt(i.precioAplicado||i.precio)}</td><td class="fw-700">${fmt(i.subtotal)}</td></tr>`).join('')}</tbody></table></div><div class="cost-calc-box"><div class="cost-row"><span>Subtotal</span><span>${fmt(v.subtotal)}</span></div><div class="cost-row"><span>Descuento</span><span style="color:var(--danger)">-${fmt(v.descuento||0)}</span></div><div class="cost-row total"><span>Total</span><span>${fmt(v.total)}</span></div></div><div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;"><button class="btn btn-wsp-sm" onclick="wspVenta('${v.id}')">📲 WhatsApp</button></div>`,null,true);}
function wspVenta(id){const v=DB.ventas.find(x=>x.id===id);if(!v)return;const cl=DB.clientes.find(c=>c.id===v.clienteId);let msg=`*🧾 NURA — Comprobante*\n📅 ${fmtDate(v.fecha)}\n`;if(cl)msg+=`👤 ${cl.nombre}${v.esMayorista?' (Mayorista)':''}\n`;msg+=`\n`;v.items.forEach(i=>msg+=`• ${i.nombre} x${i.cantidad} = ${fmt(i.subtotal)}\n`);if(v.descuento)msg+=`\n🔖 Descuento: -${fmt(v.descuento)}`;msg+=`\n\n💰 *Total: ${fmt(v.total)}*\n\nGracias por elegirnos! 🌿`;const tel=cl?.telefono?.replace(/\D/g,'');window.open(`https://wa.me/${tel||''}?text=${encodeURIComponent(msg)}`,'_blank');}
async function eliminarVenta(id){const res=await swalConfirm('¿Eliminar venta?','No se puede deshacer.');if(!res.isConfirmed)return;await fbRemove('ventas',id);toast('Venta eliminada');}

// ══════════════════════════════════════════════════════════════════════════════
// COMPRAS
// ══════════════════════════════════════════════════════════════════════════════
function renderCompras(){
  const el=document.getElementById('page-compras');
  document.getElementById('topbarActions').innerHTML=`<button class="btn btn-primary" onclick="formCompra()">+ Compra</button>`;
  const compras=[...DB.compras].sort((a,b)=>b.fecha-a.fecha);
  const tbl=`<div class="table-wrap hide-mobile"><table><thead><tr><th>Fecha</th><th>Producto</th><th>Proveedor</th><th>Cantidad</th><th>Costo unit.</th><th>Total</th><th></th></tr></thead><tbody>${compras.length===0?`<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">🚚</div><p>Sin compras</p></div></td></tr>`:compras.map(c=>`<tr><td>${fmtDate(c.fecha)}</td><td class="fw-700">${c.productoNombre}</td><td>${c.proveedor||'—'}</td><td>${c.tipo==='accesorio'?c.cantidad+' un':fmtL(c.cantidad)+' L'}</td><td>${fmt(c.precioUnit)}/${c.tipo==='accesorio'?'un':'L'}</td><td class="fw-700">${fmt(c.total)}</td><td><button class="btn btn-danger btn-sm btn-icon" onclick="eliminarCompra('${c.id}')">🗑</button></td></tr>`).join('')}</tbody></table></div>`;
  const cards=`<div class="mobile-card-list">${compras.map(c=>`<div class="m-card"><div class="m-card-header"><div><div class="m-card-title">${c.productoNombre}</div><div class="m-card-subtitle">${fmtDate(c.fecha)}${c.proveedor?' · '+c.proveedor:''}</div></div><span class="fw-700 text-gradient" style="font-family:var(--font-display);font-size:18px;">${fmt(c.total)}</span></div><div class="m-card-body"><div class="m-card-row"><span class="m-card-row-label">Cantidad</span><span class="m-card-row-value">${c.tipo==='accesorio'?c.cantidad+' un':fmtL(c.cantidad)+' L'}</span></div><div class="m-card-row"><span class="m-card-row-label">Costo/unit.</span><span class="m-card-row-value">${fmt(c.precioUnit)}</span></div></div><div class="m-card-footer"><button class="btn btn-danger btn-sm" onclick="eliminarCompra('${c.id}')">🗑 Eliminar</button></div></div>`).join('')}</div>`;
  el.innerHTML=compras.length===0?`<div class="empty-state"><div class="empty-icon">🚚</div><p>No hay compras registradas</p></div>`:tbl+cards;
}
function formCompra(){
  openModal('Nueva Compra',`<div class="form-grid">
    <div class="form-group full"><label>Producto</label><select id="cpProducto" onchange="onCpProdChange()"><option value="">Seleccioná...</option>${DB.productos.map(p=>`<option value="${p.id}">${p.nombre} (${p.tipo==='accesorio'?'accesorio':'líquido'})${p.codigo?' #'+p.codigo:''}</option>`).join('')}</select></div>
    <div class="form-group"><label>Proveedor</label><input id="cpProveedor" placeholder="Nombre del proveedor" /></div>
    <div class="form-group"><label>Fecha</label><input id="cpFecha" type="date" value="${new Date().toISOString().slice(0,10)}" /></div>
    <div class="form-group"><label id="cpCantLabel">Cantidad (L)</label>${unitInput('cpCantidad','1','L','0.001','calcCompra()')}</div>
    <div class="form-group"><label id="cpPrecioLabel">Precio por L ($)</label>${moneyInput('cpPrecioUnit','','calcCompra()')}</div>
    <div class="cost-calc-box"><h4>Total</h4><div class="cost-row total"><span>Total</span><span id="cpTotal">$0.00</span></div></div>
    <div class="form-group full"><label>Notas</label><textarea id="cpNotas" rows="2"></textarea></div>
  </div>`,guardarCompra);
}
window.onCpProdChange=function(){const p=DB.productos.find(x=>x.id===document.getElementById('cpProducto').value);if(!p)return;const esAcc=p.tipo==='accesorio';document.getElementById('cpCantLabel').textContent=esAcc?'Cantidad (un)':'Cantidad (L)';document.getElementById('cpPrecioLabel').textContent=esAcc?'Precio por unidad ($)':'Precio por litro ($)';const inp=document.getElementById('cpCantidad');const suf=inp.closest('.input-unit-wrap')?.querySelector('.unit-label');if(suf)suf.textContent=esAcc?'un':'L';inp.step=esAcc?'1':'0.001';calcCompra();};
window.calcCompra=function(){const c=parseFloat(document.getElementById('cpCantidad')?.value)||0,p=parseFloat(document.getElementById('cpPrecioUnit')?.value)||0;const t=document.getElementById('cpTotal');if(t)t.textContent=fmt(c*p);};
async function guardarCompra(){
  const prodId=document.getElementById('cpProducto').value;if(!prodId){await swalError('Seleccioná un producto');return;}
  const p=DB.productos.find(x=>x.id===prodId),cant=parseFloat(document.getElementById('cpCantidad').value)||0,pu=parseFloat(document.getElementById('cpPrecioUnit').value)||0;
  if(!cant||!pu){await swalError('Completá cantidad y precio');return;}
  if(p.tipo==='accesorio'){p.stockUnidades=(p.stockUnidades||0)+cant;p.costoUnidad=pu;}else{p.stockLitros=(p.stockLitros||0)+cant;p.costoLitro=pu;}
  const compra={id:genId(),fecha:new Date(document.getElementById('cpFecha').value).getTime()||Date.now(),productoId:prodId,productoNombre:p.nombre,tipo:p.tipo,proveedor:document.getElementById('cpProveedor').value.trim(),cantidad:cant,precioUnit:pu,total:cant*pu,notas:document.getElementById('cpNotas').value.trim()};
  closeModal();
  await Promise.all([fbSave('productos',p),fbSave('compras',compra)]);
  swalSuccess('¡Compra registrada!',`Stock de <strong>${p.nombre}</strong> actualizado.`);
}
async function eliminarCompra(id){const res=await swalConfirm('¿Eliminar compra?','No se puede deshacer.');if(!res.isConfirmed)return;await fbRemove('compras',id);toast('Compra eliminada');}

// ══════════════════════════════════════════════════════════════════════════════
// STOCK
// ══════════════════════════════════════════════════════════════════════════════
let _ajusteItems=[];
function renderStock(){
  const el=document.getElementById('page-stock');
  document.getElementById('topbarActions').innerHTML=`<button class="btn btn-primary" onclick="abrirAjusteStock()">⚖️ Ajustar Stock</button>`;
  const criticos=DB.productos.filter(p=>p.tipo==='accesorio'?(p.stockUnidades||0)<=(p.stockMinUnidades||0):(p.stockLitros||0)<=(p.stockMinLitros||0));
  const rows=DB.productos.map(p=>{const esAcc=p.tipo==='accesorio',sv=esAcc?p.stockUnidades||0:p.stockLitros||0,sm=esAcc?p.stockMinUnidades||0:p.stockMinLitros||0;const bajo=sv<=sm,pct=Math.min(100,sm>0?(sv/(sm*3))*100:100),nivel=sv>sm*2?'high':sv>sm?'med':'low';const presStr=esAcc?'Unidad':(p.presentaciones||[]).map(pr=>{const mu=pr.litros>0?Math.floor(sv/pr.litros):0;return`${pr.nombre}:~${mu}`;}).join(' | ')||'Sin pres.';return{p,esAcc,sv,sm,bajo,pct,nivel,stockStr:esAcc?`${sv} un`:`${fmtL(sv)} L`,stockMinStr:esAcc?`${sm} un`:`${fmtL(sm)} L`,presStr};});
  const tbl=`<div class="table-wrap hide-mobile"><table><thead><tr><th></th><th>Nombre</th><th>Categoría</th><th>Stock</th><th>Mínimo</th><th>Nivel</th><th>Unidades posibles</th></tr></thead><tbody>${rows.length===0?`<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📦</div><p>Sin productos</p></div></td></tr>`:rows.map(r=>`<tr><td style="font-size:20px;">${EMOJIS_CAT[r.p.categoria]||'🧴'}</td><td><div class="fw-700">${r.p.nombre}</div>${r.p.codigo?`<div class="text-muted">#${r.p.codigo}</div>`:''}</td><td>${r.p.categoria}</td><td><strong>${r.stockStr}</strong></td><td>${r.stockMinStr}</td><td style="min-width:130px;"><div class="stock-bar-wrap"><div class="stock-bar"><div class="stock-bar-fill ${r.nivel}" style="width:${r.pct}%"></div></div><span class="stock-qty" style="color:${r.nivel==='low'?'var(--danger)':r.nivel==='med'?'var(--warning)':'var(--accent-dark)'}">${r.nivel==='low'?'⚠️':'OK'}</span></div></td><td style="font-size:11.5px;color:var(--text-muted);">${r.presStr}</td></tr>`).join('')}</tbody></table></div>`;
  const cards=`<div class="mobile-card-list">${rows.map(r=>`<div class="m-card"><div class="m-card-header"><div>${r.p.codigo?`<div class="text-muted">#${r.p.codigo}</div>`:''}  <div class="m-card-title">${EMOJIS_CAT[r.p.categoria]||'🧴'} ${r.p.nombre}</div><div class="m-card-subtitle">${r.p.categoria}</div></div><span class="badge badge-${!r.bajo?'green':'red'}">${r.stockStr}</span></div><div class="stock-bar-wrap mb-8"><div class="stock-bar" style="flex:1;"><div class="stock-bar-fill ${r.nivel}" style="width:${r.pct}%"></div></div><span class="stock-qty" style="color:${r.nivel==='low'?'var(--danger)':r.nivel==='med'?'var(--warning)':'var(--accent-dark)'}">${r.nivel==='low'?'⚠️ Crítico':'OK'}</span></div><div class="text-muted">${r.presStr}</div></div>`).join('')}</div>`;
  el.innerHTML=`${criticos.length>0?`<div class="card mb-16" style="border-left:4px solid var(--danger);"><div class="section-title mb-8">⚠️ Stock crítico</div><div class="flex gap-8 flex-wrap">${criticos.map(p=>`<div style="background:rgba(244,63,94,0.08);border:1px solid rgba(244,63,94,0.2);border-radius:var(--radius-sm);padding:8px 12px;"><div class="fw-700" style="font-size:12px;">${p.nombre}</div><div style="font-size:11px;color:var(--danger);">${p.tipo==='accesorio'?(p.stockUnidades||0)+' un':fmtL(p.stockLitros||0)+' L'}</div></div>`).join('')}</div></div>`:''}<div class="card"><div class="section-header"><div class="section-title">Inventario completo</div></div>${rows.length===0?`<div class="empty-state"><div class="empty-icon">📦</div><p>Sin productos</p></div>`:tbl+cards}</div>`;
}
function abrirAjusteStock(){_ajusteItems=[];openModal('⚖️ Ajuste de Stock múltiple',`<div class="form-group mb-12"><label>Buscar y agregar producto</label><div class="flex gap-8"><select id="ajProdSel" style="flex:1;"><option value="">Seleccioná...</option>${DB.productos.map(p=>`<option value="${p.id}">${p.nombre}${p.codigo?' #'+p.codigo:''} — ${p.tipo==='accesorio'?(p.stockUnidades||0)+' un':fmtL(p.stockLitros||0)+' L'}</option>`).join('')}</select><button class="btn btn-primary" style="flex-shrink:0;" onclick="agregarAjusteItem()">+ Agregar</button></div></div><div id="ajusteListaWrap"><div class="empty-state" style="padding:20px;"><div class="empty-icon" style="font-size:28px;">⚖️</div><p>Agregá productos para ajustar</p></div></div>`,guardarAjusteStock);}
window.agregarAjusteItem=function(){const prodId=document.getElementById('ajProdSel').value;if(!prodId){toast('Seleccioná un producto','info');return;}if(_ajusteItems.find(x=>x.productoId===prodId)){toast('Ya está en la lista','info');return;}const p=DB.productos.find(x=>x.id===prodId);if(!p)return;const esAcc=p.tipo==='accesorio';_ajusteItems.push({productoId:prodId,nombre:p.nombre,codigo:p.codigo||'',tipo:p.tipo,esAcc,stockActual:esAcc?p.stockUnidades||0:p.stockLitros||0,nuevoStock:esAcc?p.stockUnidades||0:p.stockLitros||0,nuevoMin:esAcc?p.stockMinUnidades||0:p.stockMinLitros||0});renderAjusteItems();};
function renderAjusteItems(){const wrap=document.getElementById('ajusteListaWrap');if(!wrap)return;if(!_ajusteItems.length){wrap.innerHTML=`<div class="empty-state" style="padding:20px;"><div class="empty-icon" style="font-size:28px;">⚖️</div><p>Agregá productos</p></div>`;return;}wrap.innerHTML=`<div style="border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden;">${_ajusteItems.map((item,i)=>`<div style="padding:12px 14px;background:${i%2===0?'var(--surface)':'var(--surface2)'};display:flex;align-items:center;gap:12px;flex-wrap:wrap;"><div style="flex:1;min-width:140px;"><div class="fw-700" style="font-size:13px;">${item.nombre}${item.codigo?` <span class="badge badge-gray">#${item.codigo}</span>`:''}</div><div style="font-size:11px;color:var(--text-muted);">Actual: <strong>${item.esAcc?item.stockActual+' un':fmtL(item.stockActual)+' L'}</strong></div></div><div class="flex gap-8 flex-wrap" style="flex-shrink:0;"><div class="form-group" style="min-width:110px;"><label>Nuevo stock</label>${item.esAcc?unitInput(`ajS${i}`,item.nuevoStock,'un','1',`_ajusteItems[${i}].nuevoStock=+this.value;`):unitInput(`ajS${i}`,item.nuevoStock,'L','0.001',`_ajusteItems[${i}].nuevoStock=+this.value;`)}</div><div class="form-group" style="min-width:110px;"><label>Stock mín.</label>${item.esAcc?unitInput(`ajM${i}`,item.nuevoMin,'un','1',`_ajusteItems[${i}].nuevoMin=+this.value;`):unitInput(`ajM${i}`,item.nuevoMin,'L','0.001',`_ajusteItems[${i}].nuevoMin=+this.value;`)}</div><button class="btn btn-danger btn-sm btn-icon" style="align-self:flex-end;" onclick="_ajusteItems.splice(${i},1);renderAjusteItems()">✕</button></div></div>`).join('')}</div><div style="margin-top:8px;font-size:12px;color:var(--text-muted);">${_ajusteItems.length} producto(s) a ajustar.</div>`;}
async function guardarAjusteStock(){if(!_ajusteItems.length){await swalError('Agregá al menos un producto');return;}const prods=[];_ajusteItems.forEach(item=>{const p=DB.productos.find(x=>x.id===item.productoId);if(!p)return;if(item.esAcc){p.stockUnidades=item.nuevoStock;p.stockMinUnidades=item.nuevoMin;}else{p.stockLitros=item.nuevoStock;p.stockMinLitros=item.nuevoMin;}prods.push(p);});closeModal();await Promise.all(prods.map(p=>fbSave('productos',p)));swalSuccess('Stock actualizado',`Se actualizaron <strong>${_ajusteItems.length}</strong> producto(s).`);_ajusteItems=[];}

// ── Cálculo de ganancia neta por ventas ───────────────────────────────────────
function calcularCostoVenta(venta) {
  let costoTotal = 0;
  venta.items.forEach(item => {
    if (item.esCombo) {
      const combo = DB.combos.find(c => c.id === item.comboId);
      if (combo) {
        (combo.items || []).forEach(ci => {
          const p = DB.productos.find(x => x.id === ci.productoId);
          if (!p) return;
          if (ci.esAcc) {
            costoTotal += (p.costoUnidad || 0) * ci.cantidad * item.cantidad;
          } else {
            const pr = (p.presentaciones || []).find(x => x.id === ci.presId);
            const costoL = p.costoLitro || 0;
            const litros = pr ? pr.litros : (ci.litrosPorUnidad || 0);
            const costoEnvase = pr ? ((pr.costoEnvase || 0) + (pr.costoEtiqueta || 0)) : 0;
            costoTotal += (costoL * litros + costoEnvase) * ci.cantidad * item.cantidad;
          }
        });
      }
    } else if (item.esAcc) {
      const p = DB.productos.find(x => x.id === item.productoId);
      if (p) costoTotal += (p.costoUnidad || 0) * item.cantidad;
    } else {
      const p = DB.productos.find(x => x.id === item.productoId);
      if (!p) return;
      const pr = (p.presentaciones || []).find(x => x.id === item.presId);
      const costoL = p.costoLitro || 0;
      const litros = pr ? pr.litros : (item.litrosPorUnidad || 0);
      const costoEnvase = pr ? ((pr.costoEnvase || 0) + (pr.costoEtiqueta || 0)) : 0;
      costoTotal += (costoL * litros + costoEnvase) * item.cantidad;
    }
  });
  return costoTotal;
}

// ══════════════════════════════════════════════════════════════════════════════
// REPORTES
// ══════════════════════════════════════════════════════════════════════════════
function renderReportes(){
  const el=document.getElementById('page-reportes');
  document.getElementById('topbarActions').innerHTML=`<button class="btn btn-wsp-sm" onclick="wspReporte()">📲 Compartir</button>`;
  const tv=DB.ventas.reduce((s,v)=>s+v.total,0),tc=DB.compras.reduce((s,c)=>s+c.total,0);
  const cobrado=DB.ventas.filter(v=>v.estado==='pagado').reduce((s,v)=>s+v.total,0);
  const pendiente=DB.ventas.filter(v=>v.estado==='pendiente').reduce((s,v)=>s+v.total,0);

  const ventasPagadas = DB.ventas.filter(v => v.estado === 'pagado');
  const ventasPendientes = DB.ventas.filter(v => v.estado === 'pendiente');
  const costoPagadas = ventasPagadas.reduce((s,v) => s + calcularCostoVenta(v), 0);
  const costoPendientes = ventasPendientes.reduce((s,v) => s + calcularCostoVenta(v), 0);
  const gananciaNeta = cobrado - costoPagadas;
  const gananciaTotal = tv - DB.ventas.reduce((s,v) => s + calcularCostoVenta(v), 0);
  const margenPct = cobrado > 0 ? Math.round((gananciaNeta / cobrado) * 100) : 0;

  const topP={};DB.ventas.forEach(v=>v.items.forEach(i=>{topP[i.nombre]=(topP[i.nombre]||0)+i.subtotal;}));
  const topCl={};DB.ventas.forEach(v=>{const cl=DB.clientes.find(c=>c.id===v.clienteId);const n=cl?cl.nombre:v.clienteNombre||'?';topCl[n]=(topCl[n]||0)+v.total;});
  const litV={};DB.ventas.forEach(v=>v.items.forEach(i=>{if(!i.esAcc&&!i.esCombo){const b=i.nombre.split(' ').slice(0,-1).join(' ')||i.nombre;litV[b]=(litV[b]||0)+(i.litrosPorUnidad||0)*i.cantidad;}}));
  const vtaMay=DB.ventas.filter(v=>v.esMayorista).reduce((s,v)=>s+v.total,0);
  const vtaMin=DB.ventas.filter(v=>!v.esMayorista).reduce((s,v)=>s+v.total,0);
  const topCard=(items,vf)=>{if(!items.length)return`<div class="empty-state" style="padding:20px;"><p>Sin datos</p></div>`;return items.map(([n,v],i)=>`<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);"><span style="font-family:var(--font-display);font-weight:800;font-size:18px;color:var(--text-light);width:22px;">${i+1}</span><span style="flex:1;font-weight:500;font-size:13px;">${n}</span><span class="fw-700 text-gradient">${vf(v)}</span></div>`).join('');};

  el.innerHTML=`
    <div class="grid-4 mb-16">
      <div class="stat-card"><div class="stat-icon green">💰</div><div class="stat-info"><div class="stat-label">Ventas totales</div><div class="stat-value">${fmt(tv)}</div></div></div>
      <div class="stat-card"><div class="stat-icon violet">✅</div><div class="stat-info"><div class="stat-label">Cobrado</div><div class="stat-value">${fmt(cobrado)}</div></div></div>
      <div class="stat-card"><div class="stat-icon orange">⏳</div><div class="stat-info"><div class="stat-label">Pendiente</div><div class="stat-value">${fmt(pendiente)}</div></div></div>
      <div class="stat-card"><div class="stat-icon ${gananciaNeta>=0?'green':'red'}">📊</div><div class="stat-info"><div class="stat-label">Ganancia neta</div><div class="stat-value">${fmt(gananciaNeta)}</div><div class="stat-sub">Margen ${margenPct}%</div></div></div>
    </div>

    <div class="card mb-16" style="border-left:4px solid var(--accent-dark);">
      <div class="section-title mb-12">💸 Desglose financiero neto</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div class="cost-row"><span>Ingresos cobrados</span><span class="fw-700" style="color:var(--accent-dark)">${fmt(cobrado)}</span></div>
        <div class="cost-row"><span style="padding-left:12px;color:var(--text-muted);font-size:13px;">— Costo de lo vendido (cobrado)</span><span style="color:var(--danger)">-${fmt(costoPagadas)}</span></div>
        <div class="cost-row total"><span>✅ Ganancia neta cobrada</span><span style="color:${gananciaNeta>=0?'var(--accent-dark)':'var(--danger)'}">${fmt(gananciaNeta)}</span></div>
        <div style="border-top:1px solid var(--border);margin:4px 0;"></div>
        <div class="cost-row"><span>Ventas pendientes de cobro</span><span class="fw-700" style="color:var(--warning)">${fmt(pendiente)}</span></div>
        <div class="cost-row"><span style="padding-left:12px;color:var(--text-muted);font-size:13px;">— Costo de lo pendiente</span><span style="color:var(--danger)">-${fmt(costoPendientes)}</span></div>
        <div class="cost-row"><span>⏳ Ganancia neta pendiente</span><span style="color:var(--warning)">${fmt(pendiente-costoPendientes)}</span></div>
        <div style="border-top:1px solid var(--border);margin:4px 0;"></div>
        <div class="cost-row total" style="font-size:16px;"><span>🏆 Ganancia neta total</span><span style="color:${gananciaTotal>=0?'var(--accent-dark)':'var(--danger)'}">${fmt(gananciaTotal)}</span></div>
        ${costoPagadas===0&&tv>0?`<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">⚠️ Sin datos de costo — cargá el costo por litro y envase en cada producto para ver la ganancia real.</div>`:''}
      </div>
    </div>

    <div class="grid-2 mb-16">
      <div class="card"><div class="section-title mb-12">🛍️ Ventas por tipo</div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <div class="cost-row"><span>🛍️ Actual</span><span class="fw-700 text-gradient">${fmt(vtaMin)}</span></div>
          <div class="cost-row"><span>🏪 Mayorista</span><span class="fw-700" style="color:var(--accent-dark)">${fmt(vtaMay)}</span></div>
          <div class="cost-row total"><span>Total</span><span>${fmt(tv)}</span></div>
        </div>
      </div>
      <div class="card"><div class="section-title mb-12">🏆 Top productos ($)</div>${topCard(Object.entries(topP).sort((a,b)=>b[1]-a[1]).slice(0,5),fmt)}</div>
    </div>
    <div class="grid-2 mb-16">
      <div class="card"><div class="section-title mb-12">👑 Mejores clientes</div>${topCard(Object.entries(topCl).sort((a,b)=>b[1]-a[1]).slice(0,5),fmt)}</div>
      <div class="card"><div class="section-title mb-12">💧 Litros vendidos</div>${topCard(Object.entries(litV).sort((a,b)=>b[1]-a[1]).slice(0,5),v=>fmtL(v)+' L')}</div>
    </div>
    <div class="card"><div class="section-title mb-12">📦 Inventario</div>
      <div class="grid-3 keep-2" style="margin-top:8px;text-align:center;">
        <div style="padding:12px;"><div class="fw-800 text-gradient" style="font-family:var(--font-display);font-size:32px;">${DB.productos.length}</div><div class="text-muted">Productos</div></div>
        <div style="padding:12px;"><div class="fw-800" style="font-family:var(--font-display);font-size:32px;color:var(--warning);">${DB.productos.filter(p=>p.tipo==='accesorio'?(p.stockUnidades||0)<=(p.stockMinUnidades||0):(p.stockLitros||0)<=(p.stockMinLitros||0)).length}</div><div class="text-muted">Stock bajo</div></div>
        <div style="padding:12px;"><div class="fw-800" style="font-family:var(--font-display);font-size:32px;color:var(--danger);">${DB.productos.filter(p=>p.tipo==='accesorio'?(p.stockUnidades||0)===0:(p.stockLitros||0)===0).length}</div><div class="text-muted">Sin stock</div></div>
      </div>
    </div>`;
}
function wspReporte(){const tv=DB.ventas.reduce((s,v)=>s+v.total,0),tc=DB.compras.reduce((s,c)=>s+c.total,0),sb=DB.productos.filter(p=>p.tipo==='accesorio'?(p.stockUnidades||0)<=(p.stockMinUnidades||0):(p.stockLitros||0)<=(p.stockMinLitros||0)).length;window.open('https://wa.me/?text='+encodeURIComponent(`*📊 Resumen NURA — ${new Date().toLocaleDateString('es-AR')}*\n\n💰 Ventas: ${fmt(tv)}\n🚚 Compras: ${fmt(tc)}\n📈 Ganancia: ${fmt(tv-tc)}\n📦 Productos: ${DB.productos.length} | 👥 Clientes: ${DB.clientes.length}\n⚠️ Stock bajo: ${sb}\n\n_NURA Gestión_`),'_blank');}

// ── WhatsApp catálogo global ──────────────────────────────────────────────────
document.getElementById('btnWhatsappGlobal').onclick=async function(){
  if(!DB.productos.length){await swalInfo('Sin productos','No hay productos en el catálogo.');return;}
  let msg=`*🌿 NURA — Catálogo*\n\n`;
  const cats=[...new Set(DB.productos.map(p=>p.categoria))];
  cats.forEach(cat=>{msg+=`*${EMOJIS_CAT[cat]||'🧴'} ${cat}*\n`;DB.productos.filter(p=>p.categoria===cat).forEach(p=>{if(p.tipo==='accesorio')msg+=`  • ${p.nombre}${p.codigo?' #'+p.codigo:''} — ${fmt(p.precioVenta)}\n`;else(p.presentaciones||[]).forEach(pr=>{msg+=`  • ${p.nombre} ${pr.nombre}${p.codigo?' #'+p.codigo:''} — ${fmt(pr.precioVenta)}\n`;});});msg+='\n';});
  if(DB.combos.length){msg+=`*🎁 Combos*\n`;DB.combos.forEach(c=>{msg+=`  • ${c.nombre} — ${fmt(c.precio)}\n`;});msg+='\n';}
  msg+=`📞 ¡Consultanos!\n📷 @nura.neco | 📲 2262 240512`;
  window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank');
};

// ── Eventos globales — SIN cerrar modal con click afuera ni Escape ────────────
document.getElementById('hamburger').onclick=function(){document.getElementById('sidebar').classList.toggle('open');};
document.addEventListener('click',e=>{
  const s=document.getElementById('sidebar');
  if(s.classList.contains('open')&&!s.contains(e.target)&&e.target.id!=='hamburger')s.classList.remove('open');
  // Overlay del modal: NO hace closeModal
});
// Eliminar el handler del overlay que cierra el modal
document.getElementById('modalOverlay').onclick=function(e){
  // Intencionalmente vacío — no se cierra con click afuera
};
// Bloquear Escape en el modal
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.getElementById('modalOverlay').classList.contains('active')) {
    e.preventDefault(); e.stopPropagation();
  }
});
document.getElementById('modalClose').onclick=closeModal;
document.querySelectorAll('.nav-item').forEach(item=>{item.onclick=()=>navigate(item.dataset.page);});

// CSS extra
const css=`.form-grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}@media(max-width:700px){.form-grid-3{grid-template-columns:1fr 1fr}}`;
const s=document.createElement('style');s.textContent=css;document.head.appendChild(s);

// ══════════════════════════════════════════════════════════════════════════════
// DEUDAS — Cuenta corriente con historial de pagos por cliente
// ══════════════════════════════════════════════════════════════════════════════

function getSaldoVenta(venta) {
  const pagado = (venta.pagos || []).reduce((s, p) => s + p.monto, 0);
  return { pagado, saldo: Math.max(0, venta.total - pagado) };
}

function getTotalDeudaCliente(clienteKey) {
  return DB.ventas
    .filter(v => (v.clienteId === clienteKey || v.clienteNombre === clienteKey) && v.estado !== 'cancelado' && 
      v.estado !== 'pagado')
    .reduce((s, v) => s + getSaldoVenta(v).saldo, 0);
}

function renderDeudas() {
  const el = document.getElementById('page-deudas');
  if (!el) return;
  document.getElementById('topbarActions').innerHTML = '';

  // Clientes con saldo > 0
  const clientesConDeuda = [];
  const vistos = new Set();
  DB.ventas.forEach(v => {
    // Solo consideramos ventas que NO están pagadas
    if (v.estado === 'pagado') return;
    const key = v.clienteId || v.clienteNombre || '—';
    if (vistos.has(key)) return;
    vistos.add(key);
    const deuda = getTotalDeudaCliente(key);
    if (deuda > 0.01) clientesConDeuda.push(key);
  });

  if (!clientesConDeuda.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🎉</div><p>¡Sin deudas pendientes!</p><div class="stat-sub" style="margin-top:8px;">Todos los clientes están al día</div></div>`;
    return;
  }

  const totalGlobal = clientesConDeuda.reduce((s, k) => s + getTotalDeudaCliente(k), 0);

  // Ordenar por deuda mayor primero
  clientesConDeuda.sort((a, b) => getTotalDeudaCliente(b) - getTotalDeudaCliente(a));

  const cards = clientesConDeuda.map(key => {
    const cl = DB.clientes.find(c => c.id === key);
    const nombre = cl ? cl.nombre : (DB.ventas.find(v => v.clienteId === key || v.clienteNombre === key)?.clienteNombre || '—');
    const deuda = getTotalDeudaCliente(key);
    const ventasConSaldo = DB.ventas.filter(v => 
  (v.clienteId === key || v.clienteNombre === key) && 
  v.estado !== 'cancelado' && 
  v.estado !== 'pagado' && // <--- AGREGAR ESTO para seguridad extra
  getSaldoVenta(v).saldo > 0.01
);
    const masAntigua = Math.min(...ventasConSaldo.map(v => v.fecha));
    const dias = Math.floor((Date.now() - masAntigua) / 86400000);
    const colorBorde = dias > 14 ? 'var(--danger)' : dias > 7 ? 'var(--warning)' : 'var(--border)';
    const colorDias = dias > 14 ? 'var(--danger)' : dias > 7 ? 'var(--warning)' : 'var(--text-muted)';

    return `<div class="m-card" style="border-left:4px solid ${colorBorde};">
      <div class="m-card-header">
        <div>
          <div class="m-card-title">👤 ${nombre}</div>
          <div class="m-card-subtitle">${ventasConSaldo.length} pedido(s) con saldo · <span style="color:${colorDias};">${dias} día(s)</span></div>
          ${cl?.telefono ? `<div class="m-card-subtitle">📲 ${cl.telefono}</div>` : ''}
        </div>
        <div style="text-align:right;">
          <div style="font-family:var(--font-display);font-size:24px;font-weight:900;color:var(--danger);">${fmt(deuda)}</div>
          <div style="font-size:10px;color:var(--text-muted);">adeudado</div>
        </div>
      </div>
      <div class="m-card-footer">
        <button class="btn btn-primary btn-sm" style="flex:1;" onclick="verCuentaCorriente('${key}')">📋 Cuenta corriente</button>
        ${cl?.telefono ? `<button class="btn btn-wsp-sm btn-sm" style="flex:1;" onclick="wspDeudaCliente('${key}')">📲 WS</button>` : ''}
      </div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="card mb-16" style="border-left:4px solid var(--danger);">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div class="section-title">💳 Total adeudado</div>
          <div class="stat-sub" style="margin-top:4px;">${clientesConDeuda.length} cliente(s) con deuda</div>
        </div>
        <div style="font-family:var(--font-display);font-size:32px;font-weight:900;color:var(--danger);">${fmt(totalGlobal)}</div>
      </div>
    </div>
    <div class="mobile-card-list deuda-container">${cards}</div>`;
}

window.verCuentaCorriente = function(clienteKey) {
  const cl = DB.clientes.find(c => c.id === clienteKey);
  const nombre = cl ? cl.nombre : (DB.ventas.find(v => v.clienteId === clienteKey)?.clienteNombre || '—');

  // Todas las ventas del cliente (con y sin saldo) ordenadas por fecha
  const todasVentas = DB.ventas
    .filter(v => (v.clienteId === clienteKey || v.clienteNombre === clienteKey) && v.estado !== 'cancelado')
    .sort((a, b) => b.fecha - a.fecha);

  const totalDeuda = todasVentas.reduce((s, v) => s + getSaldoVenta(v).saldo, 0);
  const totalPagado = todasVentas.reduce((s, v) => s + getSaldoVenta(v).pagado, 0);
  const totalFacturado = todasVentas.reduce((s, v) => s + v.total, 0);

  const ventasHTML = todasVentas.map(v => {
    const { pagado, saldo } = getSaldoVenta(v);
    const pct = v.total > 0 ? Math.round((pagado / v.total) * 100) : 100;
    const esSaldado = saldo <= 0.01;

    // items del pedido
    const itemsList = v.items.map(i =>
      `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:11px;border-bottom:1px solid var(--border);">
        <span style="color:var(--text-muted);">${i.nombre}${i.detalle && i.detalle!=='Unidad'?' '+i.detalle:''} × ${i.cantidad}</span>
        <span style="font-weight:600;">${fmt(i.subtotal)}</span>
      </div>`
    ).join('');

    // historial de pagos del pedido
    const pagosHTML = (v.pagos || []).length > 0
      ? `<div style="margin-top:8px;padding-top:6px;border-top:1px dashed var(--border);">
          <div style="font-size:10px;font-weight:700;color:var(--text-muted);margin-bottom:4px;">PAGOS REGISTRADOS</div>
          ${(v.pagos || []).map(p => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:11px;">
              <span>${fmtDate(p.fecha)} · ${p.medio==='transferencia'?'📱 Transferencia':'💵 Efectivo'}</span>
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="color:var(--accent-dark);font-weight:700;">+${fmt(p.monto)}</span>
                <button class="btn btn-danger btn-sm btn-icon" style="padding:2px 6px;font-size:10px;" onclick="eliminarPago('${v.id}','${p.id}','${clienteKey}')">✕</button>
              </div>
            </div>`).join('')}
        </div>`
      : '';

    return `<div style="background:var(--surface2);border:1px solid ${esSaldado?'var(--border)':'rgba(244,63,94,0.3)'};border-radius:var(--radius-sm);padding:14px;margin-bottom:10px;${esSaldado?'opacity:0.75':''}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
        <div>
          <div style="font-size:12px;color:var(--text-muted);">📅 ${fmtDate(v.fecha)}</div>
          <div style="font-size:11px;color:var(--text-muted);">${v.items.length} ítem(s)${v.esMayorista?' · <span style="color:var(--accent-dark)">Mayorista</span>':''}</div>
        </div>
        <div style="text-align:right;">
          <span class="badge badge-${esSaldado?'green':'red'}" style="font-size:10px;">${esSaldado?'✅ Saldado':'⏳ Con deuda'}</span>
          <div style="font-weight:800;font-size:15px;margin-top:4px;">${fmt(v.total)}</div>
        </div>
      </div>
      <div style="margin-bottom:8px;">${itemsList}</div>
      ${v.descuento ? `<div style="font-size:11px;color:var(--danger);">🔖 Descuento: -${fmt(v.descuento)}</div>` : ''}
      <div style="background:var(--surface);border-radius:4px;height:5px;margin:8px 0;">
        <div style="height:100%;width:${pct}%;background:${esSaldado?'var(--accent-dark)':'var(--warning)'};border-radius:4px;"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px;">
        <span style="color:var(--accent-dark);">Pagado: ${fmt(pagado)} (${pct}%)</span>
        ${!esSaldado ? `<span style="color:var(--danger);font-weight:700;">Saldo: ${fmt(saldo)}</span>` : '<span style="color:var(--accent-dark);font-weight:700;">Saldado ✅</span>'}
      </div>
      ${pagosHTML}
      ${!esSaldado ? `<button class="btn btn-primary btn-sm" style="width:100%;margin-top:8px;" onclick="modalRegistrarPago('${v.id}','${clienteKey}')">💰 Registrar pago</button>` : ''}
    </div>`;
  }).join('');

  openModal(`📋 Cuenta corriente — ${nombre}`, `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px;text-align:center;">
      <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:10px;">
        <div style="font-size:10px;color:var(--text-muted);">FACTURADO</div>
        <div style="font-family:var(--font-display);font-weight:800;font-size:16px;">${fmt(totalFacturado)}</div>
      </div>
      <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:10px;">
        <div style="font-size:10px;color:var(--text-muted);">PAGADO</div>
        <div style="font-family:var(--font-display);font-weight:800;font-size:16px;color:var(--accent-dark);">${fmt(totalPagado)}</div>
      </div>
      <div style="background:rgba(244,63,94,0.08);border-radius:var(--radius-sm);padding:10px;border:1px solid rgba(244,63,94,0.2);">
        <div style="font-size:10px;color:var(--danger);">ADEUDA</div>
        <div style="font-family:var(--font-display);font-weight:900;font-size:16px;color:var(--danger);">${fmt(totalDeuda)}</div>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
      ${cl?.telefono ? `<button class="btn btn-wsp-sm" style="flex:1;" onclick="wspDeudaCliente('${clienteKey}')">📲 Enviar estado de cuenta</button>` : ''}
      <button class="btn btn-secondary btn-sm" onclick="navigate('deudas');closeModal()">← Volver</button>
    </div>
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:10px;">Todos los pedidos — del más reciente al más antiguo</div>
    <div style="max-height:440px;overflow-y:auto;">${ventasHTML}</div>
  `, null, true);
};

window.modalRegistrarPago = function(ventaId, clienteKey) {
  const v = DB.ventas.find(x => x.id === ventaId);
  if (!v) return;
  const { saldo } = getSaldoVenta(v);

  Swal.fire({
    title: '💰 Registrar pago',
    html: `
      <div style="text-align:left;font-size:13px;color:#64748b;margin-bottom:10px;">
        Saldo pendiente: <strong style="color:#ef4444;">${fmt(saldo)}</strong>
      </div>
      <input id="swal-monto" type="number" min="1" max="${Math.ceil(saldo)}" step="1"
        value="${Math.ceil(saldo)}" class="swal2-input" placeholder="Monto" style="margin:0 0 10px 0;" />
      <select id="swal-medio" class="swal2-input" style="margin:0;">
        <option value="efectivo">💵 Efectivo</option>
        <option value="transferencia">📱 Transferencia</option>
      </select>`,
    showCancelButton: true,
    confirmButtonText: 'Registrar',
    cancelButtonText: 'Cancelar',
    focusConfirm: false,
    didOpen: () => { const i = document.getElementById('swal-monto'); if(i){i.focus();i.select();} },
    preConfirm: () => {
      const monto = parseFloat(document.getElementById('swal-monto').value) || 0;
      const medio = document.getElementById('swal-medio').value;
      if (!monto || monto <= 0) { Swal.showValidationMessage('Ingresá un monto válido'); return false; }
      if (monto > saldo + 0.01) { Swal.showValidationMessage(`No puede superar el saldo (${fmt(saldo)})`); return false; }
      return { monto, medio };
    }
  }).then(async result => {
    if (!result.isConfirmed) return;
    const { monto, medio } = result.value;
    v.pagos = [...(v.pagos || []), { id: genId(), fecha: Date.now(), monto, medio }];
    if (getSaldoVenta(v).saldo <= 0.01) v.estado = 'pagado';
    await fbSave('ventas', v);
    toast(`Pago de ${fmt(monto)} registrado ✅`);
    window.verCuentaCorriente(clienteKey);
  });
};

window.eliminarPago = async function(ventaId, pagoId, clienteKey) {
  const v = DB.ventas.find(x => x.id === ventaId);
  if (!v) return;
  const pago = (v.pagos || []).find(p => p.id === pagoId);
  if (!pago) return;
  const res = await swalConfirm('¿Eliminar pago?', `Se eliminará el pago de <strong>${fmt(pago.monto)}</strong>`);
  if (!res.isConfirmed) return;
  v.pagos = v.pagos.filter(p => p.id !== pagoId);
  if (getSaldoVenta(v).saldo > 0.01 && v.estado === 'pagado') v.estado = 'pendiente';
  await fbSave('ventas', v);
  toast('Pago eliminado');
  window.verCuentaCorriente(clienteKey);
};

window.wspDeudaCliente = function(clienteKey) {
  const cl = DB.clientes.find(c => c.id === clienteKey);
  const nombre = cl ? cl.nombre : '—';
  const ventas = DB.ventas
    .filter(v => (v.clienteId === clienteKey || v.clienteNombre === clienteKey) && v.estado !== 'cancelado' && getSaldoVenta(v).saldo > 0.01)
    .sort((a,b) => a.fecha - b.fecha);

  const totalDeuda = ventas.reduce((s,v) => s + getSaldoVenta(v).saldo, 0);
  let msg = `*🧾 NURA — Estado de cuenta*\n`;
  msg += `👤 ${nombre}\n`;
  msg += `📅 ${new Date().toLocaleDateString('es-AR')}\n`;
  msg += `--------------------------\n\n`;

  ventas.forEach((v, idx) => {
    const { pagado, saldo } = getSaldoVenta(v);
    msg += `*Pedido ${idx+1}* — ${fmtDate(v.fecha)}\n`;
    v.items.forEach(i => { msg += `  • ${i.nombre}${i.detalle&&i.detalle!=='Unidad'?' '+i.detalle:''} x${i.cantidad} = ${fmt(i.subtotal)}\n`; });
    if (v.descuento) msg += `  🔖 Desc: -${fmt(v.descuento)}\n`;
    msg += `  Total: ${fmt(v.total)}`;
    if (pagado > 0) msg += ` · Pagado: ${fmt(pagado)}`;
    msg += `\n  💰 *Saldo: ${fmt(saldo)}*\n\n`;
  });

  msg += `--------------------------\n`;
  msg += `💰 *TOTAL ADEUDADO: ${fmt(totalDeuda)}*\n\n`;
  msg += `Podés pagar por efectivo o transferencia.\n📷 @nura.neco`;

  const tel = cl?.telefono?.replace(/\D/g,'');
  window.open(`https://wa.me/${tel||''}?text=${encodeURIComponent(msg)}`, '_blank');
};

navigate('dashboard');
document.getElementById('sidebarClose').onclick = function() {
  document.getElementById('sidebar').classList.remove('open');
};
console.log('🌿 NURA — Realtime Database + PWA + Combos + Mayorista');