// ===== NURA — clientes.js: Gestión de Clientes =====
'use strict';

let clienteSearch='';

function renderClientes(){
  const el = document.getElementById('page-clientes');
  document.getElementById('topbarActions').innerHTML = Sesion.esAdmin()
    ? `<button class="btn btn-primary" onclick="formCliente(null)">+ Cliente</button>`
    : `<button class="btn btn-primary" onclick="formCliente(null)">+ Cliente</button>`;

  const lista = DB.clientes.filter(c => {
    const matchSearch = !clienteSearch || c.nombre.toLowerCase().includes(clienteSearch.toLowerCase()) || (c.telefono || '').includes(clienteSearch);
    if (!matchSearch) return false;
    if (Sesion.esAdmin()) return true;
    return c.vendedorId === Sesion.user.id || !c.vendedorId;
  });

  const tbl = `<div class="table-wrap hide-mobile"><table><thead><tr>
    <th>Nombre</th><th>Teléfono</th><th>Email</th><th>Dirección</th><th>Tipo</th>
    ${Sesion.esAdmin() ? '<th>Creado por</th>' : ''}
    <th>Acciones</th>
  </tr></thead><tbody>${lista.length === 0
    ? `<tr><td colspan="${Sesion.esAdmin() ? 7 : 6}"><div class="empty-state"><div class="empty-icon">👥</div><p>Sin clientes</p></div></td></tr>`
    : lista.map(c => {
        const vendedorNombre = c.vendedorId ? (DB.usuarios.find(u => u.id === c.vendedorId)?.nombre || 'Desconocido') : '—';
        return `<tr>
          <td class="fw-700">${c.nombre}</td>
          <td>${c.telefono || '—'}</td>
          <td>${c.email || '—'}</td>
          <td>${c.direccion || '—'}</td>
          <td><span class="badge badge-${c.esMayorista ? 'violet' : 'gray'}">${c.esMayorista ? 'Mayorista' : 'Actual'}</span></td>
          ${Sesion.esAdmin() ? `<td style="font-size:11px;color:var(--text-muted);">${vendedorNombre}</td>` : ''}
          <td><div class="table-actions">
            <button class="btn btn-secondary btn-sm" onclick="formCliente('${c.id}')">✏️</button>
            ${c.telefono ? `<button class="btn btn-wsp-sm btn-sm" onclick="wspCliente('${c.id}')">📲</button>` : ''}
            ${Sesion.esAdmin() ? `<button class="btn btn-danger btn-sm btn-icon" onclick="eliminarCliente('${c.id}')">🗑</button>` : ''}
          </div></td>
        </tr>`;
      }).join('')
  }</tbody></table></div>`;

  const cards = `<div class="mobile-card-list">${lista.map(c => {
    const vendedorNombre = Sesion.esAdmin() && c.vendedorId
      ? `<div style="font-size:10px;color:var(--text-muted);">Creado por: ${DB.usuarios.find(u => u.id === c.vendedorId)?.nombre || 'Desconocido'}</div>`
      : '';
    return `<div class="m-card">
      <div class="m-card-header">
        <div>
          <div class="m-card-title">👤 ${c.nombre}</div>
          ${c.email ? `<div class="m-card-subtitle">${c.email}</div>` : ''}
          ${vendedorNombre}
        </div>
        <span class="badge badge-${c.esMayorista ? 'violet' : 'gray'}">${c.esMayorista ? 'Mayorista' : 'Actual'}</span>
      </div>
      <div class="m-card-body">
        ${c.telefono ? `<div class="m-card-row"><span class="m-card-row-label">Teléfono</span><span class="m-card-row-value">${c.telefono}</span></div>` : ''}
        ${c.direccion ? `<div class="m-card-row"><span class="m-card-row-label">Dirección</span><span class="m-card-row-value">${c.direccion}</span></div>` : ''}
      </div>
      <div class="m-card-footer">
        <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="formCliente('${c.id}')">✏️ Editar</button>
        ${c.telefono ? `<button class="btn btn-wsp-sm btn-sm" style="flex:1;" onclick="wspCliente('${c.id}')">📲</button>` : ''}
        ${Sesion.esAdmin() ? `<button class="btn btn-danger btn-sm btn-icon" onclick="eliminarCliente('${c.id}')">🗑</button>` : ''}
      </div>
    </div>`;
  }).join('')}</div>`;

  el.innerHTML = `<div class="flex flex-center gap-8 mb-16">
    <div class="search-bar" style="max-width:100%;"><span class="search-icon">🔍</span><input type="text" placeholder="Buscar cliente..." id="clienteSearch" value="${clienteSearch}" /></div>
  </div>
  ${lista.length === 0 && !clienteSearch ? `<div class="empty-state"><div class="empty-icon">👥</div><p>No hay clientes</p></div>` : tbl + cards}`;

  document.getElementById('clienteSearch').oninput = e => {
    clienteSearch = e.target.value;
    renderClientes();
  };
}

function formCliente(id){
  const c = id ? DB.clientes.find(x => x.id === id) : null;
  openModal(c ? 'Editar Cliente' : 'Nuevo Cliente', `<div class="form-grid">
    <div class="form-group full"><label>Nombre completo</label><input id="cNombre" value="${c ? c.nombre : ''}" placeholder="Nombre y apellido" /></div>
    <div class="form-group"><label>Teléfono / WhatsApp</label><input id="cTelefono" value="${c ? c.telefono || '' : ''}" placeholder="+54 9 ..." /></div>
    <div class="form-group"><label>Email</label><input id="cEmail" type="email" value="${c ? c.email || '' : ''}" /></div>
    <div class="form-group full"><label>Dirección</label><input id="cDireccion" value="${c ? c.direccion || '' : ''}" /></div>
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
    const nombre = document.getElementById('cNombre').value.trim();
    if(!nombre){ await swalError('El nombre es obligatorio'); return; }
    const cl = {
      id: c ? c.id : genId(),
      nombre,
      telefono: document.getElementById('cTelefono').value.trim(),
      email: document.getElementById('cEmail').value.trim(),
      direccion: document.getElementById('cDireccion').value.trim(),
      notas: document.getElementById('cNotas').value.trim(),
      esMayorista: document.getElementById('cEsMayorista').value == '1',
      vendedorId: Sesion.esVendedor() ? Sesion.user.id : (c ? c.vendedorId || null : null)
    };
    closeModal();
    await fbSave('clientes', cl);
    toast(c ? 'Cliente actualizado ✅' : 'Cliente creado ✅');
  });
}

async function eliminarCliente(id){const c=DB.clientes.find(x=>x.id===id);const res=await swalConfirm('¿Eliminar cliente?',`Se eliminará a <strong>${escapeHTML(c?.nombre)}</strong>`);if(!res.isConfirmed)return;await fbRemove('clientes',id);toast('Cliente eliminado');}
function wspCliente(id){const c=DB.clientes.find(x=>x.id===id);if(!c?.telefono)return;window.open('https://wa.me/'+c.telefono.replace(/\D/g,''),'_blank');}
