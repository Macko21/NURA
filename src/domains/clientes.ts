import { coincideBusqueda } from '../lib/search';
import { navIcon } from '../lib/nav-icons';
import { store, saveCliente, removeCliente } from '../lib/db';
import { Sesion } from '../lib/session';
import { escapeHTML, toast, swalConfirm, swalError, openModal, closeModal, registerRenderer, exposeGlobal } from '../lib/ui';
import { genId } from '../lib/id';
import { waLink } from '../config';
import type { Cliente } from '../types';

let clienteSearch = '';

export function renderClientes() {
  const el = document.getElementById('page-clientes');
  if (!el) return;
  document.getElementById('topbarActions')!.innerHTML = `<button class="btn btn-primary" onclick="formCliente(null)">+ Cliente</button>`;

  const lista = store.clientes.filter((c) => {
    const matchSearch = coincideBusqueda(clienteSearch, c.nombre, c.telefono, c.email, c.direccion);
    if (!matchSearch) return false;
    if (Sesion.esAdmin()) return true;
    return c.vendedorId === Sesion.uid() || !c.vendedorId;
  });

  const isAdmin = Sesion.esAdmin();
  const tbl = `<div class="table-wrap hide-mobile"><table><thead><tr>
    <th>Nombre</th><th>Teléfono</th><th>Email</th><th>Dirección</th><th>Tipo</th>
    ${isAdmin ? '<th>Creado por</th>' : ''}<th class="actions-col">Acciones</th>
  </tr></thead><tbody>${
    lista.length === 0
      ? `<tr><td colspan="${isAdmin ? 7 : 6}"><div class="empty-state"><div class="empty-icon">👥</div><p>Sin clientes</p></div></td></tr>`
      : lista.map((c) => {
          const vendedorNombre = c.vendedorId ? (store.perfiles.find((u) => u.id === c.vendedorId)?.nombre || 'Desconocido') : '—';
          return `<tr>
            <td class="fw-700">${escapeHTML(c.nombre)}</td>
            <td>${escapeHTML(c.telefono || '—')}</td>
            <td>${escapeHTML(c.email || '—')}</td>
            <td>${escapeHTML(c.direccion || '—')}</td>
            <td><span class="badge badge-${c.esMayorista ? 'violet' : 'gray'}">${c.esMayorista ? 'Mayorista' : 'Actual'}</span></td>
            ${isAdmin ? `<td style="font-size:11px;color:var(--text-muted);">${escapeHTML(vendedorNombre)}</td>` : ''}
            <td class="actions-col"><div class="table-actions">
              <button class="btn btn-secondary btn-sm" onclick="formCliente('${c.id}')">✏️</button>
              ${c.telefono ? `<button class="btn btn-wsp-sm btn-sm" onclick="wspCliente('${c.id}')">📲</button>` : ''}
              ${isAdmin ? `<button class="btn btn-danger btn-sm btn-icon" onclick="eliminarCliente('${c.id}')">🗑</button>` : ''}
            </div></td>
          </tr>`;
        }).join('')
  }</tbody></table></div>`;

  const cards = `<div class="mobile-card-list record-list">${lista.map((c) => {
    const accion = (nombre: string, icono: string, color: string, handler: string) =>
      `<button type="button" class="btn icon-action ${color}" data-cliente="${escapeHTML(c.id)}" data-contacto="${handler}" title="${nombre}" aria-label="${nombre}">${navIcon(icono)}</button>`;
    const contactos = [['Teléfono', c.telefono], ['Email', c.email], ['Dirección', c.direccion]];
    return `<article class="m-card record-card">
      <div class="record-card-heading">
        <span class="record-card-icon client-icon">${navIcon('clientes')}</span>
        <div class="record-card-identity"><h3 class="m-card-title">${escapeHTML(c.nombre)}</h3>
          ${isAdmin && c.vendedorId ? `<p class="m-card-subtitle">Creado por ${escapeHTML(store.perfiles.find((u) => u.id === c.vendedorId)?.nombre || 'Desconocido')}</p>` : ''}
        </div>
        <span class="badge badge-${c.esMayorista ? 'violet' : 'gray'}">${c.esMayorista ? 'Mayorista' : 'Actual'}</span>
      </div>
      <dl class="record-card-fields">${contactos.filter(([, valor]) => valor).map(([etiqueta, valor]) =>
        `<div><dt>${etiqueta}</dt><dd>${escapeHTML(valor)}</dd></div>`).join('')}</dl>
      <div class="m-card-footer record-card-actions">
        ${accion('Editar cliente', 'edit', 'is-violet', 'editar')}
        ${c.telefono ? accion('Abrir WhatsApp', 'share', 'is-teal', 'whatsapp') : ''}
        ${isAdmin ? accion('Eliminar cliente', 'trash', 'is-danger', 'eliminar') : ''}
      </div>
    </article>`;
  }).join('')}</div>`;

  if (!el.querySelector('#clienteResultados')) {
    el.innerHTML = `<div class="search-bar mb-16" style="max-width:100%;">
      <input type="search" aria-label="Buscar cliente" placeholder="Buscar cliente..." id="clienteSearch" value="${escapeHTML(clienteSearch)}" />
    </div><div id="clienteResultados"></div>`;
    el.querySelector<HTMLInputElement>('#clienteSearch')!.oninput = (event) => {
      clienteSearch = (event.target as HTMLInputElement).value;
      renderClientes();
    };
  }
  el.querySelector('#clienteResultados')!.innerHTML = lista.length ? tbl + cards
    : `<p class="empty-state">${clienteSearch ? 'No se encontraron clientes' : 'No hay clientes'}</p>`;
  el.querySelectorAll<HTMLButtonElement>('[data-contacto]').forEach((button) => {
    button.onclick = () => {
      const id = button.dataset.cliente!;
      if (button.dataset.contacto === 'editar') formCliente(id);
      else if (button.dataset.contacto === 'whatsapp') wspCliente(id);
      else if (button.dataset.contacto === 'eliminar') void eliminarCliente(id);
    };
  });
}

