import type { Presentacion } from '../types';

export const dinero = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

export function calcularPresentacion(
  costoLitro: number,
  presentacion: Pick<Presentacion, 'litros' | 'costoEnvase' | 'costoEtiqueta' | 'ganancia' | 'descMayorista'>,
  precioManual?: number,
  mayoristaManual?: number,
) {
  const redondear = (valor: number) => Math.round((valor + Number.EPSILON) * 100) / 100;
  const liquido = costoLitro * presentacion.litros;
  const costoReal = redondear(liquido + presentacion.costoEnvase + presentacion.costoEtiqueta);
  const precioVenta = precioManual ?? redondear(costoReal * (1 + presentacion.ganancia / 100));
  const precioMayorista = mayoristaManual ?? redondear(precioVenta * (1 - presentacion.descMayorista / 100));
  return {
    liquido,
    costoReal,
    precioVenta,
    precioMayorista,
    gananciaVenta: redondear(precioVenta - costoReal),
    gananciaMayorista: redondear(precioMayorista - costoReal),
  };
}
