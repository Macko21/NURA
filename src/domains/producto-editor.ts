import { redondearPesos } from '../lib/format';
import { store, saveProducto } from '../lib/db';
import { genId } from '../lib/id';
import { Sesion } from '../lib/session';
import { CATEGORIAS, closeModal, escapeHTML, openModal, swalError, toast } from '../lib/ui';
import type { Presentacion, Producto } from '../types';
import { calcularPresentacion, dinero } from './precios';

const medidas = [100, 250, 500, 1000, 5000];
const nombreMedida = (ml: number) => ml < 1000 ? ml + ' ml' : ml / 1000 + ' L';
const etiqueta = (texto: string, campo: string, valor: unknown, attrs = '') =>
  `<label class="form-group">${texto}<input name="${campo}" value="${escapeHTML(valor)}" ${attrs}></label>`;
const numero = (texto: string, campo: string, valor: number | undefined, attrs = '') =>
  etiqueta(texto, campo, valor, 'type="number" min="0" step="any" ' + attrs);
const precio = (texto: string, campo: string, valor?: number) =>
  numero(texto, campo, valor === undefined ? undefined : redondearPesos(valor), 'data-precio');
const campos = ['costoEnvase', 'costoEtiqueta', 'ganancia', 'descMayorista'] as const;
type Fila = Presentacion & { minorista?: number; mayorista?: number };

function resultado(r: ReturnType<typeof calcularPresentacion>) {
  return [
    ['Costo real', r.costoReal], ['Minorista', r.precioVenta], ['Ganancia minorista', r.gananciaVenta],
    ['Mayorista', r.precioMayorista], ['Ganancia mayorista', r.gananciaMayorista],
  ].map(([t, v]) => `<span>${t}<strong class="${Number(v) < 0 ? 'negative-price' : ''}">${dinero.format(Number(v))}</strong></span>`).join('');
}

