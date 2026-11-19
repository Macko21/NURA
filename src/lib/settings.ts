const key = 'nura.business.settings';

export type TipoMensaje = 'comprobante' | 'deuda' | 'catalogo' | 'combo';
export interface NuraSettings {
  nombre: string;
  bajada: string;
  logo: string;
  envioModo: 'absorbido' | 'porcentaje';
  envioPorcentaje: number;
  mensajes: Record<TipoMensaje, string>;
}
const defaults: NuraSettings = {
  nombre: 'Nura',
  bajada: 'artículos de limpieza',
  logo: '',
  envioModo: 'absorbido',
  envioPorcentaje: 0,
  mensajes: { comprobante: '{detalle}', deuda: '{detalle}', catalogo: '{detalle}', combo: '{detalle}' },
};

export function getSettings(): NuraSettings {
  try {
    const data = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<NuraSettings> | null;
    const porcentaje = Number(data?.envioPorcentaje);
    return {
      nombre: typeof data?.nombre === 'string' && data.nombre.trim() ? data.nombre : defaults.nombre,
      bajada: typeof data?.bajada === 'string' ? data.bajada : defaults.bajada,
      logo: typeof data?.logo === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(data.logo) ? data.logo : '',
      envioModo: data?.envioModo === 'porcentaje' ? 'porcentaje' : 'absorbido',
      envioPorcentaje: Number.isFinite(porcentaje) && porcentaje >= 0 && porcentaje <= 100 ? porcentaje : 0,
      mensajes: Object.fromEntries(Object.entries(defaults.mensajes).map(([tipo, valor]) => [
        tipo, typeof data?.mensajes?.[tipo as TipoMensaje] === 'string' ? data.mensajes[tipo as TipoMensaje] : valor,
      ])) as NuraSettings['mensajes'],
    };
  } catch { return defaults; }
}

export function saveSettings(settings: NuraSettings) {
  localStorage.setItem(key, JSON.stringify(settings));
  applyBrand();
}

export function applyBrand() {
  const { nombre, bajada, logo } = getSettings();
  document.querySelectorAll<HTMLElement>('[data-brand-name]').forEach((el) => {
    if (nombre === defaults.nombre) {
      const a = document.createElement('span');
      a.className = 'letra-a';
      a.textContent = 'a';
      el.replaceChildren('Nur', a);
    } else el.textContent = nombre;
  });
  document.querySelectorAll<HTMLElement>('[data-brand-subtitle]').forEach((el) => el.textContent = bajada);
  if (logo) {
    document.querySelectorAll<HTMLImageElement>('[data-brand-image]').forEach((img) => img.src = logo);
    document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="apple-touch-icon"]').forEach((link) => link.href = logo);
  } else {
    document.querySelectorAll<HTMLImageElement | HTMLLinkElement>('[data-original-brand]').forEach((el) => {
      el.setAttribute(el instanceof HTMLImageElement ? 'src' : 'href', el.dataset.originalBrand!);
    });
  }
  document.title = nombre + ' — Gestión';
}

export function whatsappMessage(tipo: TipoMensaje, detalle: string, valores: Record<string, string> = {}) {
  const settings = getSettings();
  const campos: Record<string, string> = { marca: settings.nombre, detalle, ...valores };
  return (settings.mensajes[tipo] || '{detalle}').replace(/\{([a-z]+)\}/g, (literal, campo) => campos[campo] ?? literal);
}

export function prepareBrandAssets() {
  document.querySelectorAll<HTMLImageElement | HTMLLinkElement>('[data-brand-image], link[rel="icon"], link[rel="apple-touch-icon"]')
    .forEach((el) => { el.dataset.originalBrand = el.getAttribute(el instanceof HTMLImageElement ? 'src' : 'href') ?? ''; });
  applyBrand();
}
