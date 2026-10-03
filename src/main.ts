import 'sweetalert2/dist/sweetalert2.css';
import Swal from 'sweetalert2';
import { initAuth, login, logout } from './lib/auth';
import { loadAll, suscribirRealtime, getLastUpdateStr } from './lib/db';
import { closeModal, currentPage, renderPage } from './lib/ui';

// Módulos de dominio (registran sus renderers y exponen handlers globales)
import './domains/productos';
import './domains/clientes';
import './domains/ventas';
import './domains/compras';
import './domains/stock';
import './domains/combos';
import './domains/deudas';
import './domains/reportes';
import './domains/usuarios';
import { formVenta } from './domains/ventas';

// ── Listeners globales ────────────────────────────────────────────────
document.getElementById('hamburger')!.onclick = () => document.getElementById('sidebar')!.classList.toggle('open');
document.addEventListener('click', (e) => {
  const s = document.getElementById('sidebar')!;
  if (s.classList.contains('open') && !s.contains(e.target as Node) && (e.target as HTMLElement).id !== 'hamburger') {
    s.classList.remove('open');
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('modalOverlay')!.classList.contains('active')) {
    e.preventDefault();
    e.stopPropagation();
    closeModal();
  }
});
document.getElementById('modalClose')!.onclick = closeModal;
document.getElementById('sidebarClose')!.onclick = () => document.getElementById('sidebar')!.classList.remove('open');

document.getElementById('loginBtn')!.onclick = () => void login();
for (const id of ['loginUser', 'loginPass']) {
  document.getElementById(id)!.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') void login();
  });
}

document.getElementById('logoutBtn')!.onclick = () => {
  Swal.fire({
    title: 'Cerrar sesión',
    text: '¿Estás seguro?',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Sí, salir',
    cancelButtonText: 'Cancelar',
  }).then((r) => { if (r.isConfirmed) void logout(); });
};

const fab = document.getElementById('fab');
if (fab) fab.onclick = () => formVenta();

// ── Actualizar "Última actualización" cada 10s ────────────────────────
setInterval(() => {
  const el = document.getElementById('dashLastUpdate');
  if (el) {
    el.innerHTML = `<span style="width:6px;height:6px;border-radius:50%;background:var(--accent-dark);animation:pulse 2s infinite;"></span> Actualizado ${getLastUpdateStr()}`;
  }
}, 10000);

// ── Reload con debounce vía realtime ──────────────────────────────────
let reloadTimer: number | undefined;
function debouncedReload() {
  window.clearTimeout(reloadTimer);
  reloadTimer = window.setTimeout(async () => {
    await loadAll();
    renderPage(currentPage);
  }, 300);
}

// ── Splash ────────────────────────────────────────────────────────────
let splashOk = false;
function hideSplash() {
  if (splashOk) return;
  splashOk = true;
  const s = document.getElementById('splash');
  if (s) { s.style.opacity = '0'; setTimeout(() => s.remove(), 420); }
}
setTimeout(() => {
  if (!splashOk) hideSplash();
}, 10000);

// ── Bootstrap ─────────────────────────────────────────────────────────
async function boot() {
  await initAuth();
  hideSplash();
  suscribirRealtime(debouncedReload);
}
void boot();

// ── PWA: instalación ──────────────────────────────────────────────────
let deferredPrompt: (Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }) | null = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e as typeof deferredPrompt;
  setTimeout(() => { if (document.getElementById('app')!.style.display !== 'none') mostrarInstall(); }, 5000);
});
function mostrarInstall() {
  if (!deferredPrompt || document.getElementById('installBanner')) return;
  const b = document.createElement('div');
  b.id = 'installBanner';
  b.innerHTML = `<div style="position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#161d27;border:1px solid rgba(82,218,210,0.25);border-radius:var(--r-md);padding:12px 14px;display:flex;align-items:center;gap:10px;box-shadow:0 8px 24px rgba(0,0,0,0.4);z-index:7000;max-width:320px;width:calc(100% - 24px);">
    <img src="/logo.png" style="width:34px;height:34px;object-fit:contain;flex-shrink:0;">
    <div style="flex:1;"><div style="font-family:'Nunito',sans-serif;font-weight:800;color:#fff;font-size:12px;">Instalá NURA</div><div style="font-size:10px;color:rgba(255,255,255,0.35);">Accedé desde la pantalla de inicio</div></div>
    <button id="installBtn" style="background:linear-gradient(135deg,#1ab8af,#52dad2);color:#fff;border:none;border-radius:var(--r-sm);padding:7px 12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:11px;cursor:pointer;">Instalar</button>
    <button id="installClose" style="background:none;border:none;color:rgba(255,255,255,0.25);cursor:pointer;font-size:16px;padding:2px 4px;">✕</button>
  </div>`;
  document.body.appendChild(b);
  document.getElementById('installBtn')!.onclick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    b.remove();
  };
  document.getElementById('installClose')!.onclick = () => b.remove();
}

// ── Evitar zoom por doble toque ───────────────────────────────────────
document.addEventListener('gesturestart', (e) => e.preventDefault());
let lastTouchEnd = 0;
document.addEventListener('touchend', (event) => {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) event.preventDefault();
  lastTouchEnd = now;
}, false);

// ── Service Worker ────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  // BASE_URL respeta el subpath de GitHub Pages (/NURA/)
  window.addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {}));
}
