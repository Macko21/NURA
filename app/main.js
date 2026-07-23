// ===== NURA — main.js: Event listeners, Init =====
'use strict';

// ── Eventos globales ─────────────────────────────────────────────────
document.getElementById('hamburger').onclick=function(){document.getElementById('sidebar').classList.toggle('open');};
document.addEventListener('click',e=>{
  const s=document.getElementById('sidebar');
  if(s.classList.contains('open')&&!s.contains(e.target)&&e.target.id!=='hamburger')s.classList.remove('open');
});
document.getElementById('modalOverlay').onclick=function(e){};
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.getElementById('modalOverlay').classList.contains('active')) {
    e.preventDefault(); e.stopPropagation();
    closeModal();
  }
});
document.getElementById('modalClose').onclick=closeModal;
document.getElementById('sidebarClose').onclick = function() {
  document.getElementById('sidebar').classList.remove('open');
};

// ── CSS extra ────────────────────────────────────────────────────────
const css=`.form-grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}@media(max-width:700px){.form-grid-3{grid-template-columns:1fr 1fr}}`;
const s=document.createElement('style');s.textContent=css;document.head.appendChild(s);

// ── Cerrar sesión ────────────────────────────────────────────────────
document.getElementById('logoutBtn').onclick = () => {
  Swal.fire({
    title: 'Cerrar sesión',
    text: '¿Estás seguro?',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Sí, salir',
    cancelButtonText: 'Cancelar'
  }).then(result => {
    if (result.isConfirmed) {
      Sesion.cerrar();
    }
  });
};

// ── Init ─────────────────────────────────────────────────────────────
console.log('🌿 NURA — Supabase + PWA + Módulos');

// ── FAB → Nueva Venta ────────────────────────────────────────────────
const fab = document.getElementById('fab');
if (fab) {
  fab.onclick = () => navigate('ventas');
}

// ── Actualizar timestamp "Última actualización" cada 10s ──────────────
setInterval(() => {
  const el = document.getElementById('dashLastUpdate');
  if (el && typeof getLastUpdateStr === 'function') {
    el.innerHTML = `<span style="width:6px;height:6px;border-radius:50%;background:var(--accent-dark);animation:pulse 2s infinite;"></span> Actualizado ${getLastUpdateStr()}`;
  }
}, 10000);

// ── Animar stat cards cuando cambian los datos ────────────────────────
document.addEventListener('nura:datachange', () => {
  if (typeof currentPage !== 'undefined' && currentPage === 'dashboard') {
    document.querySelectorAll('.dash-stat').forEach(card => {
      card.classList.remove('updated');
      void card.offsetWidth; // force reflow
      card.classList.add('updated');
    });
  }
});
