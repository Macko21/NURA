import { normalizarBusqueda } from './search';
import { EMOJIS_CAT, escapeHTML } from './ui';

const tones: Record<string, string> = {
  desengrasante: 'orange', desinfectante: 'teal', limpiavidrios: 'blue', lavandina: 'cyan',
  detergente: 'violet', suavizante: 'pink', 'limpiador multiuso': 'amber', 'jabon liquido': 'mint',
  quitamanchas: 'blue', perfumina: 'rose', accesorio: 'orange',
};
const art = new Map(Object.entries(EMOJIS_CAT).map(([category, icon]) => {
  const key = normalizarBusqueda(category);
  return [key, { icon, tone: tones[key] ?? 'violet' }];
}));

for (const [alias, category] of [
  ['perfuminas', 'perfumina'], ['jabon liquido para ropa', 'jabon liquido'], ['limpia vidrios', 'limpiavidrios'],
  ['accesorios', 'accesorio'], ['limpiador multiusos', 'limpiador multiuso'],
]) {
  art.set(alias, art.get(category)!);
}

export function categoryArt(category: string) {
  const { icon, tone } = art.get(normalizarBusqueda(category)) ?? { icon: '🧴', tone: 'violet' };
  return `<span class="category-art" data-tone="${tone}" aria-hidden="true">${escapeHTML(icon)}</span>`;
}
