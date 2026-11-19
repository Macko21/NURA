export function normalizarBusqueda(valor: unknown): string {
  return String(valor ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

export function coincideBusqueda(consulta: string, ...campos: unknown[]): boolean {
  const texto = campos.map(normalizarBusqueda).join(' ');
  return normalizarBusqueda(consulta).split(/\s+/).every((palabra) => texto.includes(palabra));
}
