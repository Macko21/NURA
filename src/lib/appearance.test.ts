// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { categoryArt } from './category-art';
import { catalogPreference, installThemeControls, saveCatalogPreference } from './appearance';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.head.innerHTML = '<meta name="theme-color">';
  document.body.innerHTML = '<button data-theme-toggle></button><button data-theme-toggle></button>';
});

describe('preferencias de Nura', () => {
  it('guarda la vista de tarjetas y respeta el valor por defecto', () => {
    expect(catalogPreference()).toBe('lista');
    saveCatalogPreference('tarjetas');
    expect(catalogPreference()).toBe('tarjetas');
    saveCatalogPreference('lista');
    expect(catalogPreference()).toBe('lista');
  });

  it('restaura el tema guardado y actualiza ambos botones al cambiarlo', () => {
    localStorage.setItem('nura.theme', 'dark');
    installThemeControls();
    const [login, header] = document.querySelectorAll('button');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(header.getAttribute('aria-label')).toBe('Cambiar a modo claro');
    login.click();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('nura.theme')).toBe('light');
    expect(header.getAttribute('aria-label')).toBe('Cambiar a modo oscuro');
  });

  it('asigna un jabón y una rosa aun con tildes o plurales distintos', () => {
    expect(categoryArt('JABON LIQUIDO')).toContain('🧼');
    expect(categoryArt('Perfuminas')).toContain('🌹');
    expect(categoryArt('Categoría extra')).toContain('🧴');
  });
});
