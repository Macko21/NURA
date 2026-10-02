import { sb } from '../lib/supabase';
import { store, loadAll } from '../lib/db';
import { Sesion } from '../lib/session';
import { escapeHTML, toast, swalError, swalConfirm, openModal, closeModal, registerRenderer, navigate, exposeGlobal } from '../lib/ui';
import type { Perfil, Rol } from '../types';

function renderUsuarios() {
  if (!Sesion.esAdmin()) { navigate('dashboard'); return; }
  const el = document.getElementById('page-usuarios');
  if (!el) return;
  document.getElementById('topbarActions')!.innerHTML = '<button class="btn btn-primary" onclick="formUsuario(null)">+ Usuario</button>';
  const lista = store.perfiles.filter((u) => u.rol !== 'admin' || u.id === Sesion.uid());
  const tbl = `<div class="table-wrap hide-mobile"><table><thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Activo</th><th>Acciones</th></tr></thead><tbody>
    ${lista.map((u) => `
      <tr>
        <td class="fw-700">${escapeHTML(u.username)}</td>
        <td>${escapeHTML(u.nombre)}</td>
        <td><span class="badge badge-${u.rol === 'admin' ? 'violet' : 'blue'}">${escapeHTML(u.rol)}</span></td>
        <td><span class="badge badge-${u.activo !== false ? 'green' : 'red'}">${u.activo !== false ? 'Sí' : 'No'}</span></td>
        <td><div class="table-actions">
          <button class="btn btn-secondary btn-sm" onclick="formUsuario('${u.id}')">✏️</button>
          <button class="btn btn-danger btn-sm btn-icon" onclick="eliminarUsuario('${u.id}')">🗑</button>
        </div></td>
      </tr>`).join('')}
  </tbody></table></div>`;
  const cards = `<div class="mobile-card-list">${lista.map((u) => `
    <div class="m-card">
      <div class="m-card-header"><div><div class="m-card-title">${escapeHTML(u.username)}</div><div class="m-card-subtitle">${escapeHTML(u.nombre)}</div></div><span class="badge badge-${u.rol === 'admin' ? 'violet' : 'blue'}">${escapeHTML(u.rol)}</span></div>
      <div class="m-card-footer">
        <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="formUsuario('${u.id}')">✏️ Editar</button>
        <button class="btn btn-danger btn-sm btn-icon" onclick="eliminarUsuario('${u.id}')">🗑</button>
      </div>
    </div>`).join('')}</div>`;
  el.innerHTML = lista.length ? tbl + cards : '<div class="empty-state"><div class="empty-icon">👤</div><p>No hay usuarios</p></div>';
}

async function formUsuario(id: string | null) {
  if (!Sesion.esAdmin()) return;
  const u: Perfil | null = id ? store.perfiles.find((x) => x.id === id) ?? null : null;
  const isAdmin = u?.rol === 'admin';
  openModal(u ? 'Editar Usuario' : 'Nuevo Usuario', `
    <div class="form-grid">
      <div class="form-group full"><label>Nombre completo</label><input id="uNombre" value="${u ? escapeHTML(u.nombre) : ''}" /></div>
      <div class="form-group"><label>Email (login)</label><input id="uEmail" type="email" value="${u ? escapeHTML(u.username) : ''}" ${u ? 'readonly' : ''} /></div>
      <div class="form-group"><label>${u ? 'Nueva contraseña (dejar vacía si no cambia)' : 'Contraseña'}</label><input type="password" id="uPassword" /></div>
      <div class="form-group"><label>Rol</label><select id="uRol" ${isAdmin ? 'disabled' : ''}>
        <option value="vendedor" ${u?.rol === 'vendedor' ? 'selected' : ''}>Vendedor</option>
        <option value="admin" ${u?.rol === 'admin' ? 'selected' : ''}>Admin</option>
      </select></div>
      <div class="form-group"><label>Activo</label><select id="uActivo">
        <option value="1" ${u?.activo !== false ? 'selected' : ''}>Sí</option>
        <option value="0" ${u?.activo === false ? 'selected' : ''}>No</option>
      </select></div>
    </div>`, async () => {
    const nombre = (document.getElementById('uNombre') as HTMLInputElement).value.trim();
    const email = (document.getElementById('uEmail') as HTMLInputElement).value.trim();
    const password = (document.getElementById('uPassword') as HTMLInputElement).value;
    const rol = (document.getElementById('uRol') as HTMLSelectElement).value as Rol;
    const activo = (document.getElementById('uActivo') as HTMLSelectElement).value === '1';
    if (!nombre || !email || (!u && !password)) {
      await swalError('Nombre, email y contraseña son obligatorios');
      return;
    }
    closeModal();
    const action = u ? 'update' : 'create';
    const payload: Record<string, unknown> = u
      ? { id: u.id, nombre, rol, activo, password: password || undefined }
      : { email, password, nombre, rol, activo };
    const { data, error } = await sb().functions.invoke('manage-users', { body: { action, ...payload } });
    if (error || (data as { ok?: boolean })?.ok === false) {
      toast('Error al guardar usuario', 'error');
      return;
    }
    await loadAll();
    toast(u ? 'Usuario actualizado' : 'Usuario creado');
  });
}

async function eliminarUsuario(id: string) {
  if (!Sesion.esAdmin()) return;
  const u = store.perfiles.find((x) => x.id === id);
  if (!u) return;
  if (u.id === Sesion.uid()) { await swalError('No podés eliminar tu propio usuario'); return; }
  const res = await swalConfirm('¿Eliminar usuario?', `Se eliminará a <strong>${escapeHTML(u.nombre)}</strong>`);
  if (!res.isConfirmed) return;
  const { error } = await sb().functions.invoke('manage-users', { body: { action: 'delete', id } });
  if (error) { toast('Error al eliminar usuario', 'error'); return; }
  await loadAll();
  toast('Usuario eliminado');
}

registerRenderer('usuarios', renderUsuarios);
exposeGlobal({ formUsuario, eliminarUsuario });
