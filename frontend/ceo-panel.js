/* ── CEO Panel — Los 10.000 de Macko ──────────────────── */
const API = '/ceo-panel/api';
let _token = null;
let _myRole = 'viewer';
let _myUsername = '';
let _users = [];
let _refreshInterval = null;
let _confirmCallback = null;
let _currentUserId = null;

const $ = id => document.getElementById(id);

function showScreen(id) {
  document.querySelectorAll('.ceo-screen').forEach(s => s.classList.add('hidden'));
  $(id).classList.remove('hidden');
}

/**
 * Wrapper de fetch que agrega el token automáticamente y
 * redirige al login si el servidor responde 401 (token inválido/expirado).
 */
async function apiFetch(url, options = {}) {
  if (!options.headers) options.headers = {};
  if (_token) {
    options.headers['Authorization'] = 'Bearer ' + _token;
  }
  const res = await fetch(url, options);
  if (res.status === 401 && _token) {
    _token = null;
    if (_refreshInterval) clearInterval(_refreshInterval);
    showScreen('ceo-login');
    toast('Sesión expirada. Ingresá de nuevo.', 'error', 5000);
    throw new Error('Sesión expirada');
  }
  return res;
}

/* ══════════════════════════════════════════════════════════
   TOAST NOTIFICATIONS
   ══════════════════════════════════════════════════════════ */
