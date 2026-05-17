// ===== NURA APP.JS — Firebase Realtime Database =====
'use strict';

// ── Firebase refs ─────────────────────────────────────────────────────────────
const { db, ref, set, onValue, remove } = window._FB;

// Ruta base: /nura/
const r = path => ref(db, 'nura/' + path);

// ── Cache local (se llena con onValue) ───────────────────────────────────────
const DB = { productos:[], clientes:[], ventas:[], compras:[] };

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

// ── Operaciones Realtime DB ───────────────────────────────────────────────────
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

// Guardar un item dentro de una colección: nura/{col}/{id}
async function fbSave(col, item) { await fbSet(`${col}/${item.id}`, item); }
async function fbRemove(col, id) { await fbDel(`${col}/${id}`); }

// Guardar varios a la vez (objeto plano)
async function fbSaveMany(col, items) {
  const obj = {};
  items.forEach(it => { obj[it.id] = it; });
  await fbSet(col, obj);   // sobreescribe toda la colección
}

// ── Suscribir colecciones en tiempo real ──────────────────────────────────────
const COLS = ['productos','clientes','ventas','compras'];
const RELOAD_PAGES = {
  productos: ['catalogo','stock','dashboard','reportes'],
  clientes:  ['clientes','dashboard','ventas'],
  ventas:    ['ventas','dashboard','reportes'],
  compras:   ['compras','dashboard','reportes'],
};

let _splashOk = false;
function hideSplash() {
  if (_splashOk) return; _splashOk = true;
  document.getElementById('app').style.display = '';
  const s = document.getElementById('splash');
  if (s) { s.style.opacity='0'; setTimeout(()=>s.remove(), 420); }
  syncUI('ok');
}
setTimeout(hideSplash, 5000); // máximo 5s de espera

COLS.forEach(col => {
  onValue(r(col), snap => {
    const val = snap.val();
    // Realtime DB devuelve un objeto {id: item}, lo convertimos a array
    DB[col] = val ? Object.values(val) : [];
    hideSplash();
    if (RELOAD_PAGES[col]?.includes(currentPage)) renderPage(currentPage);
  }, () => syncUI('off'));
});

