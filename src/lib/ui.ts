import Swal from 'sweetalert2';
import type { Rol } from '../types';
import { Sesion } from './session';
import { fmt } from './format';

// ── Escapado HTML (anti-XSS) ─────────────────────────────────────────
const escDiv = document.createElement('div');
export function escapeHTML(str: unknown): string {
  if (str == null) return '';
  escDiv.textContent = String(str);
  return escDiv.innerHTML;
}

// ── SweetAlert2 ───────────────────────────────────────────────────────
export function swalConfirm(title: string, text: string) {
  return Swal.fire({
    title,
    html: text,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar',
    reverseButtons: true,
    focusCancel: true,
  });
}
export function swalError(msg: string) {
  return Swal.fire({ title: 'Error', html: msg, icon: 'error', confirmButtonText: 'Entendido' });
}
export function swalSuccess(title: string, msg: string) {
  return Swal.fire({ title, html: msg, icon: 'success', timer: 2200, timerProgressBar: true, confirmButtonText: 'OK' });
}
export function swalInfo(title: string, html: string) {
  return Swal.fire({ title, html, icon: 'info', confirmButtonText: 'OK' });
}

// ── Toast ─────────────────────────────────────────────────────────────
export function toast(msg: string, type: 'success' | 'error' | 'info' = 'success') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => (t.className = 'toast'), 2800);
}

// ── Datos constantes ──────────────────────────────────────────────────
export const CATEGORIAS = [
  'Desengrasante', 'Desinfectante', 'Limpiavidrios', 'Lavandina', 'Detergente',
  'Suavizante', 'Limpiador multiuso', 'Jabón líquido', 'Quitamanchas', 'Perfumina', 'Accesorio',
] as const;

export const EMOJIS_CAT: Record<string, string> = {
  Desengrasante: '🧴', Desinfectante: '🦠', Limpiavidrios: '🪟', Lavandina: '💧',
  Detergente: '🫧', Suavizante: '🌸', 'Limpiador multiuso': '✨', 'Jabón líquido': '🧼',
  Quitamanchas: '🔵', Perfumina: '🌹', Accesorio: '🧹',
};

export const PRES_RAPIDAS = [
  { nombre: '250ml', litros: 0.25 },
  { nombre: '500ml', litros: 0.5 },
  { nombre: '750ml', litros: 0.75 },
  { nombre: '1L', litros: 1 },
  { nombre: '2L', litros: 2 },
  { nombre: '5L', litros: 5 },
  { nombre: '10L', litros: 10 },
];

// ── Modal ─────────────────────────────────────────────────────────────
export function openModal(title: string, bodyHTML: string, onSave?: (() => void) | null, wide = false) {
  const titleEl = document.getElementById('modalTitle');
  const bodyEl = document.getElementById('modalBody');
  const overlay = document.getElementById('modalOverlay');
  const modal = document.getElementById('modal');
  if (!titleEl || !bodyEl || !overlay || !modal) return;
  titleEl.textContent = title;
  bodyEl.innerHTML = bodyHTML;
  modal.style.maxWidth = wide ? '820px' : '600px';
  overlay.classList.add('active');
  let footer = modal.querySelector('.modal-footer') as HTMLElement | null;
  if (onSave) {
    if (!footer) {
      footer = document.createElement('div');
      footer.className = 'modal-footer';
      modal.appendChild(footer);
    }
    footer.innerHTML =
      '<button class="btn btn-secondary" id="btnModalCancel">Cancelar</button><button class="btn btn-primary" id="btnModalSave">💾 Guardar</button>';
    document.getElementById('btnModalSave')!.onclick = onSave;
    document.getElementById('btnModalCancel')!.onclick = closeModal;
  } else if (footer) {
    footer.remove();
  }
}

export function closeModal() {
  document.getElementById('modalOverlay')?.classList.remove('active');
}