function toast(message, type = 'info', duration = 4000) {
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const container = $('ceo-toast-container');
  const el = document.createElement('div');
  el.className = `ceo-toast ceo-toast-${type}`;
  el.innerHTML = `<span class="ceo-toast-icon">${icons[type] || 'ℹ️'}</span><span class="ceo-toast-msg">${esc(message)}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('ceo-toast-out');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

/* ══════════════════════════════════════════════════════════
   CONFIRM MODAL
   ══════════════════════════════════════════════════════════ */
function confirmModal(title, desc, cb) {
  $('ceo-confirm-title').textContent = title;
  $('ceo-confirm-desc').innerHTML = desc;
  _confirmCallback = cb;
  $('ceo-modal-confirm').classList.remove('hidden');
}

$('ceo-confirm-yes').onclick = () => {
  $('ceo-modal-confirm').classList.add('hidden');
  if (_confirmCallback) _confirmCallback(true);
  _confirmCallback = null;
};
$('ceo-confirm-no').onclick = () => {
  $('ceo-modal-confirm').classList.add('hidden');
  if (_confirmCallback) _confirmCallback(false);
  _confirmCallback = null;
};

/* ══════════════════════════════════════════════════════════
   LOGIN
   ══════════════════════════════════════════════════════════ */
$('ceo-login-btn').onclick = async () => {
  const user = $('ceo-user').value.trim();
  const pass = $('ceo-pass').value.trim();
  const errEl = $('ceo-login-error');
  if (!user || !pass) { errEl.textContent = 'Completá usuario y contraseña'; errEl.classList.remove('hidden'); return; }
  try {
    $('ceo-login-btn').disabled = true;
    $('ceo-login-btn').textContent = 'Entrando...';
    const res = await fetch(API + '/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    _token = data.token;
    _myRole = data.role || 'viewer';
    _myUsername = data.username;
    $('ceo-topbar-user').textContent = '👑 ' + data.username + ' · ' + roleLabel(data.role || 'viewer');
    applyRoleVisibility();
    // Cargar versión dinámica para el botón de changelog + indicador de nuevas versiones
    checkUpdateIndicator();
    errEl.classList.add('hidden');
    showScreen('ceo-dashboard');
    loadDashboard();
    if (_refreshInterval) clearInterval(_refreshInterval);
    _refreshInterval = setInterval(() => { loadStats(); }, 15000);
    toast('Sesión iniciada correctamente', 'success');
  } catch (e) {
    errEl.textContent = e.message;
    errEl.classList.remove('hidden');
  } finally {
    $('ceo-login-btn').disabled = false;
    $('ceo-login-btn').textContent = 'Ingresar';
  }
};

$('ceo-pass').onkeydown = e => { if (e.key === 'Enter') $('ceo-login-btn').click(); };
$('ceo-user').onkeydown = e => { if (e.key === 'Enter') $('ceo-pass').focus(); };

$('ceo-logout-btn').onclick = () => {
  _token = null;
  _myRole = 'viewer';
  _myUsername = '';
  if (_refreshInterval) clearInterval(_refreshInterval);
  showScreen('ceo-login');
  toast('Sesión cerrada', 'info');
};

/* ── Indicador visual de nuevas actualizaciones ──────────── */
const CEO_LAST_SEEN_KEY = 'ceo_last_seen_version';

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function checkUpdateIndicator() {
  fetch('/api/version').then(r => r.json()).then(d => {
    if (!d.version) return;
    const currentVersion = d.version;
    const lastSeen = localStorage.getItem(CEO_LAST_SEEN_KEY);
    const btn = $('ceo-changelog-btn');
    if (!btn) return;
    // Primero actualizar texto (esto limpia cualquier badge viejo ya que textContent borra hijos)
    btn.textContent = '📋 v' + currentVersion;
    // Luego agregar badge si hay version nueva no vista
    if (!lastSeen || compareVersions(currentVersion, lastSeen) > 0) {
      const badge = document.createElement('span');
      badge.className = 'ceo-update-badge';
      btn.appendChild(badge);
      btn.title = '📢 ¡Nueva versión disponible!';
    } else {
      btn.title = 'Versiones';
    }
  }).catch(() => {});
}

/* ── Changelog (CEO Panel: muestra TODAS las entries, game + ceo) ─────────────────────────── */
$('ceo-changelog-btn').onclick = async () => {
  try {
    const res = await fetch('/api/version');
    const data = await res.json();
    const version = data.version || '—';
    const changelog = data.changelog || [];
    
    // Marcar como vista la versión actual (quitar badge)
    if (data.version) {
      localStorage.setItem(CEO_LAST_SEEN_KEY, data.version);
      const badge = $('ceo-changelog-btn')?.querySelector('.ceo-update-badge');
      if (badge) badge.remove();
      $('ceo-changelog-btn').title = 'Versiones';
    }
    
    // Mostrar versión actual
    const verEl = $('ceo-changelog-current-version');
    if (verEl) verEl.textContent = 'v' + version;
    
    const list = $('ceo-changelog-list');
    if (!list) return;
    
    // En CEO Panel mostrar TODAS las entries sin filtrar
    if (!changelog.length) {
      list.innerHTML = '<p style="color:var(--text3);text-align:center;padding:20px">Sin historial disponible</p>';
      $('ceo-modal-changelog').classList.remove('hidden');
      return;
    }
    
    list.innerHTML = changelog.map(entry => {
      const isCurrent = entry.version === version;
      const scopeLabel = entry.scope === 'game' ? '' : entry.scope === 'ceo' ? ' [CEO]' : ' [All]';
      return `<div style="
        background:${isCurrent ? 'rgba(212,175,55,.08)' : 'var(--bg-card2)'};
        border:1px solid ${isCurrent ? 'var(--gold)' : 'var(--border2)'};
        border-radius:10px;padding:14px 12px;
        transition:all .2s;
      ">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;flex-wrap:wrap;gap:4px">
          <span style="
            font-family:'Cinzel',serif;font-size:16px;font-weight:700;
            color:${isCurrent ? 'var(--gold2)' : 'var(--gold)'};
          ">v${esc(entry.version)}${scopeLabel}</span>
          <span style="
            font-size:10px;color:var(--text3);
            background:var(--bg-input);padding:2px 8px;border-radius:4px;
          ">${esc(entry.date || '')}</span>
        </div>
        <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:6px">${esc(entry.title || '')}</div>
        <ul style="margin:0;padding-left:16px;list-style:none">
          ${(entry.changes || []).map(c => 
            `<li style="font-size:11px;color:var(--text2);margin-bottom:3px;position:relative;padding-left:14px">
              <span style="position:absolute;left:0;top:2px">•</span>
              ${esc(c)}
            </li>`
          ).join('')}
        </ul>
        ${entry.files?.length ? `<div style="margin-top:6px;font-size:10px;color:var(--text3);font-family:monospace">📂 ${entry.files.join(', ')}</div>` : ''}
        ${isCurrent ? '<div style="margin-top:6px;font-size:10px;color:var(--gold);font-weight:600">⬅ Actual</div>' : ''}
      </div>`;
    }).join('');
    
    $('ceo-modal-changelog').classList.remove('hidden');
  } catch(err) {
    toast('Error al cargar historial: ' + err.message, 'error');
  }
};

$('ceo-modal-changelog-close').onclick = () => $('ceo-modal-changelog').classList.add('hidden');

$('ceo-logout-btn').onclick = () => {
  _token = null;
  _myRole = 'viewer';
  _myUsername = '';
  if (_refreshInterval) clearInterval(_refreshInterval);
  showScreen('ceo-login');
  toast('Sesión cerrada', 'info');
};

/* ══════════════════════════════════════════════════════════
   TABS
   ══════════════════════════════════════════════════════════ */
document.querySelectorAll('.ceo-tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.ceo-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.ceo-tab-content').forEach(c => c.classList.add('hidden'));
    const content = $('ceo-tab-' + tab.dataset.tab);
    if (content) content.classList.remove('hidden');
    const tabName = tab.dataset.tab;
    if (!_token) return;
    if (tabName === 'users') loadUsers();
    if (tabName === 'feedback') loadFeedback();
    if (tabName === 'games') loadGames();
    if (tabName === 'audit') loadAuditLog();
    if (tabName === 'admins') loadAdmins();
    if (tabName === 'analytics') loadAnalytics();
    if (tabName === 'shop') loadShopCatalog();
    if (tabName === 'tournaments') loadTournamentsList();
    if (tabName === 'server') loadServerInfo();
  };
});

/* ══════════════════════════════════════════════════════════
   DASHBOARD
   ══════════════════════════════════════════════════════════ */
async function loadDashboard() {
  if (!_token) return;
  loadStats();
  loadUsers();
}

async function loadStats() {
  try {
    const res = await apiFetch(API + '/stats');
    if (!res.ok) throw new Error('Error');
    const s = await res.json();
    $('stat-users').textContent = formatNum(s.totalUsers || 0);
    $('stat-games').textContent = formatNum(s.totalGamesPlayed || 0);
    $('stat-online').textContent = s.onlineNow || 0;
    $('stat-rooms').textContent = s.activeRooms || 0;
    $('stat-matches').textContent = s.activeMatches || 0;
    $('stat-feedback').textContent = s.totalFeedback || 0;
    $('stat-transactions').textContent = formatNum(s.totalTransactions || 0);
  } catch(e) {}
}

/* ══════════════════════════════════════════════════════════
   USERS
   ══════════════════════════════════════════════════════════ */
async function loadUsers() {
  try {
    const res = await apiFetch(API + '/users');
    if (!res.ok) throw new Error('Error');
    const data = await res.json();
    _users = data.users || [];
    $('ceo-user-count').textContent = `${_users.length} usuarios`;
    renderUsers(_users);
  } catch(e) {
    if (e.message !== 'Sesión expirada') {
      $('ceo-users-tbody').innerHTML = '<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--text3)">Error al cargar</td></tr>';
    }
  }
}

function renderUsers(users) {
  const tbody = $('ceo-users-tbody');
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--text3)">Sin usuarios</td></tr>';
    return;
  }
  tbody.innerHTML = users.map(u => {
    const banned = u.banned_permanent;
    const suspended = u.banned_until > 0 && u.banned_until > Date.now();
    let statusHtml, statusClass;
    if (banned) { statusHtml = '🚫 Baneado'; statusClass = 'ceo-badge-banned'; }
    else if (suspended) { statusHtml = '⏳ Suspendido'; statusClass = 'ceo-badge-suspended'; }
    else { statusHtml = '✅ Activo'; statusClass = 'ceo-badge-ok'; }

    const jsSafeName = encodeURIComponent(u.username||u.alias||'');
    const actionsHtml = banned
      ? `<button class="ceo-action-btn ceo-action-unban" onclick="confirmUnban('${u.id}')">Desbanear</button>`
      : `<button class="ceo-action-btn ceo-action-ban" onclick="confirmBan('${u.id}')">Banear</button>
         <button class="ceo-action-btn ceo-action-suspend" onclick="suspendUser('${u.id}','${jsSafeName}')">Suspender</button>`;

    return `<tr>
      <td><strong class="ceo-clickable" onclick="openUserDetail('${u.id}')">${esc(u.username||'?')}</strong></td>
      <td><span class="ceo-cell-email">${esc(u.email||'—')}</span></td>
      <td>${esc(u.alias||'—')}</td>
      <td>${formatNum(u.coins||0)}</td>
      <td>${u.games_played||0}</td>
      <td>${u.games_won||0}</td>
      <td>${u.level||1}</td>
      <td><span class="ceo-badge ${statusClass}">${statusHtml}</span></td>
      <td><div class="ceo-cell-actions">${actionsHtml}</div></td>
    </tr>`;
  }).join('');
}

$('ceo-refresh-users').onclick = loadUsers;

$('ceo-search-users').oninput = function() {
  const q = this.value.toLowerCase().trim();
  if (!q) { renderUsers(_users); $('ceo-user-count').textContent = `${_users.length} usuarios`; return; }
  const filtered = _users.filter(u =>
    (u.username && u.username.toLowerCase().includes(q)) ||
    (u.email && u.email.toLowerCase().includes(q)) ||
    (u.alias && u.alias.toLowerCase().includes(q))
  );
  renderUsers(filtered);
  $('ceo-user-count').textContent = `${filtered.length} de ${_users.length}`;
};

/* ── Ban / Suspend / Unban ──────────────────────────── */
function confirmBan(userId) {
  confirmModal('🚫 Banear usuario', '¿Banear permanentemente a este usuario? No podrá volver a ingresar.', async (ok) => {
    if (!ok) return;
    try {
      await apiFetch(API + '/users/ban', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      toast('Usuario baneado permanentemente', 'error');
      loadUsers(); loadStats();
    } catch(e) { toast('Error: ' + e.message, 'error'); }
  });
}

let _suspendUserId = null;
function suspendUser(userId, username) {
  _suspendUserId = userId;
  $('ceo-suspend-user').textContent = 'Suspender a: ' + esc(decodeURIComponent(username));
  $('ceo-suspend-hours').value = 24;
  $('ceo-modal-suspend').classList.remove('hidden');
}

$('ceo-suspend-confirm').onclick = async () => {
  if (!_suspendUserId) return;
  const hours = parseInt($('ceo-suspend-hours').value) || 24;
  try {
    await apiFetch(API + '/users/suspend', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: _suspendUserId, hours })
    });
    $('ceo-modal-suspend').classList.add('hidden');
    toast(`Usuario suspendido por ${hours}h`, 'info');
    loadUsers(); loadStats();
  } catch(e) { toast('Error: ' + e.message, 'error'); }
};

$('ceo-suspend-cancel').onclick = () => { $('ceo-modal-suspend').classList.add('hidden'); _suspendUserId = null; };

function confirmUnban(userId) {
  confirmModal('✅ Desbanear usuario', '¿Querés desbanear a este usuario?', async (ok) => {
    if (!ok) return;
    try {
      await apiFetch(API + '/users/unban', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      toast('Usuario desbaneado', 'success');
      loadUsers(); loadStats();
    } catch(e) { toast('Error: ' + e.message, 'error'); }
  });
}

/* ── User Detail Modal ──────────────────────────────── */
async function openUserDetail(userId) {
  _currentUserId = userId;
  const u = _users.find(x => x.id === userId);
  if (!u) return;
  $('ceo-user-detail-name').textContent = esc(u.username || 'Usuario');
  $('ceo-ud-id').textContent = u.id;
  $('ceo-ud-email').textContent = u.email || '—';
  $('ceo-ud-alias').textContent = u.alias || '—';
  $('ceo-ud-coins').textContent = formatNum(u.coins || 0);
  $('ceo-ud-level').textContent = u.level || 1;
  $('ceo-ud-games').textContent = u.games_played || 0;
  $('ceo-ud-wins').textContent = u.games_won || 0;
  $('ceo-ud-coin-amount').value = 100;
  $('ceo-ud-coin-reason').value = '';
  $('ceo-ud-reset-pass-btn').dataset.userid = userId;
  $('ceo-ud-reset-pass-btn').dataset.username = u.username || '';
  $('ceo-modal-user').classList.remove('hidden');
  loadUserTransactions(userId);
}

$('ceo-user-detail-close').onclick = () => { $('ceo-modal-user').classList.add('hidden'); _currentUserId = null; };

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.ceo-modal').forEach(m => m.classList.add('hidden'));
    _currentUserId = null;
    _suspendUserId = null;
    _changeRoleAdminId = null;
  }
});

async function loadUserTransactions(userId) {
  const tbody = $('ceo-ud-txns');
  try {
    const res = await apiFetch(API + '/users/' + userId + '/transactions');
    const data = await res.json();
    const txns = data.transactions || [];
    if (!txns.length) {
      tbody.innerHTML = '<div class="ceo-txns-empty">Sin transacciones</div>';
      return;
    }
    tbody.innerHTML = txns.map(t => {
      const d = new Date(Number(t.created_at));
      const dateStr = d.toLocaleDateString('es-AR', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
      const isPositive = parseInt(t.amount) > 0;
      return `<div class="ceo-txn-item">
        <span class="ceo-txn-amount ${isPositive ? 'ceo-txn-positive' : 'ceo-txn-negative'}">${isPositive ? '+' : ''}${t.amount}</span>
        <span class="ceo-txn-reason">${esc(t.reason || '')}</span>
        <span class="ceo-txn-date">${dateStr}</span>
      </div>`;
    }).join('');
  } catch(e) {
    tbody.innerHTML = '<div class="ceo-txns-empty">Error al cargar</div>';
  }
}

$('ceo-ud-coin-give').onclick = () => adjustCoins(1);
$('ceo-ud-coin-take').onclick = () => adjustCoins(-1);

$('ceo-ud-reset-pass-btn').onclick = function() {
  const userId = this.dataset.userid;
  const username = this.dataset.username;
  if (userId) openResetUserPassword(userId, username);
};

async function adjustCoins(sign) {
  if (!_currentUserId) return;
  const amount = parseInt($('ceo-ud-coin-amount').value);
  if (!amount || amount < 1) { toast('Ingresá una cantidad válida', 'error'); return; }
  const u = _users.find(x => x.id === _currentUserId);
  const playerId = u?.player_id || _currentUserId;
  const finalAmount = sign * amount;
  const reason = $('ceo-ud-coin-reason').value.trim() || (sign > 0 ? 'Ajuste CEO (+)' : 'Ajuste CEO (-)');
  try {
    const res = await apiFetch(API + '/users/adjust-coins', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, amount: finalAmount, reason })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    $('ceo-ud-coins').textContent = formatNum(data.newBalance);
    toast(`Monedas ajustadas: ${finalAmount > 0 ? '+' : ''}${finalAmount}`, 'success');
    loadUserTransactions(_currentUserId);
    loadUsers();
  } catch(e) { toast('Error: ' + e.message, 'error'); }
}

/* ══════════════════════════════════════════════════════════
   FEEDBACK
   ══════════════════════════════════════════════════════════ */
let _feedbackRespondId = null;

async function loadFeedback() {
  try {
    const res = await apiFetch(API + '/feedback');
    if (!res.ok) throw new Error('Error');
    const data = await res.json();
    const feedback = data.feedback || [];
    $('ceo-feedback-count').textContent = `${feedback.length} feedbacks`;
    const tbody = $('ceo-feedback-tbody');
    if (!feedback.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text3)">Sin feedback aún</td></tr>';
      return;
    }
    tbody.innerHTML = feedback.map(f => {
      const d = new Date(Number(f.created_at));
      const dateStr = d.toLocaleDateString('es-AR', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
      const catClass = 'ceo-feedback-cat cat-' + f.category;
      const catLabel = { sugerencia: '💡 Sugerencia', bug: '🐛 Bug', otro: '📝 Otro' }[f.category] || f.category;
      const hasResponse = f.admin_response ? true : false;
      const respHtml = hasResponse
        ? `<span style="font-size:10px;color:var(--green)">✅ ${esc(f.admin_response).slice(0, 60)}${f.admin_response.length > 60 ? '...' : ''}</span>`
        : `<span style="font-size:10px;color:var(--text3)">—</span>`;
      const jsSafeName = encodeURIComponent(f.player_name);
      const jsSafeMsg = encodeURIComponent(f.message);
      return `<tr>
        <td style="white-space:nowrap;font-size:10px;color:var(--text3)">${dateStr}</td>
        <td>${esc(f.player_name)}</td>
        <td><span class="${catClass}">${catLabel}</span></td>
        <td style="max-width:200px;white-space:pre-wrap;font-size:11px">${esc(f.message)}</td>
        <td style="max-width:140px">${respHtml}</td>
        <td style="white-space:nowrap">
          <button class="ceo-action-btn ceo-action-view" onclick="openFeedbackRespond('${f.id}','${jsSafeName}','${jsSafeMsg}')">💬</button>
          <button class="ceo-action-btn ceo-action-ban" onclick="confirmDeleteFeedback('${f.id}')">🗑️</button>
        </td>
      </tr>`;
    }).join('');
  } catch(e) {}
}

$('ceo-refresh-feedback').onclick = loadFeedback;

function openFeedbackRespond(id, playerName, message) {
  _feedbackRespondId = id;
  $('ceo-fb-user').textContent = decodeURIComponent(playerName);
  $('ceo-fb-msg').textContent = decodeURIComponent(message);
  $('ceo-fb-response').value = '';
  $('ceo-modal-feedback-respond').classList.remove('hidden');
  setTimeout(() => $('ceo-fb-response')?.focus(), 100);
}

$('ceo-fb-close').onclick = () => { $('ceo-modal-feedback-respond').classList.add('hidden'); _feedbackRespondId = null; };
$('ceo-fb-cancel').onclick = () => { $('ceo-modal-feedback-respond').classList.add('hidden'); _feedbackRespondId = null; };

$('ceo-fb-send').onclick = async () => {
  if (!_feedbackRespondId) return;
  const msg = $('ceo-fb-response').value.trim();
  if (!msg) { toast('Escribí una respuesta', 'error'); return; }
  try {
    const res = await apiFetch(API + '/feedback/' + _feedbackRespondId + '/respond', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    toast('Respuesta enviada al usuario', 'success');
    $('ceo-modal-feedback-respond').classList.add('hidden');
    _feedbackRespondId = null;
    loadFeedback();
  } catch(e) { toast('Error: ' + e.message, 'error'); }
};

function confirmDeleteFeedback(id) {
  confirmModal('🗑️ Eliminar feedback', '¿Eliminar este feedback permanentemente?', async (ok) => {
    if (!ok) return;
    try {
      const res = await apiFetch(API + '/feedback/' + id, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast('Feedback eliminado', 'info');
      loadFeedback();
    } catch(e) { toast('Error: ' + e.message, 'error'); }
  });
}

/* ══════════════════════════════════════════════════════════
   ACTIVE GAMES
   ══════════════════════════════════════════════════════════ */
async function loadGames() {
  try {
    const res = await apiFetch(API + '/games/active');
    if (!res.ok) throw new Error('Error');
    const data = await res.json();
    const games = data.games || [];
    $('ceo-games-count').textContent = `${games.length} salas activas`;
    const tbody = $('ceo-games-tbody');
    if (!games.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:30px;color:var(--text3)">Sin salas activas</td></tr>';
      return;
    }
    tbody.innerHTML = games.map(g => {
      const statusLabel = g.status === 'playing' ? '⚔️ En juego' : '⏳ Esperando';
      const statusClass = g.status === 'playing' ? 'ceo-badge-playing' : 'ceo-badge-waiting';
      const playersHtml = g.players.map(p => `<span class="ceo-game-player-tag">${esc(p.name)}</span>`).join('');
      return `<tr>
        <td><strong>${esc(g.code)}</strong></td>
        <td><span class="ceo-badge ${statusClass}">${statusLabel}</span></td>
        <td><div class="ceo-game-players">${playersHtml}</div></td>
        <td>${g.playerCount}/${g.maxPlayers}</td>
      </tr>`;
    }).join('');
  } catch(e) {
    $('ceo-games-tbody').innerHTML = '<tr><td colspan="4" style="text-align:center;padding:30px;color:var(--text3)">Error al cargar</td></tr>';
  }
}

$('ceo-refresh-games').onclick = loadGames;

/* ══════════════════════════════════════════════════════════
   AUDIT LOG
   ══════════════════════════════════════════════════════════ */
async function loadAuditLog() {
  try {
    const res = await apiFetch(API + '/audit-log');
    if (!res.ok) throw new Error('Error');
    const data = await res.json();
    const logs = data.logs || [];
    $('ceo-audit-count').textContent = `${logs.length} acciones`;
    const tbody = $('ceo-audit-tbody');
    if (!logs.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text3)">Sin registros aún</td></tr>';
      return;
    }
    tbody.innerHTML = logs.map(l => {
      const d = new Date(Number(l.created_at));
      const dateStr = d.toLocaleDateString('es-AR', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
      const actionLabels = {
        ban: '🚫 Banear', unban: '✅ Desbanear', suspend: '⏳ Suspender',
        broadcast: '📢 Broadcast', admin_create: '👤 Crear admin',
        admin_delete: '🗑️ Eliminar admin', admin_change_password: '🔑 Cambiar contraseña',
        adjust_coins: '💰 Ajustar monedas',
        feedback_respond: '💬 Responder feedback',
        feedback_delete: '🗑️ Eliminar feedback'
      };
      const actionLabel = actionLabels[l.action] || l.action;
      const actionClass = 'ceo-audit-' + l.action.split('_')[0];
      return `<tr>
        <td style="white-space:nowrap;font-size:10px;color:var(--text3)">${dateStr}</td>
        <td>${esc(l.admin_username)}</td>
        <td><span class="${actionClass}">${actionLabel}</span></td>
        <td style="font-size:11px;color:var(--text3)">${esc(l.target_id || '—')}</td>
        <td style="font-size:11px;color:var(--text2)">${esc(l.details || '')}</td>
      </tr>`;
    }).join('');
  } catch(e) {
    $('ceo-audit-tbody').innerHTML = '<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text3)">Error al cargar</td></tr>';
    if (e.message !== 'Sesión expirada') toast('Error al cargar auditoría', 'error');
  }
}

$('ceo-refresh-audit').onclick = loadAuditLog;

/* ══════════════════════════════════════════════════════════
   ADMINS
   ══════════════════════════════════════════════════════════ */
async function loadAdmins() {
  try {
    const currentAdmin = _myUsername;
    const res = await apiFetch(API + '/admins');
    if (!res.ok) throw new Error('Error');
    const data = await res.json();
    const admins = data.admins || [];
    $('ceo-admins-count').textContent = `${admins.length} admins`;
    const tbody = $('ceo-admins-tbody');
    if (!admins.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:30px;color:var(--text3)">Sin admins</td></tr>';
      return;
    }
    const isAdmin = _myRole === 'admin';
    tbody.innerHTML = admins.map(a => {
      const d = new Date(Number(a.created_at));
      const dateStr = d.toLocaleDateString('es-AR', { day:'numeric', month:'short', year:'numeric' });
      const isMe = a.username === currentAdmin;
      const roleHtml = `<span class="ceo-badge ${roleBadgeClass(a.role || 'editor')}">${roleLabel(a.role || 'editor')}</span>`;
      let      actionsHtml = isMe ? '<span style="color:var(--text3);font-size:10px">—</span>' : '';
      if (!isMe && isAdmin) {
        const safeRole = (a.role || 'editor');
        actionsHtml = `<button class="ceo-action-btn ceo-action-view" onclick="openChangeRole('${a.id}','${esc(a.username)}','${safeRole}')" title="Cambiar rol">🔄</button>
                       <button class="ceo-action-btn ceo-action-view" onclick="openResetAdminPassword('${a.id}','${esc(a.username)}')" title="Resetear contraseña">🔑</button>
                       <button class="ceo-action-btn ceo-action-ban" onclick="confirmDeleteAdmin('${a.id}','${esc(a.username)}')">🗑️</button>`;
      }
      return `<tr>
        <td>${esc(a.username)} ${isMe ? '<span style="color:var(--gold);font-size:10px">(vos)</span>' : ''}</td>
        <td>${roleHtml}</td>
        <td style="font-size:11px;color:var(--text3)">${dateStr}</td>
        <td><div class="ceo-cell-actions">${actionsHtml}</div></td>
      </tr>`;
    }).join('');
  } catch(e) {
    if (e.message !== 'Sesión expirada') toast('Error al cargar admins', 'error');
  }
}

// Helper: label de rol
function roleLabel(role) {
  const labels = { viewer: '👁️ Viewer', editor: '✏️ Editor', admin: '👑 Admin' };
  return labels[role] || role;
}
function roleBadgeClass(role) {
  const classes = { viewer: 'ceo-badge-waiting', editor: 'ceo-badge-ok', admin: 'ceo-badge-banned' };
  return classes[role] || 'ceo-badge-offline';
}

// ── Resetear contraseña de otro admin (admin only) ───────
function openResetAdminPassword(adminId, username) {
  confirmModal('🔑 Resetear contraseña de ' + username,
    `Ingresá la nueva contraseña para "${username}":<br><br>
     <input id="ceo-new-admin-pass-reset" type="text" class="ceo-input" placeholder="Nueva contraseña (mín. 6 caracteres)" style="width:100%;margin-bottom:6px">
     <input id="ceo-new-admin-pass-confirm" type="text" class="ceo-input" placeholder="Repetir contraseña" style="width:100%">`,
    async (ok) => {
      $('ceo-confirm-yes').textContent = 'Confirmar';
      $('ceo-confirm-yes').className = 'ceo-btn ceo-btn-red';
      if (!ok) return;
      const pass = document.getElementById('ceo-new-admin-pass-reset')?.value?.trim();
      const confirm = document.getElementById('ceo-new-admin-pass-confirm')?.value?.trim();
      if (!pass || pass.length < 6) {
        toast('La contraseña debe tener al menos 6 caracteres', 'error');
        return;
      }
      if (pass !== confirm) {
        toast('Las contraseñas no coinciden', 'error');
        return;
      }
      try {
        const res = await apiFetch(API + '/admins/change-password/' + adminId, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newPassword: pass })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        toast(`🔑 Contraseña de "${username}" actualizada`, 'success');
      } catch(e) { toast('Error: ' + e.message, 'error'); }
    }
  );
  $('ceo-confirm-yes').textContent = 'Guardar contraseña';
  setTimeout(() => document.getElementById('ceo-new-admin-pass-reset')?.focus(), 100);
}

// ── Resetear contraseña de usuario regular (editor+) ─────
function openResetUserPassword(userId, username) {
  confirmModal('🔑 Resetear contraseña de ' + username,
    `Nueva contraseña para "${username}":<br><br>
     <input id="ceo-new-user-pass-reset" type="text" class="ceo-input" placeholder="Nueva contraseña (mín. 6 caracteres)" style="width:100%;margin-bottom:6px">
     <input id="ceo-new-user-pass-confirm" type="text" class="ceo-input" placeholder="Repetir contraseña" style="width:100%">`,
    async (ok) => {
      $('ceo-confirm-yes').textContent = 'Confirmar';
      $('ceo-confirm-yes').className = 'ceo-btn ceo-btn-red';
      if (!ok) return;
      const pass = document.getElementById('ceo-new-user-pass-reset')?.value?.trim();
      const confirm = document.getElementById('ceo-new-user-pass-confirm')?.value?.trim();
      if (!pass || pass.length < 6) {
        toast('La contraseña debe tener al menos 6 caracteres', 'error');
        return;
      }
      if (pass !== confirm) {
        toast('Las contraseñas no coinciden', 'error');
        return;
      }
      try {
        const res = await apiFetch(API + '/users/reset-password', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, newPassword: pass })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        toast(`🔑 Contraseña de "${username}" reseteada`, 'success');
      } catch(e) { toast('Error: ' + e.message, 'error'); }
    }
  );
  $('ceo-confirm-yes').textContent = 'Guardar contraseña';
  setTimeout(() => document.getElementById('ceo-new-user-pass-reset')?.focus(), 100);
}
let _changeRoleAdminId = null;
function openChangeRole(adminId, username, currentRole) {
  _changeRoleAdminId = adminId;
  $('ceo-confirm-title').textContent = '🔄 Cambiar rol de ' + username;
  $('ceo-confirm-desc').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
      <select id="ceo-new-role-select" class="ceo-input" style="padding:8px 10px">
        <option value="viewer" ${currentRole === 'viewer' ? 'selected' : ''}>👁️ Viewer — Solo ver</option>
        <option value="editor" ${currentRole === 'editor' ? 'selected' : ''}>✏️ Editor — Ver y modificar</option>
        <option value="admin" ${currentRole === 'admin' ? 'selected' : ''}>👑 Admin — Acceso completo</option>
      </select>
    </div>
  `;
  $('ceo-confirm-yes').textContent = 'Guardar rol';
  $('ceo-confirm-yes').className = 'ceo-btn ceo-btn-gold';
  _confirmCallback = async (ok) => {
    $('ceo-confirm-yes').textContent = 'Confirmar';
    $('ceo-confirm-yes').className = 'ceo-btn ceo-btn-red';
    if (!ok) return;
    const newRole = $('ceo-new-role-select')?.value;
    if (!newRole) return;
    try {
      const res = await apiFetch(API + '/admins/role', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId, role: newRole })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast('Rol actualizado a ' + roleLabel(newRole), 'success');
      loadAdmins();
    } catch(e) { toast('Error: ' + e.message, 'error'); }
  };
  $('ceo-modal-confirm').classList.remove('hidden');
}