// ── Utils ─────────────────────────────────────────────────────────────────────
function genId()    { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function fmt(n)     { return '$\u202F' + Number(n||0).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
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

// ── Modal ─────────────────────────────────────────────────────────────────────
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
    {dashboard:'Dashboard',catalogo:'Catálogo',clientes:'Clientes',ventas:'Ventas',compras:'Compras',stock:'Stock',reportes:'Reportes'}[page];
  currentPage=page;
  document.getElementById('topbarActions').innerHTML='';
  renderPage(page);
  document.getElementById('sidebar').classList.remove('open');
}
function renderPage(page) {
  ({dashboard:renderDashboard,catalogo:renderCatalogo,clientes:renderClientes,ventas:renderVentas,compras:renderCompras,stock:renderStock,reportes:renderReportes})[page]?.();
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
  document.getElementById('topbarActions').innerHTML=`<button class="btn btn-outline btn-sm" onclick="exportarCatalogo()">📄 Exportar</button><button class="btn btn-primary" onclick="formProducto(null)">+ Producto</button>`;
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
    return`<div class="product-card">
      <div class="product-card-img">${EMOJIS_CAT[p.categoria]||'🧴'}<div class="product-card-badge">${bajo?'<span class="badge badge-red">⚠️</span>':''}</div></div>
      <div class="product-card-body">
        ${p.codigo?`<div class="product-card-code">#${p.codigo}</div>`:''}
        <div class="product-card-name">${p.nombre}</div>
        <div class="product-card-cat">${p.categoria}</div>
        ${esAcc?`<div class="product-card-price">${fmt(p.precioVenta)}</div><div class="product-card-unit">por unidad</div>`
          :pres.length?`<div class="product-card-price">${pMin===pMax?fmt(pMin):`${fmt(pMin)}–${fmt(pMax)}`}</div><div class="product-card-unit">${pres.length} presentación(es)</div>`
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
    <thead><tr><th>Cód.</th><th>Nombre</th><th>Categoría</th><th>Stock</th><th>Precios</th><th>Acciones</th></tr></thead>
    <tbody>${prods.map(p=>{const esAcc=p.tipo==='accesorio',sv=esAcc?p.stockUnidades||0:p.stockLitros||0,sm=esAcc?p.stockMinUnidades||0:p.stockMinLitros||0,pres=!esAcc?(p.presentaciones||[]):[];return`<tr>
      <td><span class="badge badge-gray">${p.codigo||'—'}</span></td><td class="fw-700">${p.nombre}</td><td>${p.categoria}</td>
      <td><span class="badge badge-${sv>sm?'green':'red'}">${esAcc?`${sv} un`:`${fmtL(sv)} L`}</span></td>
      <td style="font-size:12px;">${esAcc?fmt(p.precioVenta)+'/un':pres.map(pr=>`${pr.nombre}: <strong>${fmt(pr.precioVenta)}</strong>`).join(' · ')}</td>
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
    <div class="m-card-body">${esAcc?`<div class="m-card-row"><span class="m-card-row-label">Precio</span><span class="m-card-row-value fw-700 text-gradient">${fmt(p.precioVenta)}</span></div>`:pres.map(pr=>`<div class="m-card-row"><span class="m-card-row-label">${pr.nombre}</span><span class="m-card-row-value fw-700 text-gradient">${fmt(pr.precioVenta)}</span></div>`).join('')}</div>
    <div class="m-card-footer"><button class="btn btn-secondary btn-sm" style="flex:1;" onclick="formProducto('${p.id}')">✏️</button><button class="btn btn-outline btn-sm" style="flex:1;" onclick="duplicarProducto('${p.id}')">📋</button><button class="btn btn-wsp-sm btn-sm" onclick="wspProducto('${p.id}')">📲</button><button class="btn btn-danger btn-sm btn-icon" onclick="eliminarProducto('${p.id}')">🗑</button></div>
  </div>`;}).join('')}</div>`;
  return tbl+cards;
}

// ── Export PDF ────────────────────────────────────────────────────────────────
function exportarCatalogo() {
  if(!DB.productos.length){swalInfo('Sin productos','No hay productos en el catálogo.');return;}
  let html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;padding:30px;color:#0f172a}.header{text-align:center;margin-bottom:28px;padding-bottom:18px;border-bottom:2px solid #52dad2}.logo{width:90px;height:90px;object-fit:contain}.brand{font-size:28px;font-weight:900;letter-spacing:8px}.a{color:#7c3aed}.sub{font-size:9px;color:#94a3b8;letter-spacing:3px;text-transform:uppercase;margin-top:4px}.fecha{color:#64748b;font-size:11px;margin-top:8px}.cat{margin-top:22px;margin-bottom:10px;padding-bottom:7px;border-bottom:1.5px solid #e2eaf2}.cat-title{font-size:16px;font-weight:800;color:#1ab8af}.prod{padding-left:18px;margin-bottom:10px}.prod-name{font-weight:700;font-size:13px}.prod-code{font-size:10px;color:#94a3b8;margin-left:6px}.pres{display:flex;justify-content:space-between;padding:2px 0 2px 18px;font-size:12px;color:#475569}.precio{font-weight:800;color:#1ab8af}.footer{margin-top:36px;padding-top:18px;border-top:1px solid #e2eaf2;text-align:center;font-size:12px}.contactos{margin-top:10px;display:flex;justify-content:center;gap:24px;flex-wrap:wrap;color:#1ab8af;font-size:12px}hr{border:none;border-top:1px dashed #e2eaf2;margin:10px 0}</style></head><body>
    <div class="header"><img src="logo.png" class="logo" /><div class="brand">NUR<span class="a">A</span></div><div class="sub">artículos de limpieza</div><div class="fecha">Catálogo al ${new Date().toLocaleDateString('es-AR')}</div></div>`;
  const cats=[...new Set(DB.productos.map(p=>p.categoria))];
  cats.forEach(cat=>{
    html+=`<div class="cat"><div class="cat-title">${EMOJIS_CAT[cat]||'•'} ${cat}</div></div>`;
    DB.productos.filter(p=>p.categoria===cat).forEach(p=>{
      html+=`<div class="prod"><div class="prod-name">${p.nombre}${p.codigo?`<span class="prod-code">#${p.codigo}</span>`:''}</div>`;
      if(p.tipo==='accesorio'){html+=`<div class="pres"><span>Unidad</span><span class="precio">${fmt(p.precioVenta)}</span></div>`;}
      else{(p.presentaciones||[]).forEach(pr=>{html+=`<div class="pres"><span>${pr.nombre}</span><span class="precio">${fmt(pr.precioVenta)}</span></div>`;});}
      if(p.descripcion)html+=`<div style="padding-left:18px;font-size:10px;color:#94a3b8;">📝 ${p.descripcion}</div>`;
      html+=`</div>`;
    });html+=`<hr>`;
  });
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
          <div class="cost-calc-box"><h4>💰 Cálculo</h4>
            <div class="cost-row"><span>Costo</span><span id="accCostoU">$0.00</span></div>
            <div class="cost-row"><span id="accGanLabel">Ganancia</span><span id="accGan">$0.00</span></div>
            <div class="cost-row total"><span>Precio sugerido</span><span id="accPrecio">$0.00</span></div></div>
          <div class="form-group"><label>Precio de venta ($)</label>${moneyInput('pPrecioVentaAcc',p?p.precioVenta||'':'')}<span class="form-note">Podés sobreescribir</span></div>
        </div>
      </div>
    </div>
  </div>`;
  openModal(p?'Editar Producto':'Nuevo Producto',html,guardarProducto.bind(null,id),true);
  setTimeout(()=>{renderPresContainer();recalcTodasPres();calcAccesorio();},30);
}

window.onTipoChange=function(){const t=document.getElementById('pTipo')?.value;document.getElementById('panelLiquido').style.display=t==='liquido'?'':'none';document.getElementById('panelAccesorio').style.display=t==='accesorio'?'':'none';};
window.calcAccesorio=function(){const c=parseFloat(document.getElementById('pCostoUnidad')?.value)||0,g=parseFloat(document.getElementById('pGananciaAcc')?.value)||0,p=c*(1+g/100);const s=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=fmt(v);};s('accCostoU',c);s('accGan',c*g/100);s('accPrecio',p);const gl=document.getElementById('accGanLabel');if(gl)gl.textContent=`Ganancia (${g}%)`;const pv=document.getElementById('pPrecioVentaAcc');if(pv&&p>0&&!pv.dataset.manual)pv.value=p.toFixed(2);};

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
        <div class="form-group"><label style="color:var(--accent-dark);">Precio venta ($)</label>${moneyInput(`pvPres${i}`,(pr.precioVenta||0).toFixed(2),`_presTemp[${i}].precioVenta=+this.value;document.getElementById('pvPres${i}').dataset.manual='1';`)}</div>
      </div>
      <div class="pres-calc-row">
        <span>Producto: <strong id="pcCP${i}">—</strong></span><span>Env+Etiq: <strong id="pcEE${i}">—</strong></span>
        <span>Total: <strong id="pcCT${i}">—</strong></span><span>Gan.: <strong id="pcG${i}">—</strong></span>
        <span style="color:var(--accent-dark);font-weight:700;">Sugerido: <strong id="pcPV${i}">—</strong></span>
      </div>
    </div>`).join('');
  _presTemp.forEach((_,i)=>recalcPres(i));
}
window.recalcPres=function(i){const cl=parseFloat(document.getElementById('pCostoLitro')?.value)||0;const pr=_presTemp[i];if(!pr)return;const cp=cl*pr.litros,ee=(pr.costoEnvase||0)+(pr.costoEtiqueta||0),ct=cp+ee,g=ct*((pr.ganancia||40)/100),pv=ct+g;const s=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=fmt(v);};s(`pcCP${i}`,cp);s(`pcEE${i}`,ee);s(`pcCT${i}`,ct);s(`pcG${i}`,g);s(`pcPV${i}`,pv);const pvEl=document.getElementById(`pvPres${i}`);if(pvEl&&!pvEl.dataset.manual){pvEl.value=pv.toFixed(2);_presTemp[i].precioVenta=pv;}};
window.recalcTodasPres=function(){_presTemp.forEach((_,i)=>recalcPres(i));};
window.agregarPresRapida=function(nombre,litros){if(_presTemp.find(p=>p.nombre===nombre)){toast(`Ya existe ${nombre}`,'info');return;}_presTemp.push({id:genId(),nombre,litros,costoEnvase:0,costoEtiqueta:0,ganancia:40,precioVenta:0});renderPresContainer();};
window.agregarPresPersonalizada=function(){_presTemp.push({id:genId(),nombre:'Nueva',litros:1,costoEnvase:0,costoEtiqueta:0,ganancia:40,precioVenta:0});renderPresContainer();};
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
    prod={id:id||genId(),nombre,codigo,tipo,categoria:cat,descripcion:desc,stockLitros:parseFloat(document.getElementById('pStockLitros').value)||0,stockMinLitros:parseFloat(document.getElementById('pStockMinLitros').value)||5,costoLitro:cl,presentaciones:_presTemp.map(pr=>({id:pr.id||genId(),nombre:pr.nombre,litros:pr.litros||0,costoEnvase:pr.costoEnvase||0,costoEtiqueta:pr.costoEtiqueta||0,ganancia:pr.ganancia||40,precioVenta:pr.precioVenta||0}))};
  } else {
    prod={id:id||genId(),nombre,codigo,tipo,categoria:cat,descripcion:desc,stockUnidades:parseFloat(document.getElementById('pStockUnidades').value)||0,stockMinUnidades:parseFloat(document.getElementById('pStockMinUnidades').value)||2,costoUnidad:parseFloat(document.getElementById('pCostoUnidad').value)||0,gananciaAcc:parseFloat(document.getElementById('pGananciaAcc').value)||40,precioVenta:parseFloat(document.getElementById('pPrecioVentaAcc').value)||0};
  }
  closeModal();
  await fbSave('productos',prod);
  toast(id?'Producto actualizado ✅':'Producto creado ✅');
}

