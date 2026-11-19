const paths: Record<string, string> = {
  dashboard: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  catalogo: 'M3 5h18M3 12h18M3 19h18 M7 3v4M16 10v4M10 17v4',
  clientes: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.9 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM17 3a4 4 0 0 1 0 8',
  ventas: 'M3 7h18v13H3z M7 7V4h10v3 M3 11h18 M8 16h3',
  compras: 'M2 4h3l2.1 10h11.8L21 7H6 M9 20h.01 M17 20h.01',
  stock: 'M3 7l9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11v10 M8 5l8 4',
  combos: 'M3 8h18v4H3z M5 12h14v9H5z M12 8v13 M12 8C7 8 5 7 6 4c1-2 5 0 6 4Zm0 0c5 0 7-1 6-4-1-2-5 0-6 4Z',
  deudas: 'M3 5h18v14H3z M3 9h18 M7 15h4',
  reportes: 'M3 4v16h18 M7 15l4-4 4 2 5-6',
  usuarios: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
};

export function navIcon(page: string) {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[page === 'misreportes' ? 'reportes' : page]}"/></svg>`;
}