export function formProducto(id: string | null) {
  if (!Sesion.esAdmin()) return;
  const anterior = store.productos.find((p) => p.id === id);
  if (id && !anterior) return;
  const productoId = anterior?.id ?? genId();
  const filas: Fila[] = (anterior?.presentaciones ?? []).map((p) => {
    const sugerido = calcularPresentacion(anterior?.costoLitro ?? 0, p);
    const conMinorista = calcularPresentacion(anterior?.costoLitro ?? 0, p, p.precioVenta);
    return { ...p, minorista: redondearPesos(p.precioVenta) === sugerido.precioVenta ? undefined : p.precioVenta,
      mayorista: redondearPesos(p.precioMayorista) === conMinorista.precioMayorista ? undefined : p.precioMayorista };
  }).sort((a, b) => a.litros - b.litros);
  const categorias = [...new Set([...CATEGORIAS, ...(anterior?.categoria ? [anterior.categoria] : [])])];
  let guardando = false;
  let activa = 0;
  openModal(id ? 'Editar artículo' : 'Nuevo artículo', `<form id="editorProducto" novalidate data-vista="general">
    <div class="editor-mobile-nav" role="group" aria-label="Secciones del artículo">
      <button type="button" class="btn btn-secondary btn-sm" data-vista-editor="general" aria-pressed="true">Datos generales</button>
      <button type="button" class="btn btn-secondary btn-sm" data-vista-editor="precios" aria-pressed="false">Medidas y precios</button>
    </div>
    <section class="editor-general"><h4>Datos generales</h4><div class="form-grid">
      ${etiqueta('Nombre', 'nombre', anterior?.nombre, 'required')}
      ${etiqueta('Código', 'codigo', anterior?.codigo, anterior ? '' : 'readonly placeholder="Se asigna al guardar"')}
      <label class="form-group">Categoría<select name="categoria"><option value="">Sin categoría</option>
        ${categorias.map((c) => `<option value="${escapeHTML(c)}" ${c === anterior?.categoria ? 'selected' : ''}>${escapeHTML(c)}</option>`).join('')}</select></label>
      <label class="form-group">Tipo<select name="tipo" ${anterior ? 'disabled' : ''}><option value="liquido">Líquido</option>
        <option value="accesorio" ${anterior?.tipo === 'accesorio' ? 'selected' : ''}>Accesorio</option></select></label>
      <label class="form-group full">Descripción<textarea name="descripcion" rows="2">${escapeHTML(anterior?.descripcion)}</textarea></label>
    </div>
    <fieldset class="editor-section editor-stock" data-tipo="liquido"><legend>Costo y stock</legend>
      <div class="editor-fields">
        ${numero('Costo por litro ($)', 'costoLitro', anterior?.costoLitro ?? 0, 'required')}
        ${numero('Stock (L)', 'stockLitros', anterior?.stockLitros ?? 0, anterior ? 'readonly' : '')}
        ${numero('Stock mínimo (L)', 'stockMinLitros', anterior?.stockMinLitros ?? 0)}
      </div>
    </fieldset></section>
    <fieldset class="editor-section editor-precios" data-tipo="liquido"><legend>Medidas y precios</legend>
      <div class="editor-tabs" id="editorMedidas" role="tablist" aria-label="Medidas del artículo"></div>
      <div class="preset-row" aria-label="Agregar medida">
        ${medidas.map((m) => `<button class="btn btn-secondary btn-sm" type="button" data-medida="${m}">+ ${nombreMedida(m)}</button>`).join('')}
        <button class="btn btn-outline btn-sm" type="button" data-medida="0">+ Otra medida</button>
      </div><p class="editor-hint">Dejá el precio vacío para usar el cálculo automático.</p>
      <div id="editorPresentaciones"></div>
    </fieldset>
    <fieldset class="editor-section editor-precios" data-tipo="accesorio"><legend>Stock y precios por unidad</legend>
      <div class="editor-fields">
        ${numero('Costo por unidad ($)', 'costoUnidad', anterior?.costoUnidad ?? 0)}
        ${etiqueta('Stock (un.)', 'stockUnidades', anterior?.stockUnidades ?? 0, 'type="number" min="0" step="1" ' + (anterior ? 'readonly' : ''))}
        ${etiqueta('Stock mínimo (un.)', 'stockMinUnidades', anterior?.stockMinUnidades ?? 0, 'type="number" min="0" step="1"')}
        ${numero('Recargo (%)', 'gananciaAcc', anterior?.gananciaAcc ?? 40)}
        ${numero('Descuento mayorista (%)', 'descMayoristaAcc', anterior?.descMayorista ?? 20, 'max="100"')}
        ${precio('Minorista ($)', 'precioAcc', anterior?.precioVenta)}
        ${precio('Mayorista ($)', 'mayorAcc', anterior?.precioMayorista)}
      </div><div id="resultadoAcc" class="editor-summary"></div>
    </fieldset></form>`, guardar, 1120);

  const form = document.querySelector<HTMLFormElement>('#editorProducto')!;
  (form.elements.namedItem('categoria') as HTMLSelectElement).value = anterior?.categoria ?? '';
  (form.elements.namedItem('tipo') as HTMLSelectElement).value = anterior?.tipo ?? 'liquido';
  const lista = form.querySelector<HTMLElement>('#editorPresentaciones')!;
  const tabs = form.querySelector<HTMLElement>('#editorMedidas')!;
  const input = (n: string) => form.elements.namedItem(n) as HTMLInputElement;
  const val = (n: string) => Number(input(n).value);
  const opcional = (n: string) => input(n).value === '' ? undefined : val(n);
  const esAcc = () => input('tipo').value === 'accesorio';
  const calc = (r: Fila) => calcularPresentacion(val('costoLitro'), r, r.minorista, r.mayorista);
  const acc = () => calcularPresentacion(val('costoUnidad'), {
    litros: 1, costoEnvase: 0, costoEtiqueta: 0, ganancia: val('gananciaAcc'), descMayorista: val('descMayoristaAcc'),
  }, opcional('precioAcc'), opcional('mayorAcc'));

  function recalcular() {
    filas.forEach((r, i) => {
      const p = calc(r);
      input('pv' + i).placeholder = String(p.precioVenta);
      input('pm' + i).placeholder = String(p.precioMayorista);
      lista.querySelector(`[data-resumen="${i}"]`)!.innerHTML = resultado(p);
    });
    const a = acc();
    input('precioAcc').placeholder = String(a.precioVenta);
    input('mayorAcc').placeholder = String(a.precioMayorista);
    form.querySelector('#resultadoAcc')!.innerHTML = resultado(a);
    form.querySelectorAll<HTMLButtonElement>('[data-medida]').forEach((boton) => {
      boton.disabled = filas.some((r) => r.litros > 0 && r.litros === Number(boton.dataset.medida) / 1000);
    });
  }

  function pintar() {
    tabs.innerHTML = filas.map((r, i) => `<button type="button" role="tab" class="editor-tab" id="medidaTab${i}" aria-controls="medidaPanel${i}" data-tab-medida="${i}">${escapeHTML(r.nombre || 'Otra medida')}</button>`).join('');
    tabs.hidden = !filas.length;
    lista.innerHTML = filas.map((r, i) => `<section class="editor-row" id="medidaPanel${i}" role="tabpanel" aria-labelledby="medidaTab${i}" data-fila="${i}">
      <div class="editor-row-header"><h4>${escapeHTML(r.nombre || 'Otra medida')}</h4>
        <button type="button" class="btn btn-secondary btn-sm" data-quitar="${i}">Quitar</button></div>
      <div class="editor-fields">
        ${etiqueta('Nombre', 'pn' + i, r.nombre, 'required')}
        ${etiqueta('Volumen (ml)', 'pl' + i, r.litros ? r.litros * 1000 : '', 'type="number" min="0.001" step="any" required')}
        ${numero('Envase ($)', 'costoEnvase' + i, r.costoEnvase)}
        ${numero('Etiqueta ($)', 'costoEtiqueta' + i, r.costoEtiqueta)}
        ${numero('Recargo (%)', 'ganancia' + i, r.ganancia)}
        ${numero('Descuento mayorista (%)', 'descMayorista' + i, r.descMayorista, 'max="100"')}
        ${precio('Minorista ($)', 'pv' + i, r.minorista)}
        ${precio('Mayorista ($)', 'pm' + i, r.mayorista)}
      </div><div class="editor-summary" data-resumen="${i}"></div></section>`).join('') || '<p class="editor-empty">Elegí una medida para cargar sus precios.</p>';
    seleccionarMedida(activa);
    recalcular();
  }

  function seleccionarMedida(i: number) {
    activa = i;
    tabs.querySelectorAll<HTMLButtonElement>('[data-tab-medida]').forEach((tab, index) => {
      tab.setAttribute('aria-selected', String(index === activa));
      tab.tabIndex = index === activa ? 0 : -1;
    });
    lista.querySelectorAll<HTMLElement>('[data-fila]').forEach((panel, index) => panel.hidden = index !== activa);
  }

  function mostrarVista(vista: string) {
    form.dataset.vista = vista;
    form.querySelectorAll<HTMLButtonElement>('[data-vista-editor]').forEach((boton) => {
      boton.setAttribute('aria-pressed', String(boton.dataset.vistaEditor === vista));
    });
  }

  tabs.onkeydown = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !filas.length) return;
    event.preventDefault();
    const siguiente = event.key === 'Home' ? 0 : event.key === 'End' ? filas.length - 1 :
      (activa + (event.key === 'ArrowLeft' ? -1 : 1) + filas.length) % filas.length;
    seleccionarMedida(siguiente);
    tabs.querySelector<HTMLButtonElement>(`[data-tab-medida="${siguiente}"]`)?.focus();
  };

  function mostrarTipo() {
    form.querySelectorAll<HTMLFieldSetElement>('[data-tipo]').forEach((el) => {
      el.hidden = el.disabled = (el.dataset.tipo === 'accesorio') !== esAcc();
    });
  }
  form.addEventListener('change', (event) => {
    const campo = event.target as HTMLInputElement;
    if (campo.matches('[data-precio]') && Number.isFinite(campo.valueAsNumber)) {
      campo.value = String(redondearPesos(campo.valueAsNumber));
      campo.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  input('tipo').onchange = mostrarTipo;
  form.oninput = (event) => {
    const el = (event.target as HTMLElement).closest<HTMLElement>('[data-fila]');
    if (el) {
      const i = Number(el.dataset.fila);
      const r = filas[i];
      r.nombre = input('pn' + i).value;
      r.litros = val('pl' + i) / 1000;
      for (const c of campos) r[c] = val(c + i);
      r.minorista = opcional('pv' + i);
      r.mayorista = opcional('pm' + i);
      el.querySelector('h4')!.textContent = r.nombre || 'Otra medida';
      tabs.querySelector(`[data-tab-medida="${i}"]`)!.textContent = r.nombre || 'Otra medida';
    }
    recalcular();
  };
  form.onclick = (event) => {
    const b = (event.target as HTMLElement).closest('button');
    if (b?.dataset.vistaEditor) mostrarVista(b.dataset.vistaEditor);
    if (b?.dataset.tabMedida !== undefined) seleccionarMedida(Number(b.dataset.tabMedida));
    if (b?.dataset.medida !== undefined) {
      const ml = Number(b.dataset.medida);
      filas.push({ id: genId(), nombre: ml ? nombreMedida(ml) : '', litros: ml / 1000, costoEnvase: 0,
        costoEtiqueta: 0, ganancia: 40, descMayorista: 20, precioVenta: 0, precioMayorista: 0 });
      activa = filas.length - 1;
      pintar();
      input((ml ? 'pv' : 'pn') + (filas.length - 1)).focus();
    }
    if (b?.dataset.quitar !== undefined) {
      const i = Number(b.dataset.quitar);
      if (store.combos.some((c) => c.items.some((item) => item.presId === filas[i].id))) {
        void swalError('Retirá esta presentación del combo antes de quitarla del artículo.');
        return;
      }
      filas.splice(i, 1);
      activa = Math.max(0, Math.min(i, filas.length - 1));
      pintar();
      (tabs.querySelector<HTMLButtonElement>(`[data-tab-medida="${activa}"]`) ?? form.querySelector<HTMLButtonElement>('[data-medida]'))?.focus();
    }
  };
  form.onsubmit = (event) => { event.preventDefault(); void guardar(); };
  mostrarTipo();
  pintar();

  async function guardar() {
    if (guardando) return;
    const invalido = Array.from(form.querySelectorAll<HTMLInputElement>('input, select, textarea'))
      .find((campo) => campo.willValidate && !campo.validity.valid);
    if (invalido) {
      mostrarVista(invalido.closest('.editor-precios') ? 'precios' : 'general');
      const fila = invalido.closest<HTMLElement>('[data-fila]');
      if (fila) seleccionarMedida(Number(fila.dataset.fila));
      invalido.reportValidity();
      return;
    }
    const nombre = input('nombre').value.trim();
    if (!nombre || (!esAcc() && filas.some((f) => !f.nombre.trim()))) {
      await swalError('Completá el nombre del artículo y sus presentaciones.'); return;
    }
    if (!esAcc() && filas.some((f) => filas.some((otra) => otra !== f && otra.litros === f.litros)
      && !anterior?.presentaciones.some((old) => old.id === f.id && old.litros === f.litros))) {
      await swalError('Ya existe una presentación con ese volumen.'); return;
    }
    const accesorio = esAcc();
    const a = acc();
    const p: Producto = {
      id: productoId, nombre, codigo: input('codigo').value.trim() || undefined,
      categoria: input('categoria').value, tipo: accesorio ? 'accesorio' : 'liquido', descripcion: input('descripcion').value.trim(),
      stockLitros: accesorio ? 0 : val('stockLitros'), stockMinLitros: accesorio ? 0 : val('stockMinLitros'),
      costoLitro: accesorio ? 0 : val('costoLitro'), stockUnidades: accesorio ? val('stockUnidades') : 0,
      stockMinUnidades: accesorio ? val('stockMinUnidades') : 0, costoUnidad: accesorio ? val('costoUnidad') : 0,
      gananciaAcc: accesorio ? val('gananciaAcc') : 0, descMayorista: accesorio ? val('descMayoristaAcc') : 0,
      precioVenta: accesorio ? a.precioVenta : anterior?.precioVenta ?? 0,
      precioMayorista: accesorio ? a.precioMayorista : anterior?.precioMayorista ?? 0,
      presentaciones: accesorio ? [] : filas.map((r) => {
        const { id, litros, costoEnvase, costoEtiqueta, ganancia, descMayorista } = r;
        const { precioVenta, precioMayorista } = calc(r);
        return { id, nombre: r.nombre.trim(), litros, costoEnvase, costoEtiqueta, ganancia, descMayorista, precioVenta, precioMayorista };
      }),
    };
    guardando = true;
    const boton = document.querySelector<HTMLButtonElement>('#btnModalSave');
    if (boton) boton.disabled = true;
    try {
      const codigo = await saveProducto(p, !anterior);
      if (form.isConnected) closeModal();
      toast(anterior ? 'Artículo actualizado' : `Artículo creado · ${codigo}`);
    } catch (error) {
      await swalError(error instanceof Error ? error.message : 'No se pudo guardar el artículo.');
    } finally {
      guardando = false;
      if (boton) boton.disabled = false;
    }
  }
}
