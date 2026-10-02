// Formateadores. `fmt` ahora redondea al entero más cercano (antes usaba
// Math.ceil y redondeaba SIEMPRE hacia arriba, inflando totales).

export function fmt(n: unknown): string {
  return '$ ' + Math.round(Number(n) || 0).toLocaleString('es-AR');
}

export function fmtL(n: unknown): string {
  return Number(n || 0).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  });
}

export function fmtDate(d: number | string | Date): string {
  return new Date(d).toLocaleDateString('es-AR');
}
