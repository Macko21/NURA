// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { buildBottomNav, navigate } from './ui';
import { Sesion } from './session';

describe('menú del teléfono', () => {
  it('abre el menú desde la barra inferior y lo cierra al navegar', () => {
    Sesion.set({ id: 'admin', username: 'admin', nombre: 'Admin', email: 'admin@example.test', activo: true, rol: 'admin' });
    document.body.innerHTML = '<nav id="sidebar"></nav><button id="hamburger"></button><div id="bottomNavInner"></div>';
    buildBottomNav();

    const menu = document.querySelector<HTMLButtonElement>('#bottomMenu')!;
    const sidebar = document.getElementById('sidebar')!;
    menu.click();
    expect(sidebar.classList.contains('open')).toBe(true);
    expect(menu.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById('hamburger')!.getAttribute('aria-expanded')).toBe('true');

    navigate('stock');
    expect(sidebar.classList.contains('open')).toBe(false);
    expect(menu.getAttribute('aria-expanded')).toBe('false');
  });
});
