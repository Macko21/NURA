// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { renderCompras } from './compras';
import { store } from '../lib/db';

it('lista todas las compras y abre los datos de la compra seleccionada', () => {
  document.body.innerHTML = '<header id="topbarActions"></header><div id="page-compras"></div><div id="modalOverlay"><div id="modal"><h3 id="modalTitle"></h3><div id="modalBody"></div></div></div>';
  store.compras = [
    { id: 'a', fecha: 1, productoId: 'p1', productoNombre: 'Detergente', tipo: 'liquido',
      proveedor: 'Proveedor A', cantidad: 15, precioUnit: 10, total: 150, notas: 'Entregado el lunes' },
    { id: 'b', fecha: 2, productoId: 'p2', productoNombre: 'Paño', tipo: 'accesorio',
      proveedor: 'Proveedor B', cantidad: 25, precioUnit: 20, total: 500, notas: 'Pago en efectivo' },
  ];
  renderCompras();

  const cards = [...document.querySelectorAll<HTMLElement>('.record-card')];
  expect(cards).toHaveLength(2);
  expect(cards[0].textContent).toContain('Paño');
  expect(cards[0].textContent).not.toContain('Pago en efectivo');
  cards[0].querySelector('button')!.click();
  expect(document.getElementById('modalTitle')!.textContent).toBe('Detalle de la compra #2');
  expect(document.getElementById('modalBody')!.textContent).toContain('25 un.');
  expect(document.getElementById('modalBody')!.textContent).toContain('Pago en efectivo');
  expect(document.getElementById('modalBody')!.textContent).not.toContain('Entregado el lunes');
});