// ── Input helpers ─────────────────────────────────────────────────────
export function moneyInput(id: string, value: string | number = '', onInput = ''): string {
  return `<div class="input-money-wrap"><span class="money-sign">$</span><input id="${id}" type="number" min="0" step="0.01" value="${value}" placeholder="0.00" ${onInput ? `oninput="${onInput}"` : ''}></div>`;
}
export function unitInput(id: string, value: string | number = '', unit = 'L', step = '0.001', onInput = ''): string {
  return `<div class="input-unit-wrap"><input id="${id}" type="number" min="0" step="${step}" value="${value}" placeholder="0" ${onInput ? `oninput="${onInput}"` : ''}><span class="unit-label">${unit}</span></div>`;
}

// ── Notas de versión ──────────────────────────────────────────────────
interface Nota { v: string; fecha: string; notas: string[] }
const NOTAS_VERSION: Nota[] = [
  { v: '3.0', fecha: new Date().toISOString().slice(0, 10), notas: [
    'Arquitectura: TypeScript + Vite + ES modules',
    'Seguridad: Supabase Auth + Row Level Security por usuario',
    'Base de datos normalizada (esquema relacional)',
    'Fix: redondeo de precios (Math.ceil → redondeo estándar)',
    'Fix: IDs con crypto.getRandomValues',
    'Fix: XSS (escapeHTML en todos los campos dinámicos)',
  ]},
  { v: '2.5', fecha: '2026-07-23', notas: ['Fix: FAB visible en desktop', 'Fix: posición FAB en desktop']},
  { v: '2.0', fecha: '2026-07-22', notas: ['Rediseño UI v2.0 — mobile-first', 'Bottom nav + FAB', 'Dashboard con gráfico y actividad']},
  { v: '1.5', fecha: '2026-07-20', notas: ['Supabase realtime + debounce', 'Edge Function para login', 'Service Worker cache']},
  { v: '1.0', fecha: '2026-07-15', notas: ['Versión inicial', 'Ventas, stock, clientes, combos, deudas', 'PWA instalable']},
];

export function verNotasVersion() {
  const html = NOTAS_VERSION.map(
    (n) => `
    <div style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="font-family:var(--font-display);font-weight:800;font-size:18px;" class="text-gradient">v${n.v}</span>
        <span style="font-size:12px;color:var(--text-muted);">${n.fecha}</span>
      </div>
      <ul style="margin:0;padding-left:20px;">
        ${n.notas.map((nt) => `<li style="font-size:13px;color:var(--text-secondary);margin-bottom:3px;">${escapeHTML(nt)}</li>`).join('')}
      </ul>
    </div>`,
  ).join('');
  openModal('📋 Notas de versión', html);
}

// ── Navegación ────────────────────────────────────────────────────────
export let currentPage = 'dashboard';

export const PAGES_ADMIN = ['dashboard', 'catalogo', 'clientes', 'ventas', 'compras', 'stock', 'combos', 'deudas', 'reportes', 'usuarios'] as const;
export const PAGES_VENDEDOR = ['catalogo', 'combos', 'stock', 'clientes', 'ventas', 'misreportes'] as const;

const renderers: Record<string, () => void> = {};
export function registerRenderer(page: string, fn: () => void) {
  renderers[page] = fn;
}
export function renderPage(page: string) {
  renderers[page]?.();
}

const PAGE_TITLES: Record<string, string> = {
  dashboard: 'Dashboard', catalogo: 'Catálogo', clientes: 'Clientes', ventas: 'Ventas',
  compras: 'Compras', stock: 'Stock', reportes: 'Reportes', combos: 'Combos',
  deudas: 'Deudas', usuarios: 'Usuarios', misreportes: 'Mis Reportes',
};

function allowedPages(): readonly string[] {
  return Sesion.esAdmin() ? PAGES_ADMIN : PAGES_VENDEDOR;
}

