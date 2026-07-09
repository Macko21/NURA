// ===== NURA — auth.js: Login, Sesión, Usuarios =====
'use strict';

const Sesion = {
  user: null,
  lastActive: Date.now(),
  TIMEOUT: 12 * 60 * 60 * 1000,
  iniciar(user) {
    this.user = user;
    this.lastActive = Date.now();
    localStorage.setItem('nura_sesion', JSON.stringify({ uid: user.id, lastActive: this.lastActive, rol: user.rol }));
  },
  cerrar() {
    this.user = null;
    localStorage.removeItem('nura_sesion');
    document.getElementById('app').style.display = 'none';
    document.getElementById('loginScreen').style.display = '';
    document.getElementById('loginError').style.display = 'none';
    document.getElementById('loginPass').value = '';
    toast('Sesión cerrada por inactividad', 'info');
  },
  verificar() {
    const data = localStorage.getItem('nura_sesion');
    if (!data) return false;
    try {
      const { uid, lastActive, rol } = JSON.parse(data);
      if (Date.now() - lastActive > this.TIMEOUT) { this.cerrar(); return false; }
      const usuario = DB.usuarios.find(u => u.id === uid && u.rol === rol && u.activo !== false);
      if (!usuario) { this.cerrar(); return false; }
      this.user = usuario;
      this.lastActive = Date.now();
      return true;
    } catch { this.cerrar(); return false; }
  },
  touch() { this.lastActive = Date.now(); localStorage.setItem('nura_sesion', JSON.stringify({ ...JSON.parse(localStorage.getItem('nura_sesion')), lastActive: this.lastActive })); },
  esAdmin() { return this.user?.rol === 'admin'; },
  esVendedor() { return this.user?.rol === 'vendedor'; }
};

function iniciarControlInactividad() {
  setInterval(() => {
    if (Sesion.user && Date.now() - Sesion.lastActive > Sesion.TIMEOUT) {
      Sesion.cerrar();
    }
  }, 60000);
  ['click', 'keydown'].forEach(ev => document.addEventListener(ev, () => Sesion.touch()));
}

async function login() {
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;
  const rol = document.getElementById('loginRole').value;
  const errorEl = document.getElementById('loginError');
  const loginBtn = document.getElementById('loginBtn');
  errorEl.style.display = 'none';

  if (!username || !password) {
    errorEl.textContent = 'Completá todos los campos';
    errorEl.style.display = 'block';
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = 'Ingresando...';

  try {
    let user = null;

    // Try server-side auth first (Edge Function)
    try {
      const resp = await fetch('https://niwikufqwwpcsoqxifbe.supabase.co/functions/v1/auth-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': 'sb_publishable_Gp_4lmWZhyB8ZUbFwgCKfw_aKo3Rbbj' },
        body: JSON.stringify({ username, password, rol })
      });
      const data = await resp.json();
      if (resp.ok && data.user) user = data.user;
    } catch (_) { /* Edge Function not deployed — fallback to client-side */ }

    // Fallback: client-side auth (legacy, less secure)
    if (!user) {
      const u = DB.usuarios.find(u => u.username === username && u.rol === rol && u.activo !== false);
      if (u) {
        const hash = await hashPassword(password, u.salt);
        if (hash === u.passwordHash) user = { id: u.id, nombre: u.nombre, username: u.username, rol: u.rol, activo: u.activo };
      }
    }

    if (!user) {
      errorEl.textContent = 'Usuario o contraseña incorrectos';
      errorEl.style.display = 'block';
      return;
    }

    Sesion.iniciar(user);
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('app').style.display = '';
    buildMenu();
    currentPage = Sesion.esAdmin() ? 'dashboard' : 'catalogo';
    navigate(currentPage);
    iniciarControlInactividad();
  } catch (err) {
    errorEl.textContent = 'Error al conectar';
    errorEl.style.display = 'block';
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Ingresar';
  }
}

function renderUsuarios() {
  if (!Sesion.esAdmin()) return navigate('dashboard');
  const el = document.getElementById('page-usuarios');
  document.getElementById('topbarActions').innerHTML = `<button class="btn btn-primary" onclick="formUsuario(null)">+ Usuario</button>`;
  const lista = DB.usuarios.filter(u => u.rol !== 'admin' || u.id === Sesion.user.id);
  const tbl = `<div class="table-wrap hide-mobile"><table><thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Activo</th><th>Acciones</th></tr></thead><tbody>
    ${lista.map(u => `
      <tr>
        <td class="fw-700">${u.username}</td>
        <td>${u.nombre}</td>
        <td><span class="badge badge-${u.rol==='admin'?'violet':'blue'}">${u.rol}</span></td>
        <td><span class="badge badge-${u.activo!==false?'green':'red'}">${u.activo!==false?'Sí':'No'}</span></td>
        <td><div class="table-actions">
          <button class="btn btn-secondary btn-sm" onclick="formUsuario('${u.id}')">✏️</button>
          <button class="btn btn-danger btn-sm btn-icon" onclick="eliminarUsuario('${u.id}')">🗑</button>
        </div></td>
      </tr>`).join('')}
  </tbody></table></div>`;
  const cards = `<div class="mobile-card-list">${lista.map(u => `
    <div class="m-card">
      <div class="m-card-header"><div><div class="m-card-title">${u.username}</div><div class="m-card-subtitle">${u.nombre}</div></div><span class="badge badge-${u.rol==='admin'?'violet':'blue'}">${u.rol}</span></div>
      <div class="m-card-footer">
        <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="formUsuario('${u.id}')">✏️ Editar</button>
        <button class="btn btn-danger btn-sm btn-icon" onclick="eliminarUsuario('${u.id}')">🗑</button>
      </div>
    </div>`).join('')}</div>`;
  el.innerHTML = lista.length ? tbl+cards : `<div class="empty-state"><div class="empty-icon">👤</div><p>No hay usuarios</p></div>`;
}