export function formCliente(id: string | null) {
  const c: Cliente | null = id ? store.clientes.find((x) => x.id === id) ?? null : null;
  openModal(c ? 'Editar Cliente' : 'Nuevo Cliente', `<div class="form-grid">
    <div class="form-group full"><label>Nombre completo</label><input id="cNombre" value="${c ? escapeHTML(c.nombre) : ''}" placeholder="Nombre y apellido" /></div>
    <div class="form-group"><label>Teléfono / WhatsApp</label><input id="cTelefono" value="${c ? escapeHTML(c.telefono || '') : ''}" placeholder="+54 9 ..." /></div>
    <div class="form-group"><label>Email</label><input id="cEmail" type="email" value="${c ? escapeHTML(c.email || '') : ''}" /></div>
    <div class="form-group full"><label>Dirección</label><input id="cDireccion" value="${c ? escapeHTML(c.direccion || '') : ''}" /></div>
    <div class="form-group full">
      <label>Tipo de cliente</label>
      <select id="cEsMayorista">
        <option value="0" ${!c?.esMayorista ? 'selected' : ''}>🛍️ Actual (precio de lista)</option>
        <option value="1" ${c?.esMayorista ? 'selected' : ''}>🏪 Mayorista / Vendedor (precio mayorista)</option>
      </select>
      <span class="form-note">Los mayoristas ven precio mayorista automáticamente en ventas</span>
    </div>
    <div class="form-group full"><label>Notas</label><textarea id="cNotas">${c ? escapeHTML(c.notas || '') : ''}</textarea></div>
  </div>`, async () => {
    const nombre = (document.getElementById('cNombre') as HTMLInputElement).value.trim();
    if (!nombre) { await swalError('El nombre es obligatorio'); return; }
    const cl: Cliente = {
      id: c ? c.id : genId(),
      nombre,
      telefono: (document.getElementById('cTelefono') as HTMLInputElement).value.trim(),
      email: (document.getElementById('cEmail') as HTMLInputElement).value.trim(),
      direccion: (document.getElementById('cDireccion') as HTMLInputElement).value.trim(),
      notas: (document.getElementById('cNotas') as HTMLTextAreaElement).value.trim(),
      esMayorista: (document.getElementById('cEsMayorista') as HTMLSelectElement).value === '1',
      vendedorId: Sesion.esVendedor() ? Sesion.uid() : (c ? c.vendedorId || null : null),
    };
    closeModal();
    await saveCliente(cl);
    toast(c ? 'Cliente actualizado ✅' : 'Cliente creado ✅');
  });
}

export async function eliminarCliente(id: string) {
  const c = store.clientes.find((x) => x.id === id);
  const res = await swalConfirm('¿Eliminar cliente?', `Se eliminará a <strong>${escapeHTML(c?.nombre)}</strong>`);
  if (!res.isConfirmed) return;
  await removeCliente(id);
  toast('Cliente eliminado');
}

export function wspCliente(id: string) {
  const c = store.clientes.find((x) => x.id === id);
  if (!c?.telefono) return;
  const url = waLink('', c.telefono);
  window.open(url, '_blank');
}

registerRenderer('clientes', renderClientes);
exposeGlobal({ formCliente, eliminarCliente, wspCliente });
