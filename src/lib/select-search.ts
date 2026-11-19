import { coincideBusqueda } from './search';

export function activarBuscadores(contenedor: ParentNode) {
  for (const select of contenedor.querySelectorAll<HTMLSelectElement>('select[data-buscar]')) {
    const opciones = Array.from(select.options);
    if (opciones.length < 2) continue;
    const campo = document.createElement('input');
    campo.type = 'search';
    campo.className = 'select-search';
    campo.placeholder = select.dataset.buscar || 'Buscar';
    campo.setAttribute('aria-label', campo.placeholder);
    select.before(campo);
    campo.oninput = () => {
      const elegida = select.value;
      const filtradas = opciones.filter((op) => !op.value || op.value === elegida || coincideBusqueda(campo.value, op.text, op.dataset.codigo));
      select.replaceChildren(...filtradas);
      select.value = elegida;
    };
    campo.onkeydown = (e) => {
      if (e.key !== 'Enter' || !campo.value.trim()) return;
      e.preventDefault();
      const visibles = [...select.options].filter((op) => op.value && coincideBusqueda(campo.value, op.text, op.dataset.codigo));
      if (visibles.length !== 1) { select.focus(); return; }
      select.value = visibles[0].value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      select.focus();
    };
  }
}
