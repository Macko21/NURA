// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '../lib/db';
import { renderDeudas } from './deudas';
import type { Venta } from '../types';

function seedDeuda(clienteId: string, clienteNombre: string, total: number) {
  store.ventas.push({
    id: 'v-' + clienteId,
    fecha: Date.now() - 3 * 86400000,
    clienteId,
    clienteNombre,
    items: [],
    descuento: 0,
    envio: 0,
    total,
    estado: 'pendiente',
    pagos: [],
  } as unknown as Venta);
}

beforeEach(() => {
  store.ventas = [];
  store.clientes = [];
  document.body.innerHTML = `
    <div id="page-deudas"></div>
    <div id="topbarActions"></div>
    <div class="modal-overlay" id="modalOverlay">
      <div class="modal" id="modal">
        <div class="modal-header"><h3 id="modalTitle"></h3><button id="modalClose"></button></div>
        <div class="modal-body" id="modalBody"></div>
      </div>
    </div>`;
});

describe('renderDeudas', () => {
  it('muestra el total global y las tarjetas de clientes', () => {
    seedDeuda('c1', 'Juan Pérez', 5000);
    seedDeuda('c2', 'María "La K" O\'Connor', 3000);

    renderDeudas();

    const el = document.getElementById('page-deudas')!;
    expect(el.textContent).toContain('Total adeudado');
    expect(el.textContent).toContain('$');
    // Las tarjetas deben existir aunque el nombre tenga comillas
    const cards = el.querySelectorAll('[data-deuda-idx]');
    expect(cards.length).toBe(2);
  });

  it('el click en la tarjeta abre la cuenta corriente (regresión: keys con comillas)', () => {
    seedDeuda('c1', "O'Connor \"La K\"", 7500);

    renderDeudas();

    const card = document.querySelector<HTMLElement>('[data-deuda-idx="0"]')!;
    expect(card).not.toBeNull();

    card.click();

    const overlay = document.getElementById('modalOverlay')!;
    expect(overlay.classList.contains('active')).toBe(true);
    expect(document.getElementById('modalTitle')!.textContent).toContain('Cuenta corriente');
    expect(document.getElementById('modalBody')!.textContent).toContain('7.500');
  });

  it('el botón WS abre wa.me y la tarjeta no dispara dos veces', () => {
    seedDeuda('c1', 'Cliente Raro', 1000);
    store.clientes.push({ id: 'c1', nombre: 'Cliente Raro', telefono: '2262240512' } as never);

    let opened: string | null = null;
    const originalOpen = window.open;
    window.open = ((url: string) => { opened = url; return null; }) as never;

    try {
      renderDeudas();
      const wspBtn = document.querySelector<HTMLElement>('[data-accion="wsp"]')!;
      expect(wspBtn).not.toBeNull();
      wspBtn.click();
      expect(opened).toContain('wa.me/2262240512');
      // El botón WS no debe abrir también la cuenta corriente (stopPropagation)
      expect(document.getElementById('modalOverlay')!.classList.contains('active')).toBe(false);
    } finally {
      window.open = originalOpen;
    }
  });

  it('sin deudas muestra empty state', () => {
    renderDeudas();
    const el = document.getElementById('page-deudas')!;
    expect(el.textContent).toContain('Sin deudas pendientes');
    expect(el.querySelectorAll('[data-deuda-idx]').length).toBe(0);
  });
});
