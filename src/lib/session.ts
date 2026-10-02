import type { SesionUsuario } from '../types';

// Estado de sesión en memoria. La autenticación real la gestiona Supabase Auth
// (ver auth.ts); aquí solo se guarda el perfil del usuario logueado para
// resolver rol/nombre sin tocar la DB en cada render.

let currentUser: SesionUsuario | null = null;

export const Sesion = {
  get user(): SesionUsuario | null {
    return currentUser;
  },
  set(user: SesionUsuario | null) {
    currentUser = user;
  },
  esAdmin(): boolean {
    return currentUser?.rol === 'admin';
  },
  esVendedor(): boolean {
    return currentUser?.rol === 'vendedor';
  },
  uid(): string | null {
    return currentUser?.id ?? null;
  },
};
