import { sb } from './supabase';
import { Sesion } from './session';
import { store, loadAll } from './db';
import { buildMenu, navigate, toast } from './ui';
import type { SesionUsuario } from '../types';

const TIMEOUT = 12 * 60 * 60 * 1000;
let lastActive = Date.now();

function showApp() {
  document.getElementById('loginScreen')!.style.display = 'none';
  document.getElementById('app')!.style.display = '';
  buildMenu();
  navigate(Sesion.esAdmin() ? 'dashboard' : 'catalogo');
}

function showLogin() {
  document.getElementById('app')!.style.display = 'none';
  document.getElementById('loginScreen')!.style.display = '';
}

function clearLoginError() {
  const e = document.getElementById('loginError');
  if (e) e.style.display = 'none';
}

async function loadProfile(uid: string): Promise<SesionUsuario | null> {
  const perfil = store.perfiles.find((p) => p.id === uid && p.activo !== false);
  if (!perfil) return null;
  const { data } = await sb().auth.getUser();
  return {
    id: uid,
    email: data.user?.email ?? '',
    username: perfil.username,
    nombre: perfil.nombre,
    rol: perfil.rol,
    activo: perfil.activo,
  };
}

export async function login() {
  const emailEl = document.getElementById('loginUser') as HTMLInputElement;
  const passEl = document.getElementById('loginPass') as HTMLInputElement;
  const errorEl = document.getElementById('loginError') as HTMLElement;
  const btn = document.getElementById('loginBtn') as HTMLButtonElement;
  const rawEmail = emailEl.value.trim();
  const password = passEl.value;
  clearLoginError();

  if (!rawEmail || !password) {
    errorEl.textContent = 'Completá usuario y contraseña';
    errorEl.style.display = 'block';
    return;
  }

  // Compatibilidad con la versión legacy: se puede ingresar con el username
  // simple (ej: "admin") y se completa el dominio @nura.app.
  const email = rawEmail.includes('@') ? rawEmail : `${rawEmail}@nura.app`;

  btn.disabled = true;
  btn.textContent = 'Ingresando...';
  try {
    const { data, error } = await sb().auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      const msg = error?.message ?? '';
      if (/invalid login credentials/i.test(msg)) {
        errorEl.textContent = 'Usuario o contraseña incorrectos';
      } else if (/email not confirmed/i.test(msg)) {
        errorEl.textContent = 'Email sin confirmar — revisá tu casilla';
      } else {
        errorEl.textContent = msg ? `Error: ${msg}` : 'Usuario o contraseña incorrectos';
      }
      errorEl.style.display = 'block';
      return;
    }
    await loadAll();
    const user = await loadProfile(data.user.id);
    if (!user) {
      await sb().auth.signOut();
      errorEl.textContent = 'Usuario sin perfil activo';
      errorEl.style.display = 'block';
      return;
    }
    Sesion.set(user);
    passEl.value = '';
    showApp();
    iniciarControlInactividad();
  } catch {
    errorEl.textContent = 'Error al conectar';
    errorEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Ingresar';
  }
}

export async function logout() {
  await sb().auth.signOut();
  Sesion.set(null);
  showLogin();
  toast('Sesión cerrada', 'info');
}

export function iniciarControlInactividad() {
  lastActive = Date.now();
  setInterval(() => {
    if (Sesion.user && Date.now() - lastActive > TIMEOUT) void logout();
  }, 60000);
  ['click', 'keydown'].forEach((ev) => document.addEventListener(ev, () => { lastActive = Date.now(); }));
}

export async function initAuth() {
  const { data } = await sb().auth.getSession();
  if (!data.session?.user) {
    showLogin();
    return;
  }
  await loadAll();
  const user = await loadProfile(data.session.user.id);
  if (!user) {
    await sb().auth.signOut();
    showLogin();
    return;
  }
  Sesion.set(user);
  showApp();
  iniciarControlInactividad();
}
