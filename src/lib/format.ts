export function redondearPesos(valor: number): number {
  return Math.round(valor + Number.EPSILON * Math.abs(valor));
}

export function fmt(n: unknown): string {
  return '$ ' + redondearPesos(Number(n) || 0).toLocaleString('es-AR');
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