window.formUsuario = async function(id) {
  if (!Sesion.esAdmin()) return;
  const u = id ? DB.usuarios.find(x => x.id === id) : null;
  const isAdmin = u?.rol === 'admin';
  openModal(u ? 'Editar Usuario' : 'Nuevo Usuario', `
    <div class="form-grid">
      <div class="form-group full"><label>Nombre completo</label><input id="uNombre" value="${u ? u.nombre : ''}" /></div>
      <div class="form-group"><label>Usuario</label><input id="uUsername" value="${u ? u.username : ''}" ${isAdmin ? 'readonly' : ''} /></div>
      <div class="form-group"><label>Nueva contraseña ${u ? '(dejar vacía si no cambia)' : ''}</label><input type="password" id="uPassword" /></div>
      <div class="form-group"><label>Rol</label><select id="uRol" ${isAdmin ? 'disabled' : ''}>
        <option value="vendedor" ${u?.rol==='vendedor'?'selected':''}>Vendedor</option>
        <option value="admin" ${u?.rol==='admin'?'selected':''}>Admin</option>
      </select></div>
      <div class="form-group"><label>Activo</label><select id="uActivo">
        <option value="1" ${u?.activo!==false?'selected':''}>Sí</option>
        <option value="0" ${u?.activo===false?'selected':''}>No</option>
      </select></div>
    </div>`, async () => {
    const nombre = document.getElementById('uNombre').value.trim();
    const username = document.getElementById('uUsername').value.trim();
    const password = document.getElementById('uPassword').value;
    const rol = document.getElementById('uRol').value;
    const activo = document.getElementById('uActivo').value === '1';
    if (!nombre || !username || (!u && !password)) {
      await swalError('Nombre, usuario y contraseña son obligatorios');
      return;
    }
    if (!u && DB.usuarios.find(x => x.username === username)) {
      await swalError('El nombre de usuario ya existe');
      return;
    }
    const usuario = {
      id: u ? u.id : genId(),
      nombre,
      username,
      salt: u ? u.salt : genId(),
      rol,
      activo
    };
    if (password) {
      usuario.passwordHash = await hashPassword(password, usuario.salt);
    } else if (u) {
      usuario.passwordHash = u.passwordHash;
    }
    closeModal();
    await fbSave('usuarios', usuario);
    toast(u ? 'Usuario actualizado' : 'Usuario creado');
  });
};

window.eliminarUsuario = async function(id) {
  if (!Sesion.esAdmin()) return;
  const u = DB.usuarios.find(x => x.id === id);
  if (!u) return;
  if (u.id === Sesion.user.id) {
    await swalError('No podés eliminar tu propio usuario');
    return;
  }
  const res = await swalConfirm('¿Eliminar usuario?', `Se eliminará a <strong>${escapeHTML(u.nombre)}</strong>`);
  if (!res.isConfirmed) return;
  await fbRemove('usuarios', id);
  toast('Usuario eliminado');
};

// ── Setup Login ───────────────────────────────────────────────────────
(async function setupLogin() {
  await new Promise(resolve => {
    const check = () => {
      if (window._supabase && DB.usuarios !== undefined) resolve();
      else setTimeout(check, 100);
    };
    check();
  });

  if (window.__NURA_DEBUG__ && !DB.usuarios.find(u => u.username === 'admin')) {
    const salt = genId();
    const admin = {
      id: genId(),
      nombre: 'Admin Principal',
      username: 'admin',
      passwordHash: await hashPassword('admin123', salt),
      salt,
      rol: 'admin',
      activo: true
    };
    await fbSave('usuarios', admin);
  }

  document.getElementById('loginBtn').onclick = login;
  document.getElementById('loginPass').onkeydown = e => { if (e.key === 'Enter') login(); };
  document.getElementById('loginUser').onkeydown = e => { if (e.key === 'Enter') login(); };
  document.getElementById('loginRole').onkeydown = e => { if (e.key === 'Enter') login(); };

  if (Sesion.verificar()) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('app').style.display = '';
    buildMenu();
    currentPage = Sesion.esAdmin() ? 'dashboard' : 'catalogo';
    navigate(currentPage);
    iniciarControlInactividad();
  } else {
    document.getElementById('loginScreen').style.display = '';
    document.getElementById('app').style.display = 'none';
  }
})();
