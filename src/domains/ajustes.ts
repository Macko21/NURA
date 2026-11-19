import { Sesion } from '../lib/session';
import { escapeHTML, registerRenderer, toast } from '../lib/ui';
import { getSettings, mensajesBase, renderWhatsapp, saveSettings, type TipoMensaje } from '../lib/settings';

const variables: Record<string, string> = {
  marca: 'Nombre de tu negocio', cliente: 'Nombre del cliente', fecha: 'Fecha de la venta',
  detalle: 'Listado de pedidos, artículos o presentaciones según el mensaje', total: 'Total del comprobante o precio del combo',
  saldo: 'Importe pendiente', alias: 'Alias que cargaste para transferencias',
  datosdepago: 'Instrucción de transferencia si hay saldo y configuraste un alias',
  listaprecios: 'Catálogo o lista mayorista', combo: 'Nombre del combo',
};
const tipos: [TipoMensaje, string, string[], string][] = [
  ['deuda', 'Recordatorio de saldo pendiente', ['cliente', 'saldo', 'datosdepago', 'alias'], 'Pedido del 18/11/2026\n• Detergente 1 L × 2 · $ 8.500\nSaldo del pedido: $ 8.500'],
  ['comprobante', 'Comprobante de venta', ['cliente', 'fecha', 'total', 'saldo', 'datosdepago', 'alias'], '• Detergente 1 L × 2 · $ 8.500\nSaldo pendiente: $ 8.500'],
  ['catalogo', 'Catálogo', ['listaprecios'], '• Detergente 1 L · $ 4.250\n• Suavizante 5 L · $ 7.000'],
  ['combo', 'Combo', ['combo', 'total'], '• Detergente 1 L × 2\n• Suavizante 1 L × 1'],
];

