// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { activarBuscadores } from './select-search';

describe('buscador de opciones', () => {
  it('abre al enfocar, filtra por código mientras se escribe y permite elegir con el teclado', () => {
    document.body.innerHTML = `<label for="producto">Producto</label>
      <select id="producto" data-buscar="Buscar artículo">
        <option value="">Seleccionar</option><option value="1" data-codigo="DES001">Desengrasante</option>
        <option value="2" data-codigo="JAB010">Jabón</option>
      </select>`;
    const select = document.querySelector('select')!;
    const cambio = vi.fn();
    select.addEventListener('change', cambio);
    activarBuscadores(document.body);
    const campo = document.querySelector('input')!;
    expect(select.hidden).toBe(true);
    expect(document.querySelector('label')?.htmlFor).toBe(campo.id);
    campo.focus();
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(2);
    campo.value = 'des001';
    campo.dispatchEvent(new Event('input'));
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(1);
    campo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(campo.value).toBe('Desengrasante');
    expect(select.value).toBe('1');
    expect(cambio).toHaveBeenCalledOnce();
    expect(campo.getAttribute('aria-expanded')).toBe('false');
  });
});
