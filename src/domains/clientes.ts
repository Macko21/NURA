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
    const matchSearch = !clienteSearch || c.nombre.toLowerCase().includes(clienteSearch.toLowerCase()) || (c.telefono || '').includes(clienteSearch);
    if (!matchSearch) return false;
    if (Sesion.esAdmin()) return true;
    return c.vendedorId === Sesion.uid() || !c.vendedorId;
  });

  const isAdmin = Sesion.esAdmin();
  const tbl = `<div class="table-wrap hide-mobile"><table><thead><tr>
    <th>Nombre</th><th>Teléfono</th><th>Email</th><th>Dirección</th><th>Tipo</th>
    ${isAdmin ? '<th>Creado por</th>' : ''}<th>Acciones</th>
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
            <td><div class="table-actions">
              <button class="btn btn-secondary btn-sm" onclick="formCliente('${c.id}')">✏️</button>
              ${c.telefono ? `<button class="btn btn-wsp-sm btn-sm" onclick="wspCliente('${c.id}')">📲</button>` : ''}
              ${isAdmin ? `<button class="btn btn-danger btn-sm btn-icon" onclick="eliminarCliente('${c.id}')">🗑</button>` : ''}
            </div></td>
          </tr>`;
        }).join('')
  }</tbody></table></div>`;

  const cards = `<div class="mobile-card-list">${lista.map((c) => {
    const vendedorNombre = isAdmin && c.vendedorId
      ? `<div style="font-size:10px;color:var(--text-muted);">Creado por: ${escapeHTML(store.perfiles.find((u) => u.id === c.vendedorId)?.nombre || 'Desconocido')}</div>`
      : '';
    return `<div class="m-card">
      <div class="m-card-header">
        <div>
          <div class="m-card-title">👤 ${escapeHTML(c.nombre)}</div>
          ${c.email ? `<div class="m-card-subtitle">${escapeHTML(c.email)}</div>` : ''}
          ${vendedorNombre}
        </div>
        <span class="badge badge-${c.esMayorista ? 'violet' : 'gray'}">${c.esMayorista ? 'Mayorista' : 'Actual'}</span>
      </div>
      <div class="m-card-body">
        ${c.telefono ? `<div class="m-card-row"><span class="m-card-row-label">Teléfono</span><span class="m-card-row-value">${escapeHTML(c.telefono)}</span></div>` : ''}
        ${c.direccion ? `<div class="m-card-row"><span class="m-card-row-label">Dirección</span><span class="m-card-row-value">${escapeHTML(c.direccion)}</span></div>` : ''}
      </div>
      <div class="m-card-footer">
        <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="formCliente('${c.id}')">✏️ Editar</button>
        ${c.telefono ? `<button class="btn btn-wsp-sm btn-sm" style="flex:1;" onclick="wspCliente('${c.id}')">📲</button>` : ''}
        ${isAdmin ? `<button class="btn btn-danger btn-sm btn-icon" onclick="eliminarCliente('${c.id}')">🗑</button>` : ''}
      </div>
    </div>`;
  }).join('')}</div>`;

  el.innerHTML = `<div class="flex flex-center gap-8 mb-16">
    <div class="search-bar" style="max-width:100%;"><span class="search-icon">🔍</span><input type="text" placeholder="Buscar cliente..." id="clienteSearch" value="${escapeHTML(clienteSearch)}" /></div>
  </div>
  ${lista.length === 0 && !clienteSearch ? `<div class="empty-state"><div class="empty-icon">👥</div><p>No hay clientes</p></div>` : tbl + cards}`;

  const searchInput = document.getElementById('clienteSearch') as HTMLInputElement | null;
  if (searchInput) {
    searchInput.oninput = (e) => {
      clienteSearch = (e.target as HTMLInputElement).value;
      renderClientes();
    };
  }
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