function renderAjustes() {
  if (!Sesion.esAdmin()) return;
  const el = document.getElementById('page-ajustes');
  if (!el) return;
  const config = getSettings();
  let logo = config.logo;
  let leyendoLogo = false;
  el.innerHTML = `<form id="configNura" class="config-nura">
    <section class="card config-panel"><h3>Marca</h3>
      <label class="form-group">Nombre<input name="nombre" maxlength="60" required value="${escapeHTML(config.nombre)}"></label>
      <label class="form-group">Texto secundario<input name="bajada" maxlength="100" value="${escapeHTML(config.bajada)}"></label>
      <label class="form-group">Logo <input type="file" name="logo" accept="image/png,image/jpeg,image/webp"></label>
      <div class="config-logo"><img alt="Vista previa del logo" ${logo ? `src="${escapeHTML(logo)}"` : 'hidden'}><button type="button" class="btn btn-secondary btn-sm" id="restaurarLogo">Restaurar logo</button></div>
    </section>
    <section class="card config-panel"><h3>Envíos</h3>
      <label class="form-group">Tratamiento<select name="envioModo"><option value="absorbido">Absorber el envío</option><option value="porcentaje">Aplicar recargo porcentual</option></select></label>
      <label class="form-group" id="porcentajeEnvioControl">Recargo sobre la venta neta (%)<input type="number" name="envioPorcentaje" min="0" max="100" step="0.01" value="${config.envioPorcentaje}"></label>
    </section>
    <section class="card config-panel config-whatsapp"><h3>Mensajes de WhatsApp</h3>
      <label class="form-group config-transfer">Alias para transferencias<input name="aliasTransferencia" maxlength="60" value="${escapeHTML(config.aliasTransferencia)}" placeholder="Ej. nura.pagos"><small>Se incluye en el mensaje base cuando hay un saldo pendiente.</small></label>
      ${tipos.map(([key, nombre, vars]) => `<div class="whatsapp-template" data-plantilla="${key}">
        <label class="form-group">${nombre}<textarea name="${key}" rows="5" maxlength="1500">${escapeHTML(config.mensajes[key])}</textarea></label>
        <details><summary>Variables disponibles</summary><ul>${['marca', 'detalle', ...vars].map((v) => `<li><button type="button" class="btn btn-secondary btn-sm" data-variable="${v}" title="Insertar {${v}}">{${v}}</button> ${variables[v]}</li>`).join('')}</ul></details>
        <details><summary>Vista previa de ejemplo</summary><pre data-vista-previa></pre></details>
        <button type="button" class="btn btn-outline btn-sm" data-restaurar>Restaurar mensaje base</button>
      </div>`).join('')}
    </section>
    <div class="config-footer"><button type="submit" class="btn btn-primary">Guardar configuración</button></div>
  </form>`;
  const form = el.querySelector<HTMLFormElement>('form')!;
  const campo = (nombre: string) => form.elements.namedItem(nombre) as HTMLInputElement;
  const tratamiento = form.elements.namedItem('envioModo') as HTMLSelectElement;
  tratamiento.value = config.envioModo;
  const toggle = () => {
    const oculto = tratamiento.value !== 'porcentaje';
    document.getElementById('porcentajeEnvioControl')!.hidden = oculto;
    campo('envioPorcentaje').disabled = oculto;
  };
  tratamiento.onchange = toggle;
  toggle();
  const actualizarVistas: (() => void)[] = [];
  for (const [key, , , detalle] of tipos) {
    const panel = form.querySelector<HTMLElement>(`[data-plantilla="${key}"]`)!;
    const textarea = panel.querySelector('textarea')!;
    const vista = panel.querySelector<HTMLPreElement>('[data-vista-previa]')!;
    const actualizar = () => {
      const alias = campo('aliasTransferencia').value.trim();
      vista.textContent = renderWhatsapp(textarea.value.trim() || mensajesBase[key], {
        marca: campo('nombre').value.trim() || 'Nura', cliente: 'Juan', fecha: '18/11/2026', detalle,
        saldo: '$ 8.500', total: '$ 8.500', alias, listaprecios: 'catálogo', combo: 'Limpieza del hogar',
        datosdepago: alias ? `Si preferís transferir, nuestro alias es *${alias}*.\n` : '',
      });
    };
    actualizarVistas.push(actualizar);
    textarea.addEventListener('input', actualizar);
    panel.querySelectorAll<HTMLButtonElement>('[data-variable]').forEach((boton) => {
      boton.onclick = () => {
        const token = `{${boton.dataset.variable}}`;
        if (textarea.value.length - (textarea.selectionEnd - textarea.selectionStart) + token.length > textarea.maxLength) return;
        textarea.setRangeText(token, textarea.selectionStart, textarea.selectionEnd, 'end');
        textarea.focus();
        actualizar();
      };
    });
    panel.querySelector<HTMLButtonElement>('[data-restaurar]')!.onclick = () => { textarea.value = mensajesBase[key]; actualizar(); };
    actualizar();
  }
  for (const name of ['nombre', 'aliasTransferencia']) {
    campo(name).addEventListener('input', () => actualizarVistas.forEach((actualizar) => actualizar()));
  }
  const preview = el.querySelector<HTMLImageElement>('.config-logo img')!;
  const previewLogo = () => {
    preview.hidden = !logo;
    if (logo) preview.src = logo;
    else preview.removeAttribute('src');
  };
  campo('logo').onchange = async () => {
    const imagen = campo('logo').files?.[0];
    if (!imagen) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(imagen.type) || imagen.size > 800_000) {
      toast('Elegí un PNG, JPG o WebP de hasta 800 KB', 'error'); campo('logo').value = ''; return;
    }
    leyendoLogo = true;
    try {
      logo = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(imagen);
      });
      previewLogo();
    } catch { toast('No se pudo leer el logo', 'error'); }
    finally { leyendoLogo = false; }
  };
  el.querySelector<HTMLButtonElement>('#restaurarLogo')!.onclick = () => {
    if (leyendoLogo) return;
    logo = '';
    campo('logo').value = '';
    previewLogo();
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    if (leyendoLogo) { toast('Esperá a que termine de cargar el logo', 'info'); return; }
    const nombre = campo('nombre').value.trim();
    if (!nombre) { toast('Ingresá el nombre de la marca', 'error'); return; }
    try {
      saveSettings({
        nombre, bajada: campo('bajada').value.trim(), logo, aliasTransferencia: campo('aliasTransferencia').value.trim(),
        envioModo: tratamiento.value === 'porcentaje' ? 'porcentaje' : 'absorbido',
        envioPorcentaje: campo('envioPorcentaje').valueAsNumber || 0,
        mensajes: Object.fromEntries(tipos.map(([key]) => [key, campo(key).value.trim() || mensajesBase[key]])) as ReturnType<typeof getSettings>['mensajes'],
      });
      toast('Configuración guardada en este navegador');
    } catch { toast('No se pudo guardar la configuración en el navegador', 'error'); }
  };
}
registerRenderer('ajustes', renderAjustes);
