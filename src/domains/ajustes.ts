import { Sesion } from '../lib/session';
import { escapeHTML, registerRenderer, toast } from '../lib/ui';
import { getSettings, saveSettings, type TipoMensaje } from '../lib/settings';

const tipos: [TipoMensaje, string, string][] = [
  ['catalogo', 'Catálogo', '{marca}, {detalle}'],
  ['comprobante', 'Comprobante de venta', '{cliente}, {total}, {saldo}, {marca}, {detalle}'],
  ['deuda', 'Cuenta corriente con deuda', '{cliente}, {saldo}, {marca}, {detalle}'],
  ['combo', 'Combo', '{marca}, {detalle}'],
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
      ${tipos.map(([key, nombre, vars]) => `<label class="form-group">${nombre}<small>${vars}</small><textarea name="${key}" rows="3" maxlength="1500">${escapeHTML(config.mensajes[key])}</textarea></label>`).join('')}
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
        nombre, bajada: campo('bajada').value.trim(), logo,
        envioModo: tratamiento.value === 'porcentaje' ? 'porcentaje' : 'absorbido',
        envioPorcentaje: campo('envioPorcentaje').valueAsNumber || 0,
        mensajes: Object.fromEntries(tipos.map(([key]) => [key, campo(key).value.trim() || '{detalle}'])) as ReturnType<typeof getSettings>['mensajes'],
      });
      toast('Configuración guardada en este navegador');
    } catch { toast('No se pudo guardar la configuración en el navegador', 'error'); }
  };
}
registerRenderer('ajustes', renderAjustes);
