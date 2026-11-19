import { navIcon } from './nav-icons';

const themeKey = 'nura.theme';
const catalogKey = 'nura.catalog.view';

export type CatalogView = 'lista' | 'tarjetas';

function readPreference(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function savePreference(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* Sigue disponible durante la sesión. */ }
}

export function catalogPreference(): CatalogView {
  return readPreference(catalogKey) === 'tarjetas' ? 'tarjetas' : 'lista';
}

export function saveCatalogPreference(view: CatalogView) {
  savePreference(catalogKey, view);
}

export function installThemeControls() {
  const root = document.documentElement;
  const controls = [...document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]')];
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = readPreference(themeKey);
  const render = (dark: boolean) => {
    root.dataset.theme = dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#17142a' : '#f5f4fb');
    const label = dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
    controls.forEach((button) => {
      button.innerHTML = navIcon(dark ? 'sun' : 'moon');
      button.title = label;
      button.setAttribute('aria-label', label);
    });
  };
  render(preference === 'dark' || (preference !== 'light' && system.matches));
  controls.forEach((button) => button.addEventListener('click', () => {
    preference = root.dataset.theme === 'dark' ? 'light' : 'dark';
    savePreference(themeKey, preference);
    render(preference === 'dark');
  }));
  system.addEventListener('change', (event) => {
    if (preference !== 'dark' && preference !== 'light') render(event.matches);
  });
}
