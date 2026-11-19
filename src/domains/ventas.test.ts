// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { descontarStock, registrarVentaNueva, store } from '../lib/db';
import { Sesion } from '../lib/session';
import { agregarItemVenta, formVenta, updateVentaTotals } from './ventas';
import { redondearPesos } from '../lib/format';
import { getSettings, saveSettings, whatsappMessage } from '../lib/settings';

vi.mock('../lib/db', () => ({
  store: { productos: [], combos: [], ventas: [], clientes: [] },
  descontarStock: vi.fn().mockResolvedValue(true), registrarVentaNueva: vi.fn().mockResolvedValue(undefined),
  loadAll: vi.fn().mockResolvedValue(undefined),
}));

const campo = (id: string) => document.getElementById(id) as HTMLInputElement;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  Sesion.set({ id: 'admin', nombre: 'Admin', username: 'admin', email: 'admin@example.test', rol: 'admin', activo: true });
  store.clientes = [{ id: 'c1', nombre: 'Lucía', telefono: '1234', email: 'lucia@example.test', direccion: 'Centro',
    notas: 'Entrega por la tarde', vendedorId: null, esMayorista: false }];
  store.productos = [{ id: 'p', nombre: 'Jabón', tipo: 'liquido', categoria: 'Jabón líquido', stockLitros: 5, stockMinLitros: 0,
    stockUnidades: 0, stockMinUnidades: 0, costoLitro: 100, costoUnidad: 0, gananciaAcc: 0, descMayorista: 0, precioVenta: 0, precioMayorista: 0,
    presentaciones: [{ id: '500', nombre: '500 ml', litros: 0.5, costoEnvase: 20, costoEtiqueta: 0,
      ganancia: 100, descMayorista: 0, precioVenta: 199.5, precioMayorista: 150 }] }];
  document.body.innerHTML = '<div id="toast"></div><div id="modalOverlay"><div id="modal"><h3 id="modalTitle"></h3><div id="modalBody"></div></div></div>';
});

describe('nueva venta', () => {
  it('muestra el cliente y guarda un cobro combinado con descuento y recargo configurado', async () => {
    saveSettings({ ...getSettings(), envioModo: 'porcentaje', envioPorcentaje: 10 });
    formVenta();
    campo('vCliente').value = 'c1';
    campo('vCliente').dispatchEvent(new Event('change'));
    expect(document.getElementById('ventaClienteInfo')!.textContent).toContain('lucia@example.test');
    campo('vItemSel').value = '500';
    agregarItemVenta();
    campo('vDescuento').value = '20';
    campo('vEfectivo').value = '100';
    campo('vTransferencia').value = '98';
    updateVentaTotals();
    expect(document.getElementById('vGanancia')!.textContent).toContain('110');
    expect(document.getElementById('vTotal')!.textContent).toContain('198');
    document.querySelector<HTMLButtonElement>('#btnModalSave')!.click();
    await vi.waitFor(() => expect(registrarVentaNueva).toHaveBeenCalledOnce());
    expect(descontarStock).toHaveBeenCalledWith('p', 0.5, false);
    expect(vi.mocked(registrarVentaNueva).mock.calls[0][0]).toMatchObject({
      subtotal: 200, descuento: 20, envio: 18, total: 198, estado: 'pagado',
      pagos: [{ monto: 100, medio: 'efectivo' }, { monto: 98, medio: 'transferencia' }],
    });
    await vi.waitFor(() => expect(document.getElementById('toast')!.textContent).toContain('Venta registrada'));
  });

  it('redondea al peso más cercano y permite plantillas con variables', () => {
    expect([486.00000000000006, 10.49, 10.5, 10.51].map(redondearPesos)).toEqual([486, 10, 11, 11]);
    const config = getSettings();
    saveSettings({ ...config, mensajes: { ...config.mensajes, deuda: 'Hola {cliente}, saldo {saldo}\n{detalle}' } });
    expect(whatsappMessage('deuda', 'Factura 1', { cliente: 'Lucía', saldo: '$ 500' })).toBe('Hola Lucía, saldo $ 500\nFactura 1');
  });

  it('actualiza la plantilla anterior y agrega el alias solamente si corresponde', () => {
    const settings = getSettings();
    saveSettings({ ...settings, aliasTransferencia: 'nura.pagos', mensajes: { ...settings.mensajes, deuda: '{detalle}' } });
    const deuda = whatsappMessage('deuda', 'Pedido del 18/11/2026', { cliente: 'Juan', saldo: '$ 8.500' });
    expect(deuda).toContain('Hola Juan');
    expect(deuda).toContain('Pedido del 18/11/2026');
    expect(deuda).toContain('*Total pendiente: $ 8.500*');
    expect(deuda).toContain('*nura.pagos*');
    const comprobante = whatsappMessage('comprobante', '2 artículos', { cliente: 'Juan', fecha: '18/11/2026', total: '$ 8.500' });
    expect(comprobante).not.toContain('nura.pagos');
    saveSettings({ ...getSettings(), aliasTransferencia: '' });
    expect(whatsappMessage('deuda', 'Pedido', { cliente: 'Juan', saldo: '$ 500' })).not.toContain('alias');
  });
});