export function navigate(page: string) {
  if (!allowedPages().includes(page)) return;
  document.querySelectorAll('.nav-item').forEach((el) => el.classList.toggle('active', el.getAttribute('data-page') === page));
  document.querySelectorAll('.bottom-nav-item').forEach((el) => el.classList.toggle('active', el.getAttribute('data-page') === page));
  document.querySelectorAll('.page').forEach((el) => el.classList.toggle('active', el.id === 'page-' + page));
  const titleEl = document.getElementById('pageTitle');
  if (titleEl) titleEl.textContent = PAGE_TITLES[page] ?? page;
  currentPage = page;
  const actions = document.getElementById('topbarActions');
  if (actions) actions.innerHTML = '';
  renderPage(page);
  document.getElementById('sidebar')?.classList.remove('open');
}

interface NavItem { page: string; icon: string; label: string }
const BOTTOM_NAV_ADMIN: NavItem[] = [
  { page: 'dashboard', icon: '📊', label: 'Inicio' },
  { page: 'ventas', icon: '💸', label: 'Ventas' },
  { page: 'reportes', icon: '📈', label: 'Reportes' },
  { page: 'clientes', icon: '👥', label: 'Clientes' },
  { page: 'stock', icon: '📦', label: 'Stock' },
];
const BOTTOM_NAV_VENDEDOR: NavItem[] = [
  { page: 'catalogo', icon: '🧴', label: 'Catálogo' },
  { page: 'ventas', icon: '💸', label: 'Ventas' },
  { page: 'misreportes', icon: '📈', label: 'Reportes' },
  { page: 'clientes', icon: '👥', label: 'Clientes' },
  { page: 'stock', icon: '📦', label: 'Stock' },
];

export function buildBottomNav() {
  const inner = document.getElementById('bottomNavInner');
  if (!inner) return;
  const items = Sesion.esAdmin() ? BOTTOM_NAV_ADMIN : BOTTOM_NAV_VENDEDOR;
  inner.innerHTML = items
    .map((it) => `<div class="bottom-nav-item" data-page="${it.page}"><span class="bnav-icon">${it.icon}</span><span>${it.label}</span></div>`)
    .join('');
  inner.querySelectorAll('.bottom-nav-item').forEach((el) => {
    (el as HTMLElement).onclick = () => navigate((el as HTMLElement).dataset.page!);
  });
}

export function buildMenu() {
  const menu = document.getElementById('navMenu');
  if (!menu) return;
  const items: NavItem[] = Sesion.esAdmin()
    ? [
        { page: 'dashboard', icon: '📊', label: 'Dashboard' },
        { page: 'catalogo', icon: '🧴', label: 'Catálogo' },
        { page: 'clientes', icon: '👥', label: 'Clientes' },
        { page: 'ventas', icon: '💸', label: 'Ventas' },
        { page: 'compras', icon: '🛒', label: 'Compras' },
        { page: 'stock', icon: '📦', label: 'Stock' },
        { page: 'combos', icon: '🎁', label: 'Combos' },
        { page: 'deudas', icon: '💳', label: 'Deudas' },
        { page: 'reportes', icon: '📈', label: 'Reportes' },
        { page: 'usuarios', icon: '👤', label: 'Usuarios' },
      ]
    : [
        { page: 'catalogo', icon: '🧴', label: 'Catálogo' },
        { page: 'combos', icon: '🎁', label: 'Combos' },
        { page: 'stock', icon: '📦', label: 'Stock' },
        { page: 'clientes', icon: '👥', label: 'Clientes' },
        { page: 'ventas', icon: '💸', label: 'Nueva Venta' },
        { page: 'misreportes', icon: '📈', label: 'Mis Reportes' },
      ];
  menu.innerHTML = items.map((it) => `<li class="nav-item active" data-page="${it.page}"><span class="nav-icon">${it.icon}</span><span>${it.label}</span></li>`).join('');
  menu.querySelectorAll('.nav-item').forEach((el) => {
    (el as HTMLElement).onclick = () => navigate((el as HTMLElement).dataset.page!);
  });
  buildBottomNav();
}

// Expone funciones en `window` para que los manejadores inline (`onclick="..."`)
// de las plantillas HTML sigan funcionando en un entorno de ES modules.
export function exposeGlobal(fns: Record<string, unknown>) {
  Object.assign(window, fns);
}

export type { Rol };
export { fmt };
