// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ajustarStock, store } from '../lib/db';
import { Sesion } from '../lib/session';
import { abrirAjusteStock, agregarAjusteItem } from './stock';

vi.mock('../lib/db', () => ({ store: { productos: [] }, ajustarStock: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
  Sesion.set({ id: 'admin', email: 'admin@example.test', username: 'admin', nombre: 'Admin', activo: true, rol: 'admin' });
  store.productos = [{ id: 'des', nombre: 'Desengrasante', codigo: 'DES001', categoria: 'Desengrasante', tipo: 'liquido',
    stockLitros: 0, stockMinLitros: 1, stockUnidades: 0, stockMinUnidades: 0, costoLitro: 10,
    costoUnidad: 0, gananciaAcc: 0, descMayorista: 0, precioVenta: 0, precioMayorista: 0, presentaciones: [] }];
  document.body.innerHTML = '<div id="toast"></div><div id="modalOverlay"><div id="modal"><h3 id="modalTitle"></h3><div id="modalBody"></div></div></div>';
});

function cargarAjuste() {
  abrirAjusteStock();
  document.querySelector<HTMLSelectElement>('#ajProdSel')!.value = 'des';
  agregarAjusteItem();
  const stock = document.querySelector<HTMLInputElement>('#ajS0')!;
  stock.value = '12.5';
  stock.dispatchEvent(new Event('input'));
  document.querySelector<HTMLButtonElement>('#btnModalSave')!.click();
}

describe('ajuste de stock', () => {
  it('envía el valor editado y confirma después del guardado', async () => {
    vi.mocked(ajustarStock).mockResolvedValue(undefined);
    cargarAjuste();
    await vi.waitFor(() => expect(document.getElementById('toast')?.textContent).toContain('Stock actualizado'));
    expect(ajustarStock).toHaveBeenCalledWith('des', 12.5, 1, 0, 1, false);
    expect(document.getElementById('modalOverlay')?.classList.contains('active')).toBe(false);
  });

  it('conserva el ajuste y avisa sin cerrar cuando la base lo rechaza', async () => {
    vi.mocked(ajustarStock).mockRejectedValue(new Error('La base rechazó el ajuste'));
    cargarAjuste();
    await vi.waitFor(() => expect(document.getElementById('toast')?.classList.contains('error')).toBe(true));
    expect(document.querySelector<HTMLInputElement>('#ajS0')?.value).toBe('12.5');
    expect(document.getElementById('modalOverlay')?.classList.contains('active')).toBe(true);
  });
});