async function eliminarProducto(id){const p=DB.productos.find(x=>x.id===id);const res=await swalConfirm('¿Eliminar producto?',`Se eliminará <strong>${p?.nombre}</strong>`);if(!res.isConfirmed)return;await fbRemove('productos',id);toast('Producto eliminado');}
async function duplicarProducto(id){const orig=DB.productos.find(x=>x.id===id);if(!orig)return;const copia=JSON.parse(JSON.stringify(orig));copia.id=genId();copia.nombre=`${orig.nombre} (copia)`;if(copia.presentaciones)copia.presentaciones=copia.presentaciones.map(pr=>({...pr,id:genId()}));await fbSave('productos',copia);toast('Producto duplicado ✅');}
function wspProducto(id){const p=DB.productos.find(x=>x.id===id);if(!p)return;let msg=`*🌿 NURA — ${p.nombre}*\n📦 ${p.categoria}${p.codigo?' | #'+p.codigo:''}\n\n`;if(p.tipo==='accesorio')msg+=`💲 ${fmt(p.precioVenta)} por unidad\n`;else(p.presentaciones||[]).forEach(pr=>{msg+=`• ${pr.nombre} → ${fmt(pr.precioVenta)}\n`;});if(p.descripcion)msg+=`\n📝 ${p.descripcion}\n`;msg+='\n¡Consultanos! 🌿';window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank');}

// ══════════════════════════════════════════════════════════════════════════════
// CLIENTES
// ══════════════════════════════════════════════════════════════════════════════
let clienteSearch='';
function renderClientes(){
  const el=document.getElementById('page-clientes');
  document.getElementById('topbarActions').innerHTML=`<button class="btn btn-primary" onclick="formCliente(null)">+ Cliente</button>`;
  const lista=DB.clientes.filter(c=>!clienteSearch||c.nombre.toLowerCase().includes(clienteSearch.toLowerCase())||(c.telefono||'').includes(clienteSearch));
  const tbl=`<div class="table-wrap hide-mobile"><table><thead><tr><th>Nombre</th><th>Teléfono</th><th>Email</th><th>Dirección</th><th>Acciones</th></tr></thead><tbody>${lista.length===0?`<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">👥</div><p>Sin clientes</p></div></td></tr>`:lista.map(c=>`<tr><td class="fw-700">${c.nombre}</td><td>${c.telefono||'—'}</td><td>${c.email||'—'}</td><td>${c.direccion||'—'}</td><td><div class="table-actions"><button class="btn btn-secondary btn-sm" onclick="formCliente('${c.id}')">✏️</button>${c.telefono?`<button class="btn btn-wsp-sm btn-sm" onclick="wspCliente('${c.id}')">📲</button>`:''}<button class="btn btn-danger btn-sm btn-icon" onclick="eliminarCliente('${c.id}')">🗑</button></div></td></tr>`).join('')}</tbody></table></div>`;
  const cards=`<div class="mobile-card-list">${lista.map(c=>`<div class="m-card"><div class="m-card-header"><div><div class="m-card-title">👤 ${c.nombre}</div>${c.email?`<div class="m-card-subtitle">${c.email}</div>`:''}</div></div><div class="m-card-body">${c.telefono?`<div class="m-card-row"><span class="m-card-row-label">Teléfono</span><span class="m-card-row-value">${c.telefono}</span></div>`:''} ${c.direccion?`<div class="m-card-row"><span class="m-card-row-label">Dirección</span><span class="m-card-row-value">${c.direccion}</span></div>`:''}</div><div class="m-card-footer"><button class="btn btn-secondary btn-sm" style="flex:1;" onclick="formCliente('${c.id}')">✏️ Editar</button>${c.telefono?`<button class="btn btn-wsp-sm btn-sm" style="flex:1;" onclick="wspCliente('${c.id}')">📲</button>`:''}<button class="btn btn-danger btn-sm btn-icon" onclick="eliminarCliente('${c.id}')">🗑</button></div></div>`).join('')}</div>`;
  el.innerHTML=`<div class="flex flex-center gap-8 mb-16"><div class="search-bar" style="max-width:100%;"><span class="search-icon">🔍</span><input type="text" placeholder="Buscar cliente..." id="clienteSearch" value="${clienteSearch}" /></div></div>${lista.length===0&&!clienteSearch?`<div class="empty-state"><div class="empty-icon">👥</div><p>No hay clientes</p></div>`:tbl+cards}`;
  document.getElementById('clienteSearch').oninput=e=>{clienteSearch=e.target.value;renderClientes();};
}
function formCliente(id){
  const c=id?DB.clientes.find(x=>x.id===id):null;
  openModal(c?'Editar Cliente':'Nuevo Cliente',`<div class="form-grid"><div class="form-group full"><label>Nombre completo</label><input id="cNombre" value="${c?c.nombre:''}" placeholder="Nombre y apellido" /></div><div class="form-group"><label>Teléfono / WhatsApp</label><input id="cTelefono" value="${c?c.telefono||'':''}" placeholder="+54 9 ..." /></div><div class="form-group"><label>Email</label><input id="cEmail" type="email" value="${c?c.email||'':''}" /></div><div class="form-group full"><label>Dirección</label><input id="cDireccion" value="${c?c.direccion||'':''}" /></div><div class="form-group full"><label>Notas</label><textarea id="cNotas">${c?c.notas||'':''}</textarea></div></div>`,async()=>{
    const nombre=document.getElementById('cNombre').value.trim();if(!nombre){await swalError('El nombre es obligatorio');return;}
    const cl={id:c?c.id:genId(),nombre,telefono:document.getElementById('cTelefono').value.trim(),email:document.getElementById('cEmail').value.trim(),direccion:document.getElementById('cDireccion').value.trim(),notas:document.getElementById('cNotas').value.trim()};
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
  document.getElementById('topbarActions').innerHTML=`<button class="btn btn-primary" onclick="formVenta()">+ Venta</button>`;
  const ventas=[...DB.ventas].sort((a,b)=>b.fecha-a.fecha);
  const tbl=`<div class="table-wrap hide-mobile"><table><thead><tr><th>Fecha</th><th>Cliente</th><th>Items</th><th>Total</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${ventas.length===0?`<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">🛒</div><p>Sin ventas</p></div></td></tr>`:ventas.map(v=>{const cl=DB.clientes.find(c=>c.id===v.clienteId);return`<tr><td>${fmtDate(v.fecha)}</td><td>${cl?cl.nombre:v.clienteNombre||'—'}</td><td>${v.items.length}</td><td class="fw-700">${fmt(v.total)}</td><td>${estadoSelect(v)}</td><td><div class="table-actions"><button class="btn btn-secondary btn-sm" onclick="verVenta('${v.id}')">👁</button><button class="btn btn-wsp-sm btn-sm" onclick="wspVenta('${v.id}')">📲</button><button class="btn btn-danger btn-sm btn-icon" onclick="eliminarVenta('${v.id}')">🗑</button></div></td></tr>`;}).join('')}</tbody></table></div>`;
  const cards=`<div class="mobile-card-list">${ventas.map(v=>{const cl=DB.clientes.find(c=>c.id===v.clienteId);return`<div class="m-card"><div class="m-card-header"><div><div class="m-card-title">${cl?cl.nombre:v.clienteNombre||'Sin cliente'}</div><div class="m-card-subtitle">${fmtDate(v.fecha)} · ${v.items.length} ítem(s)</div></div>${estadoSelect(v)}</div><div style="font-family:var(--font-display);font-size:22px;font-weight:800;" class="text-gradient">${fmt(v.total)}</div><div class="m-card-footer mt-8"><button class="btn btn-secondary btn-sm" style="flex:1;" onclick="verVenta('${v.id}')">👁 Ver</button><button class="btn btn-wsp-sm btn-sm" style="flex:1;" onclick="wspVenta('${v.id}')">📲</button><button class="btn btn-danger btn-sm btn-icon" onclick="eliminarVenta('${v.id}')">🗑</button></div></div>`;}).join('')}</div>`;
  el.innerHTML=ventas.length===0?`<div class="empty-state"><div class="empty-icon">🛒</div><p>No hay ventas registradas</p></div>`:tbl+cards;
}
function estadoSelect(v){const col=v.estado==='pagado'?'rgba(82,218,210,0.14)':v.estado==='pendiente'?'rgba(245,158,11,0.12)':'rgba(244,63,94,0.1)';const tc=v.estado==='pagado'?'var(--accent-dark)':v.estado==='pendiente'?'#b45309':'var(--danger)';return`<select class="badge" onchange="cambiarEstadoVenta('${v.id}',this.value)" style="border:none;font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;cursor:pointer;background:${col};color:${tc};"><option value="pagado" ${v.estado==='pagado'?'selected':''}>Pagado</option><option value="pendiente" ${v.estado==='pendiente'?'selected':''}>Pendiente</option><option value="cancelado" ${v.estado==='cancelado'?'selected':''}>Cancelado</option></select>`;}
window.cambiarEstadoVenta=async function(id,estado){const v=DB.ventas.find(x=>x.id===id);if(!v)return;v.estado=estado;await fbSave('ventas',v);toast('Estado actualizado');};

function buildVendibles(){const items=[];DB.productos.forEach(p=>{if(p.tipo==='accesorio'){items.push({key:`${p.id}|acc`,label:`${EMOJIS_CAT[p.categoria]||'🧴'} ${p.nombre} — unidad — ${fmt(p.precioVenta)}`,productoId:p.id,presId:null,nombre:p.nombre,detalle:'Unidad',precio:p.precioVenta,litrosPorUnidad:0,stockDisp:p.stockUnidades||0,esAcc:true});}else{(p.presentaciones||[]).forEach(pr=>{const mu=pr.litros>0?Math.floor((p.stockLitros||0)/pr.litros):999;items.push({key:`${p.id}|${pr.id}`,label:`${EMOJIS_CAT[p.categoria]||'🧴'} ${p.nombre} ${pr.nombre} — ${fmt(pr.precioVenta)} (stock:${mu})`,productoId:p.id,presId:pr.id,nombre:`${p.nombre} ${pr.nombre}`,detalle:pr.nombre,precio:pr.precioVenta,litrosPorUnidad:pr.litros,stockDisp:mu,esAcc:false});});}});return items;}

function formVenta(){ventaItems=[];renderModalVenta();}
function renderModalVenta(){
  const vendibles=buildVendibles();
  openModal('Nueva Venta',`
    <div class="form-group mb-12"><label>Cliente</label><select id="vCliente"><option value="">— Sin cliente —</option>${DB.clientes.map(c=>`<option value="${c.id}">${c.nombre}</option>`).join('')}</select></div>
    <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px;border:1px solid var(--border);">
      <label style="display:block;margin-bottom:8px;">Agregar producto</label>
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
    <div id="ventaTotalBox"></div>`,guardarVenta,true);
  setTimeout(updateVentaTotals,30);
}
function renderVentaCart(){
  if(!ventaItems.length)return`<div class="empty-state" style="padding:16px;"><div class="empty-icon">🛒</div><p>Agregá productos</p></div>`;
  const tbl=`<div class="table-wrap hide-mobile"><table class="cart-table"><thead><tr><th>Producto</th><th>Pres.</th><th>Cant.</th><th>Precio</th><th>Subtotal</th><th></th></tr></thead><tbody>${ventaItems.map((item,i)=>`<tr><td class="fw-600">${item.nombre}</td><td><span class="badge badge-violet">${item.detalle}</span></td><td><input type="number" min="1" value="${item.cantidad}" style="width:55px;padding:4px 6px;" onchange="_updVI(${i},+this.value)" /></td><td>${fmt(item.precio)}</td><td class="fw-700">${fmt(item.subtotal)}</td><td><button class="btn btn-danger btn-sm btn-icon" onclick="_rmVI(${i})">✕</button></td></tr>`).join('')}</tbody></table></div>`;
  const cards=`<div class="mobile-card-list" style="gap:7px;">${ventaItems.map((item,i)=>`<div class="m-card" style="padding:10px 12px;"><div class="m-card-header" style="margin-bottom:7px;"><div><div class="m-card-title" style="font-size:13px;">${item.nombre}</div><span class="badge badge-violet">${item.detalle}</span></div><button class="btn btn-danger btn-sm btn-icon" onclick="_rmVI(${i})">✕</button></div><div class="flex-center gap-8"><label style="font-size:11px;color:var(--text-muted);">Cant.</label><input type="number" min="1" value="${item.cantidad}" style="width:60px;padding:5px 8px;" onchange="_updVI(${i},+this.value)" /><span style="flex:1;text-align:right;font-family:var(--font-display);font-weight:800;font-size:16px;" class="text-gradient">${fmt(item.subtotal)}</span></div></div>`).join('')}</div>`;
  return tbl+cards;
}
window._updVI=function(i,v){ventaItems[i].cantidad=v;ventaItems[i].subtotal=v*ventaItems[i].precio;document.getElementById('ventaCartWrap').innerHTML=renderVentaCart();updateVentaTotals();};
window._rmVI=function(i){ventaItems.splice(i,1);document.getElementById('ventaCartWrap').innerHTML=renderVentaCart();updateVentaTotals();};
window.agregarItemVenta=async function(){const key=document.getElementById('vItemSel').value,cant=parseInt(document.getElementById('vCantidad').value)||1;if(!key){await swalError('Seleccioná un producto/presentación');return;}const v=buildVendibles().find(x=>x.key===key);if(!v)return;if(v.stockDisp<cant){await swalError(`Stock insuficiente. Disponible: <strong>${v.stockDisp} un</strong>`);return;}const exist=ventaItems.find(x=>x.key===key);if(exist){exist.cantidad+=cant;exist.subtotal=exist.cantidad*exist.precio;}else ventaItems.push({...v,cantidad:cant,subtotal:v.precio*cant});document.getElementById('ventaCartWrap').innerHTML=renderVentaCart();updateVentaTotals();};
window.updateVentaTotals=function(){const sub=ventaItems.reduce((s,i)=>s+i.subtotal,0),desc=parseFloat(document.getElementById('vDescuento')?.value)||0,total=Math.max(0,sub-desc);const box=document.getElementById('ventaTotalBox');if(box)box.innerHTML=`<div class="cost-calc-box mt-12"><div class="cost-row"><span>Subtotal</span><span>${fmt(sub)}</span></div><div class="cost-row"><span>Descuento</span><span style="color:var(--danger)">-${fmt(desc)}</span></div><div class="cost-row total"><span>Total</span><span>${fmt(total)}</span></div></div>`;};

async function guardarVenta(){
  if(!ventaItems.length){await swalError('Agregá al menos un producto');return;}
  const sub=ventaItems.reduce((s,i)=>s+i.subtotal,0),desc=parseFloat(document.getElementById('vDescuento')?.value)||0,total=Math.max(0,sub-desc);
  const clienteId=document.getElementById('vCliente')?.value||'',cl=DB.clientes.find(c=>c.id===clienteId);
  // Descontar stock
  const prodsUpd={};
  ventaItems.forEach(item=>{const p=DB.productos.find(x=>x.id===item.productoId);if(!p)return;if(item.esAcc)p.stockUnidades=Math.max(0,(p.stockUnidades||0)-item.cantidad);else p.stockLitros=Math.max(0,(p.stockLitros||0)-item.litrosPorUnidad*item.cantidad);prodsUpd[p.id]=p;});
  const venta={id:genId(),fecha:Date.now(),clienteId,clienteNombre:cl?cl.nombre:'',items:ventaItems.map(i=>({...i})),subtotal:sub,descuento:desc,total,estado:'pendiente',obs:document.getElementById('vObs')?.value.trim()||''};
  closeModal();
  // Guardar stock y venta en paralelo
  await Promise.all([
    ...Object.values(prodsUpd).map(p=>fbSave('productos',p)),
    fbSave('ventas',venta)
  ]);
  swalSuccess('¡Venta registrada!',`Total: <strong>${fmt(total)}</strong>`);
}

function verVenta(id){const v=DB.ventas.find(x=>x.id===id);if(!v)return;const cl=DB.clientes.find(c=>c.id===v.clienteId);openModal('Detalle de Venta',`<p class="mb-8"><strong>Fecha:</strong> ${fmtDate(v.fecha)}</p><p class="mb-8"><strong>Cliente:</strong> ${cl?cl.nombre:v.clienteNombre||'—'}</p>${v.obs?`<p class="mb-12"><strong>Obs:</strong> ${v.obs}</p>`:''}<p class="mb-12"><strong>Estado:</strong> <span class="badge badge-${v.estado==='pagado'?'green':v.estado==='pendiente'?'orange':'red'}">${v.estado}</span></p><div class="table-wrap mb-12"><table class="cart-table"><thead><tr><th>Producto</th><th>Pres.</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr></thead><tbody>${v.items.map(i=>`<tr><td class="fw-600">${i.nombre}</td><td><span class="badge badge-violet">${i.detalle}</span></td><td>${i.cantidad}</td><td>${fmt(i.precio)}</td><td class="fw-700">${fmt(i.subtotal)}</td></tr>`).join('')}</tbody></table></div><div class="cost-calc-box"><div class="cost-row"><span>Subtotal</span><span>${fmt(v.subtotal)}</span></div><div class="cost-row"><span>Descuento</span><span style="color:var(--danger)">-${fmt(v.descuento||0)}</span></div><div class="cost-row total"><span>Total</span><span>${fmt(v.total)}</span></div></div><div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;"><button class="btn btn-wsp-sm" onclick="wspVenta('${v.id}')">📲 WhatsApp</button></div>`,null,true);}
function wspVenta(id){const v=DB.ventas.find(x=>x.id===id);if(!v)return;const cl=DB.clientes.find(c=>c.id===v.clienteId);let msg=`*🧾 NURA — Comprobante*\n📅 ${fmtDate(v.fecha)}\n`;if(cl)msg+=`👤 ${cl.nombre}\n`;msg+=`\n`;v.items.forEach(i=>msg+=`• ${i.nombre} x${i.cantidad} = ${fmt(i.subtotal)}\n`);if(v.descuento)msg+=`\n🔖 Descuento: -${fmt(v.descuento)}`;msg+=`\n\n💰 *Total: ${fmt(v.total)}*\n\nGracias por elegirnos! 🌿`;const tel=cl?.telefono?.replace(/\D/g,'');window.open(`https://wa.me/${tel||''}?text=${encodeURIComponent(msg)}`,'_blank');}
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

function abrirAjusteStock(){
  _ajusteItems=[];
  openModal('⚖️ Ajuste de Stock múltiple',`
    <div class="form-group mb-12"><label>Buscar y agregar producto</label>
      <div class="flex gap-8"><select id="ajProdSel" style="flex:1;"><option value="">Seleccioná...</option>${DB.productos.map(p=>`<option value="${p.id}">${p.nombre}${p.codigo?' #'+p.codigo:''} — ${p.tipo==='accesorio'?(p.stockUnidades||0)+' un':fmtL(p.stockLitros||0)+' L'}</option>`).join('')}</select>
      <button class="btn btn-primary" style="flex-shrink:0;" onclick="agregarAjusteItem()">+ Agregar</button></div>
    </div>
    <div id="ajusteListaWrap"><div class="empty-state" style="padding:20px;"><div class="empty-icon" style="font-size:28px;">⚖️</div><p>Agregá productos para ajustar</p></div></div>`,
  guardarAjusteStock);
}
window.agregarAjusteItem=function(){const prodId=document.getElementById('ajProdSel').value;if(!prodId){toast('Seleccioná un producto','info');return;}if(_ajusteItems.find(x=>x.productoId===prodId)){toast('Ya está en la lista','info');return;}const p=DB.productos.find(x=>x.id===prodId);if(!p)return;const esAcc=p.tipo==='accesorio';_ajusteItems.push({productoId:prodId,nombre:p.nombre,codigo:p.codigo||'',tipo:p.tipo,esAcc,stockActual:esAcc?p.stockUnidades||0:p.stockLitros||0,nuevoStock:esAcc?p.stockUnidades||0:p.stockLitros||0,nuevoMin:esAcc?p.stockMinUnidades||0:p.stockMinLitros||0});renderAjusteItems();};
function renderAjusteItems(){const wrap=document.getElementById('ajusteListaWrap');if(!wrap)return;if(!_ajusteItems.length){wrap.innerHTML=`<div class="empty-state" style="padding:20px;"><div class="empty-icon" style="font-size:28px;">⚖️</div><p>Agregá productos</p></div>`;return;}wrap.innerHTML=`<div style="border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden;">${_ajusteItems.map((item,i)=>`<div style="padding:12px 14px;background:${i%2===0?'var(--surface)':'var(--surface2)'};display:flex;align-items:center;gap:12px;flex-wrap:wrap;"><div style="flex:1;min-width:140px;"><div class="fw-700" style="font-size:13px;">${item.nombre}${item.codigo?` <span class="badge badge-gray">#${item.codigo}</span>`:''}</div><div style="font-size:11px;color:var(--text-muted);">Actual: <strong>${item.esAcc?item.stockActual+' un':fmtL(item.stockActual)+' L'}</strong></div></div><div class="flex gap-8 flex-wrap" style="flex-shrink:0;"><div class="form-group" style="min-width:110px;"><label>Nuevo stock</label>${item.esAcc?unitInput(`ajS${i}`,item.nuevoStock,'un','1',`_ajusteItems[${i}].nuevoStock=+this.value;`):unitInput(`ajS${i}`,item.nuevoStock,'L','0.001',`_ajusteItems[${i}].nuevoStock=+this.value;`)}</div><div class="form-group" style="min-width:110px;"><label>Stock mín.</label>${item.esAcc?unitInput(`ajM${i}`,item.nuevoMin,'un','1',`_ajusteItems[${i}].nuevoMin=+this.value;`):unitInput(`ajM${i}`,item.nuevoMin,'L','0.001',`_ajusteItems[${i}].nuevoMin=+this.value;`)}</div><button class="btn btn-danger btn-sm btn-icon" style="align-self:flex-end;" onclick="_ajusteItems.splice(${i},1);renderAjusteItems()">✕</button></div></div>`).join('')}</div><div style="margin-top:8px;font-size:12px;color:var(--text-muted);">${_ajusteItems.length} producto(s) a ajustar.</div>`;}
async function guardarAjusteStock(){
  if(!_ajusteItems.length){await swalError('Agregá al menos un producto');return;}
  const prods=[];
  _ajusteItems.forEach(item=>{const p=DB.productos.find(x=>x.id===item.productoId);if(!p)return;if(item.esAcc){p.stockUnidades=item.nuevoStock;p.stockMinUnidades=item.nuevoMin;}else{p.stockLitros=item.nuevoStock;p.stockMinLitros=item.nuevoMin;}prods.push(p);});
  closeModal();
  await Promise.all(prods.map(p=>fbSave('productos',p)));
  swalSuccess('Stock actualizado',`Se actualizaron <strong>${_ajusteItems.length}</strong> producto(s).`);
  _ajusteItems=[];
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
  const topP={};DB.ventas.forEach(v=>v.items.forEach(i=>{topP[i.nombre]=(topP[i.nombre]||0)+i.subtotal;}));
  const topCl={};DB.ventas.forEach(v=>{const cl=DB.clientes.find(c=>c.id===v.clienteId);const n=cl?cl.nombre:v.clienteNombre||'?';topCl[n]=(topCl[n]||0)+v.total;});
  const litV={};DB.ventas.forEach(v=>v.items.forEach(i=>{if(!i.esAcc){const b=i.nombre.split(' ').slice(0,-1).join(' ')||i.nombre;litV[b]=(litV[b]||0)+(i.litrosPorUnidad||0)*i.cantidad;}}));
  const topCard=(items,vf)=>{if(!items.length)return`<div class="empty-state" style="padding:20px;"><p>Sin datos</p></div>`;return items.map(([n,v],i)=>`<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);"><span style="font-family:var(--font-display);font-weight:800;font-size:18px;color:var(--text-light);width:22px;">${i+1}</span><span style="flex:1;font-weight:500;font-size:13px;">${n}</span><span class="fw-700 text-gradient">${vf(v)}</span></div>`).join('');};
  el.innerHTML=`
    <div class="grid-4 mb-16">
      <div class="stat-card"><div class="stat-icon green">💰</div><div class="stat-info"><div class="stat-label">Total ventas</div><div class="stat-value">${fmt(tv)}</div></div></div>
      <div class="stat-card"><div class="stat-icon violet">✅</div><div class="stat-info"><div class="stat-label">Cobrado</div><div class="stat-value">${fmt(cobrado)}</div></div></div>
      <div class="stat-card"><div class="stat-icon orange">⏳</div><div class="stat-info"><div class="stat-label">Pendiente</div><div class="stat-value">${fmt(pendiente)}</div></div></div>
      <div class="stat-card"><div class="stat-icon ${tv-tc>=0?'green':'red'}">📊</div><div class="stat-info"><div class="stat-label">Ganancia est.</div><div class="stat-value">${fmt(tv-tc)}</div></div></div>
    </div>
    <div class="grid-2 mb-16">
      <div class="card"><div class="section-title mb-12">🏆 Top productos ($)</div>${topCard(Object.entries(topP).sort((a,b)=>b[1]-a[1]).slice(0,5),fmt)}</div>
      <div class="card"><div class="section-title mb-12">💧 Litros vendidos</div>${topCard(Object.entries(litV).sort((a,b)=>b[1]-a[1]).slice(0,5),v=>fmtL(v)+' L')}</div>
    </div>
    <div class="grid-2 mb-16">
      <div class="card"><div class="section-title mb-12">👑 Mejores clientes</div>${topCard(Object.entries(topCl).sort((a,b)=>b[1]-a[1]).slice(0,5),fmt)}</div>
      <div class="card"><div class="section-title mb-12">📦 Inventario</div>
        <div class="grid-3 keep-2" style="margin-top:8px;text-align:center;">
          <div style="padding:12px;"><div class="fw-800 text-gradient" style="font-family:var(--font-display);font-size:32px;">${DB.productos.length}</div><div class="text-muted">Productos</div></div>
          <div style="padding:12px;"><div class="fw-800" style="font-family:var(--font-display);font-size:32px;color:var(--warning);">${DB.productos.filter(p=>p.tipo==='accesorio'?(p.stockUnidades||0)<=(p.stockMinUnidades||0):(p.stockLitros||0)<=(p.stockMinLitros||0)).length}</div><div class="text-muted">Stock bajo</div></div>
          <div style="padding:12px;"><div class="fw-800" style="font-family:var(--font-display);font-size:32px;color:var(--danger);">${DB.productos.filter(p=>p.tipo==='accesorio'?(p.stockUnidades||0)===0:(p.stockLitros||0)===0).length}</div><div class="text-muted">Sin stock</div></div>
        </div>
      </div>
    </div>`;
}
function wspReporte(){const tv=DB.ventas.reduce((s,v)=>s+v.total,0),tc=DB.compras.reduce((s,c)=>s+c.total,0),sb=DB.productos.filter(p=>p.tipo==='accesorio'?(p.stockUnidades||0)<=(p.stockMinUnidades||0):(p.stockLitros||0)<=(p.stockMinLitros||0)).length;window.open('https://wa.me/?text='+encodeURIComponent(`*📊 Resumen NURA — ${new Date().toLocaleDateString('es-AR')}*\n\n💰 Ventas: ${fmt(tv)}\n🚚 Compras: ${fmt(tc)}\n📈 Ganancia: ${fmt(tv-tc)}\n📦 Productos: ${DB.productos.length} | 👥 Clientes: ${DB.clientes.length}\n⚠️ Stock bajo: ${sb}\n\n_NURA Gestión_`),'_blank');}

// ── WhatsApp catálogo ─────────────────────────────────────────────────────────
document.getElementById('btnWhatsappGlobal').onclick=async function(){
  if(!DB.productos.length){await swalInfo('Sin productos','No hay productos en el catálogo.');return;}
  let msg=`*🌿 NURA — Catálogo*\n\n`;
  const cats=[...new Set(DB.productos.map(p=>p.categoria))];
  cats.forEach(cat=>{msg+=`*${EMOJIS_CAT[cat]||'🧴'} ${cat}*\n`;DB.productos.filter(p=>p.categoria===cat).forEach(p=>{if(p.tipo==='accesorio')msg+=`  • ${p.nombre}${p.codigo?' #'+p.codigo:''} — ${fmt(p.precioVenta)}\n`;else(p.presentaciones||[]).forEach(pr=>{msg+=`  • ${p.nombre} ${pr.nombre}${p.codigo?' #'+p.codigo:''} — ${fmt(pr.precioVenta)}\n`;});});msg+='\n';});
  msg+=`📞 ¡Consultanos!\n📷 @nura.neco | 📲 2262 240512`;
  window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank');
};

// ── Eventos globales ──────────────────────────────────────────────────────────
document.getElementById('hamburger').onclick=function(){document.getElementById('sidebar').classList.toggle('open');};
document.addEventListener('click',e=>{const s=document.getElementById('sidebar');if(s.classList.contains('open')&&!s.contains(e.target)&&e.target.id!=='hamburger')s.classList.remove('open');});
document.getElementById('modalClose').onclick=closeModal;
document.getElementById('modalOverlay').onclick=function(e){if(e.target===this)closeModal();};
document.querySelectorAll('.nav-item').forEach(item=>{item.onclick=()=>navigate(item.dataset.page);});

// CSS extra
const css=`.form-grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}@media(max-width:700px){.form-grid-3{grid-template-columns:1fr 1fr}}`;
const s=document.createElement('style');s.textContent=css;document.head.appendChild(s);

navigate('dashboard');
console.log('🌿 NURA — Realtime Database + PWA');