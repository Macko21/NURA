const paths: Record<string, string> = {
  list: 'M7 6h14M7 12h14M7 18h14M3 6h.01M3 12h.01M3 18h.01',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  edit: 'M13.5 6.5l4 4M4 20l4-.9L20 7l-4-4L4 15z',
  share: 'M12 16V3m-4 4 4-4 4 4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  export: 'M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4',
  wholesale: 'M4 10v10h16V10M3 7l2-4h14l2 4v3h-4l-2-1-3 1-3-1-2 1H3zM9 20v-6h6v6',
  add: 'M12 5v14M5 12h14',
  logout: 'M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5M9 12h11m-4-4 4 4-4 4',
  notes: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7',
  clock: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM12 6v6l4 2',
  warning: 'M12 3 2 20h20ZM12 9v4m0 3h.01',
  moon: 'M21 13a9 9 0 0 1-10-10 9 9 0 1 0 10 10z',
  sun: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 2v2m0 16v2m-10-10h2m16 0h2M5 5l1.5 1.5m11 11L19 19M19 5l-1.5 1.5m-11 11L5 19',
  menu: 'M4 6h16M4 12h16M4 18h16',
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