function confirmDeleteAdmin(adminId, username) {
  confirmModal('🗑️ Eliminar admin', `¿Eliminar a "${username}"? No podrá acceder al panel.`, async (ok) => {
    if (!ok) return;
    try {
      const res = await apiFetch(API + '/admins/delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`Admin "${username}" eliminado`, 'info');
      loadAdmins();
    } catch(e) { toast('Error: ' + e.message, 'error'); }
  });
}

// Create admin modal with role selector
$('ceo-create-admin-btn').onclick = () => {
  $('ceo-confirm-title').textContent = '👤 Nuevo admin';
  $('ceo-confirm-desc').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
      <input id="ceo-new-admin-user" type="text" class="ceo-input" placeholder="Nombre de usuario" autocomplete="off">
      <input id="ceo-new-admin-pass" type="password" class="ceo-input" placeholder="Contraseña (mín. 6 caracteres)">
      <label style="font-size:11px;color:var(--text3);margin-top:4px">Rol del admin:</label>
      <select id="ceo-new-admin-role" class="ceo-input" style="padding:8px 10px">
        <option value="viewer">👁️ Viewer — Solo ver</option>
        <option value="editor" selected>✏️ Editor — Ver y modificar</option>
        <option value="admin">👑 Admin — Acceso completo</option>
      </select>
    </div>
  `;
  $('ceo-confirm-yes').textContent = 'Crear admin';
  $('ceo-confirm-yes').className = 'ceo-btn ceo-btn-gold';
  _confirmCallback = async (ok) => {
    $('ceo-confirm-yes').textContent = 'Confirmar';
    $('ceo-confirm-yes').className = 'ceo-btn ceo-btn-red';
    if (!ok) return;
    const username = $('ceo-new-admin-user')?.value?.trim();
    const password = $('ceo-new-admin-pass')?.value?.trim();
    const role = $('ceo-new-admin-role')?.value || 'editor';
    if (!username) { toast('Ingresá un nombre de usuario', 'error'); return; }
    if (!password || password.length < 6) { toast('La contraseña debe tener al menos 6 caracteres', 'error'); return; }
    try {
      const res = await apiFetch(API + '/admins/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`Admin "${username}" creado como ${roleLabel(role)}`, 'success');
      loadAdmins();
    } catch(e) { toast('Error: ' + e.message, 'error'); }
  };
  $('ceo-modal-confirm').classList.remove('hidden');
  setTimeout(() => $('ceo-new-admin-user')?.focus(), 100);
};

// Ocultar botones de admin si no tenemos rol admin
function applyRoleVisibility() {
  const isAdmin = _myRole === 'admin';
  const createBtn = $('ceo-create-admin-btn');
  if (createBtn) createBtn.style.display = isAdmin ? '' : 'none';
  // Solo los editors+ pueden hacer broadcast
  const broadcastBtn = $('ceo-broadcast-btn');
  if (broadcastBtn) broadcastBtn.style.display = (_myRole === 'admin' || _myRole === 'editor') ? '' : 'none';
}

$('ceo-pass-change-btn').onclick = async () => {
  const current = $('ceo-pass-current').value;
  const newPass = $('ceo-pass-new').value;
  const statusEl = $('ceo-pass-status');
  if (!current || !newPass) { statusEl.textContent = 'Completá ambos campos'; statusEl.classList.remove('hidden'); return; }
  if (newPass.length < 6) { statusEl.textContent = 'Mínimo 6 caracteres'; statusEl.classList.remove('hidden'); return; }
  try {
    const res = await apiFetch(API + '/admins/change-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: current, newPassword: newPass })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    statusEl.classList.add('hidden');
    $('ceo-pass-current').value = '';
    $('ceo-pass-new').value = '';
    toast('Contraseña cambiada correctamente', 'success');
  } catch(e) {
    statusEl.textContent = e.message;
    statusEl.classList.remove('hidden');
  }
};

/* ══════════════════════════════════════════════════════════
   ANALYTICS / CHARTS
   ══════════════════════════════════════════════════════════ */
function getAnalyticsDays() {
  const sel = $('ceo-analytics-days');
  return sel ? '?days=' + sel.value : '';
}

// Helper: fetch analytics endpoint safely (no throw on individual failure)
async function safeAnalyticsFetch(url) {
  try {
    const res = await apiFetch(url);
    if (!res.ok) return { data: [] };
    return await res.json();
  } catch(e) {
    if (e.message === 'Sesión expirada') throw e;
    return { data: [] };
  }
}

async function loadAnalytics() {
  try {
    const daysParam = getAnalyticsDays();
    const results = await Promise.allSettled([
      safeAnalyticsFetch(API + '/analytics/users' + daysParam),
      safeAnalyticsFetch(API + '/analytics/transactions' + daysParam),
      safeAnalyticsFetch(API + '/analytics/games' + daysParam),
      safeAnalyticsFetch(API + '/analytics/revenue' + daysParam),
      safeAnalyticsFetch(API + '/analytics/levels'),
      safeAnalyticsFetch(API + '/analytics/heatmap'),
      safeAnalyticsFetch(API + '/analytics/shop')
    ]);

    const extractData = (result) => (result.status === 'fulfilled' ? result.value.data || [] : []);
    const extractObj = (result) => (result.status === 'fulfilled' ? result.value.data || {} : {});
    
    // Charts más grandes (260px height)
    drawChart('chart-users', extractData(results[0]), '👥 Registros de usuarios', '#2A9A6C', 260);
    drawChart('chart-transactions', extractData(results[1]), '💰 Transacciones (monedas)', '#D4AF37', 260);
    drawChart('chart-games', extractData(results[2]), '🎮 Jugadores activos', '#8888FF', 260);
    drawChart('chart-revenue', extractData(results[3]), '💳 Revenue (monedas gastadas)', '#FF6B6B', 260);
    drawLevelBars('chart-levels', extractData(results[4]));
    drawHeatmap('chart-heatmap', extractData(results[5]));
    drawShopStats(extractObj(results[6]));
  } catch(e) {
    if (e.message !== 'Sesión expirada') toast('Error al cargar analytics', 'error');
  }
}

$('ceo-refresh-analytics').onclick = loadAnalytics;
$('ceo-analytics-days')?.addEventListener('change', loadAnalytics);

// Email report send
$('ceo-email-report').onclick = async () => {
  if (!_token) return;
  const email = prompt('📧 Enviar reporte semanal por email\nIngresá el correo del destinatario:');
  if (!email) return;
  try {
    const res = await apiFetch(API + '/report/email', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: email })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    toast(`📧 Reporte enviado a ${email}`, 'success');
  } catch(e) { toast('Error: ' + e.message, 'error'); }
};

// Weekly report download
$('ceo-download-report').onclick = async () => {
  if (!_token) return;
  try {
    const res = await apiFetch(API + '/report/weekly');
    const report = await res.json();
    if (report.error) { toast('Error: ' + report.error, 'error'); return; }
    const html = `<html><head><meta charset="utf-8"><title>Reporte Semanal</title>
    <style>body{font-family:sans-serif;background:#0A0A12;color:#EDE8DC;padding:20px}
    h1{color:#D4AF37;font-size:24px}.stat{display:inline-block;padding:16px;margin:8px;background:rgba(18,18,30,.9);border-radius:8px;border:1px solid rgba(212,175,55,.15);text-align:center;min-width:120px}
    .num{font-size:32px;color:#D4AF37;font-weight:700}.lbl{font-size:11px;color:#5A5440;margin-top:4px}
    .footer{margin-top:20px;color:#5A5440;font-size:11px}</style></head><body>
    <h1>📋 Reporte Semanal</h1>
    <p style="color:#5A5440">${new Date(report.generatedAt).toLocaleDateString('es-AR', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</p>
    <div style="margin-top:16px">
      <div class="stat"><div class="num">${report.newUsers}</div><div class="lbl">Nuevos usuarios</div></div>
      <div class="stat"><div class="num">${report.newPlayers}</div><div class="lbl">Nuevos jugadores</div></div>
      <div class="stat"><div class="num">${formatNum(report.totalRevenue)}</div><div class="lbl">Monedas gastadas</div></div>
      <div class="stat"><div class="num">${report.feedbackCount}</div><div class="lbl">Feedbacks</div></div>
      <div class="stat"><div class="num">${report.activePlayers}</div><div class="lbl">Jugadores activos</div></div>
    </div>
    <div style="margin-top:20px">
      <div class="stat"><div class="num">${formatNum(report.totalUsers)}</div><div class="lbl">Total usuarios</div></div>
      <div class="stat"><div class="num">${formatNum(report.totalPlayers)}</div><div class="lbl">Total jugadores</div></div>
    </div>
    <div class="footer">📈 Los 10.000 de Macko — Reporte generado automáticamente</div>
    </body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'reporte-semanal-' + new Date().toISOString().slice(0,10) + '.html';
    link.click();
    URL.revokeObjectURL(link.href);
    toast('Reporte semanal descargado', 'success');
  } catch(e) { toast('Error: ' + e.message, 'error'); }
};

function drawChart(canvasId, data, label, color, customHeight) {
  const canvas = $(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const parent = canvas.parentElement;
  // Ensure we have a valid width even if parent is not yet laid out
  const rect = parent ? parent.getBoundingClientRect() : { width: 340 };
  const w = Math.max(rect.width - 32, 300);
  const h = customHeight || 240;
  canvas.width = w * 2;
  canvas.height = h * 2;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.scale(2, 2);

  const values = data.map(d => parseInt(d.count) || 0);
  const labels = data.map(d => {
    if (!d.day) return '';
    const parts = d.day.split('-');
    return parts[2] + '/' + parts[1];
  });
  const maxVal = Math.max(...values, 1);

  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  ctx.beginPath();
  ctx.roundRect(4, 4, w - 8, h - 8, 6);
  ctx.fill();

  if (values.length === 0) {
    ctx.fillStyle = '#5A5440';
    ctx.font = '11px Sora, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Sin datos', w / 2, h / 2);
    return;
  }

  const pad = { top: 12, bottom: 20, left: 8, right: 8 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;
  const gap = chartW / (values.length - 1 || 1);

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
  }

  // Fill
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = pad.left + i * gap;
    const y = pad.top + chartH - (v / maxVal) * chartH * 0.85;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(pad.left + (values.length - 1) * gap, pad.top + chartH);
  ctx.lineTo(pad.left, pad.top + chartH);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
  grad.addColorStop(0, color + '60');
  grad.addColorStop(1, color + '10');
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = pad.left + i * gap;
    const y = pad.top + chartH - (v / maxVal) * chartH * 0.85;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();

  if (values.length <= 14) {
    values.forEach((v, i) => {
      const x = pad.left + i * gap;
      const y = pad.top + chartH - (v / maxVal) * chartH * 0.85;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#0A0A12';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }

  ctx.fillStyle = '#5A5440';
  ctx.font = '9px Sora, sans-serif';
  ctx.textAlign = 'center';
  const step = Math.max(1, Math.floor(labels.length / 10));
  labels.forEach((l, i) => {
    if (i % step !== 0 && i !== labels.length - 1) return;
    ctx.fillText(l, pad.left + i * gap, h - 4);
  });

  if (values.length > 0) {
    const lastVal = values[values.length - 1];
    const lastX = pad.left + (values.length - 1) * gap;
    const lastY = pad.top + chartH - (lastVal / maxVal) * chartH * 0.85;
    ctx.fillStyle = color;
    ctx.font = 'bold 11px Sora, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(lastVal, lastX, lastY - 8);
  }
}

function drawLevelBars(containerId, data) {
  const container = $(containerId);
  if (!container) return;
  if (!data || !data.length) {
    container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text3);font-size:12px">Sin datos</div>';
    return;
  }
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const barColors = ['#2A9A6C', '#3AB07A', '#4BC68A', '#D4AF37', '#E8C84A', '#F0D060'];
  container.innerHTML = data.map((d, i) => {
    const pct = (d.count / maxCount) * 100;
    const color = barColors[i % barColors.length];
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:11px">
      <span style="width:60px;color:var(--text3);text-align:right">${esc(d.range)}</span>
      <div style="flex:1;height:18px;background:rgba(255,255,255,.04);border-radius:4px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${color};border-radius:4px;transition:width .5s"></div>
      </div>
      <span style="width:30px;color:var(--text);font-weight:600;text-align:right">${d.count}</span>
    </div>`;
  }).join('');
}

function drawHeatmap(containerId, data) {
  const container = $(containerId);
  if (!container) return;
  if (!data || !data.length) {
    container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text3);font-size:12px">Sin datos</div>';
    return;
  }
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const labels = ['0-3', '3-6', '6-9', '9-12', '12-15', '15-18', '18-21', '21-24'];
  const groups = [
    data.filter(d => d.hour >= 0 && d.hour < 3),
    data.filter(d => d.hour >= 3 && d.hour < 6),
    data.filter(d => d.hour >= 6 && d.hour < 9),
    data.filter(d => d.hour >= 9 && d.hour < 12),
    data.filter(d => d.hour >= 12 && d.hour < 15),
    data.filter(d => d.hour >= 15 && d.hour < 18),
    data.filter(d => d.hour >= 18 && d.hour < 21),
    data.filter(d => d.hour >= 21 && d.hour < 24)
  ];
  const groupSums = groups.map(g => g.reduce((s, h) => s + h.count, 0));
  const groupMax = Math.max(...groupSums, 1);
  const total = groupSums.reduce((s, v) => s + v, 0);

  container.innerHTML = `<div class="ceo-heatmap-grid">
    ${labels.map((l, i) => {
      const pct = (groupSums[i] / groupMax) * 100;
      const opacity = Math.max(0.15, pct / 100);
      const pctOfTotal = total > 0 ? ((groupSums[i] / total) * 100).toFixed(1) : 0;
      const bgColor = `rgba(212, 175, 55, ${opacity.toFixed(2)})`;
      return `<div style="background:${bgColor};border-radius:8px;padding:14px 10px;text-align:center;border:1px solid rgba(212,175,55,.15);transition:transform .2s">
        <div style="font-size:22px;font-weight:700;color:${opacity > 0.5 ? '#FFF' : '#D4AF37'}">${groupSums[i]}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px">${l}h</div>
        <div style="font-size:9px;color:${opacity > 0.5 ? 'rgba(255,255,255,.5)' : 'var(--text3)'};margin-top:1px">${pctOfTotal}%</div>
      </div>`;
    }).join('')}
  </div>
  <div class="ceo-chart-sub" style="margin-top:6px;font-size:10px;color:var(--text3)">📊 Actividad semanal · Total: ${total} conexiones</div>`;
}

// ── Shop Stats (items más comprados) ──────────────────
function drawShopStats(data) {
  const container = $('chart-shop-stats');
  if (!container) return;
  if (!data.topItems || !data.topItems.length) {
    container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text3);font-size:12px">Sin compras aún</div>';
    return;
  }
  const maxCount = data.topItems[0]?.count || 1;
  const colWidth = Math.floor(100 / data.topItems.length);

  // Top items horizontal bars
  let html = `<div class="ceo-shop-stats-summary" style="display:flex;gap:12px;margin-bottom:14px;flex-wrap:wrap">
    <div class="ceo-shop-stat-pill" style="background:rgba(212,175,55,.12);border-radius:8px;padding:8px 14px;text-align:center;flex:1;min-width:80px">
      <div style="font-size:22px;font-weight:700;color:var(--gold)">${data.totalPurchases}</div>
      <div style="font-size:9px;color:var(--text3);margin-top:2px">🛒 Compras totales</div>
    </div>
    ${['dados','avatares','especiales','ultra'].map(cat => {
      const count = data.byCategory?.[cat] || 0;
      const icons = { dados:'🎲', avatares:'👤', especiales:'✨', ultra:'💎' };
      return `<div class="ceo-shop-stat-pill" style="background:rgba(255,255,255,.03);border-radius:8px;padding:8px 10px;text-align:center;flex:1;min-width:60px">
        <div style="font-size:18px;font-weight:600;color:var(--text)">${count}</div>
        <div style="font-size:9px;color:var(--text3);margin-top:2px">${icons[cat]||''} ${cat}</div>
      </div>`;
    }).join('')}
  </div>`;

  html += data.topItems.map((item, i) => {
    const pct = (item.count / maxCount) * 100;
    const barColors = ['#D4AF37','#2A9A6C','#8888FF','#FF6B6B','#F0D060','#5AB0D0'];
    const color = barColors[i % barColors.length];
    return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;font-size:12px">
      <span style="width:32px;font-size:20px;text-align:center;flex-shrink:0">${item.icon || '🎲'}</span>
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px">
          <span style="color:var(--text);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(item.name)}</span>
          <span style="color:var(--gold);font-weight:700;font-family:'Cinzel',serif;font-size:13px;flex-shrink:0">${item.count}</span>
        </div>
        <div style="height:20px;background:rgba(255,255,255,.04);border-radius:6px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${color};border-radius:6px;transition:width .6s ease"></div>
        </div>
      </div>
    </div>`;
  }).join('');

  container.innerHTML = html;
}

/* ══════════════════════════════════════════════════════════
   SERVER INFO
   ══════════════════════════════════════════════════════════ */
async function loadServerInfo() {
  try {
    const res = await apiFetch(API + '/server');
    if (!res.ok) throw new Error('Error');
    const info = await res.json();

    $('srv-uptime').textContent = info.uptimeStr || '-';
    $('srv-connections').textContent = info.connectedPlayers || 0;
    $('srv-rooms').textContent = info.activeRooms || 0;
    $('srv-memory').textContent = info.memoryUsage ? formatBytes(info.memoryUsage.rss) : '-';
    $('srv-node').textContent = info.nodeVersion || '-';
    $('srv-platform').textContent = info.platform || '-';
    $('ceo-server-refresh-label').textContent = '🖥️ ' + (info.nodeVersion || '') + ' · ' + (info.platform || '');

    // Push notification stats
    try {
      const pushRes = await apiFetch(API + '/push/stats');
      const pushData = await pushRes.json();
      let pushEl = document.getElementById('srv-push-status');
      if (!pushEl) {
        pushEl = document.createElement('div');
        pushEl.id = 'srv-push-status';
        pushEl.className = 'ceo-server-card';
        const grid = document.querySelector('.ceo-server-grid');
        if (grid) grid.appendChild(pushEl);
      }
      if (pushData.ready) {
        pushEl.innerHTML = `<h4>🔔 Push notifications</h4><div class="ceo-server-val" style="font-size:16px">✅ Activo · ${pushData.subscriptions} suscriptos</div>`;
      } else {
        pushEl.innerHTML = `<h4>🔔 Push notifications</h4><div class="ceo-server-val" style="font-size:14px;color:var(--text3)">⚠️ Sin VAPID keys</div>`;
      }
    } catch(e) {}

    // Env vars
    const envGrid = $('ceo-env-grid');
    if (info.env) {
      const envEntries = Object.entries(info.env);
      if (envEntries.length > 0) {
        envGrid.innerHTML = envEntries.map(([key, val]) => {
          const isOk = val === true || (typeof val === 'string' && val !== '');
          const valDisplay = typeof val === 'boolean' ? (val ? '✅ Configurado' : '❌ Faltante') : String(val);
          return `<div class="ceo-env-item">
            <span class="ceo-env-key">${key}</span>
            <span class="ceo-env-val ${isOk ? 'ceo-env-ok' : 'ceo-env-missing'}">${valDisplay}</span>
          </div>`;
        }).join('');
      } else {
        envGrid.innerHTML = '<div style="color:var(--text3);font-size:12px">No disponible</div>';
      }
    } else {
      envGrid.innerHTML = '<div style="color:var(--text3);font-size:12px">No disponible</div>';
    }
  } catch(e) {
    if (e.message !== 'Sesión expirada') toast('Error al cargar info del servidor', 'error');
  }
}

$('ceo-refresh-server').onclick = loadServerInfo;

/* ══════════════════════════════════════════════════════════
   BROADCAST
   ══════════════════════════════════════════════════════════ */
$('ceo-broadcast-btn').onclick = () => {
  if (!_token) return;
  $('ceo-broadcast-msg').value = '';
  $('ceo-broadcast-status').classList.add('hidden');
  $('ceo-modal-broadcast').classList.remove('hidden');
};

$('ceo-broadcast-cancel').onclick = () => { $('ceo-modal-broadcast').classList.add('hidden'); };

$('ceo-broadcast-send').onclick = async () => {
  const msg = $('ceo-broadcast-msg').value.trim();
  if (!msg) { toast('Escribí un mensaje', 'error'); return; }
  const btn = $('ceo-broadcast-send');
  btn.disabled = true;
  btn.textContent = 'Enviando...';
  try {
    const res = await apiFetch(API + '/broadcast', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    toast(`📢 Mensaje enviado a ${data.sent} jugadores`, 'success');
    $('ceo-modal-broadcast').classList.add('hidden');
  } catch(e) {
    $('ceo-broadcast-status').textContent = 'Error: ' + e.message;
    $('ceo-broadcast-status').classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enviar';
  }
};

/* ══════════════════════════════════════════════════════════
   SHOP CRUD
   ══════════════════════════════════════════════════════════ */
let _shopItems = [];

async function loadShopCatalog() {
  try {
    const res = await apiFetch(API + '/shop/items');
    if (!res.ok) throw new Error('Error');
    const data = await res.json();
    _shopItems = data.items || [];
    renderShopCatalog(_shopItems);
  } catch(e) {
    if (e.message !== 'Sesión expirada') {
      $('ceo-shop-grid').innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)">Error al cargar tienda</div>';
      toast('Error al cargar tienda', 'error');
    }
  }
}

function renderShopCatalog(items) {
  const searchVal = ($('ceo-search-shop')?.value || '').toLowerCase().trim();
  const filtered = searchVal ? items.filter(i => i.name.toLowerCase().includes(searchVal)) : items;
  $('ceo-shop-count').textContent = `${filtered.length} de ${items.length} items`;
  const grid = $('ceo-shop-grid');
  if (!filtered.length) {
    grid.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)">' +
      (searchVal ? 'Sin resultados para "' + esc(searchVal) + '"' : 'Sin items — hacé clic en ➕ Nuevo item') +
      '</div>';
    return;
  }
  const categories = ['dados', 'avatares', 'especiales', 'ultra'];
  const catLabels = { dados: '🎲 Dados', avatares: '👤 Avatares', especiales: '✨ Especiales', ultra: '💎 Ultra Raros' };
  let html = '';
  for (const cat of categories) {
    const catItems = filtered.filter(i => i.category === cat);
    if (!catItems.length) continue;
    html += `<div class="ceo-shop-cat-header">${catLabels[cat] || cat}</div>`;
    html += catItems.map(item => {
      const enabled = item.enabled !== false;
      return `<div class="ceo-shop-card ${enabled ? '' : 'ceo-shop-disabled'}" data-id="${item.id}">
        <div class="ceo-shop-icon">${item.icon || '🎲'}</div>
        <div class="ceo-shop-name">${esc(item.name)} ${enabled ? '' : '<span style="font-size:9px;color:var(--red)">DESACTIVADO</span>'}</div>
        <div class="ceo-shop-category">${item.category}</div>
        <div class="ceo-shop-desc">${esc(item.description || '')}</div>
        <div class="ceo-shop-price">${formatNum(item.price)} <span style="font-size:11px;color:var(--text3)">🪙</span></div>
        <div class="ceo-shop-actions">
          <button class="ceo-action-btn ceo-action-view" onclick="openShopEdit('${item.id}')">✏️</button>
          <button class="ceo-action-btn ceo-action-ban" onclick="confirmDeleteShopItem('${item.id}','${esc(item.name)}')">🗑️</button>
        </div>
      </div>`;
    }).join('');
  }
  grid.innerHTML = html;
}

// Filtro en vivo para la tienda
$('ceo-search-shop').oninput = function() {
  if (_shopItems.length) renderShopCatalog(_shopItems);
};

$('ceo-refresh-shop').onclick = loadShopCatalog;

// ── Create / Edit item modal ────────────────────────────
$('ceo-shop-add').onclick = () => openShopModal(null);

function openShopModal(item) {
  _shopEditingId = item ? item.id : null;
  $('ceo-shop-modal-title').textContent = item ? '✏️ Editar item' : '➕ Nuevo item';
  $('ceo-shop-f-name').value = item ? item.name : '';
  $('ceo-shop-f-icon').value = item ? (item.icon || '🎲') : '🎲';
  $('ceo-shop-f-category').value = item ? item.category : 'dados';
  $('ceo-shop-f-price').value = item ? item.price : '';
  $('ceo-shop-f-desc').value = item ? (item.description || '') : '';
  $('ceo-shop-form-error').classList.add('hidden');
  $('ceo-modal-shop-item').classList.remove('hidden');
  setTimeout(() => $('ceo-shop-f-name')?.focus(), 100);
}

function openShopEdit(id) {
  const card = document.querySelector(`.ceo-shop-card[data-id="${id}"]`);
  if (!card) { toast('Item no encontrado', 'error'); return; }
  // Extraer datos del DOM de forma robusta
  const nameEl = card.querySelector('.ceo-shop-name');
  const iconEl = card.querySelector('.ceo-shop-icon');
  const catEl = card.querySelector('.ceo-shop-category');
  const priceEl = card.querySelector('.ceo-shop-price');
  const descEl = card.querySelector('.ceo-shop-desc');

  const item = {
    id,
    name: nameEl ? (nameEl.textContent || '').replace(/DESACTIVADO/g, '').trim() : '',
    icon: iconEl ? (iconEl.textContent || '').trim() : '🎲',
    category: catEl ? (catEl.textContent || '').trim() : 'dados',
    price: priceEl ? parseInt((priceEl.textContent || '').replace(/[^0-9]/g, '') || '0') : 0,
    description: descEl ? (descEl.textContent || '').trim() : ''
  };
  openShopModal(item);
}

$('ceo-shop-modal-close').onclick = () => { $('ceo-modal-shop-item').classList.add('hidden'); _shopEditingId = null; };
$('ceo-shop-cancel').onclick = () => { $('ceo-modal-shop-item').classList.add('hidden'); _shopEditingId = null; };

$('ceo-shop-save').onclick = async () => {
  const name = $('ceo-shop-f-name').value.trim();
  const icon = $('ceo-shop-f-icon').value.trim() || '🎲';
  const category = $('ceo-shop-f-category').value;
  const price = parseInt($('ceo-shop-f-price').value);
  const description = $('ceo-shop-f-desc').value.trim();
  const errEl = $('ceo-shop-form-error');

  if (!name || !price || price < 1) {
    errEl.textContent = 'Nombre y precio válido requeridos';
    errEl.classList.remove('hidden');
    return;
  }

  try {
    if (_shopEditingId) {
      const res = await apiFetch(API + '/shop/items/' + _shopEditingId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, icon, category, price, description })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast('Item actualizado', 'success');
    } else {
      const res = await apiFetch(API + '/shop/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, icon, category, price, description })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast('Item creado', 'success');
    }
    $('ceo-modal-shop-item').classList.add('hidden');
    _shopEditingId = null;
    loadShopCatalog();
  } catch(e) {
    errEl.textContent = 'Error: ' + e.message;
    errEl.classList.remove('hidden');
  }
};

function confirmDeleteShopItem(id, name) {
  confirmModal('🗑️ Eliminar item', `¿Eliminar "${esc(name)}" permanentemente?`, async (ok) => {
    if (!ok) return;
    try {
      const res = await apiFetch(API + '/shop/items/' + id, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`Item "${name}" eliminado`, 'info');
      loadShopCatalog();
    } catch(e) { toast('Error: ' + e.message, 'error'); }
  });
}

/* ══════════════════════════════════════════════════════════
   TORNEOS (CEO Panel)
   ══════════════════════════════════════════════════════════ */

async function loadTournamentsList() {
  try {
    const res = await apiFetch(API + '/tournaments');
    if (!res.ok) throw new Error('Error');
    const data = await res.json();
    const tournaments = data.tournaments || [];
    const stats = data.stats || {};
    
    $('ceo-tournament-count').textContent = `${tournaments.length} torneos`;
    
    // Stats
    const statsEl = $('ceo-tournament-stats');
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="ceo-stat-card" style="flex:1;min-width:100px">
          <div class="ceo-stat-num" style="font-size:22px">${stats.totalTournaments || 0}</div>
          <div class="ceo-stat-label">Total</div>
        </div>
        <div class="ceo-stat-card" style="flex:1;min-width:100px">
          <div class="ceo-stat-num" style="font-size:22px;color:var(--gold)">${stats.activeTournaments || 0}</div>
          <div class="ceo-stat-label">En curso</div>
        </div>
        <div class="ceo-stat-card" style="flex:1;min-width:100px">
          <div class="ceo-stat-num" style="font-size:22px;color:var(--green)">${stats.totalParticipants || 0}</div>
          <div class="ceo-stat-label">Participantes</div>
        </div>
        <div class="ceo-stat-card" style="flex:1;min-width:100px">
          <div class="ceo-stat-num" style="font-size:22px;color:var(--gold)">${formatNum(stats.totalPrizes || 0)}</div>
          <div class="ceo-stat-label">🪙 Premios</div>
        </div>
      `;
    }
    
    const tbody = $('ceo-tournaments-tbody');
    if (!tournaments.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text3)">Sin torneos — creá uno con ➕</td></tr>';
      return;
    }
    
    tbody.innerHTML = tournaments.map(t => {
      const status = t.status || 'registration';
      const statusLabels = { registration: '📝 Inscripción', active: '⚔️ Activo', completed: '✅ Finalizado', cancelled: '❌ Cancelado' };
      const statusClass = status === 'active' ? 'ceo-badge-playing' : status === 'completed' ? 'ceo-badge-ok' : status === 'cancelled' ? 'ceo-badge-banned' : 'ceo-badge-waiting';
      
      let actions = '';
      const pushBtn = `<button class="ceo-action-btn ceo-action-view" onclick="ceoSendTournamentPush('${t.id}','${esc(t.name)}','${status}')" title="Enviar notificación push a participantes">🔔</button>`;
      if (status === 'registration') {
        actions = `${pushBtn}
          <button class="ceo-action-btn ceo-action-unban" onclick="ceoStartTournament('${t.id}')">🚀 Iniciar</button>
          <button class="ceo-action-btn ceo-action-ban" onclick="ceoCancelTournament('${t.id}','${esc(t.name)}')">❌ Cancelar</button>`;
      } else if (status === 'active') {
        actions = `${pushBtn}
          <button class="ceo-action-btn ceo-action-view" onclick="ceoViewBracket('${t.id}')">🔍 Ver bracket</button>
          <button class="ceo-action-btn ceo-action-ban" onclick="ceoCancelTournament('${t.id}','${esc(t.name)}')">❌ Cancelar</button>`;
      } else if (status === 'completed') {
        actions = `${pushBtn}
          <button class="ceo-action-btn ceo-action-view" onclick="ceoViewBracket('${t.id}')">🔍 Ver bracket</button>`;
      }
      
      return `<tr>
        <td><strong>${esc(t.name)}</strong></td>
        <td><span class="ceo-badge ${statusClass}">${statusLabels[status] || status}</span></td>
        <td>${parseInt(t.registered_count) || 0}/${t.max_players || '?'}</td>
        <td>${formatNum(parseInt(t.fee) || 0)}</td>
        <td>${formatNum(parseInt(t.prize_pool) || 0)}</td>
        <td>Ronda ${t.current_round || 0}/${t.rounds || '?'}</td>
        <td><div class="ceo-cell-actions">${actions}</div></td>
      </tr>`;
    }).join('');
  } catch(e) {
    if (e.message !== 'Sesión expirada') toast('Error al cargar torneos', 'error');
  }
}

$('ceo-refresh-tournaments').onclick = loadTournamentsList;

// ── Create Tournament ──────────────────────────────────
$('ceo-tournament-create-btn').onclick = () => {
  // Set default start date to tomorrow
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  $('ceo-tournament-f-name').value = '';
  $('ceo-tournament-f-desc').value = '';
  $('ceo-tournament-f-players').value = '16';
  $('ceo-tournament-f-fee').value = '0';
  $('ceo-tournament-f-start').value = tomorrow;
  $('ceo-tournament-f-reg').value = tomorrow;
  if ($('ceo-tournament-f-schedule')) $('ceo-tournament-f-schedule').value = '';
  $('ceo-tournament-form-error').classList.add('hidden');
  $('ceo-tournament-modal-title').textContent = '🏆 Nuevo torneo';
  $('ceo-tournament-save').textContent = 'Crear torneo';
  $('ceo-modal-tournament').classList.remove('hidden');
};

$('ceo-tournament-modal-close').onclick = () => $('ceo-modal-tournament').classList.add('hidden');
$('ceo-tournament-cancel').onclick = () => $('ceo-modal-tournament').classList.add('hidden');

$('ceo-tournament-save').onclick = async () => {
  const name = $('ceo-tournament-f-name').value.trim();
  const description = $('ceo-tournament-f-desc').value.trim();
  const maxPlayers = parseInt($('ceo-tournament-f-players').value);
  const fee = parseInt($('ceo-tournament-f-fee').value) || 0;
  const startTime = $('ceo-tournament-f-start').value;
  const regUntil = $('ceo-tournament-f-reg').value;
  const errEl = $('ceo-tournament-form-error');
  
  if (!name || !startTime) {
    errEl.textContent = 'Nombre y fecha de inicio requeridos';
    errEl.classList.remove('hidden');
    return;
  }
  
  try {
    const res = await apiFetch(API + '/tournaments/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, description, maxPlayers, fee,
        prizes: [],
        startTime: new Date(startTime).toISOString(),
        registrationUntil: regUntil ? new Date(regUntil).toISOString() : null,
        isScheduled: !!($('ceo-tournament-f-schedule')?.value || ''),
        scheduleInterval: $('ceo-tournament-f-schedule')?.value || ''
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    toast(`Torneo "${name}" creado`, 'success');
    $('ceo-modal-tournament').classList.add('hidden');
    loadTournamentsList();
  } catch(e) {
    errEl.textContent = 'Error: ' + e.message;
    errEl.classList.remove('hidden');
  }
};

// ── Start / Cancel ──────────────────────────────────────
async function ceoStartTournament(id) {
  confirmModal('🚀 Iniciar torneo', '¿Generar bracket y comenzar el torneo? Los jugadores ya no podrán inscribirse.', async (ok) => {
    if (!ok) return;
    try {
      const res = await apiFetch(API + '/tournaments/' + id + '/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast('Torneo iniciado! Bracket generado.', 'success');
      loadTournamentsList();
    } catch(e) { toast('Error: ' + e.message, 'error'); }
  });
}

async function ceoCancelTournament(id, name) {
  confirmModal('❌ Cancelar torneo', `¿Cancelar "${esc(name)}"? Se perderán todas las inscripciones.`, async (ok) => {
    if (!ok) return;
    try {
      const res = await apiFetch(API + '/tournaments/' + id + '/cancel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast('Torneo cancelado', 'info');
      loadTournamentsList();
    } catch(e) { toast('Error: ' + e.message, 'error'); }
  });
}

// ── Send Push Notification to Tournament Participants ──
function ceoSendTournamentPush(id, name, status) {
  const statusIcon = status === 'registration' ? '📝' : status === 'active' ? '⚔️' : '✅';
  $('ceo-confirm-title').textContent = '🔔 Notificar participantes';
  $('ceo-confirm-desc').innerHTML = `
    <p style="font-size:12px;color:var(--text2);margin-bottom:8px">${statusIcon} Enviar push a los participantes de <strong>${esc(name)}</strong></p>
    <div style="display:flex;flex-direction:column;gap:8px">
      <div>
        <label style="font-size:11px;color:var(--text3);margin-bottom:3px;display:block">Título *</label>
        <input id="ceo-push-title" type="text" class="ceo-input" placeholder="Ej: ⏰ Torneo por comenzar" 
          value="${statusIcon} ${name}" style="width:100%">
      </div>
      <div>
        <label style="font-size:11px;color:var(--text3);margin-bottom:3px;display:block">Mensaje *</label>
        <textarea id="ceo-push-body" class="ceo-input ceo-textarea" placeholder="Ej: El torneo está por arrancar. ¡Preparate!" 
          rows="2" style="width:100%">El torneo "${esc(name)}" te espera. Revisá los matches disponibles.</textarea>
      </div>
      <div>
        <label style="font-size:11px;color:var(--text3);margin-bottom:3px;display:block">URL (opcional)</label>
        <input id="ceo-push-url" type="text" class="ceo-input" placeholder="/?tab=tournaments" value="/?tab=tournaments" style="width:100%">
      </div>
    </div>
  `;
  $('ceo-confirm-yes').textContent = '📬 Enviar notificación';
  $('ceo-confirm-yes').className = 'ceo-btn ceo-btn-gold';
  _confirmCallback = async (ok) => {
    if (!ok) return;
    const title = document.getElementById('ceo-push-title')?.value?.trim();
    const body = document.getElementById('ceo-push-body')?.value?.trim();
    const url = document.getElementById('ceo-push-url')?.value?.trim() || '/?tab=tournaments';
    if (!title || !body) { toast('Completá título y mensaje', 'error'); return; }
    const btn = $('ceo-confirm-yes');
    btn.disabled = true;
    btn.textContent = '📬 Enviando...';
    try {
      const res = await apiFetch(API + '/tournaments/' + id + '/push', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, url })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`🔔 Notificación enviada a ${data.sent} participantes`, 'success');
      $('ceo-modal-confirm').classList.add('hidden');
    } catch(e) { toast('Error: ' + e.message, 'error'); }
    btn.disabled = false;
    btn.textContent = '📬 Enviar notificación';
  };
  $('ceo-modal-confirm').classList.remove('hidden');
  setTimeout(() => document.getElementById('ceo-push-title')?.focus(), 100);
}

// ── View Bracket ────────────────────────────────────────
async function ceoViewBracket(id) {
  try {
    const res = await apiFetch(API + '/tournaments/' + id + '/bracket');
    const data = await res.json();
    if (!data || !data.tournament) { toast('Bracket no disponible', 'error'); return; }
    
    const t = data.tournament;
    let html = `<div style="margin-bottom:12px">
      <h3 style="font-family:'Cinzel',serif;color:var(--gold);font-size:16px">🏆 ${esc(t.name)}</h3>
      <p style="font-size:11px;color:var(--text3)">${data.participants ? data.participants.length : 0} jugadores · Premios: ${formatNum(parseInt(t.prize_pool) || 0)} 🪙</p>
    </div>`;
    
    if (data.rounds && data.rounds.length) {
      data.rounds.forEach(round => {
        html += `<div style="margin-bottom:10px">
          <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid var(--border2);padding-bottom:4px;margin-bottom:6px">Ronda ${round.round}</div>`;
        
        (round.matches || []).forEach(m => {
          const isCompleted = m.status === 'completed';
          const isBye = !m.player1_id || !m.player2_id;
          html += `<div style="display:flex;gap:8px;padding:6px 8px;background:rgba(255,255,255,.03);border-radius:6px;margin-bottom:4px;font-size:12px;border-left:3px solid ${isCompleted ? 'var(--green)' : (isBye ? 'var(--text3)' : 'var(--gold)')}">
            <div style="flex:1">
              <div style="color:${m.winner_id === m.player1_id ? 'var(--green-lt)' : 'var(--text2)'};font-weight:${m.winner_id === m.player1_id ? '600' : '400'}">${esc(m.player1_name || 'BYE')} ${m.player1_score > 0 ? '<span style="color:var(--gold)">(' + m.player1_score + ')</span>' : ''}</div>
              <div style="color:${m.winner_id === m.player2_id ? 'var(--green-lt)' : 'var(--text2)'};font-weight:${m.winner_id === m.player2_id ? '600' : '400'}">${esc(m.player2_name || 'BYE')} ${m.player2_score > 0 ? '<span style="color:var(--gold)">(' + m.player2_score + ')</span>' : ''}</div>
            </div>
            ${!isBye && !isCompleted ? `<button class="ceo-action-btn ceo-action-unban" onclick="ceoAdvanceMatchPrompt('${id}','${m.id}','${esc(m.player1_name)}','${esc(m.player2_name)}','${esc(m.player1_id)}','${esc(m.player2_id)}')">Avanzar</button>` : ''}
          </div>`;
        });
        
        html += '</div>';
      });
    } else {
      html += '<p style="color:var(--text3);font-size:12px">Sin matches aún</p>';
    }
    
    // Show in confirm modal as a viewer (using callback pattern)
    $('ceo-confirm-yes').textContent = 'Cerrar';
    $('ceo-confirm-yes').className = 'ceo-btn ceo-btn-ghost';
    $('ceo-confirm-no').textContent = 'Cerrar';
    $('ceo-confirm-no').className = 'ceo-btn ceo-btn-ghost';
    _confirmCallback = () => { $('ceo-modal-confirm').classList.add('hidden'); };
    $('ceo-confirm-title').textContent = '🔍 Bracket: ' + esc(t.name);
    $('ceo-confirm-desc').innerHTML = html;
    $('ceo-modal-confirm').classList.remove('hidden');
  } catch(e) { toast('Error: ' + e.message, 'error'); }
}

// ── Advance Match ───────────────────────────────────────
async function ceoAdvanceMatchPrompt(tournamentId, matchId, p1Name, p2Name, p1Id, p2Id) {
  $('ceo-confirm-title').textContent = '🏆 Avanzar match';
  $('ceo-confirm-desc').innerHTML = `
    <p style="font-size:12px;color:var(--text2);margin-bottom:10px">${esc(p1Name)} vs ${esc(p2Name)}</p>
    <div style="display:flex;flex-direction:column;gap:8px">
      <select id="ceo-advance-winner" class="ceo-input" style="padding:8px 10px">
        <option value="">Seleccionar ganador...</option>
        <option value="${esc(p1Id || 'p1')}">🏆 ${esc(p1Name)}</option>
        <option value="${esc(p2Id || 'p2')}">🏆 ${esc(p2Name)}</option>
      </select>
      <div class="ceo-shop-form-row">
        <div class="ceo-shop-form-group" style="flex:1">
          <label>Puntaje ${esc(p1Name)}</label>
          <input id="ceo-advance-p1-score" type="number" class="ceo-input" value="10000" min="0">
        </div>
        <div class="ceo-shop-form-group" style="flex:1">
          <label>Puntaje ${esc(p2Name)}</label>
          <input id="ceo-advance-p2-score" type="number" class="ceo-input" value="0" min="0">
        </div>
      </div>
    </div>
  `;
  $('ceo-confirm-yes').textContent = 'Guardar resultado';
  $('ceo-confirm-yes').className = 'ceo-btn ceo-btn-gold';
  _confirmCallback = async (ok) => {
    $('ceo-confirm-yes').textContent = 'Confirmar';
    $('ceo-confirm-yes').className = 'ceo-btn ceo-btn-red';
    if (!ok) return;
    const winner = $('ceo-advance-winner')?.value;
    if (!winner) { toast('Seleccioná un ganador', 'error'); return; }
    const p1Score = parseInt($('ceo-advance-p1-score')?.value) || 0;
    const p2Score = parseInt($('ceo-advance-p2-score')?.value) || 0;
    try {
      const res = await apiFetch(API + '/tournaments/' + tournamentId + '/advance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, winnerId: winner, p1Score, p2Score })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast('Match avanzado!', 'success');
      loadTournamentsList();
    } catch(e) { toast('Error: ' + e.message, 'error'); }
  };
  $('ceo-modal-confirm').classList.remove('hidden');
}

/* ══════════════════════════════════════════════════════════
   EXPORT CSV
   ══════════════════════════════════════════════════════════ */
$('ceo-export-users').onclick = () => {
  if (!_token) return;
  if (!_users.length) { toast('No hay usuarios para exportar', 'info'); return; }
  const headers = ['Usuario', 'Email', 'Alias', 'Monedas', 'Partidas', 'Victorias', 'Nivel', 'Baneado', 'Creado'];
  const rows = _users.map(u => [
    u.username || '', u.email || '', u.alias || '', u.coins || 0,
    u.games_played || 0, u.games_won || 0, u.level || 1,
    u.banned_permanent ? 'Si' : (u.banned_until > Date.now() ? 'Suspendido' : 'No'),
    u.created_at ? new Date(Number(u.created_at)).toLocaleDateString('es-AR') : ''
  ]);
  downloadCSV('usuarios_ceo.csv', headers, rows);
  toast('Usuarios exportados', 'success');
};

$('ceo-export-feedback').onclick = async () => {
  if (!_token) return;
  try {
    const res = await apiFetch(API + '/feedback');
    const data = await res.json();
    const feedback = data.feedback || [];
    if (!feedback.length) { toast('No hay feedback para exportar', 'info'); return; }
    const headers = ['Fecha', 'Usuario', 'Categoría', 'Mensaje'];
    const rows = feedback.map(f => [
      new Date(Number(f.created_at)).toLocaleDateString('es-AR'),
      f.player_name || '', f.category || '',
      (f.message || '').replace(/"/g, '""')
    ]);
    downloadCSV('feedback_ceo.csv', headers, rows);
    toast('Feedback exportado', 'success');
  } catch(e) { toast('Error al exportar', 'error'); }
};

function downloadCSV(filename, headers, rows) {
  const csvContent = [
    headers.join(','),
    ...rows.map(r => r.map(v => `"${v}"`).join(','))
  ].join('\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

/* ══════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════ */
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function formatNum(n) { return Number(n).toLocaleString('es-AR'); }
function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return val.toFixed(1) + ' ' + units[i];
}
