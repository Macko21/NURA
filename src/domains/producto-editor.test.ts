// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formProducto } from './producto-editor';
import { calcularPresentacion } from './precios';
import { saveProducto, store } from '../lib/db';
import { Sesion } from '../lib/session';
import type { Producto } from '../types';

vi.mock('../lib/db', () => ({ store: { productos: [], combos: [] }, saveProducto: vi.fn().mockResolvedValue(undefined) }));

const producto: Producto = {
  id: 'prod', nombre: 'Líquido "Nura"', codigo: 'N01', categoria: 'Detergente', tipo: 'liquido',
  costoLitro: 1000, stockLitros: 15, stockMinLitros: 2, stockUnidades: 0, stockMinUnidades: 0,
  costoUnidad: 0, gananciaAcc: 0, descMayorista: 0, precioVenta: 0, precioMayorista: 0,
  presentaciones: [{ id: 'one', nombre: '1 L', litros: 1, costoEnvase: 100, costoEtiqueta: 20,
    ganancia: 40, descMayorista: 20, precioVenta: 1800, precioMayorista: 1380 }],
};

const input = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
const click = (sel: string) => document.querySelector<HTMLButtonElement>(sel)!.click();
function escribir(name: string, value: string) {
  const el = input(name);
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  vi.clearAllMocks();
  Sesion.set({ id: 'admin', username: 'admin', nombre: 'Admin', email: 'admin@example.test', activo: true, rol: 'admin' });
  store.productos = [producto];
  document.body.innerHTML = '<div id="modalOverlay"><div id="modal"><h3 id="modalTitle"></h3><div id="modalBody"></div></div></div>';
});

describe('editor de productos', () => {
  it('abre una presentación existente y preserva stock, ID y precios manuales al guardar', async () => {
    formProducto('prod');
    expect(input('nombre').value).toBe('Líquido "Nura"');
    expect(input('costoLitro').value).toBe('1000');
    expect(input('stockLitros').readOnly).toBe(true);
    expect(input('pv0').value).toBe('1800');
    click('#btnModalSave');
    await vi.waitFor(() => expect(saveProducto).toHaveBeenCalledOnce());
    expect(vi.mocked(saveProducto).mock.calls[0][0]).toMatchObject(producto);
  });

  it('agrega solo la medida elegida y calcula ambos precios y ganancias', async () => {
    formProducto(null);
    escribir('nombre', 'Nuevo');
    escribir('costoLitro', '1000');
    click('[data-medida="1000"]');
    escribir('costoEnvase0', '100');
    escribir('costoEtiqueta0', '20');
    expect(input('pv0').placeholder).toBe('1568');
    expect(input('pm0').placeholder).toBe('1254');
    expect(document.querySelectorAll('[data-fila]')).toHaveLength(1);
    click('#btnModalSave');
    await vi.waitFor(() => expect(saveProducto).toHaveBeenCalledOnce());
    expect(vi.mocked(saveProducto).mock.calls[0][0].presentaciones[0]).toMatchObject({
      nombre: '1 L', precioVenta: 1568, precioMayorista: 1254,
    });
    expect(calcularPresentacion(1000, producto.presentaciones[0], 1800, 1050).gananciaMayorista).toBe(-70);
  });

  it('muestra una sola medida por vez y guarda los valores de las pestañas ocultas', async () => {
    formProducto('prod');
    click('[data-medida="500"]');
    expect(document.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('500 ml');
    expect(document.querySelector<HTMLElement>('[data-fila="0"]')?.hidden).toBe(true);
    escribir('pv1', '900');
    click('[data-tab-medida="0"]');
    expect(document.querySelector<HTMLElement>('[data-fila="1"]')?.hidden).toBe(true);
    expect(input('pv0').value).toBe('1800');
    click('#btnModalSave');
    await vi.waitFor(() => expect(saveProducto).toHaveBeenCalledOnce());
    expect(vi.mocked(saveProducto).mock.calls[0][0].presentaciones.map((p) => p.precioVenta)).toEqual([1800, 900]);
  });
});
