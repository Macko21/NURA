const key = 'nura.business.settings';

export type TipoMensaje = 'comprobante' | 'deuda' | 'catalogo' | 'combo';
export const mensajesBase: Record<TipoMensaje, string> = {
  deuda: 'Hola {cliente}, ¿cómo estás? Te escribimos de {marca} para recordarte que quedó un saldo pendiente de *{saldo}*.\n\n{detalle}\n\n*Total pendiente: {saldo}*\n{datosdepago}\nCuando puedas, te agradecemos que regularices el saldo. Si ya abonaste, podés enviarnos el comprobante por acá. ¡Gracias!',
  comprobante: 'Hola {cliente}, gracias por tu compra en {marca}. Te compartimos el comprobante del {fecha}.\n\n{detalle}\n\n*Total: {total}*\n{datosdepago}\nSi tenés alguna consulta, podés responder a este mensaje.',
  catalogo: '¡Hola! Te compartimos el {listaprecios} de {marca}.\n\n{detalle}\n\nSi querés hacer un pedido o consultar por algún artículo, escribinos por acá.',
  combo: '¡Hola! Te compartimos el combo *{combo}* de {marca}.\n\n{detalle}\n\n*Precio: {total}*\n\nSi querés reservarlo o consultar disponibilidad, escribinos por acá.',
};
export interface NuraSettings {
  nombre: string;
  bajada: string;
  logo: string;
  aliasTransferencia: string;
  envioModo: 'absorbido' | 'porcentaje';
  envioPorcentaje: number;
  mensajes: Record<TipoMensaje, string>;
}
const defaults: NuraSettings = {
  nombre: 'Nura',
  bajada: 'artículos de limpieza',
  logo: '',
  aliasTransferencia: '',
  envioModo: 'absorbido',
  envioPorcentaje: 0,
  mensajes: mensajesBase,
};

export function getSettings(): NuraSettings {
  try {
    const data = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<NuraSettings> | null;
    const porcentaje = Number(data?.envioPorcentaje);
    return {
      nombre: typeof data?.nombre === 'string' && data.nombre.trim() ? data.nombre : defaults.nombre,
      bajada: typeof data?.bajada === 'string' ? data.bajada : defaults.bajada,
      logo: typeof data?.logo === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(data.logo) ? data.logo : '',
      aliasTransferencia: typeof data?.aliasTransferencia === 'string' ? data.aliasTransferencia.trim() : '',
      envioModo: data?.envioModo === 'porcentaje' ? 'porcentaje' : 'absorbido',
      envioPorcentaje: Number.isFinite(porcentaje) && porcentaje >= 0 && porcentaje <= 100 ? porcentaje : 0,
      mensajes: Object.fromEntries(Object.entries(defaults.mensajes).map(([tipo, valor]) => {
        const guardado = data?.mensajes?.[tipo as TipoMensaje];
        return [tipo, typeof guardado === 'string' && guardado.trim() && guardado.trim() !== '{detalle}' ? guardado : valor];
      })) as NuraSettings['mensajes'],
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

export function renderWhatsapp(plantilla: string, campos: Record<string, string>) {
  return plantilla.replace(/\{([a-z]+)\}/g, (literal, campo) => campos[campo] ?? literal)
    .replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, '\n\n').trim();
}

export function whatsappMessage(tipo: TipoMensaje, detalle: string, valores: Record<string, string> = {}, ofrecerPago = tipo === 'deuda') {
  const settings = getSettings();
  const alias = settings.aliasTransferencia;
  const datosdepago = ofrecerPago && alias ? `Si preferís transferir, nuestro alias es *${alias}*.\n` : '';
  return renderWhatsapp(settings.mensajes[tipo], { marca: settings.nombre, detalle, alias, datosdepago, ...valores });
}

export function prepareBrandAssets() {
  document.querySelectorAll<HTMLImageElement | HTMLLinkElement>('[data-brand-image], link[rel="icon"], link[rel="apple-touch-icon"]')
    .forEach((el) => { el.dataset.originalBrand = el.getAttribute(el instanceof HTMLImageElement ? 'src' : 'href') ?? ''; });
  applyBrand();
}
