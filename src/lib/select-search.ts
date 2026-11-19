import { coincideBusqueda } from './search';

export function activarBuscadores(contenedor: ParentNode) {
  for (const select of contenedor.querySelectorAll<HTMLSelectElement>('select[data-buscar]')) {
    const opciones = [...select.options].filter((option) => option.value && !option.disabled);
    const wrapper = document.createElement('div');
    wrapper.className = 'search-combo';
    const campo = document.createElement('input');
    const lista = document.createElement('div');
    lista.className = 'search-options';
    lista.id = select.id + '-opciones';
    lista.setAttribute('role', 'listbox');
    lista.hidden = true;
    campo.id = select.id + '-buscar';
    campo.type = 'search';
    campo.autocomplete = 'off';
    campo.placeholder = select.dataset.buscar || 'Buscar';
    campo.setAttribute('aria-label', campo.placeholder);
    campo.setAttribute('role', 'combobox');
    campo.setAttribute('aria-autocomplete', 'list');
    campo.setAttribute('aria-controls', lista.id);
    campo.setAttribute('aria-expanded', 'false');
    for (const label of select.labels ?? []) label.htmlFor = campo.id;
    select.hidden = true;
    wrapper.append(campo, lista);
    select.before(wrapper);

    let resultados: HTMLOptionElement[] = [];
    let activa = -1;
    let buscando = false;

    const mostrarSeleccion = () => {
      campo.value = opciones.find((item) => item.value === select.value)?.text ?? '';
    };
    function cerrar() {
      lista.hidden = true;
      campo.setAttribute('aria-expanded', 'false');
      campo.removeAttribute('aria-activedescendant');
      buscando = false;
      mostrarSeleccion();
    }
    function elegir(option: HTMLOptionElement) {
      select.value = option.value;
      cerrar();
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function activar(index: number) {
      activa = index;
      const items = [...lista.querySelectorAll<HTMLElement>('[role="option"]')];
      items.forEach((item, i) => item.dataset.active = String(i === index));
      const item = items[index];
      if (item) {
        campo.setAttribute('aria-activedescendant', item.id);
        item.scrollIntoView?.({ block: 'nearest' });
      } else campo.removeAttribute('aria-activedescendant');
    }
    function abrir() {
      resultados = opciones.filter((op) => coincideBusqueda(buscando ? campo.value : '', op.text, op.dataset.codigo));
      lista.replaceChildren(...resultados.map((option, index) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.tabIndex = -1;
        item.id = lista.id + '-' + index;
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', String(option.value === select.value));
        item.textContent = option.text;
        item.onmousedown = (event) => event.preventDefault();
        item.onclick = () => elegir(option);
        return item;
      }));
      if (!resultados.length) {
        const vacio = document.createElement('p');
        vacio.className = 'search-empty';
        vacio.textContent = 'Sin resultados';
        lista.append(vacio);
      }
      lista.hidden = false;
      campo.setAttribute('aria-expanded', 'true');
      activar(-1);
    }

    mostrarSeleccion();
    select.addEventListener('change', mostrarSeleccion);
    campo.onfocus = () => { abrir(); campo.select(); };
    campo.onclick = () => { if (lista.hidden) abrir(); };
    campo.oninput = () => {
      buscando = true;
      select.value = '';
      abrir();
    };
    wrapper.addEventListener('focusout', (event) => {
      if (!wrapper.contains(event.relatedTarget as Node | null)) cerrar();
    });
    campo.onkeydown = (event) => {
      if (event.key === 'Escape' && !lista.hidden) {
        event.preventDefault();
        event.stopPropagation();
        cerrar();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (lista.hidden) abrir();
        if (!resultados.length) return;
        const paso = event.key === 'ArrowDown' ? 1 : -1;
        activar(activa < 0 ? (paso > 0 ? 0 : resultados.length - 1) : (activa + paso + resultados.length) % resultados.length);
      } else if (event.key === 'Enter' && !lista.hidden) {
        event.preventDefault();
        const option = resultados[activa] ?? (resultados.length === 1 ? resultados[0] : undefined);
        if (option) elegir(option);
      }
    };
  }
}
