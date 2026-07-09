// ===== NURA — ui.js: Helpers, Modal, Navegación, Toast =====
'use strict';

// ── Utils ─────────────────────────────────────────────────────────────
function genId()    { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function fmt(n)     { return '$ ' + Math.ceil(Number(n||0)).toLocaleString('es-AR'); }
function fmtL(n)    { return Number(n||0).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:3}); }
function fmtDate(d) { return new Date(d).toLocaleDateString('es-AR'); }

const _escDiv = document.createElement('div');
function escapeHTML(str) {
  if (str == null) return '';
  _escDiv.textContent = String(str);
  return _escDiv.innerHTML;
}

// ── Hash SHA-256 ──────────────────────────────────────────────────────
async function hashPassword(password, salt = '') {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── SweetAlert2 ───────────────────────────────────────────────────────
function swalConfirm(title, text) {
  return Swal.fire({ title, html:text, icon:'warning', showCancelButton:true, confirmButtonText:'Sí, eliminar', cancelButtonText:'Cancelar', reverseButtons:true, focusCancel:true });
}
function swalError(msg)          { return Swal.fire({ title:'Error', html:msg, icon:'error', confirmButtonText:'Entendido' }); }
function swalSuccess(title, msg) { return Swal.fire({ title, html:msg, icon:'success', timer:2200, timerProgressBar:true, confirmButtonText:'OK' }); }
function swalInfo(title, html)   { return Swal.fire({ title, html, icon:'info', confirmButtonText:'OK' }); }

// ── Toast ─────────────────────────────────────────────────────────────
function toast(msg, type='success') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast show '+type;
  setTimeout(()=>t.className='toast', 2800);
}

// ── Datos constantes ──────────────────────────────────────────────────
const CATEGORIAS = ['Desengrasante','Desinfectante','Limpiavidrios','Lavandina','Detergente','Suavizante','Limpiador multiuso','Jabón líquido','Quitamanchas','Perfumina','Accesorio'];
const EMOJIS_CAT = {'Desengrasante':'🧴','Desinfectante':'🦠','Limpiavidrios':'🪟','Lavandina':'💧','Detergente':'🫧','Suavizante':'🌸','Limpiador multiuso':'✨','Jabón líquido':'🧼','Quitamanchas':'🔵','Perfumina':'🌹','Accesorio':'🧹'};
const PRES_RAPIDAS = [{nombre:'250ml',litros:.25},{nombre:'500ml',litros:.5},{nombre:'750ml',litros:.75},{nombre:'1L',litros:1},{nombre:'2L',litros:2},{nombre:'5L',litros:5},{nombre:'10L',litros:10}];

// ── Modal ─────────────────────────────────────────────────────────────
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

// ── Navegación ────────────────────────────────────────────────────────
let currentPage = 'dashboard';
const PAGES_ADMIN = ['dashboard','catalogo','clientes','ventas','compras','stock','combos','deudas','reportes','usuarios'];
const PAGES_VENDEDOR = ['catalogo','combos','stock','clientes','ventas','misreportes'];

function buildMenu() {
  const menu = document.getElementById('navMenu');
  if (!menu) return;
  if (Sesion.esAdmin()) {
    menu.innerHTML = `
      <li class="nav-item active" data-page="dashboard"><span class="nav-icon">📊</span><span>Dashboard</span></li>
      <li class="nav-item" data-page="catalogo"><span class="nav-icon">🧴</span><span>Catálogo</span></li>
      <li class="nav-item" data-page="clientes"><span class="nav-icon">👥</span><span>Clientes</span></li>
      <li class="nav-item" data-page="ventas"><span class="nav-icon">💸</span><span>Ventas</span></li>
      <li class="nav-item" data-page="compras"><span class="nav-icon">🛒</span><span>Compras</span></li>
      <li class="nav-item" data-page="stock"><span class="nav-icon">📦</span><span>Stock</span></li>
      <li class="nav-item" data-page="combos"><span class="nav-icon">🎁</span><span>Combos</span></li>
      <li class="nav-item" data-page="deudas"><span class="nav-icon">💳</span><span>Deudas</span></li>
      <li class="nav-item" data-page="reportes"><span class="nav-icon">📈</span><span>Reportes</span></li>
      <li class="nav-item" data-page="usuarios"><span class="nav-icon">👤</span><span>Usuarios</span></li>`;
  } else {
    menu.innerHTML = `
      <li class="nav-item active" data-page="catalogo"><span class="nav-icon">🧴</span><span>Catálogo</span></li>
      <li class="nav-item" data-page="combos"><span class="nav-icon">🎁</span><span>Combos</span></li>
      <li class="nav-item" data-page="stock"><span class="nav-icon">📦</span><span>Stock</span></li>
      <li class="nav-item" data-page="clientes"><span class="nav-icon">👥</span><span>Clientes</span></li>
      <li class="nav-item" data-page="ventas"><span class="nav-icon">💸</span><span>Nueva Venta</span></li>
      <li class="nav-item" data-page="misreportes"><span class="nav-icon">📈</span><span>Mis Reportes</span></li>`;
  }
  document.querySelectorAll('.nav-item').forEach(item => {
    item.onclick = () => navigate(item.dataset.page);
  });
}

function navigate(page) {
  const allowed = Sesion.esAdmin() ? PAGES_ADMIN : PAGES_VENDEDOR;
  if (!allowed.includes(page)) return;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('active', el.id === 'page-' + page));
  document.getElementById('pageTitle').textContent =
    { dashboard: 'Dashboard', catalogo: 'Catálogo', clientes: 'Clientes', ventas: 'Ventas', compras: 'Compras',
      stock: 'Stock', reportes: 'Reportes', combos: 'Combos', deudas: '💳 Deudas', usuarios: '👤 Usuarios',
      misreportes: '📈 Mis Reportes' }[page];
  currentPage = page;
  document.getElementById('topbarActions').innerHTML = '';
  renderPage(page);
  document.getElementById('sidebar').classList.remove('open');
}

function renderPage(page) {
  const handlers = {
    dashboard: renderDashboard, catalogo: renderCatalogo, clientes: renderClientes,
    ventas: renderVentas, compras: renderCompras, stock: renderStock,
    reportes: renderReportes, combos: renderCombos, deudas: renderDeudas,
    usuarios: renderUsuarios, misreportes: renderMisReportes
  };
  if (handlers[page]) handlers[page]();
}

// ── Input helpers ─────────────────────────────────────────────────────
function moneyInput(id, value='', onInput='') {
  return `<div class="input-money-wrap"><span class="money-sign">$</span><input id="${id}" type="number" min="0" step="0.01" value="${value}" placeholder="0.00" ${onInput?`oninput="${onInput}"`:''}></div>`;
}
function unitInput(id, value='', unit='L', step='0.001', onInput='') {
  return `<div class="input-unit-wrap"><input id="${id}" type="number" min="0" step="${step}" value="${value}" placeholder="0" ${onInput?`oninput="${onInput}"`:''}><span class="unit-label">${unit}</span></div>`;
}
