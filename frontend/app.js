/**
 * ═══════════════════════════════════════════════════════
 * LOS 10.000 DE MACKO — app.js
 * ═══════════════════════════════════════════════════════
 */

/* ── Estado global ───────────────────────────────────── */
const S = {
  id:null,
  userId:null,
  logged:false,

  name:null,
  roomId:null,
  roomCode:null,

  match:null,
  myTurn:false,
  entered:false,

  ws:null,
  joiningRoom:false,
  isOwner:false,

  banking:false,

  avatarEquipped: null, // Icono del avatar equipado
  diceEquipped: null,   // ID del skin de dados equipado
  specialEquipped: null, // Compatibilidad con versiones anteriores
  specialsEquipped: [],
  specialSlots: 1,
  joinRequests: [],
  rematchRoom: null
};
const IS_NATIVE_APP = window.MACKO_NATIVE === true;

function normalizeSpecialIds(value, legacy = null) {
  let ids = Array.isArray(value) ? value : [];
  if (!ids.length && legacy) ids = [legacy];
  return [...new Set(ids.map(String).filter(Boolean))].slice(0, 3);
}

function setEquippedSpecials(value, legacy = null, slots = S.specialSlots) {
  S.specialSlots = Math.max(1, Math.min(3, Number(slots) || 1));
  S.specialsEquipped = normalizeSpecialIds(value, legacy).slice(0, S.specialSlots);
  S.specialEquipped = S.specialsEquipped[0] || null;
}

function playerSpecials(player) {
  return normalizeSpecialIds(player?.equippedSpecials, player?.equippedSpecial);
}

function hasSpecial(id, player = null) {
  return (player ? playerSpecials(player) : S.specialsEquipped).includes(String(id));
}

function getInitial(name) {
  const match = String(name || '').trim().match(/[\p{L}\p{N}]/u);
  return match ? match[0].toLocaleUpperCase('es-AR') : '?';
}

/* ── Sistema de notificaciones ───────────────────────── */
let _notifications = [];
const MAX_NOTIFICATIONS = 50;
const NOTIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

function addNotification(title, message, type, extra) {
  type = type || 'broadcast';
  extra = extra || {};
  const now = Date.now();
  // Deduplicar por mensaje
  for (let i = 0; i < _notifications.length; i++) {
    if (_notifications[i].msg === message && (now - _notifications[i].ts) < 5000) return;
  }
  _notifications.unshift({
    id: extra.id || ('n' + now + Math.random().toString(36).slice(2,6)),
    title: title,
    msg: message,
    type: type,
    ts: extra.timestamp || now,
    expiresAt: extra.expiresAt || now + NOTIFICATION_TTL_MS,
    read: false,
    actions: extra.actions || null,
    data: extra.notifData || null
  });
  if (_notifications.length > MAX_NOTIFICATIONS) _notifications.length = MAX_NOTIFICATIONS;
  _saveNotifs();
  _updateBadge();
}

function _saveNotifs() {
  try { localStorage.setItem('macko_notifs', JSON.stringify(_notifications)); } catch(e) {}
}

function _loadNotifs() {
  let originalCount = 0;
  try {
    // Cargar del key nuevo, o migrar del viejo
    let raw = localStorage.getItem('macko_notifs');
    if (!raw) {
      raw = localStorage.getItem('macko_notifications');
      if (raw) {
        localStorage.setItem('macko_notifs', raw);
        localStorage.removeItem('macko_notifications');
      }
    }
    _notifications = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(_notifications)) _notifications = [];
    originalCount = Array.isArray(_notifications) ? _notifications.length : 0;
  } catch(e) { _notifications = []; }
  // Limpiar formato viejo
  let changed = false;
  _notifications = _notifications.filter(n => {
    if (!n && n !== 0) return false;
    if (typeof n !== 'object') return false;
    if (!n.msg && n.message) { n.msg = n.message; delete n.message; changed = true; }
    if (!n.ts && n.timestamp) { n.ts = n.timestamp; delete n.timestamp; changed = true; }
    const ts = Number(n.ts) || 0;
    return n.msg && ts > 0 && (Number(n.expiresAt) || ts + NOTIFICATION_TTL_MS) > Date.now();
  });
  if (changed || _notifications.length !== originalCount) _saveNotifs();
  _updateBadge();
}

function markAllRead() {
  _notifications.forEach(n => n.read = true);
  _saveNotifs();
  _updateBadge();
}

function _updateBadge() {
  const badge = $('notif-badge');
  if (!badge) return;
  const count = _notifications.filter(n => !n.read).length;
  badge.textContent = count;
  badge.classList.toggle('hidden', count === 0);
}

function renderNotifPanel() {
  const list = $('notif-list');
  if (!list) return;
  if (!_notifications.length) {
    list.innerHTML = '<div class="notif-empty">Sin notificaciones</div>';
    return;
  }
  list.innerHTML = _notifications.slice(0, 30).map(n => {
    const icon = n.type === 'tournament' ? '🏆' : n.type === 'friend_request' ? '👤' :
                 n.type === 'game_invite' ? '🎮' : n.type === 'system' ? '⚙️' : '📢';
    const time = _timeAgo(n.ts);
    let actionsHtml = '';
    if (n.actions && n.actions.length) {
      actionsHtml = '<div class="notif-actions">' + n.actions.map(a =>
        '<button class="notif-action-btn ' + esc(String(a.style || '').replace(/[^a-z0-9_-]/gi, '')) +
        '" data-nid="' + esc(n.id) + '" data-action="' + esc(a.action) + '">' + esc(a.label) + '</button>'
      ).join('') + '</div>';
    }
    return '<div class="notif-item ' + (n.read ? '' : 'unread') + '">' +
      '<span class="notif-icon">' + icon + '</span>' +
      '<div class="notif-body">' +
        '<div class="notif-title">' + esc(n.title) + '</div>' +
        '<div class="notif-msg">' + esc(n.msg) + '</div>' +
        '<div class="notif-time">' + time + '</div>' +
        actionsHtml +
      '</div></div>';
  }).join('');

  // Bind action buttons
  list.querySelectorAll('.notif-action-btn').forEach(btn => {
    btn.onclick = function(e) {
      e.stopPropagation();
      _handleNotifAction(this.dataset.nid, this.dataset.action);
    };
  });
}

function _timeAgo(ts) {
  const num = Number(ts);
  if (!num || isNaN(num)) return '';
  const diff = Date.now() - num;
  if (diff < 0 || diff > 31536000000) return ''; // futuro o >1 año
  if (diff < 60000) return 'Ahora';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h';
  return new Date(num).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

async function _deleteNotification(notifId, syncServer) {
  _notifications = _notifications.filter(n => n.id !== notifId);
  _saveNotifs();
  _updateBadge();
  renderNotifPanel();
  if (syncServer && isLogged()) {
    try {
      await fetch('/api/notifications/' + encodeURIComponent(notifId), {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('gameToken') }
      });
    } catch(e) {}
  }
}

function _handleNotifAction(notifId, action) {
  const notif = _notifications.find(n => n.id === notifId);
  if (!notif) return;
  if (action === 'accept_friend' && notif.data) {
    wsSend('FRIEND_ACCEPT', { requestId: notif.data.requestId, fromId: notif.data.fromId });
    toast('Amistad aceptada', 'success');
  } else if (action === 'reject_friend' && notif.data) {
    wsSend('FRIEND_REJECT', { requestId: notif.data.requestId });
    toast('Solicitud rechazada', 'info');
  } else if (action === 'accept_invite' && notif.data) {
    const invitePayload = {
      inviteId: notif.data.inviteId || notifId,
      roomId: notif.data.roomId,
      roomCode: notif.data.roomCode,
      playerId: S.id,
      playerName: getPlayerName()
    };
    if (S.ws?.readyState === WebSocket.OPEN) {
      wsSend('GAME_INVITE_ACCEPT', invitePayload);
      toast('Uniéndote a la partida...', 'success');
    } else {
      // Si no hay WS conectado, conectar y enviar después
      toast('Conectando para unirte...', 2000);
      _pendingInviteAccept = invitePayload;
      connect();
    }
  } else if (action === 'reject_invite' && notif.data) {
    wsSend('GAME_INVITE_REJECT', { inviteId: notif.data.inviteId, fromId: notif.data.fromId });
    toast('Invitación rechazada', 'info');
  }
  const removeNow = action === 'accept_invite' || action === 'reject_invite' || action === 'accept_friend' || action === 'reject_friend';
  if (removeNow) void _deleteNotification(notifId, notif.type === 'game_invite');
  else {
    notif.read = true;
    _saveNotifs();
    _updateBadge();
    renderNotifPanel();
  }
}

/* Cargar notificaciones del servidor (broadcasts recientes) */
async function loadServerNotifications() {
  if (!isLogged()) return;
  try {
    const res = await authenticatedFetch('/api/notifications');
    if (!res.ok) return;
    const data = await res.json();
    const notifications = data.notifications || [];
    const existingIds = new Set(_notifications.map(n => String(n.id)));
    let added = 0;
    for (const n of notifications) {
      const id = String(n.id);
      if (!existingIds.has(id)) {
        const isInvite = n.type === 'game_invite';
        _notifications.unshift({
          id,
          title: n.title || (n.type === 'broadcast' ? '📢 Anuncio' : 'Notificación'),
          msg: n.message,
          type: n.type || 'broadcast',
          ts: Number(n.created_at) || Date.now(),
          expiresAt: Number(n.expires_at) || Date.now() + NOTIFICATION_TTL_MS,
          read: !!n.read,
          actions: isInvite ? [
            { label: 'Unirse', action: 'accept_invite', style: 'notif-accept' },
            { label: 'Rechazar', action: 'reject_invite', style: 'notif-reject' }
          ] : null,
          data: n.data || null
        });
        existingIds.add(id);
        added++;
      }
    }
    _notifications = _notifications.filter(n => (Number(n.expiresAt) || Number(n.ts) + NOTIFICATION_TTL_MS) > Date.now());
    _notifications.sort((a, b) => b.ts - a.ts);
    if (_notifications.length > MAX_NOTIFICATIONS) _notifications.length = MAX_NOTIFICATIONS;
    _saveNotifs();
    _updateBadge();
  } catch(e) {}
}
let _playAgainTimer  = null;
let _deferredInstall = null; // evento beforeinstallprompt

/* ── Service Worker + PWA ────────────────────────────── */
let _swRegistration = null;
if (!IS_NATIVE_APP && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      console.log('SW registrado:', reg.scope);
      _swRegistration = reg;
      void checkPushStatus();
      if (reg.waiting && navigator.serviceWorker.controller) showUpdatePrompt(_availableVersion || 'nueva');
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdatePrompt(_availableVersion || 'nueva');
          }
        });
      });
      setTimeout(() => { reg.update(); checkUpdateIndicator(); }, 1500);
    }).catch(err => {
      console.warn('SW error:', err);
    });
  });
}

if (!IS_NATIVE_APP && 'serviceWorker' in navigator) {
  // Escuchar mensajes del Service Worker (push recibidos, actualizaciones, etc.)
  navigator.serviceWorker.addEventListener('message', event => {
    const msg = event.data;
    if (!msg || !msg.type) return;
    if (msg.type === 'PUSH_RECEIVED') {
      if (msg.action === 'game_invite' && msg.inviteId) {
        addNotification(msg.title || 'Invitación', msg.body || 'Te invitaron a una partida', 'game_invite', {
          id: String(msg.inviteId),
          timestamp: msg.timestamp,
          actions: [
            { label: 'Unirse', action: 'accept_invite', style: 'notif-accept' },
            { label: 'Rechazar', action: 'reject_invite', style: 'notif-reject' }
          ],
          notifData: { roomId: msg.roomId, roomCode: msg.roomCode, inviteId: msg.inviteId, fromId: msg.fromId }
        });
      }
      // Mostrar badge en el botón de torneos
      const badge = document.getElementById('tournament-push-badge');
      if (badge) {
        badge.classList.remove('hidden');
        badge.textContent = '🔔';
        clearTimeout(badge._hideTimer);
        badge._hideTimer = setTimeout(() => {
          badge.classList.add('hidden');
        }, 12000);
      }
      // Mostrar toast con el mensaje (truncar body si es muy largo)
      if (msg.title || msg.body) {
        const bodyText = msg.body ? (msg.body.length > 80 ? msg.body.slice(0, 80) + '…' : msg.body) : '';
        const prefix = msg.title ? msg.title + (bodyText ? ': ' : '') : '';
        const fullText = '📫 ' + prefix + bodyText;
        // Use the same _toastT timer variable as toast() for coordination
        const el = document.getElementById('toast');
        if (el) {
          el.textContent = fullText;
          el.classList.remove('hidden');
          clearTimeout(_toastT);
          _toastT = setTimeout(() => el.classList.add('hidden'), 5000);
        }
      }
    }
    if (msg.type === 'INVITE_RECEIVED' && msg.roomId) {
      // Invitación a partida desde push notification (OS tray)
      const invitePayload = {
        inviteId: msg.inviteId || '',
        roomId: msg.roomId,
        roomCode: msg.roomCode || '',
        playerId: S.id,
        playerName: getPlayerName()
      };
      if (S.ws?.readyState === WebSocket.OPEN) {
        wsSend('GAME_INVITE_ACCEPT', invitePayload);
        toast('🎮 Uniéndote a la partida...', 'success');
      } else {
        toast('Conectando para unirte...', 2000);
        _pendingInviteAccept = invitePayload;
        connect();
      }
    }
    if (msg.type === 'SW_UPDATED') {
      if (_appUpdateInProgress) window.location.replace('/?updated=' + Date.now());
    }
  });
}
/* ── Push Notifications ─────────────────────────────── */
let _pushSubscribed = localStorage.getItem('macko_push') === 'subscribed';

async function getServiceWorkerRegistration() {
  if (IS_NATIVE_APP) return null;
  if (_swRegistration) return _swRegistration;
  if (!('serviceWorker' in navigator)) return null;
  try {
    _swRegistration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('La aplicación todavía no está lista')), 8000))
    ]);
    return _swRegistration;
  } catch(e) {
    return null;
  }
}

// Convertir VAPID key de base64 a Uint8Array (requerido por Push API)
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

async function subscribeToPush() {
  const token = localStorage.getItem('gameToken');
  if (!token) { toast('Debés iniciar sesión'); return false; }
  try {
    if (!window.isSecureContext || !('Notification' in window) || !('PushManager' in window)) {
      throw new Error('Las notificaciones no están disponibles en este dispositivo');
    }
    let permission = Notification.permission;
    if (permission === 'default') permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      const error = new Error('Permiso de notificaciones rechazado');
      error.name = 'NotAllowedError';
      throw error;
    }
    const registration = await getServiceWorkerRegistration();
    if (!registration) throw new Error('Service Worker no disponible');
    // Obtener VAPID public key
    const keyRes = await fetch('/api/push/vapid-key');
    if (!keyRes.ok) throw new Error('No se pudo obtener la configuración push');
    const keyData = await keyRes.json();
    if (!keyData.publicKey) {
      toast('🔔 Push no disponible (sin configuración)', 'error');
      return false;
    }
    // Subscription (convertir key a Uint8Array)
    const expectedKey = urlBase64ToUint8Array(keyData.publicKey);
    let sub = await registration.pushManager.getSubscription();
    if (sub && !pushKeysMatch(sub, expectedKey)) {
      await sub.unsubscribe();
      sub = null;
    }
    if (!sub) {
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: expectedKey
      });
    }
    await savePushSubscriptionOnServer(sub, token);
    _pushSubscribed = true;
    localStorage.setItem('macko_push', 'subscribed');
    updatePushBtn();
    toast('🔔 Notificaciones activadas', 'success');
    return true;
  } catch (e) {
    _pushSubscribed = false;
    localStorage.removeItem('macko_push');
    updatePushBtn();
    if (e.name === 'NotAllowedError' || e.code === 20) {
      toast('🔔 Permití las notificaciones en el navegador', 'error');
    } else {
      toast('Error al activar push: ' + e.message, 'error');
    }
    return false;
  }
}

async function unsubscribeFromPush() {
  const token = localStorage.getItem('gameToken');
  try {
    const registration = await getServiceWorkerRegistration();
    const sub = registration ? await registration.pushManager.getSubscription() : null;
    if (sub) await sub.unsubscribe();
    if (token) {
      await fetch('/api/push/unsubscribe', {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}` }
      });
    }
  } catch(e) {}
  _pushSubscribed = false;
  localStorage.removeItem('macko_push');
  updatePushBtn();
  toast('🔔 Notificaciones desactivadas', 'info');
  return true;
}

async function checkPushStatus() {
  if (!isLogged()) return false;
  if (!(await validateStoredAuthSession())) return false;
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      _pushSubscribed = false;
      localStorage.removeItem('macko_push');
      updatePushBtn();
      return false;
    }
    const registration = await getServiceWorkerRegistration();
    if (!registration) return false;
    const sub = await registration.pushManager.getSubscription();
    const browserSubscribed = !!sub;
    if (browserSubscribed) {
      const token = localStorage.getItem('gameToken');
      if (token) await savePushSubscriptionOnServer(sub, token);
      _pushSubscribed = true;
      localStorage.setItem('macko_push', 'subscribed');
      updatePushBtn();
    } else {
      _pushSubscribed = false;
      localStorage.removeItem('macko_push');
      updatePushBtn();
    }
    return _pushSubscribed;
  } catch(e) {
    updatePushBtn();
    return false;
  }
}

function updatePushBtn() {
  const sw = $('notif-push-switch');
  if (sw) sw.checked = _pushSubscribed;
}

// También llamar al login y después de register SW
setTimeout(() => {
  if (isLogged()) void checkPushStatus();
}, 6000);

/* Capturar evento de instalación PWA */
let _pwaDismissed = false;
let _pwaAutoTimer = null;

function updatePwaOffset() {
  const bar = $('pwa-install-bar');
  const isVisible = bar && !bar.classList.contains('hidden');
  document.body.classList.toggle('pwa-visible', isVisible);
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _deferredInstall = e;
  // No mostrar si el usuario ya lo cerró antes
  if (_pwaDismissed) return;
  const bar = $('pwa-install-bar');
  if (bar) {
    bar.classList.remove('hidden');
    updatePwaOffset();
  }
});  // También mostrar la barra como recordatorio si el usuario está logueado y no se ha instalado
  // (útil en Android Chrome donde beforeinstallprompt puede tardar en dispararse)
  setTimeout(() => {
    if (!_deferredInstall && !_pwaDismissed && isLogged()) {
      const bar = $('pwa-install-bar');
      if (bar && bar.classList.contains('hidden')) {
        // Mostrar un mensaje más sutil: solo si estamos en lobby y no hay barra
      }
    }
  }, 5000);


/* Esconder banner si ya se instaló */
window.addEventListener('appinstalled', () => {
  _deferredInstall = null;
  const bar = $('pwa-install-bar');
  if (bar) { bar.classList.add('hidden'); updatePwaOffset(); }
});

/* ── Persistencia de sesión ──────────────────────────── */
const SESSION_KEY = 'macko_session';
const AUTH_KEY = 'macko_auth';
const GUEST_TOKEN_KEY = 'macko_guest_token';

// Cache busting de assets sin borrar preferencias ni sesión.
const GAME_CACHE_KEY = 'macko_cache_ver';
function checkCacheVersion() {
  const appVersion = typeof GAME_VERSION !== 'undefined' ? GAME_VERSION : '0.0.0';
  const cachedVersion = localStorage.getItem(GAME_CACHE_KEY);
  if (cachedVersion !== appVersion) {
    if (cachedVersion) sessionStorage.setItem('macko_show_changelog_after_update', '1');
    localStorage.setItem(GAME_CACHE_KEY, appVersion);
    console.log('Versión local actualizada a', appVersion);
  }
}

function saveSession() {
  if (!S.id) return;
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    id: S.id, name: S.name,
    roomId: S.roomId, roomCode: S.roomCode,
    entered: S.entered, ts: Date.now()
  }));
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (Date.now() - d.ts > 4 * 60 * 60 * 1000) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return d;
  } catch(e) { return null; }
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
function saveAuth(user, token) {
  _authExpiredHandled = false;
  _authValidationPromise = null;
  _validatedBalance = null;
  localStorage.removeItem(GUEST_TOKEN_KEY);
  localStorage.setItem(AUTH_KEY, JSON.stringify({
    id: user.id,
    username: user.alias || user.username
  }));
  localStorage.setItem('gameToken', token); // ¡Guardamos la llave VIP!
}

function isLogged() {
  return !!localStorage.getItem('gameToken');
}

function loadAuth() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY));
  } catch {
    return null;
  }
}

function loadAuthenticatedIdentity() {
  const auth = loadAuth();
  if (auth?.id && auth?.username) return auth;
  try {
    const token = localStorage.getItem('gameToken');
    if (!token) return null;
    let encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    encoded += '='.repeat((4 - encoded.length % 4) % 4);
    const payload = JSON.parse(atob(encoded));
    const identity = {
      id: payload.playerId,
      username: payload.username || 'Jugador'
    };
    if (!identity.id) return null;
    localStorage.setItem(AUTH_KEY, JSON.stringify(identity));
    return identity;
  } catch(e) {
    return null;
  }
}

let _authValidationPromise = null;
let _authExpiredHandled = false;
let _validatedBalance = null;
let _pendingRegistrationEmail = '';

function clearAuth() {
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem('gameToken');
  localStorage.removeItem(GUEST_TOKEN_KEY);
  sessionStorage.removeItem(GUEST_TOKEN_KEY);
  _authValidationPromise = null;
  _validatedBalance = null;
}

function expireAuthenticatedSession(message = 'Tu sesión venció. Volvé a ingresar.') {
  if (_authExpiredHandled) return;
  _authExpiredHandled = true;
  disconnectSocketForIdentityChange();
  clearAuth();
  clearSession();
  S.logged = false;
  S.userId = null;
  S.id = null;
  S.name = null;
  S.roomId = null;
  S.roomCode = null;
  if (document.readyState !== 'loading') {
    showScreen('screen-auth');
    toast(message, 4500);
  }
}

async function authenticatedFetch(input, options = {}) {
  const token = localStorage.getItem('gameToken');
  const headers = new Headers(options.headers || {});
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(input, { ...options, headers });
  if (token && (response.status === 401 || response.status === 403)) {
    const payload = await response.clone().json().catch(() => ({}));
    const errorText = String(payload.error || payload.message || '');
    if (/sesi[oó]n expirada|sesi[oó]n inv[aá]lida|debe(?:s|rías|rÃ­as) iniciar sesi[oó]n/i.test(errorText)) {
      expireAuthenticatedSession();
    }
  }
  return response;
}

function tokenIsLocallyExpired(token) {
  try {
    let encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    encoded += '='.repeat((4 - encoded.length % 4) % 4);
    const payload = JSON.parse(atob(encoded));
    return !payload.exp || payload.exp * 1000 <= Date.now();
  } catch (_) {
    return true;
  }
}

function loadGuestIdentity() {
  const token = localStorage.getItem(GUEST_TOKEN_KEY) || sessionStorage.getItem(GUEST_TOKEN_KEY);
  if (!token || tokenIsLocallyExpired(token)) {
    localStorage.removeItem(GUEST_TOKEN_KEY);
    sessionStorage.removeItem(GUEST_TOKEN_KEY);
    return null;
  }
  try {
    let encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    encoded += '='.repeat((4 - encoded.length % 4) % 4);
    const payload = JSON.parse(atob(encoded));
    if (!payload.playerId) return null;
    if (!localStorage.getItem(GUEST_TOKEN_KEY)) {
      localStorage.setItem(GUEST_TOKEN_KEY, token);
      sessionStorage.removeItem(GUEST_TOKEN_KEY);
    }
    return { id:payload.playerId, username:payload.username || '' };
  } catch (_) {
    localStorage.removeItem(GUEST_TOKEN_KEY);
    sessionStorage.removeItem(GUEST_TOKEN_KEY);
    return null;
  }
}

function hasGuestSession() {
  return !!loadGuestIdentity();
}

function expireGuestSession(message = 'Tu sesión de invitado venció. Entrá nuevamente.') {
  disconnectSocketForIdentityChange();
  localStorage.removeItem(GUEST_TOKEN_KEY);
  sessionStorage.removeItem(GUEST_TOKEN_KEY);
  clearSession();
  S.logged = false;
  S.userId = null;
  S.id = null;
  S.name = null;
  S.roomId = null;
  S.roomCode = null;
  showScreen('screen-auth');
  toast(message, 4500);
}

function validateStoredAuthSession() {
  if (_authValidationPromise) return _authValidationPromise;
  _authValidationPromise = (async () => {
    const token = localStorage.getItem('gameToken');
    if (!token) return false;
    if (tokenIsLocallyExpired(token)) {
      expireAuthenticatedSession();
      return false;
    }
    try {
      const response = await authenticatedFetch('/api/user/balance', { cache: 'no-store' });
      if (response.status === 401 || response.status === 403) return false;
      if (!response.ok) return true;
      _validatedBalance = await response.json().catch(() => null);
      return true;
    } catch (_) {
      // Sin red se conserva la sesión; al volver online se validará con el servidor.
      return true;
    }
  })();
  return _authValidationPromise;
}

function pushKeysMatch(subscription, expectedKey) {
  const current = subscription?.options?.applicationServerKey;
  if (!current) return false;
  const currentBytes = new Uint8Array(current);
  if (currentBytes.length !== expectedKey.length) return false;
  return currentBytes.every((byte, index) => byte === expectedKey[index]);
}

async function savePushSubscriptionOnServer(subscription, token) {
  const response = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ subscription: subscription.toJSON() })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'No se pudo guardar la suscripción');
}

// Ejecutar cache check al cargar la página
checkCacheVersion();
// ── Funciones de dados y skins → dice-renderer.js ────
// (DOT_POSITIONS, DICE_SKINS, makeDieSVG, makeDie, showDice, clearDice, setMsg, showEntryBanner, SKIN_PARTICLES, spawnSkinParticles)

/* ── Contador de tiempo ──────────────────────────────── */
const TURN_SECS     = 15;
const CIRCUMFERENCE = 2 * Math.PI * 18;

let _timerInterval = null;
let _timerSecsLeft = TURN_SECS;

function startTimer(seconds) {
  stopTimer();
  _timerSecsLeft = seconds;

  const timerEl = $('turn-timer');
  const secsEl  = $('timer-secs');
  const bar     = $('timer-ring-bar');

  timerEl.classList.remove('hidden');
  timerEl.classList.remove('timer-urgent');
  secsEl.textContent = _timerSecsLeft;
  bar.style.strokeDashoffset = 0;

  _timerInterval = setInterval(() => {
    _timerSecsLeft--;
    if (_timerSecsLeft < 0) { stopTimer(); return; }
    secsEl.textContent = _timerSecsLeft;
    const offset = CIRCUMFERENCE * (1 - _timerSecsLeft / seconds);
    bar.style.strokeDashoffset = offset;
    if (_timerSecsLeft <= 5) timerEl.classList.add('timer-urgent');
  }, 1000);
}

function stopTimer() {
  if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }
  const timerEl = $('turn-timer');
  if (timerEl) {
    timerEl.classList.add('hidden');
    timerEl.classList.remove('timer-urgent');
  }
}

/* ── Canvas fondo lobby ──────────────────────────────── */
function initBgCanvas() {
  const canvas = $('bg-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const particles = [];

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  for (let i = 0; i < 40; i++) {
    particles.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 2 + .5,
      vx: (Math.random() - .5) * .3,
      vy: (Math.random() - .5) * .3,
      alpha: Math.random() * .5 + .1
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    if (isLight) {
      ctx.fillStyle = '#f5f3ef';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const g = ctx.createRadialGradient(
        canvas.width * .5, canvas.height * .3, 0,
        canvas.width * .5, canvas.height * .5, canvas.height * .8
      );
      g.addColorStop(0, 'rgba(200,180,140,.06)');
      g.addColorStop(1, 'rgba(245,243,239,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width)  p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(8,145,178,${p.alpha * .55})`;
        ctx.fill();
      });
    } else {
      ctx.fillStyle = '#0c0e1a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const g = ctx.createRadialGradient(
        canvas.width * .4, 0, 0,
        canvas.width * .4, canvas.height * .5, canvas.height
      );
      g.addColorStop(0, 'rgba(6,182,212,.06)');
      g.addColorStop(1, 'rgba(12,14,26,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width)  p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(6,182,212,${p.alpha})`;
        ctx.fill();
      });
    }
    requestAnimationFrame(draw);
  }
  draw();
}

/* ── Confetti ────────────────────────────────────────── */
function launchConfetti() {
  const area = $('confetti-area');
  if (!area) return;
  area.innerHTML = '';
  const colors = ['#D4AF37','#f5d060','#52c87a','#e05555','#5580e0','#ffffff','#ff6bd6','#40f0ff'];
  for (let i = 0; i < 80; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    const size = 6 + Math.random() * 8;
    p.style.cssText = `
      left:${Math.random()*100}%;
      width:${size}px;height:${size * (.6 + Math.random()*.8)}px;
      background:${colors[Math.floor(Math.random()*colors.length)]};
      animation-duration:${1 + Math.random()*1.8}s;
      animation-delay:${Math.random()*.6}s;
      transform:rotate(${Math.random()*360}deg);
      border-radius:${Math.random() > .5 ? '50%' : '2px'};
      filter:drop-shadow(0 0 ${3 + Math.random()*5}px currentColor);
    `;
    area.appendChild(p);
  }
}
function launchRainbowConfetti() {
  const area = $('confetti-area');
  if (!area) return;
  area.innerHTML = '';
  const rainbow = ['#ff0000','#ff8800','#ffff00','#00ff00','#0088ff','#8800ff','#ff00ff'];
  for (let i = 0; i < 140; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    const size = 8 + Math.random() * 12;
    p.style.cssText = `
      left:${Math.random()*100}%;
      width:${size}px;height:${size * (.5 + Math.random())}px;
      background:${rainbow[i % rainbow.length]};
      animation-duration:${.8 + Math.random()*2}s;
      animation-delay:${Math.random()*.5}s;
      transform:rotate(${Math.random()*360}deg);
      border-radius:${Math.random() > .4 ? '50%' : '2px'};
      filter:drop-shadow(0 0 ${4 + Math.random()*8}px ${rainbow[i % rainbow.length]});
    `;
    area.appendChild(p);
  }
}

// ── Sistema de audio → audio.js ───────────────────────
// (AC, ac, tone, SFX, SKIN_SOUND, getActiveSkinAudio, playSkinRoll, playSkinScore, playSkinHot)
// Funciones de música (definidas en audio.js):
// startMusicForScreen, stopMusic, SFX, toggleMusicMute, toggleSfxMute,
// isMusicMuted, isSfxMuted, getMusicVolume, setMusicVolume, updateMusicBtns, ensureAudioContext, playGameOver

/* ── Helpers ─────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const esc = s => String(s)
  .replace(/&/g,'&amp;')
  .replace(/</g,'&lt;')
  .replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;')
  .replace(/'/g,'&#39;');
const uid = () => 'p' + Math.random().toString(36).slice(2,9) + Date.now().toString(36);
const formatNum = n => Number(n).toLocaleString('es-AR');

function getLevelRankMeta(levelValue) {
  const level = Math.max(1, Number(levelValue) || 1);
  const ranks = [
    { min:0, max:59, title:'Rookie', icon:'🌱' },
    { min:60, max:149, title:'Aprendiz', icon:'📖' },
    { min:150, max:499, title:'Profesional', icon:'⚙️' },
    { min:500, max:1099, title:'Maestro', icon:'🏅' },
    { min:1100, max:1899, title:'Leyenda', icon:'🌟' },
    { min:1900, max:3399, title:'Elite', icon:'💎' },
    { min:3400, max:5899, title:'Mítico', icon:'⚡' },
    { min:5900, max:Infinity, title:'Dios', icon:'👑' }
  ];
  return { level, ...(ranks.find(rank => level >= rank.min && level <= rank.max) || ranks[0]) };
}

/* Obtener nombre del jugador con fallbacks robustos */
function getPlayerName() {
  if (S.name && S.name.trim()) return S.name.trim();
  const auth = loadAuthenticatedIdentity();
  if (auth && auth.username && auth.username.trim()) return auth.username.trim();
  // Direct parse for session (bypasses 4h expiry — stale name > 'Jugador')
  try {
    const sess = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (sess && sess.name && sess.name.trim()) return sess.name.trim();
  } catch(e) {}
  return 'Jugador';
}

function preparePlayerIdentity() {
  if (isLogged()) {
    const auth = loadAuthenticatedIdentity();
    if (!auth?.id || !auth?.username) return false;
    S.logged = true;
    S.id = auth.id;
    S.userId = auth.id;
    S.name = auth.username.trim();
    const input = $('input-name');
    if (input) input.value = S.name;
    return true;
  }

  const name = $('input-name')?.value.trim();
  if (!name) return false;
  S.name = name;
  if (!S.id) S.id = uid();
  return true;
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
  document.body.classList.toggle('game-active', id === 'screen-game');
  // Gestión de música de fondo según la pantalla
  // principal = lobby, auth, join, ranking, profile, portal
  // lobby = sala de espera (screen-room)
  // partida = juego (screen-game)
  startMusicForScreen(id);
  // Actualizar estado de los botones de música/SFX
  updateMusicBtns();
}

// ── Botones de música y SFX ────────────────────────────
function updateMusicBtn() {
  // Delegar a la función unificada de audio.js
  updateMusicBtns();
}

function toggleMusic() {
  ensureAudioContext();
  toggleMusicMute();
}

function toggleSfx() {
  ensureAudioContext();
  toggleSfxMute();
}

let _toastT;
function toast(msg, ms=2800) {
  const el=$('toast');
  // Muchos llamados historicos usan "success", "error" o "info" como
  // segundo argumento. Esos valores no son una duracion valida.
  if (typeof ms !== 'number' || !Number.isFinite(ms)) ms = 2800;
  el.textContent=msg; el.classList.remove('hidden');
  clearTimeout(_toastT);
  _toastT=setTimeout(()=>el.classList.add('hidden'), ms);
}

/* ── Panel de Usuario (Lobby) ────────────────────────── */
function updateUserPanel(name, coins) {
  const topBar = $('user-top-bar');
  if (!topBar) return;
  
  if (isLogged() && name) {
    topBar.classList.remove('hidden');
    $('lobby-username').textContent = name;
    $('lobby-coins').textContent = coins || 0;
    // Mostrar avatar equipado (icono) o inicial si no tiene
    const lobbyAv = $('lobby-avatar');
    if (S.avatarEquipped) {
      lobbyAv.textContent = S.avatarEquipped;
      lobbyAv.classList.add('avatar-icon');
    } else {
      lobbyAv.textContent = getInitial(name);
      lobbyAv.classList.remove('avatar-icon');
    }
    // Marco Premium en avatar del lobby
    lobbyAv?.classList.toggle('avatar-premium', hasSpecial('15'));
    
    $('guest-name-field').classList.add('hidden');
    // Mostrar logout en topbar, ocultar volver al login
    $('btn-logout-topbar')?.classList.remove('hidden');
    $('btn-back-to-auth')?.classList.add('hidden');
    // Mostrar botón de notificaciones
    const notifWrapper = document.querySelector('.notif-wrapper');
    if (notifWrapper) notifWrapper.classList.remove('hidden');
    $('btn-logout')?.classList.add('hidden'); // ocultar el viejo del form
  } else {
    // No logueado: ocultar topbar, mostrar campo nombre
    topBar.classList.add('hidden');
    $('btn-logout-topbar')?.classList.add('hidden');
    const notifWrapper = document.querySelector('.notif-wrapper');
    if (notifWrapper) notifWrapper.classList.add('hidden');
    $('btn-back-to-auth')?.classList.remove('hidden');
    $('guest-name-field').classList.remove('hidden');
  }
}

/* ── Flash puntos ────────────────────────────────────── */
function flashTurnPoints() {
  const el = $('turn-points');
  if (!el) return;
  el.classList.remove('flash-pts');
  void el.offsetWidth;
  el.classList.add('flash-pts');
}

function syncMyScore(match) {
  const me = match?.players?.find(p=>p.id===S.id);
  if (me) $('my-score').textContent = me.score||0;
}

function updateGameRoomCode() {
  const el = $('game-room-code');
  if (el) el.textContent = S.roomCode || '—';
}

/* Resetear el botón de unirse a sala */
function resetJoinBtn() {
  const btn = $('btn-join-confirm');
  if (btn) { btn.disabled = false; btn.textContent = 'Entrar →'; }
}

/* ── Volver al lobby limpio ──────────────────────────── */
function goLobby(msg) {
  _winShown = false;
  _gameOverShown = false;
  _rematchInProgress = false;
  stopTimer();
  clearSession();
  // Limpiar grabación de audio si está activa
  if (_recording && _mediaRecorder?.state === 'recording') {
    try { _mediaRecorder.stop(); } catch(e) {}
  }
  _mediaRecorder = null;
  _audioChunks = [];
  _recording = false;
  const micBtn = $('btn-chat-mic');
  if (micBtn) { micBtn.textContent = '🎤'; micBtn.classList.remove('recording'); }
  clearInterval(_playAgainTimer);
  _playAgainTimer = null;
  S.match    = null;
  S.rematchRoom = null;
  S.roomId   = null;
  S.roomCode = null;
  S.entered  = false;
  S.myTurn   = false;
  S.isOwner  = false;
  $('btn-ready').disabled    = false;
  $('btn-ready').textContent = 'Listo ✓';
  $('btn-ready').classList.remove('hidden');
  $('ready-status')?.classList.add('hidden');
  const cm = $('chat-msgs'); if(cm) cm.innerHTML = '';
  $('modal-win').classList.add('hidden');
  clearDice();
  const hint = $('play-again-hint');
  if (hint) hint.classList.add('hidden');
  if (msg) toast(msg, 2500);
  if(isLogged()){
   showScreen('screen-lobby');
   loadLobbyMissions();
   // Recargar items equipados al volver al lobby (skins, avatares)
   loadEquippedCache();
   loadEquippedItems();
}else{
   showScreen('screen-auth');
}
}

/* ── Ir a sala de revancha ───────────────────────────── */
function goToPlayAgain(room) {
  _rematchInProgress = false; // Resetear para permitir próxima revancha
  clearInterval(_playAgainTimer);
  _playAgainTimer = null;
  $('modal-win').classList.add('hidden');
  const playAgainBtn = $('btn-play-again');
  if (playAgainBtn) {
    playAgainBtn.disabled = false;
    playAgainBtn.textContent = '🎲 Revancha';
  }
  $('ready-status')?.classList.add('hidden');
  const hint = $('play-again-hint');
  if (hint) hint.classList.add('hidden');
  S.roomId   = room.id;
  S.roomCode = room.code;
  S.match    = null;
  S.rematchRoom = null;
  S.entered  = false;
  S.myTurn   = false;
  saveSession();
  $('btn-ready').disabled    = false;
  $('btn-ready').textContent = 'Estoy listo ✓';
  $('btn-ready').classList.remove('hidden'); // Asegurar que el botón sea visible
  const c2 = $('chat-msgs'); if(c2) c2.innerHTML = '';
  clearDice();
  renderRoom(room);
  const amOwner = room.players[0]?.id === S.id;
  const hasOthers = room.players.length > 1;
  S.isOwner = amOwner;
  $('btn-cancel-room').classList.toggle('hidden', !amOwner);
  $('btn-leave-room').classList.toggle('hidden', amOwner && !hasOthers);
  $('btn-leave-room').textContent = amOwner ? 'Salir (delegar dueño)' : 'Salir de la sala';
  // Cargar items equipados al reiniciar partida
  loadEquippedCache();
  loadEquippedItems();
  showScreen('screen-room');
  toast('🎲 ¡Revancha! Marcá listo cuando estés.', 3000);
}

/* ── Modal de confirmación propio (no usar confirm()) ── */
function showConfirm(msg, onYes) {
  const modal = document.createElement('div');
  modal.className = 'confirm-overlay';
  modal.innerHTML = `
    <div class="confirm-box">
      <p class="confirm-msg">${esc(msg)}</p>
      <div class="confirm-btns">
        <button id="confirm-yes" class="btn-danger-solid">Sí, salir</button>
        <button id="confirm-no"  class="btn-ghost-sm">Cancelar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector('#confirm-yes').onclick = () => { modal.remove(); onYes(); };
  modal.querySelector('#confirm-no').onclick  = () => { modal.remove(); };
}

/* ── WebSocket ───────────────────────────────────────── */
let _reconnectTimer = null;
let _pingTimer      = null;
let _allowReconnect = true;
let _wsIdentified = false;
let _connectCallbacks = [];
let _reconnectAttempts = 0;
let _joinAttemptTimer = null;

function clearJoinAttempt() {
  if (_joinAttemptTimer) clearTimeout(_joinAttemptTimer);
  _joinAttemptTimer = null;
  S.joiningRoom = false;
  resetJoinBtn();
}

function scheduleReconnect() {
  if (!_allowReconnect || (!isLogged() && !hasGuestSession())) return;
  if (_reconnectTimer) clearTimeout(_reconnectTimer);
  const delays = [1200, 2200, 4000, 7000, 10000];
  const delay = delays[Math.min(_reconnectAttempts, delays.length - 1)];
  _reconnectAttempts++;
  _reconnectTimer = setTimeout(() => connect(), delay);
}

async function handleAuthenticationClose() {
  const token = localStorage.getItem('gameToken');
  if (!token) {
    if (hasGuestSession()) expireGuestSession();
    return;
  }
  try {
    _authValidationPromise = null;
    const response = await authenticatedFetch('/api/user/balance', { cache: 'no-store' });
    if (response.status === 401 || response.status === 403) {
      return;
    }
  } catch (_) {
    // Una caída de red no debe cerrar una sesión válida.
  }
  scheduleReconnect();
}

function disconnectSocketForIdentityChange() {
  _allowReconnect = false;
  _wsIdentified = false;
  _reconnectAttempts = 0;
  _connectCallbacks = [];
  clearJoinAttempt();
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
  if (_pingTimer)      { clearInterval(_pingTimer);     _pingTimer      = null; }
  const oldSocket = S.ws;
  S.ws = null;
  if (oldSocket && oldSocket.readyState < WebSocket.CLOSING) {
    oldSocket.close(1000, 'identity-change');
  }
}

function connect(cb) {
  _allowReconnect = true;
  // Cancelar cualquier reconexión pendiente
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
  if (_pingTimer)      { clearInterval(_pingTimer);     _pingTimer      = null; }

  // Si ya hay una conexión abierta o conectando, no abrir otra
  if (S.ws?.readyState === WebSocket.OPEN) {
    if (_wsIdentified) cb?.();
    else if (cb) _connectCallbacks.push(cb);
    return;
  }
  if (S.ws?.readyState === WebSocket.CONNECTING) {
    if (cb) _connectCallbacks.push(cb);
    return;
  }
  if (cb) _connectCallbacks.push(cb);
  _wsIdentified = false;

// Protocolo dinámico (si es http pasa a ws, si es https pasa a wss)
  const nativeWsUrl = window.MACKO_WS_URL;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const ws = new WebSocket(nativeWsUrl || `${protocol}//${host}`);
  S.ws = ws;

  S.ws.onopen = () => {
    console.log('WS conectado');
    // Siempre mandar roomId para reconexión automática
    const wsToken = isLogged()
      ? localStorage.getItem('gameToken')
      : localStorage.getItem(GUEST_TOKEN_KEY);
    try {
      ws.send(JSON.stringify({
        type: 'IDENTIFY',
        data: { token:wsToken, playerName:getPlayerName(), roomId:S.roomId }
      }));
    } catch (_) {}

    // Ping cada 25s para mantener viva la conexión
    _pingTimer = setInterval(() => {
      if (S.ws?.readyState === WebSocket.OPEN) {
        try { S.ws.send(JSON.stringify({type:'PING'})); } catch(e){}
      }
    }, 25000);
  };

  S.ws.onmessage = e => {
    try {
      const {type,data}=JSON.parse(e.data);
      if (['IDENTIFIED', 'RECONNECTED', 'RECONNECTED_GAME', 'RECONNECTED_LOBBY'].includes(type)) {
        _wsIdentified = true;
        _reconnectAttempts = 0;
        const callbacks = _connectCallbacks.splice(0);
        callbacks.forEach(fn => { try { fn(); } catch (_) {} });
      }
      if(type!=='PONG') handle(type,data);
    }
    catch(x){ console.error(x); }
  };

  S.ws.onclose = (ev) => {
    if (S.ws !== ws) return;
    console.log('WS cerrado, reconectando...');
    _wsIdentified = false;
    if (_pingTimer) { clearInterval(_pingTimer); _pingTimer = null; }
    if (ev.code === 4003) {
      handleAuthenticationClose();
      return;
    }
    scheduleReconnect();
  };

  S.ws.onerror = () => {};
}

function wsSend(type, data={}) {
  if (S.ws?.readyState === WebSocket.OPEN && (_wsIdentified || type === 'PING')) {
    S.ws.send(JSON.stringify({type,data}));
    return true;
  }
  return false;
}

function withSocketReady(action) {
  if (_wsIdentified && S.ws?.readyState === WebSocket.OPEN) {
    action();
    return;
  }
  connect(action);
}

function leaveCurrentServerContext() {
  withSocketReady(() => wsSend('LEAVE_CONTEXT'));
}

function ensureRealtimeConnection() {
  if (!isLogged() && !hasGuestSession()) return;
  if (S.ws?.readyState !== WebSocket.OPEN || !_wsIdentified) connect();
}

let _lastForegroundSync = 0;
let _foregroundSyncPromise = null;

async function refreshAuthenticatedState(force = false) {
  if (!isLogged() || document.readyState === 'loading') return;
  const now = Date.now();
  if (!force && now - _lastForegroundSync < 8000) return _foregroundSyncPromise;
  if (_foregroundSyncPromise) return _foregroundSyncPromise;
  _lastForegroundSync = now;
  _foregroundSyncPromise = (async () => {
    _authValidationPromise = null;
    const valid = await validateStoredAuthSession();
    if (!valid || !isLogged()) return;
    const auth = loadAuthenticatedIdentity();
    if (auth?.id) {
      S.logged = true;
      S.userId = auth.id;
      S.id = S.id || auth.id;
      S.name = auth.username;
    }
    await Promise.allSettled([
      loadUserBalance(),
      loadEquippedItems(),
      loadLobbyMissions(),
      loadChestStatus(),
      loadServerNotifications()
    ]);
  })().finally(() => { _foregroundSyncPromise = null; });
  return _foregroundSyncPromise;
}

function resumeAppState() {
  ensureRealtimeConnection();
  checkUpdateIndicator();
  _swRegistration?.update().catch(() => {});
  void refreshAuthenticatedState();
}

window.addEventListener('online', () => {
  ensureRealtimeConnection();
  void refreshAuthenticatedState(true);
});
window.addEventListener('pageshow', resumeAppState);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') resumeAppState();
});

function sendGameInvite(targetId, targetName) {
  if (!S.roomId) { toast('No estás en una sala'); return; }
  wsSend('GAME_INVITE', { targetId, roomId: S.roomId, roomCode: S.roomCode });
  toast(`Invitación enviada a ${targetName}`, 'success');
  $('modal-invite')?.classList.add('hidden');
}

/* ════════════════════════════════════════════════════════
   MANEJADOR DE MENSAJES
   ════════════════════════════════════════════════════════ */

// Flags para evitar doble cartel de victoria (WIN + GAME_OVER duplicados)
let _winShown = false;
let _gameOverShown = false;
let _rematchInProgress = false; // Evita doble PLAY_AGAIN
let _pendingInviteAccept = null; // Invitación aceptada pendiente de conexión WS

// Sistema de vidas por timeout (5 vidas, auto-roll al expirar turno)
const MAX_LIVES = 5;
let _playerLives = MAX_LIVES;
let _timeoutCount = 0;

function handle(type, data) {
  switch(type) {

    case 'IDENTIFIED':
      // Si hay invitación pendiente, enviarla ahora que estamos conectados
      if (_pendingInviteAccept) {
        const p = _pendingInviteAccept;
        _pendingInviteAccept = null;
        wsSend('GAME_INVITE_ACCEPT', p);
        toast('Uniéndote a la partida...', 'success');
      }
      // Cargar items equipados desde el servidor ahora que hay conexión WS
      if (isLogged()) {
        loadEquippedItems();
      }
      break;

    /* ── Reconexión ─────────────────────────────────── */
    case 'RECONNECTED':
      S.roomId      = data.match.roomId;
      S.roomCode    = data.room?.code || data.match.roomCode || S.roomCode;
      S.match       = data.match;
      S.entered     = data.match.players.find(p=>p.id===S.id)?.entered || false;
      clearJoinAttempt();
      syncEquippedFromMatch(data.match);
      saveSession();
      showScreen('screen-game');
      renderSB(data.match);
      updateTurnUI(data.match);
      updateGameRoomCode();
      toast('🔄 Reconectado a la partida', 3000);
      sys('Reconectado');
      break;

    case 'RECONNECTED_LOBBY':
      S.roomId      = data.room.id;
      S.roomCode    = data.room.code;
      clearJoinAttempt();
      saveSession();
      renderRoom(data.room);
      showScreen('screen-room');
      toast('🔄 Reconectado a la sala', 3000);
      break;

    case 'PLAYER_RECONNECTED':
      if (data.match) { S.match = data.match; renderSB(data.match); }
      sys(`${data.playerName} volvió a conectarse`);
      break;

    case 'PLAYER_DISCONNECTED':
      sys(`Un jugador se desconectó — esperando reconexión...`);
      break;

    case 'PLAYER_LEFT':
      sys(`Un jugador abandonó la partida`);
      renderSB(data.match || S.match);
      break;

    /* ── Unirse a partida en curso ───────────────────── */
    case 'JOIN_ACTIVE_SUCCESS':
    case 'JOINED_ACTIVE_GAME':
      S.roomId      = data.match.roomId;
      S.roomCode    = data.room?.code || data.match.roomCode || null;
      S.match       = data.match;
      S.entered     = false;
      S.isOwner     = false;
      clearJoinAttempt();
      S.banking     = false;
      syncEquippedFromMatch(data.match);
      saveSession();
      showScreen('screen-game');
      renderSB(data.match);
      updateTurnUI(data.match);
      clearDice();
      updateGameRoomCode();
      toast('🎲 Te uniste a la partida en curso. Necesitás 1000+ para entrar.', 4000);
      sys('Entraste a la partida en curso — necesitás 1000+ para entrar al juego');
      break;

    case 'PLAYER_JOINED_LATE':
    case 'PLAYER_JOINED_GAME':
      S.match = data.match;
      syncEquippedFromMatch(data.match);
      renderSB(data.match);
      sys(`${data.playerName} se unió a la partida`);
      toast(`➕ ${data.playerName} se unió`, 2500);
      break;

    /* ── Sala ────────────────────────────────────────── */
    case 'JOIN_REQUEST_RECEIVED':
      S.joinRequests = [
        ...S.joinRequests.filter(request => request.playerId !== data.playerId),
        { playerId:data.playerId, playerName:data.playerName, expiresAt:Date.now() + (data.expiresIn || 30000) }
      ];
      renderSB(S.match);
      toast(`${data.playerName} solicita entrar a la partida`, 3500);
      break;

    case 'JOIN_REQUEST_RESOLVED':
      S.joinRequests = S.joinRequests.filter(request => request.playerId !== data.playerId);
      renderSB(S.match);
      if (data.accepted) toast('Solicitud aceptada', 2500);
      else if (!data.expired) toast('Solicitud rechazada', 2500);
      break;

    case 'JOIN_REQUEST_SENT':
      toast('Solicitud enviada. El creador tiene 30 segundos para responder.', 4000);
      break;

    case 'JOIN_REQUEST_REJECTED':
      clearJoinAttempt();
      toast(data.message || 'La solicitud fue rechazada', 4000);
      break;

    case 'ROOM_CANCELLED':
      goLobby('La sala fue cancelada');
      break;

    case 'PLAYER_REMOVED':
      // Solo ir al lobby si YO fui removido, no cuando otro jugador se va
      if (data.playerId === S.id) {
        goLobby('Saliste de la sala');
      }
      break;

    case 'LEFT_GAME':
      // El servidor confirmó — el cliente ya fue al lobby inmediatamente
      break;

    case 'ROOM_CREATED':
      S.roomId=data.room.id; S.roomCode=data.room.code;
      S.isOwner = true;
      saveSession();
      renderRoom(data.room);
      showScreen('screen-room');
      $('btn-cancel-room').classList.remove('hidden');
      $('btn-leave-room').classList.add('hidden');
      // Forzar carga de items equipados
      loadEquippedCache();
      loadEquippedItems();
      break;

    case 'JOIN_SUCCESS':
      S.roomId=data.room.id; S.roomCode=data.room.code;
      clearJoinAttempt();
      S.isOwner = false;
      saveSession();
      renderRoom(data.room);
      showScreen('screen-room');
      $('btn-cancel-room').classList.add('hidden');
      $('btn-leave-room').classList.remove('hidden');
      // Forzar carga de items equipados
      loadEquippedCache();
      loadEquippedItems();
      break;

    case 'ROOM_STATE':
      renderRoom(data.room);
      // Forzar carga de items equipados al recibir estado de sala
      if (isLogged()) {
        loadEquippedItems();
      }
      // Actualizar ownership: el primer jugador es el dueño de la sala
      S.isOwner = data.room.players[0]?.id === S.id;
      const hasOthers = data.room.players.length > 1;
      if ($('btn-cancel-room')) {
        // Cancelar sala: solo el dueño cuando hay otros jugadores (o solo)
        $('btn-cancel-room').classList.toggle('hidden', !S.isOwner);
      }
      if ($('btn-leave-room')) {
        // Salir: el dueño también puede dejar la sala sin cancelarla (si hay otros)
        // Si está solo, se esconde para que use Cancelar sala
        $('btn-leave-room').classList.toggle('hidden', S.isOwner && !hasOthers);
        // El texto cambia según el rol
        $('btn-leave-room').textContent = S.isOwner ? 'Salir (delegar dueño)' : 'Salir de la sala';
      }
      break;

    /* ── Countdown para auto-start ────────────────── */
    case 'READY_COUNTDOWN': {
      const cdEl = $('ready-status');
      if (cdEl) {
        if (data.seconds > 0) {
          cdEl.querySelector('.ready-status-text').textContent = '⏳ Iniciando en ' + data.seconds + 's';
          cdEl.classList.remove('hidden');
        } else {
          cdEl.classList.add('hidden');
        }
      }
      break;
    }

    /* ── Inicio de partida ───────────────────────────── */
    case 'GAME_STARTED':
      S.match=data.match; S.entered=false;
      S.banking = false;
      _timeoutCount = 0;
      _playerLives = MAX_LIVES;
      _winShown = false;
      _gameOverShown = false;
      _rematchInProgress = false;
      saveSession();
      showScreen('screen-game');
      $('ready-status')?.classList.add('hidden');
      console.log('🎮 GAME_STARTED players:', data.match?.players?.map(p => ({ name: p.name, dice: p.equippedDice, av: p.equippedAvatar })));
      // Resetear botones al iniciar partida nueva
      $('btn-roll').disabled = false;
      $('btn-bank').disabled = true;
      syncEquippedFromMatch(data.match);
      renderSB(data.match);
      updateTurnUI(data.match);
      clearDice();
      updateGameRoomCode();
      updateGameCoins();
      sys('¡La partida comenzó!');
      SFX.score();
      if (data.firstPlayer?.id === S.id) startTimer(TURN_SECS);
      // Cargar items equipados: primero del cache local (instantáneo), luego API
      loadEquippedCache();
      loadEquippedItems();
      break;

    /* ── Entrada al juego ────────────────────────────── */
    case 'PLAYER_ENTERED':
      S.match=data.match;
      S.banking = false;
      syncEquippedFromMatch(data.match);
      renderSB(data.match);
      showDice(data.dice,'scored');
      setMsg(`Sacó ${data.rollScore} pts → Costo 1000 → Ganaste ${data.gained} pts`, 'good');
      $('turn-points').textContent = '0';
      $('roll-count').textContent  = '— / 3';
      $('bank-pts').textContent    = '';
      $('btn-bank').disabled = true;
      updateTurnUI(data.match);
      if (data.playerId===S.id) {
        S.entered=true;
        stopTimer();
        showEntryBanner(data.gained);
        SFX.enter();
        if (data.canContinue) startTimer(TURN_SECS);
      }
      renderSB(data.match);
      sys(`✅ ${data.playerName} entró al juego — ganó ${data.gained} pts`);
      break;

    case 'ENTRY_FAILED':
      S.match=data.match;
      syncEquippedFromMatch(data.match);
      renderSB(data.match);
      showDice(data.dice,'dead');
      setMsg(
        data.attemptsLeft>0
          ? `Intento ${data.entryAttemptsUsed}/${data.entryAttempts} — Necesitás 1000+`
          : 'Sin intentos — turno perdido',
        'bad'
      );
      if (data.playerId===S.id) {
        SFX.fail();
        $('roll-count').textContent = data.entryAttemptsUsed+' / '+data.entryAttempts;
        toast(data.attemptsLeft>0 ? `Faltan ${data.attemptsLeft} intento(s)` : 'Turno perdido');
        if (data.attemptsLeft>0) startTimer(TURN_SECS);
        else stopTimer();
      }
      updateTurnUI(data.match);
      break;

    /* ── Tiradas ─────────────────────────────────────── */
    case 'ROLL_RESULT':
      S.match=data.match;
      syncEquippedFromMatch(data.match);
      renderSB(data.match);
      showDice(data.dice,'scored');
      setMsg(data.autoBank
        ? `Ganaste ${data.turnPoints} pts — se anotarán ahora...`
        : `Tiro ${data.rollCount}/3 — +${data.rollScore} pts`,
        'good');
      $('turn-points').textContent = data.turnPoints;
      $('roll-count').textContent  = data.rollCount + ' / 3';
      $('bank-pts').textContent    = data.turnPoints>0 ? '+'+data.turnPoints : '';
      if (data.playerId===S.id) {
        flashTurnPoints();
        if (data.autoBank) stopTimer();
        else startTimer(TURN_SECS);
      }
      if (!data.autoBank) {
        updateTurnUI(data.match);
      }
      syncMyScore(data.match);
      if (data.playerId===S.id) playSkinScore();
      break;

    case 'DEAD_ROLL':
      S.match=data.match;
      S.banking=false;
      syncEquippedFromMatch(data.match);
      renderSB(data.match);
      showDice(data.dice,'dead');
      setMsg('¡Sin puntos! Turno perdido 💀','bad');
      updateTurnUI(data.match);
      if (data.playerId===S.id) stopTimer();
      sys(`${data.playerName} tiró muerto 💀`);
      SFX.fail();
      break;

    case 'BUST':
      S.match=data.match;
      S.banking=false;
      syncEquippedFromMatch(data.match);
      renderSB(data.match);
      showDice(data.dice,'dead');
      setMsg('¡Te pasaste de 10.000! 💥','bad');
      updateTurnUI(data.match);
      if (data.playerId===S.id) stopTimer();
      sys(`${data.playerName} se pasó de 10.000 — pierde el turno`);
      if (data.playerId===S.id) { SFX.fail(); toast('💥 ¡Te pasaste! Perdiste los puntos del turno'); }
      break;

    case 'HOT_DICE':
      S.match=data.match;
      S.banking=false;
      syncEquippedFromMatch(data.match);
      renderSB(data.match);
      showDice(data.dice,'all');
      setMsg('🔥 DADOS CALIENTES — Si puntúan todos, seguís; si puntúa parcialmente, suma y termina','hot');
      $('turn-points').textContent = data.turnPoints;
      $('bank-pts').textContent    = data.turnPoints>0 ? '+'+data.turnPoints : '';
      if (data.playerId===S.id) { flashTurnPoints(); startTimer(TURN_SECS); }
      updateTurnUI(data.match);
      syncMyScore(data.match);
      sys(`🔥 ${data.playerName} dados calientes! +${data.rollScore} pts acumulados`);
      playSkinHot();
      break;

    case 'BANKED':
      S.match=data.match;
      S.banking = false;
      syncEquippedFromMatch(data.match);
      renderSB(data.match);
      updateTurnUI(data.match);
      syncMyScore(data.match);
      if (data.auto) setMsg(`Banco automático — +${data.gained} pts anotados ✔`,'good');
      sys(`${data.playerName} anotó ${data.gained} pts → total ${data.totalScore}`);
      if (data.playerId===S.id) {
        stopTimer();
        SFX.bank();
        if (!data.auto) toast(`✔ Anotaste ${data.gained} puntos. Total: ${data.totalScore}`);
      }
      break;

    /* ── Cambio de turno ─────────────────────────────── */
    case 'TURN_START':
      S.match=data.match;
      S.banking = false;
      syncEquippedFromMatch(data.match);
      renderSB(data.match);
      // SIEMPRE resetear el botón tirar al cambiar de turno
      $('btn-roll').disabled = false;
      updateTurnUI(data.match);
      $('turn-points').textContent = '0';
      $('roll-count').textContent  = '— / 3';
      $('bank-pts').textContent    = '';
      // Detectar si es turno de un bot
      const _curPlayer = data.match?.players?.find(p => p.id === data.playerId);
      const _isBotTurn = _curPlayer && _curPlayer.isBot;
      if (data.playerId === S.id) {
        clearDice();
        setMsg('','');
        startTimer(TURN_SECS);
      } else if (_isBotTurn) {
        stopTimer();
        setMsg(`🤖 ${data.playerName} está pensando...`, 'bot');
      } else {
        stopTimer();
        setMsg(`Turno de ${data.playerName}`, '');
      }
      sys(`Turno de ${data.playerName}`);
      break;

    case 'TIMEOUT':
      stopTimer();
      if (data.playerId === S.id) {
        _timeoutCount++;
        _playerLives = Math.max(0, MAX_LIVES - _timeoutCount);
        if (_playerLives <= 0) {
          sys('💀 Te quedaste sin vidas — expulsado de la partida');
          toast('💀 Sin vidas — expulsado', 4000);
          setTimeout(() => goLobby('Expulsado por timeouts'), 1500);
        } else {
          const livesStr = '❤️'.repeat(_playerLives) + '🖤'.repeat(MAX_LIVES - _playerLives);
          sys(`⏰ Timeout — auto-tirando dados (${_playerLives} vidas restantes)`);
          toast(`⏰ Tiempo agotado — ${livesStr}`, 3000);
        }
      } else {
        sys(`⏰ ${data.playerName} tardó demasiado`);
      }
      break;

    case 'TIMEOUT_AUTO_ROLL': {
      stopTimer();
      S.match = data.match;
      renderSB(data.match);
      showDice(data.dice, 'all');
      const resultMsg = {
        dead: '💀 Tirada muerta — timeout',
        bust: '💥 ¡Bust por timeout!',
        scored: `🎲 Auto-tirada: +${data.gained} puntos`,
        win: '🏆 ¡Victoria por timeout!'
      };
      sys(resultMsg[data.result] || '⏰ Auto-tirada por timeout');
      toast(resultMsg[data.result] || '⏰ Auto-tirada', 3000);
      if (data.playerId === S.id) {
        _playerLives = data.lives != null ? data.lives : _playerLives;
        const livesStr = '❤️'.repeat(_playerLives) + '🖤'.repeat(MAX_LIVES - _playerLives);
        toast(`Vidas: ${livesStr}`, 2000);
      }
      // Si fue victoria por timeout, preparar flags para GAME_OVER subsiguiente
      if (data.result === 'win') {
        _winShown = true;
        S.banking = false;
        const winP = S.match?.players?.find(p => p.id === data.playerId);
        showWin(data.playerName || winP?.name || '🏆', '¡Llegó a 10.000 por auto-tirada! 🏆', data.dice, winP?.equippedDice || null, winP?.equippedSpecial || null);
        SFX.win();
      }
      updateTurnUI(data.match);
      break;
    }

    case 'ELIMINATED_TIMEOUT': {
      S.match = data.match;
      renderSB(data.match);
      if (data.playerId === S.id) {
        sys('💀 Te quedaste sin vidas — eliminado');
        toast('💀 Eliminado por timeouts', 4000);
        setTimeout(() => goLobby('Eliminado por timeouts'), 2000);
      } else {
        sys(`💀 ${data.playerName} fue eliminado por timeouts`);
        toast(`💀 ${data.playerName} eliminado`, 3000);
      }
      break;
    }

    /* ── Victorias (con flag para evitar duplicados) ───── */
    case 'INSTANT_WIN': {
      if (_gameOverShown) { break; }
      _winShown = true;
      S.match=data.match;
      S.banking=false;
      syncEquippedFromMatch(data.match);
      renderSB(data.match);
      showDice(data.dice,'all');
      stopTimer();
      const winP = S.match.players.find(p => p.id === data.playerId);
      showWin(data.playerName,'¡Sacó cinco 1s — Victoria instantánea! 🎊',data.dice, winP?.equippedDice || null, winP?.equippedSpecial || null);
      SFX.win();
      break;
    }

    case 'WIN': {
      if (_gameOverShown) { break; }
      _winShown = true;
      S.match=data.match;
      S.banking=false;
      syncEquippedFromMatch(data.match);
      renderSB(data.match);
      showDice(data.dice,'all');
      stopTimer();
      const winP = S.match.players.find(p => p.id === data.playerId);
      showWin(data.playerName,'¡Llegó a 10.000 exactos y ganó! 🏆',data.dice, winP?.equippedDice || null, winP?.equippedSpecial || null);
      SFX.win();
      break;
    }

    case 'GAME_OVER': {
      const victoryAlreadyShown = _winShown || _gameOverShown;
      _gameOverShown = true;
      S.banking = false;
      if (data.match) S.match = data.match;
      if (!data.tournamentMatch && data.room) S.rematchRoom = data.room;
      $('btn-roll').disabled = true;
      stopTimer();
      // Envolver en try/catch para evitar que errores de red arruinen la pantalla de victoria
      try { updateGameCoins(); } catch(e) { console.warn('Error actualizando monedas:', e); }
      try { checkPendingMissions(); } catch(e) { console.warn('Error revisando misiones:', e); }
      if (data.tournamentMatch) {
        S.roomId = null;
        S.roomCode = null;
        clearSession();
        $('btn-play-again')?.classList.add('hidden');
      }
      if (victoryAlreadyShown) break;
      const winnerId = data.winner?.id;
      const winSkin = winnerId && S.match 
        ? (S.match.players.find(p => p.id === winnerId)?.equippedDice || null)
        : null;
      const winSpecial = winnerId && S.match
        ? (S.match.players.find(p => p.id === winnerId)?.equippedSpecial || null)
        : null;
      showWin(
        data.winner?.alias||data.winner?.name||'?',
        `Ganó la partida con ${data.winner?.score} puntos`,
        [],
        winSkin,
        winSpecial
      );
      // Si perdimos contra bots, sonido de game-over
      if (data.winner?.id !== S.id && S.match?.players?.some(p => p.isBot)) {
        playGameOver();
      } else {
        SFX.win();
      }
      break;
    }

    /* ── Revancha ────────────────────────────────────── */
    case 'PLAY_AGAIN': {
      if (!data.room || _rematchInProgress) break;
      _winShown = false;
      _gameOverShown = false;
      S.match = null; S.entered = false; S.myTurn = false;
      stopTimer();
      _rematchInProgress = true;
      goToPlayAgain(data.room);
      break;
    }

    /* ── Chat Global ─────────────────────────────────── */
    case 'GLOBAL_CHAT':
      // Solo agregar si NO es mensaje propio (para evitar duplicados)
      if (data.playerId !== S.id) {
        addPortalChat(data.playerName, data.message);
        SFX.chat();
      }
      break;

    /* ── Chat Privado entre amigos ────────────────────── */
    case 'PRIVATE_CHAT':
      // Mensaje recibido de un amigo
      addPrivateMessage(data.fromId, data.fromName, data.message, false);
      SFX.chat();
      break;

    case 'PRIVATE_CHAT_SENT':
      // Confirmación de mensaje enviado
      addPrivateMessage(_privateChatTarget, _privateChatTargetName, data.message, true);
      break;

    case 'PRIVATE_CHAT_HISTORY':
      // Historial de mensajes con un amigo — mergear con cache local
      if (data.friendId === _privateChatTarget) {
        const serverMsgs = data.messages || [];
        const localMsgs = _privateChatMessages[data.friendId] || [];
        // Merge: keep local messages not in server (sent during disconnect)
        const serverTexts = new Set(serverMsgs.map(m => (m.message||'') + '_' + m.from_id));
        const merged = [...serverMsgs, ...localMsgs.filter(m => !serverTexts.has((m.message||'') + '_' + m.from_id))];
        merged.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
        _privateChatMessages[data.friendId] = merged;
        renderPrivateChat();
      }
      break;

    /* ── Solicitudes de amistad ────────────────────────── */
    case 'FRIEND_REQUEST':
      toast(`👤 ${data.fromName} quiere ser tu amigo`, 5000);
      addNotification(`${data.fromName}`, 'Te envió una solicitud de amistad', 'friend_request', {
        id: 'fr_' + data.fromId,
        actions: [
          { label: 'Aceptar', action: 'accept_friend', style: 'notif-accept' },
          { label: 'Rechazar', action: 'reject_friend', style: 'notif-reject' }
        ],
        notifData: { fromId: data.fromId, fromName: data.fromName }
      });
      break;

    case 'FRIEND_REQUEST_SENT':
      toast('Solicitud de amistad enviada', 'success');
      break;

    case 'FRIEND_ACCEPTED':
      toast(`✅ ${data.byName} aceptó tu solicitud de amistad`, 4000);
      addNotification(`${data.byName}`, 'Aceptó tu solicitud de amistad', 'system');
      loadPortalFriends();
      break;

    case 'FRIEND_ACCEPTED_OK':
      toast('✅ Amigo agregado', 'success');
      loadPortalFriends();
      break;

    case 'FRIEND_REJECTED_OK':
      break;

    /* ── Invitaciones a partida ────────────────────────── */
    case 'GAME_INVITE':
      toast(`🎮 ${data.fromName} te invitó a jugar`, 6000);
      addNotification(`${data.fromName}`, `Te invitó a una partida (${data.playerCount}/${data.maxPlayers} jugadores)`, 'game_invite', {
        id: String(data.inviteId),
        actions: [
          { label: 'Unirse', action: 'accept_invite', style: 'notif-accept' },
          { label: 'Rechazar', action: 'reject_invite', style: 'notif-reject' }
        ],
        notifData: { roomId: data.roomId, roomCode: data.roomCode, inviteId: data.inviteId, fromId: data.fromId }
      });
      break;

    case 'GAME_INVITE_SENT':
      toast('Invitación enviada', 'success');
      break;

    case 'GAME_INVITE_REJECTED':
      toast(`${data.byName} rechazó la invitación`, 'info');
      break;

    /* ── Chat de sala ─────────────────────────────────── */
    case 'CHAT_MESSAGE':
      addChat(data.playerName, data.message, data.equippedSpecial);
      SFX.chat();
      break;

    case 'CHAT_AUDIO':
      if (data.playerId !== S.id) {
        addAudioMsg(data.playerName, data.audioData, data.duration, false);
        SFX.chat();
      }
      break;

    /* ── Ranking ─────────────────────────────────────── */
    case 'RANKING':
      renderRanking(data.ranking);
      break;

    /* ── Error ───────────────────────────────────────── */

    /* ── Torneo: bracket update ─────────────────────── */
    case 'TOURNAMENT_BRACKET_UPDATE':
      if ($('modal-tournament') && !$('modal-tournament').classList.contains('hidden')) {
        loadTournaments();
      }
      toast('🏆 Brackets actualizados', 2000);
      break;

    /* ── Torneo: match listo ────────────────────────── */
    case 'TOURNAMENT_MATCH_READY':
      toast('🔥 Tu match de torneo está listo contra ' + (data.opponent || 'tu rival'), 5000);
      if (!S.roomId && data.roomId) {
        wsSend('TOURNAMENT_JOIN_MATCH', {
          tournamentId: data.tournamentId,
          matchId: data.matchId,
          roomId: data.roomId
        });
      } else if (S.roomId !== data.roomId) {
        addNotification('🏆 Match de torneo listo', 'Salí de tu sala actual para disputar el match.', 'tournament');
      }
      break;

    /* ── Torneo: campeon ────────────────────────────── */
    case 'TOURNAMENT_CHAMPION':
      toast('👑 SOS EL CAMPEON del torneo ' + data.tournamentName + '! Premio: ' + (data.prizePool || 0) + ' monedas!', 6000);
      launchConfetti();
      break;

    /* ── Torneo: completado ─────────────────────────── */
    case 'TOURNAMENT_COMPLETED':
      toast('🏆 Torneo ' + data.tournamentName + ' finalizado!', 4000);
      break;

    /* ── Broadcast del CEO ──────────────────────────── */
    case 'BROADCAST':
      toast('📢 ' + data.message, 6000);
      addNotification('📢 CEO', data.message, 'broadcast');
      break;

    /* ── Notificación de sistema ───────────────────── */
    case 'NOTIFICATION':
      toast((data.icon || '🔔') + ' ' + data.message, 5000);
      addNotification(data.title || 'Notificación', data.message, data.notifType || 'system');
      break;

    case 'ERROR':
      clearJoinAttempt();
      const rematchBtn = $('btn-play-again');
      if (rematchBtn?.disabled) {
        rematchBtn.disabled = false;
        rematchBtn.textContent = '🎲 Revancha';
      }
      toast('⚠ ' + data.message);
      break;
  }
}

/* ── Render sala de espera ───────────────────────────── */
function renderRoom(room) {
  $('room-code-display').textContent = room.code;
  const list = $('players-list');
  list.innerHTML = '';
  room.players.forEach(p => {
    const d = document.createElement('div');
    d.className = 'p-item';
    let avContent = esc(p.name ? p.name.charAt(0).toUpperCase() : '?');
    // Mostrar avatar equipado para TODOS los jugadores (se carga desde BD al unirse)
    avContent = esc(getInitial(p.name));
    if (p.equippedAvatar) {
      avContent = esc(p.equippedAvatar);
    } else if (p.id === S.id && S.avatarEquipped) {
      avContent = esc(S.avatarEquipped);
    }
    // Detectar si es icono personalizado (no solo letra)
    const hasCustomAvatar = avContent.length > 1 && !(/^[A-Z]$/i.test(avContent));
    d.innerHTML = `<div class="p-av${hasCustomAvatar ? ' icon' : ''}">${avContent}</div>
      <span class="p-name">${esc(p.name)}</span>
      <span class="p-tag ${p.ready?'tag-ready':'tag-wait'}">${p.ready?'Listo ✓':'Esperando'}</span>`;
    // Marco Premium: avatar dorado en el jugador que tiene el item equipado
    if (p.equippedSpecial === '15') {
      d.querySelector('.p-av')?.classList.add('avatar-premium');
    }
    list.appendChild(d);
  });

  // El servidor es la fuente de verdad del estado "listo". Esto recupera el
  // boton correctamente al volver de una partida o al reconectarse al lobby.
  const me = room.players.find(p => p.id === S.id);
  const readyBtn = $('btn-ready');
  const readyStatus = $('ready-status');
  if (readyBtn) {
    readyBtn.disabled = false;
    readyBtn.textContent = 'Estoy listo ✓';
    readyBtn.classList.toggle('hidden', !me || !!me.ready);
  }
  if (readyStatus && me?.ready) {
    const text = readyStatus.querySelector('.ready-status-text');
    if (text) text.textContent = '⏳ Esperando...';
    readyStatus.classList.remove('hidden');
  } else if (readyStatus) {
    const text = readyStatus.querySelector('.ready-status-text');
    if (!text || !text.textContent.includes('Iniciando')) readyStatus.classList.add('hidden');
  }
}

/* ── Sincronizar items equipados desde match state ──── */
function syncEquippedFromMatch(match) {
  if (!match || !match.players) return;
  const me = match.players.find(p => p.id === S.id);
  if (!me) return;
  // Solo usar datos del match si NO tenemos valores cargados desde la API
  // (los items del match pueden estar desactualizados si se cambiaron después de unirse)
  if (!S.diceEquipped)    S.diceEquipped    = me.equippedDice || null;
  if (!S.avatarEquipped)  S.avatarEquipped  = me.equippedAvatar || null;
  if (!S.specialsEquipped.length) setEquippedSpecials(me.equippedSpecials, me.equippedSpecial);
  saveEquippedCache();
  // Aplicar efectos especiales INMEDIATAMENTE (sin esperar loadEquippedItems async)
  // Item 17: Tema Oscuro Ultra
  applyUltraDarkTheme(hasSpecial('17'));
  // Item 15: Marco Premium - aplicar en todos los avatares visibles
  applyPremiumMarcoToAll();
  // Item 3: Emotes VIP - mostrar/ocultar picker
  const vips = $('vip-emojis');
  if (vips) vips.classList.toggle('hidden', !hasSpecial('3'));
  // Item 31: +50% Monedas - actualizar badge de boost con tiempo restante
  updateBoostBadge();
}

/* ── Scoreboard ──────────────────────────────────────── */
function renderSB(match) {
  if (!match) return;
  const sb    = $('scoreboard');
  const curId = match.players[match.currentPlayerIndex]?.id;
  sb.innerHTML = '';
  
  // Ordenar por puntaje descendente para que se sepa quién va ganando
  const sortedPlayers = [...match.players].sort((a, b) => (b.score || 0) - (a.score || 0));
  
  sortedPlayers.forEach(p => {
    const isMe  = p.id === S.id;
    const isCur = p.id === curId;
    const chip  = document.createElement('div');
    chip.className = 'sc-chip'
      + (isCur ? ' cur' : '')
      + (p.entered ? ' in' : '')
      + (isMe ? ' me' : '');
    let sub;
    if (!p.entered) {
      sub = p.entryAttemptsUsed>0 ? '⏳ intentando...' : '🔒 sin entrar';
    } else if (isCur && p.turnPoints>0) {
      sub = `🎲 +${p.turnPoints} turno`;
    } else if (isCur && p.isBot) {
      sub = '<span class="bot-thinking">🤔 pensando</span>';
    } else if (p.isBot) {
      sub = '🤖 bot';
    } else {
      sub = '✅ en juego';
    }
    const yoTag = isMe ? '<span class="sc-yo">YO</span>' : '';
    // Mostrar avatar equipado (del match state para todos, o local si es el jugador actual)
    let avContent = esc(getInitial(p.name));
    if (p.equippedAvatar) {
      avContent = esc(p.equippedAvatar);
    } else if (isMe && S.avatarEquipped) {
      avContent = esc(S.avatarEquipped);
    }
    // Determinar si tiene avatar personalizado (icono) o es solo letra
    const hasCustomAvatar = avContent.length > 1 && !(/^[A-Z]$/i.test(avContent));
    // Racha Visible (item 30): mostrar racha de victorias en scoreboard
    let rachaHtml = '';
    const specials = playerSpecials(p);
    if (specials.includes('30') && p.entered) {
      const streakVal = p.winStreak || 0;
      if (streakVal > 0) {
        rachaHtml = `<span class="sc-streak">🔥${streakVal}</span>`;
      }
    }
    const rankMeta = getLevelRankMeta(p.level);
    const progressHtml = p.isBot
      ? '<span class="sc-progress"><span class="sc-rank">🤖 BOT</span></span>'
      : p.isGuest
        ? '<span class="sc-progress"><span class="sc-rank">👤 INVITADO</span></span>'
        : `<span class="sc-progress"><span class="sc-lv">Nivel ${rankMeta.level}</span><span class="sc-rank">${rankMeta.icon} ${rankMeta.title}</span></span>`;
    const specialClasses = specials.length
      ? specials.map(id => ` special-${esc(id)}`).join('')
      : ' special-none';
    chip.innerHTML = `
      <span class="sc-av${hasCustomAvatar ? ' icon' : ''}${specialClasses}${p.isBot ? ' bot-avatar' : ''}">${avContent}</span>
      ${yoTag}
      <span class="sc-nm">${esc(p.name)}</span>
      ${progressHtml}
      <span class="sc-sc">${p.score}</span>
      ${rachaHtml}
      <span class="sc-sb">${sub}</span>`;
    // Marco Premium: avatar dorado en el jugador que tiene el item equipado
    if (specials.includes('15')) {
      const scAv = chip.querySelector('.sc-av');
      if (scAv) scAv.classList.add('avatar-premium');
    }
    sb.appendChild(chip);
  });

  S.joinRequests = S.joinRequests.filter(request => request.expiresAt > Date.now());
  S.joinRequests.forEach(request => {
    const chip = document.createElement('div');
    chip.className = 'sc-chip sc-join-request';
    chip.innerHTML = `
      <span class="sc-av">?</span>
      <span class="sc-nm">${esc(request.playerName)}</span>
      <span class="sc-request-label">Solicita entrar</span>
      <span class="sc-request-actions">
        <button type="button" class="sc-request-accept" aria-label="Aceptar">✓</button>
        <button type="button" class="sc-request-reject" aria-label="Rechazar">✕</button>
      </span>`;
    chip.querySelector('.sc-request-accept').onclick = () => wsSend('RESPOND_JOIN_REQUEST', {
      roomId:S.roomId, requesterId:request.playerId, accept:true
    });
    chip.querySelector('.sc-request-reject').onclick = () => wsSend('RESPOND_JOIN_REQUEST', {
      roomId:S.roomId, requesterId:request.playerId, accept:false
    });
    sb.appendChild(chip);
  });
}

/* ── Update UI turno ─────────────────────────────────── */
/* ── Actualizar monedas en pantalla de juego ────────── */
function updateGameCoins() {
  const token = localStorage.getItem('gameToken');
  if (!token) {
    $('game-coins-display').classList.add('hidden');
    return;
  }
  authenticatedFetch('/api/user/balance')
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (data) {
        $('game-coins-amount').textContent = data.coins || 0;
        $('game-coins-display').classList.remove('hidden');
        $('lobby-coins').textContent = data.coins || 0;
      }
    })
    .catch(() => {});
}

function updateTurnUI(match) {
  if (!match) return;
  S.match = match;
  const cur = match.players[match.currentPlayerIndex];
  const me  = match.players.find(p=>p.id===S.id);
  if (!cur) return;

  S.myTurn = cur.id === S.id;
  if (me) S.entered = me.entered;

  const banner = $('turn-banner');
  if (S.myTurn) {
    if (!me?.entered) {
      const left = (match.entryAttempts||3) - (me?.entryAttemptsUsed||0);
      banner.textContent = `🎲 Tu turno — Necesitás 1000+ para entrar (${left} intento${left!==1?'s':''})`;
    } else {
      banner.textContent = '🎲 Es tu turno — tirá los dados';
    }
    banner.className = 'turn-banner me';
  } else {
    banner.textContent = `Turno de ${cur.name}...`;
    banner.className   = 'turn-banner';
  }

  const az      = $('action-zone');
  const wz      = $('waiting-zone');
  const btnRoll = $('btn-roll');
  const btnBank = $('btn-bank');

  if (S.myTurn && match.status==='playing') {
    az.classList.remove('hidden');
    wz.classList.add('hidden');
    btnRoll.disabled = !!cur.mustStop;
    const canBank = me?.entered && (cur.turnPoints>0) && cur.canContinue && !cur.mustStop && !cur.isHotDiceTurn;
    btnBank.disabled = !canBank;
  } else {
    az.classList.add('hidden');
    wz.classList.remove('hidden');
    $('waiting-text').textContent = `Turno de ${cur.name}...`;
  }

  if (me) {
    $('turn-points').textContent = me.turnPoints || 0;
    $('my-score').textContent    = me.score || 0;
    $('bank-pts').textContent    = me.turnPoints>0 ? '+'+me.turnPoints : '';
    if (!me.entered) {
      $('roll-count').textContent = (me.entryAttemptsUsed||0) + ' / ' + (match.entryAttempts||3);
    } else {
      $('roll-count').textContent = (me.rollCount||0) + ' / 3';
    }
  }
}

/* ── Chat ────────────────────────────────────────────── */
function addChat(name, text, equippedSpecial) {
  const msgs = $('chat-msgs');
  const d    = document.createElement('div');
  d.className = 'cm';
  // Nick Dorado: si el que habla tiene el item especial 28 equipado, su nombre brilla
  const hasNickDorado = String(equippedSpecial || '') === '28';
  const nameStyle = hasNickDorado ? ' style="color:var(--gold2);text-shadow:0 0 8px rgba(212,175,55,.4)"' : '';
  d.innerHTML = `<span class="cn"${nameStyle}>${esc(name)}</span>: ${esc(text)}`;
  msgs.appendChild(d);
  // Limitar DOM: mantener solo últimos 60 mensajes
  while (msgs.children.length > 60) msgs.removeChild(msgs.firstChild);
  msgs.scrollTop = msgs.scrollHeight;
}

function sys(text) {
  const msgs = $('chat-msgs');
  const d    = document.createElement('div');
  d.className = 'cm sys';
  d.textContent = text;
  msgs.appendChild(d);
  msgs.scrollTop = msgs.scrollHeight;
}

function sendChat() {
  const inp = $('chat-input');
  const msg = inp.value.trim();
  if (!msg || !S.roomId) return;
  wsSend('CHAT_MESSAGE', { roomId:S.roomId, playerId:S.id, playerName:S.name, message:msg });
  inp.value = '';
}

/* ── Audio Chat (ephemeral) ──────────────────────────── */
let _mediaRecorder = null;
let _audioChunks   = [];
let _recording     = false;
let _recStartTime  = 0;

function toggleRecording() {
  const micBtn = $('btn-chat-mic');
  if (!micBtn) return;
  
  if (_recording) {
    // Detener grabación
    _mediaRecorder?.stop();
    _recording = false;
    micBtn.textContent = '🎤';
    micBtn.classList.remove('recording');
    return;
  }
  
  // Iniciar grabación
  if (!navigator.mediaDevices?.getUserMedia) {
    toast('Tu navegador no soporta grabación de audio');
    return;
  }
  
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      _audioChunks = [];
      _mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
          ? 'audio/webm;codecs=opus' : 'audio/webm'
      });
      
      _mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) _audioChunks.push(e.data);
      };
      
      _mediaRecorder.onstop = () => {
        // Liberar el stream del micrófono
        stream.getTracks().forEach(t => t.stop());
        
        const blob = new Blob(_audioChunks, { type: _mediaRecorder.mimeType });
        if (blob.size < 100) return; // Muy corto, ignorar
        
        // Convertir a base64 y enviar
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result.split(',')[1];
          const duration = Math.round((Date.now() - _recStartTime) / 1000);
          wsSend('CHAT_AUDIO', {
            roomId: S.roomId,
            playerId: S.id,
            playerName: S.name,
            audioData: base64,
            duration
          });
          // Mostrar en el chat local
          addAudioMsg(S.name, base64, duration, true);
          SFX.chat();
        };
        reader.readAsDataURL(blob);
      };
      
      _mediaRecorder.onerror = () => {
        toast('Error al grabar audio');
        micBtn.textContent = '🎤';
        micBtn.classList.remove('recording');
      };
      
      _recStartTime = Date.now();
      _recording = true;
      _mediaRecorder.start(100); // fragmentos cada 100ms
      micBtn.textContent = '🔴';
      micBtn.classList.add('recording');
      
      // Auto-stop a los 15s
      setTimeout(() => {
        if (_recording) toggleRecording();
      }, 15000);
    })
    .catch(() => {
      toast('Permití el micrófono para grabar audio');
    });
}

function addAudioMsg(name, audioBase64, duration, isMine) {
  const msgs = $('chat-msgs');
  const d = document.createElement('div');
  d.className = 'cm audio-msg' + (isMine ? ' mine' : '');
  
  // Verificar soporte de audio webm en este navegador
  const canPlay = document.createElement('audio').canPlayType('audio/webm;codecs=opus');
  const audioSrc = `data:audio/webm;base64,${audioBase64}`;
  
  const safeDuration = Number.isFinite(Number(duration)) ? Math.max(0, Math.min(30, Math.round(Number(duration)))) : 0;
  d.innerHTML = `
    <span class="cn">${esc(name)}</span>
    <span class="audio-player">
      <button class="audio-play-btn">▶</button>
      <span class="audio-duration">${safeDuration}s</span>
      <span class="audio-wave">🎤</span>
      ${!canPlay ? '<span class="audio-note">📱</span>' : ''}
    </span>
  `;
  msgs.appendChild(d);
  msgs.scrollTop = msgs.scrollHeight;
  
  // Handler para reproducir
  const playBtn = d.querySelector('.audio-play-btn');
  if (playBtn) {
    let audioEl = null;
    playBtn.onclick = () => {
      if (!canPlay) { toast('Audio no disponible en este navegador'); return; }
      if (audioEl && !audioEl.paused) {
        audioEl.pause();
        audioEl.currentTime = 0;
        playBtn.textContent = '▶';
        return;
      }
      audioEl = new Audio(audioSrc);
      audioEl.onended = () => { playBtn.textContent = '▶'; };
      audioEl.onerror = () => { playBtn.textContent = '⚠'; };
      audioEl.play().catch(() => { playBtn.textContent = '⚠'; });
      playBtn.textContent = '⏹';
    };
  }
}

/* ── PORTAL: Amigos, Partidas, Chat Global, Misiones ── */
async function loadPortalData() {
  loadPortalGames();
}

async function loadPortalFriends() {
  const token = localStorage.getItem('gameToken');
  if (!token) return;
  const list = $('portal-friends-list');
  if (!list) return;
  try {
    const res = await fetch('/api/friends', { headers: { 'Authorization': `Bearer ${token}` } });
    if (!res.ok) { list.innerHTML = '<p class="portal-empty">Error al cargar</p>'; return; }
    const { friends } = await res.json();
    if (!friends?.length) {
      list.innerHTML = '<p class="portal-empty">Sin amigos aún. Buscalos por nombre 🔍</p>';
      return;
    }
    list.innerHTML = friends.map(f => {
      const isOnline = f.is_online || false;
      let statusHtml;
      if (isOnline) {
        statusHtml = '<span class="friend-online-tag">Conectado</span>';
      } else if (f.hide_last_seen) {
        statusHtml = '<span class="friend-offline-tag">Desconectado</span>';
      } else if (f.last_seen > 0) {
        statusHtml = `<span class="friend-offline-tag">${formatTimeAgo(f.last_seen)}</span>`;
      } else {
        statusHtml = '<span class="friend-offline-tag">Sin conexión</span>';
      }
      return `
      <div class="portal-friend-item">
        <span class="portal-friend-status ${isOnline ? 'online' : 'offline'}"></span>
        <span class="portal-friend-av">${f.equipped_avatar ? esc(f.equipped_avatar) : '👤'}</span>
        <span class="portal-friend-name">${esc(f.alias || f.name)}</span>
        <span class="portal-friend-stats">${statusHtml}</span>
        <button class="portal-friend-msg" data-id="${esc(f.id)}" data-name="${esc(f.alias || f.name)}" title="Enviar mensaje">💬</button>
        <button class="portal-friend-remove" data-id="${esc(f.id)}" title="Eliminar amigo">✕</button>
      </div>
    `}).join('');
    list.querySelectorAll('.portal-friend-remove').forEach(btn => {
      btn.onclick = async () => {
        await fetch('/api/friends/remove', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ friendId: btn.dataset.id })
        });
        loadPortalFriends();
        toast('🚫 Amigo eliminado');
      };
    });
    // Botón para iniciar chat privado con amigo
    list.querySelectorAll('.portal-friend-msg').forEach(btn => {
      btn.onclick = () => {
        openPrivateChat(btn.dataset.id, btn.dataset.name);
      };
    });
  } catch(e) {
    list.innerHTML = '<p class="portal-empty">Error al cargar</p>';
  }
}

function formatTimeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

let _privateChatTarget = null;
let _privateChatTargetName = '';
let _privateChatMessages = {}; // friendId -> [{from_id, message, created_at}]

function openPrivateChat(friendId, friendName) {
  _privateChatTarget = friendId;
  _privateChatTargetName = friendName;
  // Inicializar array si no existe
  if (!Array.isArray(_privateChatMessages[friendId])) _privateChatMessages[friendId] = [];
  // Cambiar a la pestaña de amigos
  document.querySelectorAll('.portal-chat-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.portal-chat-tab[data-portal-tab="friends"]')?.classList.add('active');
  document.querySelectorAll('.portal-chat-pane').forEach(p => p.style.display = 'none');
  const friendsPane = $('portal-chat-friends');
  if (friendsPane) friendsPane.style.display = 'flex';
  // Habilitar input
  const inp = $('portal-chat-friends-input');
  const sendBtn = $('portal-chat-friends-send');
  if (inp) { inp.disabled = false; inp.placeholder = `Mensaje para ${friendName}...`; inp.focus(); }
  if (sendBtn) sendBtn.disabled = false;
  // Cargar historial del backend (puede tener mensajes cacheados localmente)
  renderPrivateChat();
  wsSend('GET_PRIVATE_CHAT', { friendId: _privateChatTarget });
}

function renderPrivateChat() {
  const msgs = $('portal-chat-friends-msgs');
  if (!msgs) return;
  if (!_privateChatTarget) {
    msgs.innerHTML = '<p class="portal-empty" style="padding:20px;font-size:11px">Seleccioná un amigo para chatear</p>';
    return;
  }
  const chatMsgs = _privateChatMessages[_privateChatTarget] || [];
  if (!chatMsgs.length) {
    msgs.innerHTML = `<p class="portal-empty" style="padding:20px;font-size:11px">Chat con ${esc(_privateChatTargetName)} — sin mensajes aún</p>`;
    return;
  }
  msgs.innerHTML = chatMsgs.map(m => {
    const isMine = m.from_id === S.id;
    const name = isMine ? 'Yo' : esc(_privateChatTargetName);
    const msgText = m.message || m.msg || '';
    return `<div class="cm${isMine ? ' mine' : ''}"><span class="cn">${name}</span>: ${esc(msgText)}</div>`;
  }).join('');
  msgs.scrollTop = msgs.scrollHeight;
}

function sendPrivateChat() {
  const inp = $('portal-chat-friends-input');
  const msg = inp.value.trim();
  if (!msg || !_privateChatTarget) return;
  // Enviar via WebSocket al servidor
  wsSend('PRIVATE_CHAT', { playerId: S.id, playerName: S.name, toId: _privateChatTarget, message: msg });
  inp.value = '';
  // Mostrar instantáneo en el frontend (sin esperar confirmación)
  addPrivateMessage(_privateChatTarget, _privateChatTargetName, msg, true);
  SFX.chat();
}

function addPrivateMessage(fromId, fromName, text, isMine) {
  const targetId = isMine ? _privateChatTarget : fromId;
  if (!targetId) return;
  // Inicializar array si no existe
  if (!Array.isArray(_privateChatMessages[targetId])) _privateChatMessages[targetId] = [];
  _privateChatMessages[targetId].push({
    from_id: isMine ? S.id : fromId,
    message: text,
    created_at: Date.now()
  });
  if (_privateChatMessages[targetId].length > 100) _privateChatMessages[targetId].shift();
  // Si estamos en la conversación correcta, renderizar
  if (_privateChatTarget === fromId || (isMine && _privateChatTarget)) {
    renderPrivateChat();
  }
}

async function searchPortalPlayers(query) {
  const token = localStorage.getItem('gameToken');
  if (!token) return;
  const results = $('portal-search-results');
  try {
    const res = await fetch(`/api/friends/search?q=${encodeURIComponent(query)}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const { players } = await res.json();
    if (!players?.length) {
      results.innerHTML = '<p class="portal-search-none">Sin resultados</p>';
      return;
    }
    results.innerHTML = players.map(p => `
      <div class="portal-search-item">
        <span class="portal-friend-av">${p.equipped_avatar ? esc(p.equipped_avatar) : '👤'}</span>
        <span>${esc(p.alias || p.name)}</span>
        <button class="portal-add-btn" data-id="${esc(p.id)}">+ Agregar</button>
      </div>
    `).join('');
    results.querySelectorAll('.portal-add-btn').forEach(btn => {
      btn.onclick = async () => {
        try {
          const r = await fetch('/api/friends/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ friendId: btn.dataset.id })
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error);
          toast('✅ Amigo agregado');
          btn.textContent = '✔';
          btn.disabled = true;
          loadPortalFriends();
        } catch(err) {
          toast('⚠ ' + err.message);
        }
      };
    });
  } catch(e) {}
}

async function loadPortalGames() {
  const token = localStorage.getItem('gameToken');
  if (!token) return;
  const list = $('portal-games-list');
  const title = $('portal-games-count-title');
  if (!list) return;
  try {
    const res = await fetch('/api/games/active', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) { list.innerHTML = '<p class="portal-empty">Error</p>'; return; }
    const { games } = await res.json();
    const count = games?.length || 0;
    if (title) title.textContent = `🎲 Partidas activas: ${count}`;
    if (!count) {
      list.innerHTML = '<p class="portal-empty">No hay partidas activas ahora</p>';
      return;
    }
    list.innerHTML = games.map(g => `
      <div class="portal-game-item${g.private ? ' is-private' : ''}">
        <div class="portal-game-info">
          <span class="portal-game-code">${g.private ? '🔒 Privada' : `Sala ${esc(g.code)}`}</span>
          <span class="portal-game-players">${g.playerCount}/${g.maxPlayers} 👥${g.isBotGame ? ' · 🤖 Bots' : ''}</span>
          <span class="portal-game-names">${(g.players || []).map(player => esc(player.name)).join(', ')}</span>
        </div>
        <button class="portal-game-join" data-room-id="${esc(g.roomId)}" data-private="${g.private ? 'true' : 'false'}">
          Unirse
        </button>
      </div>
    `).join('');
    list.querySelectorAll('.portal-game-join').forEach(button => {
      button.onclick = () => {
        if (!preparePlayerIdentity()) {
          toast('Ingresá con tu usuario o como invitado');
          return;
        }
        button.disabled = true;
        button.textContent = 'Entrando...';
        withSocketReady(() => wsSend('REQUEST_JOIN_ACTIVE', {
          roomId:button.dataset.roomId,
          playerName:getPlayerName()
        }));
        setTimeout(() => {
          if (button.isConnected) {
            button.disabled = false;
            button.textContent = 'Unirse';
          }
        }, 10000);
      };
    });
  } catch(e) {
    list.innerHTML = '<p class="portal-empty">Error al cargar</p>';
  }
}

/* ── Cargar torneos disponibles para el jugador ──────────── */
let _tournamentCache = [];

async function loadTournaments() {
  const token = localStorage.getItem('gameToken');
  if (!token) return;
  const list = $('tournament-list');
  if (!list) return;
  try {
    // Primero intentar cache
    if (_tournamentCache.length) {
      renderTournaments(_tournamentCache);
    }
    const res = await fetch('/api/tournaments', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      if (!_tournamentCache.length) {
        list.innerHTML = '<p style="text-align:center;padding:20px;color:var(--text3);font-size:13px">Sin torneos activos</p>';
      }
      return;
    }
    const data = await res.json();
    const tournaments = data.tournaments || [];
    _tournamentCache = tournaments;
    renderTournaments(tournaments);
  } catch(e) {
    if (!_tournamentCache.length) {
      list.innerHTML = '<p style="text-align:center;padding:20px;color:var(--text3);font-size:13px">Error al cargar torneos</p>';
    }
  }
}

function renderTournaments(tournaments) {
  const list = $('tournament-list');
  if (!list) return;
  if (!tournaments.length) {
    list.innerHTML = '<div class="tournament-empty">🏆<strong>No hay torneos ahora</strong><span>El próximo aparecerá acá cuando abra la inscripción.</span></div>';
    return;
  }
  const now = Date.now();
  const active = tournaments.filter(t => t.status === 'registration' || t.status === 'active');
  const recent = tournaments.filter(t => t.status === 'completed' || t.status === 'cancelled');
  const renderCard = t => {
    const statusLabels = { registration: 'Inscripción', active: 'En juego', completed: 'Finalizado', cancelled: 'Cancelado' };
    const statusIcon = t.status === 'active' ? '⚔️' : t.status === 'registration' ? '📝' : t.status === 'completed' ? '🏆' : '✕';
    const feeText = parseInt(t.fee) > 0 ? `Fee: ${formatNum(parseInt(t.fee))} 🪙` : 'Gratis';
    const prizeText = parseInt(t.prize_pool) > 0 ? `Premios: ${formatNum(parseInt(t.prize_pool))} 🪙` : '';
    const startTime = t.start_time ? new Date(Number(t.start_time)) : null;
    const startTimeStr = startTime && !isNaN(startTime.getTime()) ? startTime.toLocaleString('es-AR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';
    const count = parseInt(t.registered_count || 0);
    const maxPlayers = parseInt(t.max_players || 0);
    const registrationCloses = Number(t.registration_until || t.start_time);
    const canRegister = t.status === 'registration' && registrationCloses > now && count < maxPlayers;
    const isRegistered = !!t.is_registered;
    const endedAt = Number(t.completed_at || t.cancelled_at || 0);
    const endedText = endedAt ? new Date(endedAt).toLocaleString('es-AR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';
    return `<article class="tournament-card ${esc(t.status)}" data-tournament-id="${esc(t.id)}" onclick="showTournamentBracket(this.dataset.tournamentId)">
      <div class="tc-header">
        <div class="tc-name">${statusIcon} ${esc(t.name)}</div>
        <span class="tc-status ${esc(t.status)}">${statusLabels[t.status] || esc(t.status)}</span>
      </div>
      ${t.description ? `<p class="tc-desc">${esc(t.description)}</p>` : ''}
      <div class="tc-details">
        <span>👥 ${count}/${maxPlayers}</span><span>${feeText}</span>${prizeText ? `<span>${prizeText}</span>` : ''}
        ${t.status === 'active' ? `<span>Ronda ${t.current_round || 1}/${t.rounds || '?'}</span>` : ''}
      </div>
      <div class="tc-time">${endedText ? `Terminó: ${endedText}` : startTimeStr ? `Empieza: ${startTimeStr}` : ''}${t.status === 'registration' && !canRegister && count >= maxPlayers ? ' · Cupos completos' : ''}</div>
      <div class="tc-actions">
        <button class="btn btn-ghost" data-tournament-id="${esc(t.id)}" onclick="event.stopPropagation();showTournamentParticipantsModal(this.dataset.tournamentId)">👥 Participantes</button>
        ${canRegister && !isRegistered ? `<button class="btn btn-gold" data-tournament-id="${esc(t.id)}" onclick="event.stopPropagation();registerTournament(this.dataset.tournamentId)">Inscribirme</button>` : ''}
        ${canRegister && isRegistered ? `<button class="btn btn-ghost tc-unregister" data-tournament-id="${esc(t.id)}" onclick="event.stopPropagation();unregisterTournament(this.dataset.tournamentId)">Salir</button><span class="tc-registered">✓ Inscripto</span>` : ''}
        ${t.status !== 'registration' ? `<button class="btn btn-ghost" data-tournament-id="${esc(t.id)}" onclick="event.stopPropagation();showTournamentBracket(this.dataset.tournamentId)">Ver bracket</button>` : ''}
      </div>
    </article>`;
  };
  list.innerHTML = `${active.length ? `<div class="tournament-section-title">Disponibles</div>${active.map(renderCard).join('')}` : ''}${recent.length ? `<div class="tournament-section-title recent">Resultados recientes · visibles 24 h</div>${recent.map(renderCard).join('')}` : ''}`;
}

async function registerTournament(tournamentId) {
  const token = localStorage.getItem('gameToken');
  if (!token) { toast('Debés iniciar sesión'); return; }
  try {
    const res = await fetch('/api/tournaments/' + tournamentId + '/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    toast('✅ Te inscribiste al torneo!', 'success');
    _tournamentCache = [];
    loadTournaments();
    loadUserBalance();
    loadNextTournament();
  } catch(err) {
    toast('⚠ ' + err.message);
  }
}

async function unregisterTournament(tournamentId) {
  const token = localStorage.getItem('gameToken');
  if (!token) { toast('Debés iniciar sesión'); return; }
  // Confirmar antes de cancelar
  if (!confirm('¿Cancelar tu inscripción al torneo? Perdés tu lugar.')) return;
  try {
    const res = await fetch('/api/tournaments/' + tournamentId + '/unregister', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    toast('❌ Cancelaste tu inscripción al torneo', 'info');
    _tournamentCache = [];
    loadTournaments();
    loadNextTournament();
  } catch(err) {
    toast('⚠ ' + err.message);
  }
}



async function showTournamentParticipantsModal(tournamentId) {
  const token = localStorage.getItem('gameToken');
  if (!token) { toast('Debés iniciar sesión'); return; }
  const tournamentName = _tournamentCache.find(t => String(t.id) === String(tournamentId))?.name || 'Participantes';
  try {
    const res = await fetch('/api/tournaments/' + tournamentId + '/participants', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Error');
    const data = await res.json();
    const participants = data.participants || [];
    
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    
    const modal = document.createElement('div');
    modal.style.cssText = 'background:var(--bg-card2);border:1px solid var(--border2);border-radius:12px;max-width:500px;width:100%;max-height:80vh;overflow-y:auto;padding:20px;';
    
    modal.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div style="font-size:16px;font-weight:700;color:var(--text)">👥 ${esc(tournamentName)}</div>
        <button class="btn-ghost-sm" style="font-size:18px;width:32px;height:32px;padding:0;line-height:1" onclick="this.closest('.modal-overlay').remove()">✕</button>
      </div>
      ${participants.length === 0 ? '<p style="color:var(--text3);text-align:center;padding:20px;font-size:13px">Sin participantes aún</p>' : `
        <div style="font-size:11px;color:var(--text3);margin-bottom:10px">${participants.length} inscripto${participants.length !== 1 ? 's' : ''}</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${participants.map(p => {
            const avHtml = p.equipped_avatar ? esc(p.equipped_avatar) : '👤';
            const isChamp = p.final_position === 1;
            const isSecond = p.final_position === 2;
            return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:${isChamp ? 'rgba(212,175,55,.08)' : isSecond ? 'rgba(200,200,200,.05)' : 'rgba(255,255,255,.02)'};border-radius:8px;border:1px solid ${isChamp ? 'var(--gold)' : isSecond ? 'rgba(200,200,200,.12)' : 'transparent'};">
              <span style="font-size:20px">${avHtml}</span>
              <div style="flex:1">
                <div style="font-size:13px;font-weight:600;color:var(--text)">${esc(p.player_name)} ${isChamp ? '👑' : ''}${isSecond ? '🥈' : ''}</div>
                ${p.seed ? `<div style="font-size:10px;color:var(--text3)">Seed #${p.seed}</div>` : ''}
              </div>
              ${p.eliminated_round ? `<span style="font-size:10px;color:var(--red);padding:2px 6px;background:rgba(255,80,80,.1);border-radius:4px">Elim. ronda ${p.eliminated_round}</span>` : (isChamp ? '<span style="font-size:10px;color:var(--gold);padding:2px 6px;background:rgba(212,175,55,.1);border-radius:4px">🏆 Campeón</span>' : (p.final_position ? '<span style="font-size:10px;color:var(--text2);padding:2px 6px;background:rgba(255,255,255,.04);border-radius:4px">Finalista</span>' : '<span style="font-size:10px;color:var(--green);padding:2px 6px;background:rgba(80,200,120,.1);border-radius:4px">Activo</span>'))}
            </div>`;
          }).join('')}
        </div>
      `}
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  } catch(e) {
    toast('⚠ Error al cargar participantes');
  }
}

async function showTournamentBracket(tournamentId) {
  const token = localStorage.getItem('gameToken');
  if (!token) { toast('Debés iniciar sesión'); return; }
  try {
    const res = await fetch('/api/tournaments/' + tournamentId + '/bracket', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Error al cargar bracket');
    const data = await res.json();
    const t = data.tournament || {};
    const participants = data.participants || [];
    const rounds = data.rounds || [];
    
    $('tb-name').textContent = '🏆 ' + (t.name || '');
    $('tb-info').textContent = `${participants.length} jugadores · Premios: ${formatNum(parseInt(t.prize_pool)||0)} 🪙`;
    $('tournament-bracket-view').classList.remove('hidden');
    $('tournament-list').classList.add('hidden');
    
    
    // ── Mostrar participantes en el bracket ──
    const bracketEl = $('tournament-bracket');
    $('tb-participants')?.remove();
    const pSection = document.createElement('div');
    pSection.id = 'tb-participants';
    pSection.style.cssText = 'margin:8px 0 12px 0;padding:10px 12px;background:rgba(255,255,255,.02);border-radius:8px;border:1px solid rgba(255,255,255,.04);';
    pSection.innerHTML = `
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;display:flex;justify-content:space-between">
        <span>👥 Participantes (${participants.length})</span>
        <span style="font-size:10px;color:var(--text3)">${participants.length} jugador${participants.length !== 1 ? 'es' : ''}</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${participants.map(p => {
          const avHtml = p.equipped_avatar ? esc(p.equipped_avatar) : '👤';
          return `<div style="display:flex;align-items:center;gap:5px;padding:4px 10px;background:rgba(255,255,255,.04);border-radius:20px;font-size:11px;border:1px solid rgba(255,255,255,.04)">
            <span style="font-size:15px">${avHtml}</span>
            <span style="color:var(--text);font-weight:500">${esc(p.player_name)}</span>
            ${p.seed ? `<span style="font-size:9px;color:var(--text3);padding:0 4px">#${p.seed}</span>` : ''}
            ${p.final_position === 1 ? '<span style="font-size:11px;margin-left:2px">👑</span>' : ''}
            ${p.final_position === 2 ? '<span style="font-size:11px;margin-left:2px">🥈</span>' : ''}
          </div>`;
        }).join('')}
      </div>
    `;
    bracketEl.parentNode.insertBefore(pSection, bracketEl);
    

    if (!rounds.length) {
      bracketEl.innerHTML = '<p style="color:var(--text3);font-size:12px;text-align:center;padding:20px">Bracket no disponible aún</p>';
      return;
    }
    
    bracketEl.innerHTML = rounds.map(round => {
      return `<div class="tb-round">
        <div class="tb-round-title">Ronda ${round.round}</div>
        ${(round.matches || []).map(m => {
          const isCompleted = m.status === 'completed';
          const isBye = !m.player1_id || !m.player2_id;
          return `<div class="tb-match ${isCompleted ? 'completed' : 'live'}">
            <div class="tb-match-pair">
              <div class="tb-player ${m.winner_id === m.player1_id ? 'winner' : isCompleted ? 'loser' : ''}"><span>${esc(m.player1_name || 'BYE')}</span><span class="tb-player-score">${isCompleted ? Number(m.player1_score || 0) : ''}</span></div>
              <div class="tb-player ${m.winner_id === m.player2_id ? 'winner' : isCompleted ? 'loser' : ''}"><span>${esc(m.player2_name || 'BYE')}</span><span class="tb-player-score">${isCompleted ? Number(m.player2_score || 0) : ''}</span></div>
            </div>
            <div class="tb-match-room">${isCompleted ? '✓ Finalizado' : (isBye ? 'Pase libre' : m.room_code ? `Sala ${esc(m.room_code)}` : 'Esperando')}</div>
          </div>`;
        }).join('')}
      </div>`;
    }).join('');
  } catch(e) {
    toast('⚠ Error al cargar bracket: ' + e.message);
  }
}

// Back button from bracket view
$('tb-back').onclick = () => {
  $('tournament-bracket-view').classList.add('hidden');
  $('tournament-list').classList.remove('hidden');
};

// ── Mostrar banner del próximo torneo programado ────────────
let _nextTourneyInterval = null;

async function loadNextTournament() {
  const token = localStorage.getItem('gameToken');
  if (!token) return;
  const banner = $('next-tournament-banner');
  if (!banner) return;
  try {
    const res = await fetch('/api/tournaments/next', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) { banner.classList.add('hidden'); return; }
    const data = await res.json();
    if (!data.next) {
      banner.classList.add('hidden');
      return;
    }
    const t = data.next;
    const now = Date.now();
    const startsIn = parseInt(t.start_time) - now;
    const regUntil = parseInt(t.registration_until) || 0;
    const regEndsIn = regUntil > 0 ? regUntil - now : 0;
    
    if (startsIn <= 0) { banner.classList.add('hidden'); return; }
    
    banner.classList.remove('hidden');
    const hours = Math.floor(startsIn / 3600000);
    const mins = Math.floor((startsIn % 3600000) / 60000);
    const secs = Math.floor((startsIn % 60000) / 1000);
    const regHours = Math.floor(regEndsIn / 3600000);
    const regMins = Math.floor((regEndsIn % 3600000) / 60000);
    const regStr = regEndsIn > 0 ? `· Inscripción cierra en ${regHours}h ${regMins}m` : '';
    
    banner.innerHTML = `
      <div class="next-tourney-inner" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span style="font-size:16px">⏰</span>
        <span style="font-weight:600;font-size:13px">${esc(t.name)}</span>
        <span style="color:var(--gold);font-size:12px;font-family:'Cinzel',serif">
          ⏳ ${hours}h ${mins}m ${secs}s
        </span>
        <span style="color:var(--text3);font-size:11px">${regStr}</span>
        <span style="font-size:11px;color:var(--text2)">${parseInt(t.registered_count||0)}/${t.max_players} jugadores</span>
        <button class="btn btn-gold" style="padding:4px 12px;font-size:11px;width:auto;margin-left:auto" 
          onclick="showScreen('screen-lobby');document.querySelector('.ceo-tab[data-tab=\'tournaments\']')?.click();$('btn-tournaments')?.click();">
          Ver torneo
        </button>
      </div>
    `;
  } catch(e) {
    banner.classList.add('hidden');
  }
}

function startNextTournamentTimer() {
  loadNextTournament();
  if (_nextTourneyInterval) clearInterval(_nextTourneyInterval);
  _nextTourneyInterval = setInterval(loadNextTournament, 30000);
}

function stopNextTournamentTimer() {
  if (_nextTourneyInterval) {
    clearInterval(_nextTourneyInterval);
    _nextTourneyInterval = null;
  }
}


/* ── Cargar misiones diarias en el lobby (vista principal) ── */
async function loadLobbyMissions() {
  const token = localStorage.getItem('gameToken');
  if (!token) { 
    $('btn-missions-mobile')?.classList.add('hidden');
    $('lobby-missions-desktop')?.classList.add('hidden');
    return;
  }
  const desktopList = $('lobby-missions-list-desktop');
  $('btn-missions-mobile')?.classList.remove('hidden');
  $('lobby-missions-desktop')?.classList.remove('hidden');
  if (desktopList) desktopList.innerHTML = '<div class="lobby-missions-state">Cargando misiones...</div>';
  try {
    const res = await authenticatedFetch('/api/user/missions');
    if (!res.ok) throw new Error('No se pudieron cargar las misiones');
    const { missions } = await res.json();
    const dailies = (Array.isArray(missions) ? missions : []).filter(m => m.type === 'daily');
    if (!dailies.length) { 
      $('lobby-missions-desktop')?.classList.add('hidden');
      return;
    }
    
    const html = dailies.map(m => {
      const pct = m.req > 0 ? Math.round((m.progress / m.req) * 100) : 0;
      const done = m.completed === 1;
      const claimed = m.claimed === 1;
      return `<div class="lobby-mission${done ? ' done' : ''}">
        <span class="lm-icon">${done ? (claimed ? '✅' : '🎯') : '📅'}</span>
        <span class="lm-name">${esc(m.name)}</span>
        <div class="lm-bar"><div class="lm-fill" style="width:${Math.min(pct,100)}%"></div></div>
        <span class="lm-pct">${m.progress}/${m.req}</span>
        ${claimed ? '<span class="lm-check">✔</span>'
          : done ? `<button class="lm-claim" data-mid="${esc(m.id)}">Cobrar</button>`
          : `<span class="lm-reward">+${Number(m.coins) || 0}</span>`}
      </div>`;
    }).join('') + '<button class="missions-view-all" type="button">Ver todas las misiones →</button>';
    
    for (const list of [desktopList]) {
      if (!list) continue;
      list.innerHTML = html;
      list.querySelector('.missions-view-all')?.addEventListener('click', openMissionTab);
      list.querySelectorAll('.lm-claim').forEach(btn => {
        btn.addEventListener('click', () => claimMission(btn.dataset.mid, btn, loadLobbyMissions));
      });
    }
    $('btn-missions-mobile')?.classList.remove('hidden');
    $('lobby-missions-desktop')?.classList.remove('hidden');
  } catch(e) { 
    $('btn-missions-mobile')?.classList.remove('hidden');
    $('lobby-missions-desktop')?.classList.remove('hidden');
    for (const list of [desktopList]) {
      if (!list) continue;
      list.innerHTML = '<button class="missions-retry" type="button">Reintentar</button>';
      list.querySelector('.missions-retry')?.addEventListener('click', loadLobbyMissions);
    }
  }
}

async function claimMission(missionId, button, afterClaim) {
  if (!missionId || button?.disabled) return;
  const originalText = button?.textContent || 'Cobrar';
  if (button) {
    button.disabled = true;
    button.textContent = '⏳';
  }
  try {
    const response = await authenticatedFetch('/api/user/missions/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ missionId })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No se pudo cobrar la misión');
    toast(`🎉 ${data.missionName}: +${data.coins}🪙 ${data.xp > 0 ? '+'+data.xp+'XP' : ''}`);
    await Promise.allSettled([
      loadUserBalance(),
      typeof afterClaim === 'function' ? afterClaim(data) : Promise.resolve()
    ]);
  } catch (error) {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
    toast('⚠ ' + error.message);
  }
}



function openMissionTab() {
  $('modal-shop').classList.remove('hidden');
  loadMissions();
  document.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.shop-tab-content').forEach(c => c.style.display = 'none');
  const tab = document.querySelector('.shop-tab[data-tab="missions"]');
  if (tab) tab.classList.add('active');
  const tc = $('shop-tab-missions');
  if (tc) tc.style.display = 'block';
}


// ── Indicador visual de nuevas versiones (lobby) ─────
const GAME_LAST_SEEN_KEY = 'game_last_seen_version';
let _availableVersion = null;
let _appUpdateInProgress = false;
let _updatePromptOpen = false;

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function checkUpdateIndicator() {
  fetch('/api/version?ts=' + Date.now(), { cache: 'no-store' }).then(r => r.json()).then(d => {
    if (!d.version) return;
    const localVersion = typeof GAME_VERSION !== 'undefined' ? GAME_VERSION : '0.0.0';
    if (compareVersions(d.version, localVersion) > 0) {
      _availableVersion = d.version;
      $('btn-user-update')?.classList.add('has-update');
      showUpdatePrompt(d.version);
    }
  }).catch(() => {});
}

function showUpdatePrompt(version) {
  if (_updatePromptOpen || _appUpdateInProgress || !navigator.serviceWorker?.controller) return;
  _updatePromptOpen = true;
  const overlay = document.createElement('div');
  overlay.className = 'app-update-overlay';
  overlay.innerHTML = `<div class="app-update-card">
    <div class="app-update-icon">🔄</div>
    <h2>Nueva versión ${esc(String(version || ''))}</h2>
    <p>Actualizá primero para cargar todos los cambios. Después vas a ver las notas de la versión.</p>
    <button class="btn btn-gold" id="btn-apply-update">Actualizar ahora</button>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#btn-apply-update').onclick = () => performAppUpdate(version);
}

async function performAppUpdate(version, manual = false) {
  if (_appUpdateInProgress) return;
  _appUpdateInProgress = true;
  sessionStorage.setItem('macko_show_changelog_after_update', '1');
  toast(manual ? '🔄 Actualizando la aplicación...' : `🔄 Instalando versión ${version || ''}...`, 5000);
  document.querySelector('#btn-apply-update')?.setAttribute('disabled', 'disabled');
  try {
    const reg = _swRegistration || await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.update();
      let waiting = reg.waiting;
      if (!waiting && reg.installing) {
        await new Promise(resolve => {
          const worker = reg.installing;
          const done = () => {
            if (worker.state === 'installed' || worker.state === 'activated' || worker.state === 'redundant') resolve();
          };
          worker.addEventListener('statechange', done);
          setTimeout(resolve, 5000);
        });
        waiting = reg.waiting;
      }
      if (waiting) {
        let changed = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (changed) return;
          changed = true;
          window.location.replace('/?updated=' + Date.now());
        }, { once: true });
        waiting.postMessage({ type: 'SKIP_WAITING' });
        setTimeout(() => { if (!changed) window.location.replace('/?updated=' + Date.now()); }, 4000);
        return;
      }
    }
  } catch(e) {
    console.warn('No se pudo activar el nuevo Service Worker:', e);
  }
  window.location.replace('/?updated=' + Date.now());
}

let _globalChatMessages = [];

// Cache del changelog para carga instantánea
let _changelogCache = null;

async function loadChangelog() {
  // Si ya tenemos datos cacheados, mostrar inmediatamente
  if (_changelogCache) {
    renderChangelog(_changelogCache.version, _changelogCache.entries);
    $('modal-changelog').classList.remove('hidden');
    return;
  }
  try {
    const res = await fetch('/api/version');
    const data = await res.json();
    const version = data.version || '—';
    const changelog = data.changelog || [];
    
    // Cachear para próxima vez
        // Marcar como vista la versión actual (quitar badge)
    if (data.version) {
      localStorage.setItem(GAME_LAST_SEEN_KEY, data.version);
      $('btn-user-update')?.classList.remove('has-update');
    }
        // Solo game para jugadores — CEO entries van solo al CEO Panel
    const gameEntries = changelog.filter(e => e.scope === 'game');
    _changelogCache = { version, entries: gameEntries };
    
    renderChangelog(version, gameEntries);
    $('modal-changelog').classList.remove('hidden');
  } catch(err) {
    // Si falla el fetch, mostrar toast de error pero NO abrir modal vacío
    toast('⚠ Error al cargar historial: ' + err.message);
  }
}

function renderChangelog(version, entries) {
  const verEl = $('changelog-current-version');
  if (verEl) verEl.textContent = 'v' + version;
  
  const list = $('changelog-list');
  if (!list) return;
  
  if (!entries.length) {
    list.innerHTML = '<p style="color:var(--text3);text-align:center;padding:20px">Sin historial disponible</p>';
    return;
  }
  
  list.innerHTML = entries.map(entry => {
    const isCurrent = entry.version === version;
    return `<div style="
      background:${isCurrent ? 'rgba(212,175,55,.08)' : 'var(--bg-card2)'};
      border:1px solid ${isCurrent ? 'var(--gold)' : 'var(--border2)'};
      border-radius:10px;padding:14px 12px;
    ">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;flex-wrap:wrap;gap:4px">
        <span style="
          font-family:'Cinzel',serif;font-size:16px;font-weight:700;
          color:${isCurrent ? 'var(--gold2)' : 'var(--gold)'};
        ">v${esc(entry.version)}</span>
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
      ${isCurrent ? '<div style="margin-top:6px;font-size:10px;color:var(--gold);font-weight:600">⬅ Actual</div>' : ''}
    </div>`;
  }).join('');
}

async function loadGlobalChat() {
  const token = localStorage.getItem('gameToken');
  if (!token) return;
  try {
    const res = await fetch('/api/global-chat', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const { messages } = await res.json();
    _globalChatMessages = messages || [];
    renderPortalChat();
  } catch(e) {}
}

function renderPortalChat() {
  const msgs = $('portal-chat-msgs');
  if (!msgs) return;
  if (!_globalChatMessages.length) {
    msgs.innerHTML = '<p class="portal-empty" style="padding:10px;font-size:11px">Sin mensajes aún</p>';
    return;
  }
  msgs.innerHTML = _globalChatMessages.map(m =>
    `<div class="cm"><span class="cn">${esc(m.player_name)}</span>: ${esc(m.message)}</div>`
  ).join('');
  msgs.scrollTop = msgs.scrollHeight;
}

function addPortalChat(name, text) {
  _globalChatMessages.push({ player_name: name, message: text });
  if (_globalChatMessages.length > 50) _globalChatMessages.shift();
  renderPortalChat();
}

function sendPortalChat() {
  const inp = $('portal-chat-input');
  const msg = inp.value.trim();
  if (!msg) return;
  wsSend('GLOBAL_CHAT', { playerId: S.id, playerName: S.name, message: msg });
  inp.value = '';
  // Agregar localmente al instante (sin esperar round-trip del server)
  addPortalChat(S.name, msg);
  SFX.chat();
}

/* ── Ranking ─────────────────────────────────────────── */
function renderRanking(rows) {
  const list = $('ranking-list');
  list.innerHTML = '';
  if (!rows?.length) {
    list.innerHTML = '<p style="color:var(--text2);text-align:center;padding:30px 0">Sin datos aún</p>';
    return;
  }
  rows.forEach((r, i) => {
    const pos = i + 1;
    const cls = pos===1?'g1':pos===2?'g2':pos===3?'g3':'gn';
    const d   = document.createElement('div');
    d.className = 'rk-item';
    d.innerHTML = `<div class="rk-pos ${cls}">${pos}</div>
      <div class="rk-info"><div class="rk-nm">${esc(r.alias||r.name)}</div>
      <div class="rk-mt">Jugador verificado</div></div>
      <div class="rk-wins"><div class="rk-w">${r.games_won||0}</div><div class="rk-wl">victorias</div></div>`;
    list.appendChild(d);
  });
}

/* ── Modal victoria ──────────────────────────────────── */
function showWin(playerName, desc, dice, skinId, specialId) {
  if (!$('modal-win').classList.contains('hidden')) return;
  const playAgainBtn = $('btn-play-again');
  if (playAgainBtn) {
    playAgainBtn.classList.remove('hidden');
    playAgainBtn.disabled = false;
    playAgainBtn.textContent = '🎲 Revancha';
  }
  $('play-again-hint')?.classList.add('hidden');
  $('win-name').textContent = '¡'+playerName+'!';
  $('win-desc').textContent = desc;
  const wr = $('win-dice');
  wr.innerHTML = '';
  // Usar skin del ganador (del match state) o fallback al skin local
  let winnerSkin = skinId || S.diceEquipped;
  if (!winnerSkin && S.match && S.match.winner) {
    const wPlayer = S.match.players.find(p => p.id === S.match.winner.id);
    if (wPlayer && wPlayer.equippedDice) winnerSkin = wPlayer.equippedDice;
  }
  const displayDice = (dice && dice.length > 0) ? dice : [1,2,3,4,5];
  displayDice.forEach(v => {
    // Usar makeDie para que se vea la skin completa con ícono + puntos
    const dieEl = makeDie(v, 'hot', winnerSkin);
    dieEl.classList.remove('rolling');
    dieEl.classList.add('win-die');
    wr.appendChild(dieEl);
  });
  $('modal-win').classList.remove('hidden');
  if (typeof loadDice3D === 'function') {
    loadDice3D().then(renderer3D => renderer3D?.renderDice({
      container: wr,
      dice: displayDice,
      states: displayDice.map(() => 'hot'),
      skinId: winnerSkin,
      specialId
    }));
  }
  launchConfetti();
  // Efecto Victoria: si el jugador local tiene item 16 equipado, confetti extra
  if (String(specialId || '') === '16') {
    setTimeout(() => launchConfetti(), 800);
    setTimeout(() => launchConfetti(), 1600);
    setTimeout(() => launchConfetti(), 2400);
  }
  if (String(specialId || '') === '36') launchLaserVictory();
  if (String(specialId || '') === '47') {
    launchRainbowConfetti();
    setTimeout(() => launchRainbowConfetti(), 700);
    setTimeout(() => launchRainbowConfetti(), 1400);
  }
  if (String(specialId || '') === '51') {
    document.body.classList.add('victory-eclipse');
    setTimeout(() => document.body.classList.remove('victory-eclipse'), 3200);
  }
}

function launchLaserVictory() {
  const layer = document.createElement('div');
  layer.className = 'victory-laser-layer';
  for (let i = 0; i < 18; i++) {
    const beam = document.createElement('span');
    beam.style.setProperty('--angle', `${i * 20}deg`);
    beam.style.setProperty('--delay', `${(i % 5) * 0.06}s`);
    beam.style.height = `${3 + Math.random() * 4}px`;
    layer.appendChild(beam);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 2500);
}

/* ── Init UI ─────────────────────────────────────────── */
function initUI() {
  // Actualizar versión dinámica desde version.js
  const appVersion = typeof GAME_VERSION !== 'undefined' ? GAME_VERSION : '2.3.0';
  const authSub = document.querySelector('.auth-sub');
  if (authSub) authSub.textContent = 'Juego de dados · 2 a 10 jugadores · v' + appVersion;
  const appVerEl = document.querySelector('.app-version');
  if (appVerEl) appVerEl.textContent = 'v' + appVersion;
  // Check update indicator al cargar la UI
  setTimeout(checkUpdateIndicator, 500);
  initBgCanvas();
  initBgCanvas();

  /* ── Theme toggle (dark/light) ──────────────────────── */
  const savedTheme = localStorage.getItem('macko-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  const themeBtn = $('btn-theme-toggle');
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  const applyThemeMeta = (t) => { if (metaTheme) metaTheme.content = t === 'dark' ? '#0b1120' : '#f8fafc'; };
  applyThemeMeta(savedTheme);
  if (themeBtn) {
    themeBtn.textContent = savedTheme === 'dark' ? '🌙' : '☀️';
    themeBtn.onclick = () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('macko-theme', next);
      themeBtn.textContent = next === 'dark' ? '🌙' : '☀️';
      applyThemeMeta(next);
    };
  }

  /* PWA — botón instalar */
  $('pwa-install-btn').onclick = async () => {
    if (!_deferredInstall) return;
    _deferredInstall.prompt();
    const { outcome } = await _deferredInstall.userChoice;
    if (outcome === 'accepted') {
      $('pwa-install-bar').classList.add('hidden');
      updatePwaOffset();
    }
    _deferredInstall = null;
  };
  $('pwa-install-close').onclick = () => {
    _pwaDismissed = true; // Nunca más mostrar esta sesión
    clearTimeout(_pwaAutoTimer);
    $('pwa-install-bar').classList.add('hidden');
    updatePwaOffset();
  };

  /* ── Wallet toggle (mobile: expandir/colapsar cofre y tienda) ── */
  $('btn-wallet-toggle').onclick = () => {
    const extras = $('wallet-extras');
    const btn = $('btn-wallet-toggle');
    if (!extras || !btn) return;
    const isHidden = extras.classList.contains('hidden');
    extras.classList.toggle('hidden', !isHidden);
    btn.classList.toggle('open', isHidden);
  };

  /* ── Tienda ─────────────────────────────────────────── */
  /* ── Tienda ─────────────────────────────────────────── */
  $('btn-open-shop').onclick = () => {
    $('modal-shop').classList.remove('hidden');
    loadShopCatalog();
  };
  $('btn-close-shop').onclick = () => $('modal-shop').classList.add('hidden');
  // Preview al clickear items (event delegation, una sola vez)
  $('modal-shop')?.addEventListener('click', function shopPreviewClick(ev) {
    const itemDiv = ev.target.closest('.shop-item');
    if (!itemDiv || itemDiv.classList.contains('ultra-teaser')) return;
    if (ev.target.closest('.btn-buy')) return;
    try {
      const iconEl = itemDiv.querySelector('.shop-item-preview');
      const nameEl = itemDiv.querySelector('h3');
      const icon = iconEl ? (iconEl.textContent || '').trim().split(/\s+/)[0] : '❓';
      const name = nameEl ? (nameEl.textContent || 'Item') : 'Item';
      openItemPreview(itemDiv.dataset.category, itemDiv.dataset.id, name, icon);
    } catch(e) {
      toast('⚠ Error al abrir preview: ' + e.message);
    }
  });

  /* ── Modal invitar jugador ──────────────────────────── */
  $('btn-invite-player')?.addEventListener('click', () => {
    $('modal-invite').classList.remove('hidden');
    $('invite-search-input').value = '';
    $('invite-search-results').innerHTML = '<div style="text-align:center;color:var(--text3);padding:20px;font-size:13px">Escribí un nombre para buscar</div>';
    setTimeout(() => $('invite-search-input').focus(), 100);
  });
  $('btn-close-invite')?.addEventListener('click', () => $('modal-invite').classList.add('hidden'));

  let _inviteSearchTimer = null;
  $('invite-search-input')?.addEventListener('input', (e) => {
    clearTimeout(_inviteSearchTimer);
    const q = e.target.value.trim();
    if (q.length < 2) {
      $('invite-search-results').innerHTML = '<div style="text-align:center;color:var(--text3);padding:20px;font-size:13px">Escribí un nombre para buscar</div>';
      return;
    }
    _inviteSearchTimer = setTimeout(async () => {
      try {
        const token = localStorage.getItem('gameToken');
        const res = await fetch('/api/friends/search?q=' + encodeURIComponent(q), {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const { players } = await res.json();
        if (!players?.length) {
          $('invite-search-results').innerHTML = '<div style="text-align:center;color:var(--text3);padding:20px;font-size:13px">No se encontraron jugadores</div>';
          return;
        }
        $('invite-search-results').innerHTML = players.map(p => {
          const av = p.equipped_avatar || getInitial(p.alias);
          return `<div class="invite-player-item">
            <div class="invite-player-av">${esc(av)}</div>
            <div class="invite-player-info">
              <div class="invite-player-name">${esc(p.alias || p.name || 'Jugador')}</div>
              <div class="invite-player-meta">${p.games_played || 0} partidas · ${p.games_won || 0} victorias</div>
            </div>
            <button class="invite-send-btn" data-player-id="${esc(p.id)}" data-player-name="${esc(p.alias || p.name || 'Jugador')}">Invitar</button>
          </div>`;
        }).join('');
        $('invite-search-results').querySelectorAll('.invite-send-btn').forEach(btn => {
          btn.onclick = () => sendGameInvite(btn.dataset.playerId, btn.dataset.playerName);
        });
      } catch(e) {
        $('invite-search-results').innerHTML = '<div style="text-align:center;color:var(--red);padding:20px;font-size:13px">Error al buscar</div>';
      }
    }, 300);
  });

  // Tabs de tienda
  document.querySelectorAll('.shop-tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.shop-tab-content').forEach(c => c.style.display = 'none');
      const content = $('shop-tab-' + tab.dataset.tab);
      if (content) content.style.display = 'block';
      if (tab.dataset.tab === 'store') loadCoinPacks();
      if (['dados','avatares','efectos','consumibles'].includes(tab.dataset.tab)) loadShopTab(tab.dataset.tab);
      if (tab.dataset.tab === 'missions') loadMissions();
    };
  });

  /* ── Perfil ─────────────────────────────────────────── */
  $('btn-back-profile').onclick = navigateToLobbyOrAuth;
  $('lobby-avatar').onclick = () => {
    if (isLogged()) { loadProfile(); }
  };
  const soundButtonIds = ['btn-music-toggle', 'btn-room-sound', 'btn-sound'];
  let soundPanelAnchor = null;
  function closeSoundPanel() {
    $('sound-panel')?.classList.add('hidden');
    soundPanelAnchor = null;
    soundButtonIds.forEach(id => $(id)?.setAttribute('aria-expanded', 'false'));
  }
  function positionSoundPanel(anchor) {
    const panel = $('sound-panel');
    if (!panel || !anchor || panel.classList.contains('hidden')) return;
    const anchorRect = anchor.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const margin = 12;
    const left = Math.max(margin, Math.min(
      window.innerWidth - panelRect.width - margin,
      anchorRect.right - panelRect.width
    ));
    const below = anchorRect.bottom + 8;
    const top = below + panelRect.height <= window.innerHeight - margin
      ? below
      : Math.max(margin, anchorRect.top - panelRect.height - 8);
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
  }
  function toggleSoundPanel(anchor) {
    const panel = $('sound-panel');
    if (!panel) return;
    const shouldOpen = panel.classList.contains('hidden') || soundPanelAnchor !== anchor;
    closeSoundPanel();
    if (!shouldOpen) return;
    ensureAudioContext();
    updateMusicBtns();
    soundPanelAnchor = anchor;
    panel.classList.remove('hidden');
    anchor.setAttribute('aria-expanded', 'true');
    positionSoundPanel(anchor);
    $('notif-panel')?.classList.add('hidden');
    $('user-menu')?.classList.add('hidden');
    $('btn-user-menu')?.setAttribute('aria-expanded', 'false');
  }
  $('btn-user-menu')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = $('user-menu');
    const open = menu.classList.toggle('hidden') === false;
    $('btn-user-menu').setAttribute('aria-expanded', String(open));
    closeSoundPanel();
    $('notif-panel')?.classList.add('hidden');
  });
  $('btn-user-profile')?.addEventListener('click', () => {
    $('user-menu')?.classList.add('hidden');
    if (isLogged()) loadProfile();
  });
  $('btn-user-changelog')?.addEventListener('click', () => {
    $('user-menu')?.classList.add('hidden');
    loadChangelog();
  });
  $('btn-user-update')?.addEventListener('click', () => {
    $('user-menu')?.classList.add('hidden');
    performAppUpdate(_availableVersion, true);
  });
  // Click en avatar del perfil → scrollear al inventario
  $('profile-avatar').onclick = () => {
    const inv = $('profile-inventory-section');
    if (inv) inv.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /* Lobby */
  $('btn-create').onclick = () => {
    if (!preparePlayerIdentity()) { toast(isLogged() ? 'No se pudo recuperar tu usuario. Volvé a iniciar sesión.' : 'Ingresá tu nombre'); return; }
    withSocketReady(() => wsSend('CREATE_ROOM', {
      playerId:S.id,
      playerName:getPlayerName(),
      isPrivate:true,
      maxPlayers:10,
      equippedDice:S.diceEquipped,
      equippedAvatar:S.avatarEquipped,
      equippedSpecial:S.specialEquipped,
      equippedSpecials:S.specialsEquipped
    }));
  };

  $('btn-join-open').onclick = () => {
    if (!preparePlayerIdentity()) { toast(isLogged() ? 'No se pudo recuperar tu usuario. Volvé a iniciar sesión.' : 'Ingresá tu nombre'); return; }
    showScreen('screen-join');
  };

  /* ── Partida contra bots ────────────────────────────────── */
  $('btn-bot-game')?.addEventListener('click', () => {
    if (!preparePlayerIdentity()) {
      toast(isLogged() ? 'No se pudo recuperar tu usuario. Volvé a iniciar sesión.' : 'Ingresá tu nombre');
      return;
    }
    $('modal-bot-game')?.classList.remove('hidden');
  });

  // Bot count selector
  document.querySelectorAll('.bot-count-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.bot-count-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Bot difficulty selector
  document.querySelectorAll('.bot-diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.bot-diff-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Close bot modal
  $('btn-close-bot-game')?.addEventListener('click', () => {
    $('modal-bot-game')?.classList.add('hidden');
  });

  // Start bot game
  $('btn-start-bot-game')?.addEventListener('click', () => {
    if (S.ws?.readyState !== WebSocket.OPEN || !_wsIdentified) {
      toast('Conectando al servidor...', 2000);
      withSocketReady(() => $('btn-start-bot-game')?.click());
      return;
    }
    const countEl = document.querySelector('.bot-count-btn.active');
    const diffEl = document.querySelector('.bot-diff-btn.active');
    if (!countEl || !diffEl) { toast('Seleccioná cantidad y dificultad', 'error'); return; }
    const botCount = parseInt(countEl.dataset.count);
    const difficulty = diffEl.dataset.diff;
    $('modal-bot-game')?.classList.add('hidden');
    toast('🎮 Creando partida contra bots...', 2000);
    wsSend('START_BOT_GAME', { botCount, difficulty, playerId: S.id, playerName: getPlayerName() });
  });

  /* ── Cofre diario ──────────────────────────────────────── */
  loadChestStatus();
  $('btn-chest').onclick = async () => {
    const token = localStorage.getItem('gameToken');
    if (!token) { toast('Debes iniciar sesión'); return; }
    const btn = $('btn-chest');
    btn.disabled = true;
    btn.textContent = '⏳';
    try {
      const res = await fetch('/api/user/claim-chest', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      let msg = `🎁 +${d.coins} monedas`;
      if (d.itemGained) msg += ` + ¡${d.itemGained.icon} ${d.itemGained.name}!`;
      toast(msg);
      await loadChestStatus();
      loadUserBalance();
    } catch (err) {
      toast('⚠ ' + err.message);
    }
    await loadChestStatus();
  };

  /* ── Portal Social ────────────────────────────────── */
  $('btn-portal').onclick = async () => {
    const token = localStorage.getItem('gameToken');
    if (!token) { toast('Debes iniciar sesión'); return; }
    showScreen('screen-portal');
    loadPortalData();
    loadPortalFriends();
    loadGlobalChat();
  };
  $('btn-back-portal').onclick = navigateToLobbyOrAuth;
  $('portal-chat-send').onclick = sendPortalChat;
  $('portal-chat-input').onkeydown = e => { if (e.key==='Enter') sendPortalChat(); };
  
  // Tabs de chat en portal
  document.querySelectorAll('.portal-chat-tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.portal-chat-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.portal-chat-pane').forEach(p => p.style.display = 'none');
      const paneId = tab.dataset.portalTab === 'global' ? 'portal-chat-global' : 'portal-chat-friends';
      const pane = $(paneId);
      if (pane) pane.style.display = 'flex';
      if (tab.dataset.portalTab === 'global') {
        $('portal-chat-input')?.focus();
      } else if (_privateChatTarget) {
        $('portal-chat-friends-input')?.focus();
        renderPrivateChat();
      }
    };
  });
  
  // Chat privado con amigos
  $('portal-chat-friends-send').onclick = sendPrivateChat;
  $('portal-chat-friends-input').onkeydown = e => { if (e.key==='Enter') sendPrivateChat(); };
  $('btn-add-friend').onclick = () => {
    const area = $('portal-search-area');
    area.classList.toggle('hidden');
    if (!area.classList.contains('hidden')) {
      $('portal-search-input').focus();
      $('portal-search-input').value = '';
      $('portal-search-results').innerHTML = '';
    }
  };
  $('portal-search-input').oninput = function() {
    const q = this.value.trim();
    if (q.length < 2) { $('portal-search-results').innerHTML = ''; return; }
    clearTimeout(this._debounce);
    this._debounce = setTimeout(() => searchPortalPlayers(q), 300);
  };
  $('btn-refresh-games').onclick = loadPortalGames;

  /* ── Feedback ────────────────────────────────────────── */
  $('btn-feedback').onclick = () => {
    $('modal-feedback').classList.remove('hidden');
    $('feedback-text').value = '';
    const status = $('feedback-status');
    status.classList.add('hidden');
    status.className = 'feedback-status hidden';
  };
  $('btn-close-feedback').onclick = () => $('modal-feedback').classList.add('hidden');

  $('btn-send-feedback').onclick = async () => {
    const token = localStorage.getItem('gameToken');
    if (!token) { toast('Debes iniciar sesión'); return; }
    const cat = document.querySelector('input[name="fb-cat"]:checked');
    const category = cat ? cat.value : 'otro';
    const message = $('feedback-text').value.trim();
    if (!message) { toast('Escribí un mensaje'); return; }
    const btn = $('btn-send-feedback');
    const status = $('feedback-status');
    btn.disabled = true;
    btn.textContent = 'Enviando...';
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ category, message })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      status.textContent = '✅ Feedback enviado. ¡Gracias!';
      status.className = 'feedback-status success';
      status.classList.remove('hidden');
      $('feedback-text').value = '';
      setTimeout(() => $('modal-feedback').classList.add('hidden'), 1500);
    } catch (err) {
      status.textContent = '⚠ ' + err.message;
      status.className = 'feedback-status error';
      status.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Enviar feedback';
    }
  };
  // Enter en textarea de feedback
  $('feedback-text').onkeydown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      $('btn-send-feedback').click();
    }
  };

  /* ── Changelog ────────────────────────────────────────── */
  $('btn-close-changelog').onclick = () => $('modal-changelog').classList.add('hidden');

  /* ── Torneos ────────────────────────────────────────── */
  $('btn-tournaments').onclick = async () => {
    // Limpiar badge de notificación push al abrir torneos
    const pb = document.getElementById('tournament-push-badge');
    if (pb) pb.classList.add('hidden');
    const token = localStorage.getItem('gameToken');
    if (!token) { toast('Debés iniciar sesión'); return; }
    $('modal-tournament').classList.remove('hidden');
    loadTournaments();
  };
  $('btn-close-tournament').onclick = () => {
    $('modal-tournament').classList.add('hidden');
    $('tournament-bracket-view').classList.add('hidden');
  };

  $('btn-ranking').onclick = async () => {
    if (!isLogged()) {
      toast('🔒 Debes iniciar sesión para ver el ranking');
      return;
    }
    
    const token = localStorage.getItem('gameToken');
    
    try {
      const response = await fetch('/ranking', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.status === 401 || response.status === 403) {
        clearAuth();
        showScreen('screen-auth');
        toast('Sesión expirada. Volvé a ingresar.');
        return;
      }
      
      const rankingData = await response.json();
      renderRanking(rankingData);
      showScreen('screen-ranking');
    } catch (err) {
      toast('⚠ Error cargando el ranking');
    }
  };

/* Logout */
  /* ── Push notifications toggle via switch ──── */
  const pushSwitch = $('notif-push-switch');
  if (pushSwitch) {
    pushSwitch.addEventListener('change', async () => {
      const shouldEnable = pushSwitch.checked;
      pushSwitch.disabled = true;
      if (shouldEnable) await subscribeToPush();
      else await unsubscribeFromPush();
      pushSwitch.disabled = false;
    });
    updatePushBtn();
  }

  /* ── Centro de notificaciones ────────────────────── */
  _loadNotifs();
  loadServerNotifications();
  $('btn-notif')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const panel = $('notif-panel');
    panel.classList.toggle('hidden');
    closeSoundPanel();
    $('user-menu')?.classList.add('hidden');
    $('btn-user-menu')?.setAttribute('aria-expanded', 'false');
    if (!panel.classList.contains('hidden')) {
      renderNotifPanel();
      markAllRead();
      void checkPushStatus();
    }
  });
  $('btn-notif-mark-read')?.addEventListener('click', () => {
    markAllRead();
    renderNotifPanel();
  });
  soundButtonIds.forEach(id => $(id)?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSoundPanel(e.currentTarget);
  }));

  $('btn-music-mute')?.addEventListener('click', (e) => {
    e.stopPropagation();
    ensureAudioContext();
    toggleMusic();
    updateMusicBtn();
  });

  $('btn-sfx-mute')?.addEventListener('click', (e) => {
    e.stopPropagation();
    ensureAudioContext();
    toggleSfx();
    updateMusicBtn();
  });
  
  // Inicializar audio en la primera interacción del usuario
  // (los navegadores bloquean autoplay hasta que el usuario toca la pantalla)
  function _firstInteraction() {
    if (typeof initAudio === 'function') initAudio();
    document.removeEventListener('click', _firstInteraction);
    document.removeEventListener('touchstart', _firstInteraction);
  }
  document.addEventListener('click', _firstInteraction, { once: true });
  document.addEventListener('touchstart', _firstInteraction, { once: true });
  
  /* ── Volume slider ─────────────────────────────── */
  const volSlider = $('music-volume-slider');
  if (volSlider) {
    // Sincronizar valor inicial
    volSlider.value = Math.round(getMusicVolume() * 100);
    volSlider.addEventListener('input', (e) => {
      e.stopPropagation();
      const vol = parseInt(e.target.value, 10) / 100;
      setMusicVolume(vol);
      updateMusicBtn();
    });
  }
  const sfxSlider = $('sfx-volume-slider');
  if (sfxSlider) {
    sfxSlider.value = Math.round(getSfxVolume() * 100);
    sfxSlider.addEventListener('input', (e) => {
      e.stopPropagation();
      setSfxVolume(parseInt(e.target.value, 10) / 100);
      updateMusicBtn();
    });
  }
  // Cerrar panel al hacer click afuera
  document.addEventListener('click', (e) => {
    const panel = $('notif-panel');
    const wrapper = e.target.closest('.notif-wrapper');
    if (panel && !wrapper) panel.classList.add('hidden');
    if (!e.target.closest('#sound-panel') && !e.target.closest('#btn-music-toggle, #btn-room-sound, #btn-sound')) closeSoundPanel();
    if (!e.target.closest('.user-menu-wrap')) {
      $('user-menu')?.classList.add('hidden');
      $('btn-user-menu')?.setAttribute('aria-expanded', 'false');
    }
  });
  window.addEventListener('resize', () => {
    if (soundPanelAnchor) positionSoundPanel(soundPanelAnchor);
  });

  /* ── Click SFX solo DENTRO de la partida ──────────── */
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!target || target.closest('input, textarea, [type="range"], [data-no-sfx]')) return;
    // Solo botones dentro de la pantalla de juego
    if (target.closest('#screen-game button, #screen-game a')) {
      SFX.click();
    }
  }, { capture: true });

  /* ── Hover SFX solo DENTRO de la partida ──────────── */
  let _lastHoverTime = 0;
  document.addEventListener('mouseover', (e) => {
    const target = e.target;
    if (!target || target.closest('input, textarea, [data-no-sfx]')) return;
    const btn = target.closest('#screen-game .btn-gold, #screen-game .btn-ghost, #screen-game .btn-link');
    if (!btn) return;
    const now = Date.now();
    if (now - _lastHoverTime < 80) return;
    _lastHoverTime = now;
    SFX.hover();
  }, { capture: true });

  /* ── Sonido de navegación (cambio de pantalla) ────── */
  const _origShowScreen = showScreen;
  showScreen = function(id) {
    _origShowScreen(id);
    // Sonido sutil de navegación (no durante partida)
    if (id !== 'screen-game' && id !== 'screen-room') {
      tone(520, 'sine', .06, .05);
      tone(660, 'sine', .1, .04, .06);
    }
  };

  // Check push status after login — also triggered reliably inside btn-login's handler

  function doLogout() {
    disconnectSocketForIdentityChange();
    clearAuth();
    clearSession();
    S.logged = false;
    S.userId = null;
    S.id = null;
    S.name = null;
    $('input-name').value = '';
    $('btn-logout-topbar')?.classList.add('hidden');
    $('btn-back-to-auth')?.classList.remove('hidden');
    showScreen('screen-auth');
    toast('Sesión cerrada');
  }

  $('btn-logout').onclick = doLogout;
  $('btn-logout-topbar').onclick = doLogout;

  /* Entrar como Invitado */
  $('btn-guest').onclick = async () => {
    // Limpiamos todo antes de empezar como invitado
    disconnectSocketForIdentityChange();
    clearAuth(); 
    clearSession();
    
    S.logged = false;
    S.userId = null;
    S.id = null;
    S.name = null; // El nombre debe estar vacío para que el usuario lo escriba
    
    $('input-name').value = ''; // Limpiamos el input del lobby
    
    try {
      const res = await fetch('/api/guest-session', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.token || !data.player?.id) throw new Error(data.error || 'No se pudo crear la sesión');
      S.id = data.player.id;
      localStorage.setItem(GUEST_TOKEN_KEY, data.token);
      saveSession();
      showScreen('screen-lobby');
      updateUserPanel(null, 0);
      connect();
    } catch (err) {
      toast('⚠ ' + err.message);
    }
  };

/* Alternar entre Login y Registro */
  $('auth-mode-btn').onclick = () => {
    const isRegistering = !$('login-email').classList.contains('hidden');
    $('registration-verification')?.classList.add('hidden');
    if (isRegistering) {
      // Pasar a modo Login
      $('login-email').classList.add('hidden');
      $('btn-login').classList.remove('hidden');
      $('btn-register').classList.add('hidden');
      $('auth-mode-btn').textContent = '¿No tenés cuenta? Registrate';
    } else {
      // Pasar a modo Registro
      $('login-email').classList.remove('hidden');
      $('btn-login').classList.add('hidden');
      $('btn-register').classList.remove('hidden');
      $('auth-mode-btn').textContent = '¿Ya tenés cuenta? Iniciá sesión';
    }
  };

  /* Registro HTTP */
  $('btn-register').onclick = async () => {
    const email = $('login-email').value.trim();
    const username = $('login-user').value.trim();
    const password = $('login-pass').value.trim();

    if (!email || !username || !password) {
      toast('Completá email, usuario y contraseña');
      return;
    }
    if (!/^\p{L}/u.test(username)) {
      toast('El usuario debe comenzar con una letra');
      return;
    }

    $('btn-register').disabled = true;
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username, password })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (data.verificationRequired) {
        _pendingRegistrationEmail = data.email || email.toLowerCase();
        $('verification-copy').textContent = `Enviamos un código a ${_pendingRegistrationEmail}. Vence en 10 minutos.`;
        $('registration-code').value = '';
        $('registration-verification').classList.remove('hidden');
        $('registration-code').focus();
        toast('Revisá tu email e ingresá el código.');
      }
    } catch (err) {
      toast('⚠ ' + err.message);
    } finally {
      $('btn-register').disabled = false;
    }
  };

  /* Login HTTP */
  $('btn-login').onclick = async () => {
    const identifier = $('login-user').value.trim();
    const password = $('login-pass').value.trim();

    if (!identifier || !password) {
      toast('Completá usuario y contraseña');
      return;
    }

    $('btn-login').disabled = true;
    $('btn-login').textContent = 'Entrando...';

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Guardar sesión y token JWT
      disconnectSocketForIdentityChange();
      saveAuth(data.player, data.token);
      
      S.logged = true;
      S.userId = data.player.id;
      S.name = data.player.alias;
      S.id = data.player.id; // Clave para que los sockets del juego sigan usando este ID
      
      // GUARDAR SESIÓN COMPLETA para que sobreviva al refresh
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        id: S.id, name: S.name,
        roomId: null, roomCode: null,
        entered: false, ts: Date.now()
      }));
      
      const inp = $('input-name');
      if (inp) inp.value = S.name;

      $('btn-login').textContent = 'Ingresar';

      // Conectar WebSocket para chat, invitaciones, notificaciones
      connect();

      // Mostrar panel de usuario inmediatamente (nombre, monedas)
      // loadEquippedCache() después actualizará el avatar/icono cuando estén listos
      updateUserPanel(S.name, data.player.coins);
      // Cargar cache local de items equipados
      loadEquippedCache();
      // Actualizar items equipados desde la API (async)
      loadEquippedItems().then(() => {
        // Actualizar panel de usuario con avatar/iconos recién cargados
        updateUserPanel(S.name, data.player.coins);
        loadChestStatus();
      }).catch(() => {
        // Si falla la API, el panel ya se mostró con el primer updateUserPanel
        loadChestStatus();
      });
      // Comprobar misiones completadas
      setTimeout(checkPendingMissions, 2000);
      // Mostrar panel de notificaciones y sincronizar switch de push
      const notifWrapper = document.querySelector('.notif-wrapper');
      if (notifWrapper) notifWrapper.classList.remove('hidden');
      checkPushStatus();
      $('btn-back-to-auth')?.classList.add('hidden');
      loadChestStatus();
      loadLobbyMissions();
      showScreen('screen-lobby');
      toast('¡Bienvenido, ' + S.name + '!');
      // Cargar notificaciones/broadcasts del servidor
      loadServerNotifications();
    } catch (err) {
      toast('⚠ ' + err.message);
      $('btn-login').textContent = 'Ingresar';
    } finally {
      $('btn-login').disabled = false;
    }
  };

  /* Unirse */
  /* Unirse */
  $('btn-back-join').onclick = navigateToLobbyOrAuth;

  $('input-code').oninput = function() { this.value = this.value.replace(/[^0-9]/g, '').slice(0, 6); };

  $('btn-join-confirm').onclick = () => {
    if (!preparePlayerIdentity()) { toast(isLogged() ? 'No se pudo recuperar tu usuario. Volvé a iniciar sesión.' : 'Ingresá tu nombre'); return; }
    const code = $('input-code').value.trim().replace(/[^0-9]/g, '');
    if (code.length < 4 || !/^[0-9]+$/.test(code)) { toast('Código inválido — solo números'); return; }
    if (S.joiningRoom)   { toast('Ya estás intentando entrar...'); return; }
    S.joiningRoom = true;
    $('btn-join-confirm').disabled    = true;
    $('btn-join-confirm').textContent = 'Entrando...';
    const doJoin = () => wsSend('JOIN_ROOM', {
      playerId:S.id,
      playerName:getPlayerName(),
      code,
      equippedDice:S.diceEquipped,
      equippedAvatar:S.avatarEquipped,
      equippedSpecial:S.specialEquipped,
      equippedSpecials:S.specialsEquipped
    });
    withSocketReady(doJoin);
    _joinAttemptTimer = setTimeout(() => {
      if (!S.joiningRoom) return;
      clearJoinAttempt();
      toast('No respondió la sala. Revisá la conexión e intentá otra vez.', 4000);
      ensureRealtimeConnection();
    }, 10000);
  };

  /* Código en partida */
  $('btn-copy-game-code').onclick = () => {
    const code = S.roomCode || '';
    navigator.clipboard?.writeText(code)
      .then(()  => toast('Código copiado: ' + code))
      .catch(()  => toast('Código: ' + code));
  };

  /* Sala de espera */
  $('btn-copy-code').onclick = () => {
    navigator.clipboard?.writeText(S.roomCode||'')
      .then(()  => toast('Código copiado: ' + S.roomCode))
      .catch(()  => toast('Código: ' + S.roomCode));
  };

  $('btn-leave-room').onclick = () => {
    if (!S.roomId) return;
    leaveCurrentServerContext();
    goLobby('Saliste de la sala');
  };

  $('btn-cancel-room').onclick = () => {
    if (!S.roomId || !S.isOwner) return;
    wsSend('CANCEL_ROOM', { roomId:S.roomId, playerId:S.id });
    goLobby(null);
  };

  $('btn-ready').onclick = () => {
    wsSend('PLAYER_READY', { roomId:S.roomId, playerId:S.id, equippedDice:S.diceEquipped, equippedAvatar:S.avatarEquipped, equippedSpecial:S.specialEquipped, equippedSpecials:S.specialsEquipped });
    $('btn-ready').classList.add('hidden');
    const rs = $('ready-status');
    if (rs) {
      rs.querySelector('.ready-status-text').textContent = '⏳ Esperando...';
      rs.classList.remove('hidden');
    }
  };

  /* ── Botón TIRAR: SIN NINGÚN BLOQUEO ──────────────── */
  $('btn-roll').onclick = () => {
    wsSend('ROLL', { roomId:S.roomId, playerId:S.id });
    setMsg('','');
    playSkinRoll();
  };
  
  /* ── Botón BANCO: SIN NINGÚN BLOQUEO ──────────────── */
  $('btn-bank').onclick = () => {
    wsSend('BANK', { roomId:S.roomId, playerId:S.id });
  };

  /* Salir de partida — modal propio, va al lobby inmediatamente */
  $('btn-leave-game').onclick = () => {
    if (!S.roomId) return;
    showConfirm('¿Seguro que querés salir de la partida?', () => {
      leaveCurrentServerContext();
      goLobby('Saliste de la partida');
    });
  };

  /* Chat fijo */
  $('chat-send').onclick     = sendChat;
  $('chat-input').onkeydown  = e => { if (e.key==='Enter') sendChat(); };
  $('btn-chat-mic').onclick  = toggleRecording;
  
  // Emotes VIP (item 3): picker de emojis en el chat
  const vipEmojis = $('vip-emojis');
  if (vipEmojis) {
    ['🔥','🎲','💀','👏','😂','😱','🎉','💯'].forEach(emo => {
      const btn = document.createElement('button');
      btn.textContent = emo;
      btn.className = 'vip-emoji-btn';
      btn.onclick = () => {
        if (S.roomId) {
          wsSend('CHAT_MESSAGE', { roomId:S.roomId, playerId:S.id, playerName:S.name, message: emo });
          SFX.chat();
        }
      };
      vipEmojis.appendChild(btn);
    });
  }
  // Mostrar/ocultar picker VIP según item equipado
  function updateVIPPicker() {
    if (vipEmojis) {
      vipEmojis.classList.toggle('hidden', !hasSpecial('3'));
    }
  }
  updateVIPPicker();
  // NOTA: updateVIPPicker también se llama desde loadEquippedItems() directamente

  /* Ranking */
/* Ranking */
  $('btn-back-ranking').onclick = navigateToLobbyOrAuth;

  /* Modal victoria */
$('btn-play-again').onclick = () => {
  clearInterval(_playAgainTimer);
  _playAgainTimer = null;
  $('play-again-hint')?.classList.add('hidden');
  const btn = $('btn-play-again');
  if (S.rematchRoom?.id && S.rematchRoom.id === S.roomId) {
    goToPlayAgain(S.rematchRoom);
    return;
  }
  if (S.roomId) {
    btn.disabled = true;
    btn.textContent = 'Preparando revancha...';
    withSocketReady(() => wsSend('GET_ROOM_STATE', { roomId:S.roomId, immediate: true }));
    setTimeout(() => {
      if (!btn.disabled || !$('modal-win') || $('modal-win').classList.contains('hidden')) return;
      btn.disabled = false;
      btn.textContent = '🎲 Revancha';
      toast('La revancha tardó demasiado. Intentá de nuevo.', 3500);
      ensureRealtimeConnection();
    }, 10000);
  } else {
    goLobby(null);
  }
};

  $('btn-new-game').onclick = () => {
    if (S.roomId) leaveCurrentServerContext();
    goLobby(null);
  };

  $('registration-code').oninput = function() {
    this.value = this.value.replace(/\D/g, '').slice(0, 6);
  };
  $('registration-code').onkeydown = event => {
    if (event.key === 'Enter') $('btn-verify-registration').click();
  };

  $('btn-verify-registration').onclick = async () => {
    const code = $('registration-code').value.trim();
    if (!_pendingRegistrationEmail || !/^\d{6}$/.test(code)) {
      toast('Ingresá el código de 6 dígitos');
      return;
    }
    const btn = $('btn-verify-registration');
    btn.disabled = true;
    btn.textContent = 'Verificando...';
    try {
      const res = await fetch('/api/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email:_pendingRegistrationEmail, code })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      $('registration-verification').classList.add('hidden');
      $('login-pass').value = '';
      toast('Cuenta verificada. Ya podés iniciar sesión.');
      $('auth-mode-btn').click();
    } catch (err) {
      toast('⚠ ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Verificar y crear cuenta';
    }
  };

  $('btn-resend-registration').onclick = () => $('btn-register').click();

  /* Enter en inputs */
  $('input-name').onkeydown = e => { if (e.key==='Enter') $('btn-create').click(); };
  $('input-code').onkeydown = e => { if (e.key==='Enter') $('btn-join-confirm').click(); };

}

/* ── Cargar perfil del usuario ──────────────────────── */
async function loadProfile() {
  const token = localStorage.getItem('gameToken');
  if (!token) { toast('Debes iniciar sesión'); return; }
  
  $('profile-loading').classList.remove('hidden');
  $('profile-content').classList.add('hidden');
  showScreen('screen-profile');

  try {
    const [profileRes, invRes] = await Promise.all([
      authenticatedFetch('/api/user/profile'),
      authenticatedFetch('/api/user/inventory')
    ]);
    if (!profileRes.ok) throw new Error('Error al cargar perfil');
    const p = await profileRes.json();
    const inv = invRes.ok ? await invRes.json() : null;

    // Avatar y header — mostrar icono equipado si tiene (SIN fondo dorado)
    let avatarDisplay = getInitial(p.alias);
    let hasCustomAvatar = false;
    const profileAv = $('profile-avatar');
    S.avatarEquipped = null;
    if (inv?.equipped?.avatar) {
      const equippedItem = inv.owned.find(i => i.id === parseInt(inv.equipped.avatar));
      if (equippedItem) {
        avatarDisplay = equippedItem.icon;
        hasCustomAvatar = true;
      }
    }
    profileAv.textContent = avatarDisplay;
    profileAv.classList.toggle('profile-avatar-icon', hasCustomAvatar);
    // Marco Premium (item 15): agregar borde dorado al avatar del perfil
    if (inv?.equipped?.special === '15') {
      profileAv.classList.add('premium-marco');
    } else {
      profileAv.classList.remove('premium-marco');
    }
    // +50% Monedas x 1d (item 31): mostrar badge de boost activo
    const boostBadge = $('boost-badge');
    if (boostBadge) {
      boostBadge.classList.toggle('hidden', inv?.equipped?.special !== '31');
    }
    S.avatarEquipped = hasCustomAvatar ? avatarDisplay : null;
    $('profile-name').textContent = p.alias || '—';
    $('profile-email').textContent = p.email || '—';
    $('profile-rank').textContent = (p.rankIcon || '🌱') + ' ' + (p.rank || 'Rookie');

    // Nivel y XP
    $('profile-level').textContent = p.level || 1;
    const xp = p.xp || 0;
    const xpInCurrent = p.xpInCurrentLevel || 0;
    const xpNeeded = p.xpForNext || 200;
    const pct = Math.min(100, Math.round((xpInCurrent / Math.max(xpNeeded, 1)) * 100));
    $('profile-xp').textContent = `${xp} XP — ${xpInCurrent}/${xpNeeded} al siguiente nivel`;
    const bar = $('xp-bar-fill');
    if (bar) bar.style.width = pct + '%';

    // Stats
    $('ps-coins').textContent = (p.coins || 0).toLocaleString();
    $('ps-wins').textContent = p.gamesWon || 0;
    $('ps-games').textContent = p.gamesPlayed || 0;
    $('ps-tournaments').textContent = p.tournamentsEntered || 0;
    $('ps-tournament-wins').textContent = p.tournamentsWon || 0;
    $('ps-best-turn').textContent = (p.bestTurn || 0).toLocaleString();
    // Racha
    $('ps-streak-current').textContent = '🔥 Racha actual: ' + (p.winStreak || 0);
    $('ps-streak-best').textContent = '🏆 Mejor racha: ' + (p.bestWinStreak || 0);

    // Privacidad: toggle ocultar última conexión
    const hideLastSeenToggle = $('profile-hide-last-seen');
    if (hideLastSeenToggle) {
      // Cargar desde localStorage primero, luego desde API
      const saved = localStorage.getItem('macko_hide_last_seen');
      const initialValue = saved !== null ? saved === 'true' : !!p.hide_last_seen;
      hideLastSeenToggle.checked = initialValue;
      // Reemplazar event listeners previos (clonar y re-asignar evita duplicados)
      const newToggle = hideLastSeenToggle.cloneNode(true);
      hideLastSeenToggle.parentNode.replaceChild(newToggle, hideLastSeenToggle);
      newToggle.addEventListener('change', async function() {
        const token = localStorage.getItem('gameToken');
        if (!token) return;
        try {
          const res = await fetch('/api/user/hide-last-seen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ hide: this.checked })
          });
          if (res.ok) {
            // Guardar localmente también
            localStorage.setItem('macko_hide_last_seen', String(this.checked));
            toast(this.checked ? '🔒 Última conexión oculta' : '🔓 Última conexión visible', 'success');
          } else {
            // Revertir si el server falló
            this.checked = !this.checked;
            toast('Error al guardar preferencia', 'error');
          }
        } catch(e) {
          // Revertir si hay error de red
          this.checked = !this.checked;
          toast('Error de red al guardar preferencia', 'error');
        }
      });
    }

    $('profile-loading').classList.add('hidden');
    $('profile-content').classList.remove('hidden');
    
    // Cargar inventario DESPUÉS de que los boosts se hayan cargado (render único)
    fetch('/api/user/boost-status', { headers: { 'Authorization': `Bearer ${localStorage.getItem('gameToken')}` } })
      .then(r => r.json()).then(d => {
        window._lastBoosts = d.boosts || {};
        loadInventoryData(inv, window._lastBoosts);
      }).catch(() => {
        // Si falla boost, renderizar sin boosts
        window._lastBoosts = {};
        loadInventoryData(inv, {});
      });
    loadTransactions();
    loadBadges();
  } catch (err) {
    toast('⚠ ' + err.message);
    $('profile-loading').textContent = 'Error al cargar perfil';
    navigateToLobbyOrAuth();
  }
}

/* ── Renderizar inventario (con datos ya obtenidos) ── */
const ULTRA_ITEM_EQUIP_CATEGORIES = Object.freeze({
  32: 'dice',
  33: 'dice',
  34: 'avatar',
  35: 'avatar',
  36: 'special'
});

const CONSUMABLE_IDS = new Set(['31','52','53','54']);

function getItemEquipCategory(item) {
  if (!item) return null;
  if (CONSUMABLE_IDS.has(String(item.id))) return 'consumable';
  if (item.category === 'avatares') return 'avatar';
  if (item.category === 'dados') return 'dice';
  if (item.category === 'especiales') return 'special';
  return ULTRA_ITEM_EQUIP_CATEGORIES[Number(item.id)] || null;
}

// Subtipo visual para items especiales (agrupación en inventario)
function getSpecialSubtype(item) {
  const avatarEffects = new Set([45, 46, 15]);
  const diceEffects = new Set([29, 48]);
  const nickChat = new Set([3, 28, 30]);
  const victoryEffects = new Set([16, 36, 47, 51]);
  if (avatarEffects.has(Number(item.id))) return 'avatar';
  if (diceEffects.has(Number(item.id))) return 'dice';
  if (victoryEffects.has(Number(item.id))) return 'victory';
  if (nickChat.has(Number(item.id))) return 'chat';
  return 'other';
}

function loadInventoryData(invData, boostsData) {
  const container = $('profile-inventory');
  if (!container) return;
  if (!invData) {
    container.innerHTML = '<p class="inv-empty">Error al cargar</p>';
    return;
  }
  const owned = invData.owned || [];
  const equipped = invData.equipped || {};
  if (!owned.length) {
    container.innerHTML = '<p class="inv-empty">Todavía no compraste nada 🛒</p>';
    return;
  }
  const categories = {
    avatar: { label: 'Avatares', icon: '👤' },
    dice: { label: 'Dados', icon: '🎲' },
    special: { label: 'Efectos', icon: '✨' },
    consumable: { label: 'Consumibles', icon: '🧪' }
  };
  container.innerHTML = '';
  window._lastBoosts = window._lastBoosts || {};
  const boosts = boostsData || window._lastBoosts;
  if (boostsData) window._lastBoosts = boostsData;
  const now = Date.now();

  // Equipped summary bar
  const eqSummary = document.createElement('div');
  eqSummary.className = 'inv-equipped-bar';
  const eqParts = [];
  for (const [cat, info] of Object.entries(categories)) {
    if (cat === 'consumable') continue;
    const eqId = equipped[cat];
    const eqItem = eqId ? owned.find(i => String(i.id) === String(eqId)) : null;
    const label = eqItem ? `${info.icon} ${eqItem.name}` : `${info.icon} Original`;
    const cls = cat === 'avatar' ? 'avatar' : cat === 'dice' ? 'dice' : 'special';
    eqParts.push(`<span class="eq-slot eq-${cls}" onclick="equipItemFromProfile('default','${cat}')">${esc(label)}</span>`);
  }
  eqSummary.innerHTML = `<span style="font-size:10px;opacity:.5;margin-right:6px">EQUIPADO</span>${eqParts.join('')}`;
  container.appendChild(eqSummary);

  // Items by category
  for (const [equipCategory, categoryInfo] of Object.entries(categories)) {
    const items = owned.filter(item => getItemEquipCategory(item) === equipCategory);
    if (!items.length) continue;
    const section = document.createElement('div');
    section.className = 'inv-cat';
    container.appendChild(section);

    if (equipCategory === 'special') {
      const subLabels = { avatar:'🎭 Avatar', dice:'🎲 Dados', victory:'🏆 Victoria', chat:'💬 Chat', other:'✨ Otros' };
      const grouped = {};
      items.forEach(item => {
        const sub = getSpecialSubtype(item);
        if (!grouped[sub]) grouped[sub] = [];
        grouped[sub].push(item);
      });
      let first = true;
      for (const [subKey, subItems] of Object.entries(grouped)) {
        const subSection = document.createElement('div');
        subSection.className = 'inv-subcat';
        if (first) subSection.innerHTML = `<p class="inv-cat-title">${categoryInfo.label}</p>`;
        subSection.innerHTML += `<p class="inv-subtitle">${subLabels[subKey] || '✨ Otros'}</p><div class="inv-items"></div>`;
        section.appendChild(subSection);
        const subGrid = subSection.querySelector('.inv-items');
        if (first) {
          const defaultDiv = document.createElement('div');
          defaultDiv.className = 'inv-item' + (String(equipped[equipCategory] || '') === '' ? ' equipped' : '');
          defaultDiv.innerHTML = `<div class="inv-item-icon">${categoryInfo.icon}</div><span class="inv-item-name">Ninguno</span>`;
          defaultDiv.onclick = () => equipItemFromProfile('default', equipCategory);
          subGrid.appendChild(defaultDiv);
          first = false;
        }
        subItems.forEach(item => renderInventoryItem(item, equipCategory, subGrid, equipped, boosts, now));
      }
    } else {
      section.innerHTML = `<p class="inv-cat-title">${categoryInfo.label}</p><div class="inv-items"></div>`;
      const grid = section.querySelector('.inv-items');
      if (equipCategory !== 'consumable') {
        const defaultDiv = document.createElement('div');
        defaultDiv.className = 'inv-item' + (String(equipped[equipCategory] || '') === '' ? ' equipped' : '');
        defaultDiv.innerHTML = `<div class="inv-item-icon">${categoryInfo.icon}</div><span class="inv-item-name">Ninguno</span>`;
        defaultDiv.onclick = () => equipItemFromProfile('default', equipCategory);
        grid.appendChild(defaultDiv);
      }
      items.forEach(item => renderInventoryItem(item, equipCategory, grid, equipped, boosts, now));
    }
  }

  function renderInventoryItem(item, equipCategory, grid, equipped, boosts, now) {
    const isEquipped = String(equipped[equipCategory] || '') === String(item.id);
    const div = document.createElement('div');
    div.className = 'inv-item' + (isEquipped ? ' equipped' : '');
    let boostTimerHtml = '';
    const boostKey = { '31':'coins_all', '52':'xp', '53':'coins_win_50', '54':'coins_win_100' }[String(item.id)];
    const boostExpiry = boostKey ? (boosts || {})[boostKey] : 0;
    if (boostExpiry && boostExpiry > now) {
      const remaining = boostExpiry - now;
      const hours = Math.floor(remaining / 3600000);
      const mins = Math.floor((remaining % 3600000) / 60000);
      boostTimerHtml = `<span class="inv-boost-timer">⏱ ${hours}h ${mins}m</span>`;
    }
    div.innerHTML = `
      <div class="inv-item-icon">${esc(String(item.icon || ''))}</div>
      <span class="inv-item-name">${esc(String(item.name || 'Cosmético'))}</span>
      ${boostTimerHtml}
      ${isEquipped ? '<span class="inv-equipped-badge">✔</span>' : ''}
    `;
    if (equipCategory === 'consumable') {
      div.classList.add('inv-consumable');
      const useBtn = document.createElement('button');
      useBtn.className = 'btn btn-gold inv-use-btn';
      useBtn.textContent = boostTimerHtml ? 'Activo' : 'Usar';
      useBtn.disabled = !!boostTimerHtml;
      if (!boostTimerHtml) {
        useBtn.onclick = (e) => {
          e.stopPropagation();
          equipItemFromProfile(String(item.id), 'special');
        };
      }
      div.appendChild(useBtn);
    } else {
      div.onclick = () => openInventoryPreview(item, equipCategory, isEquipped);
    }
    grid.appendChild(div);
  }
}

/* ── Cargar historial de transacciones ────────────── */
async function loadTransactions() {
  const token = localStorage.getItem('gameToken');
  if (!token) return;
  const container = $('profile-transactions');
  if (!container) return;
  try {
    const res = await fetch('/api/user/transactions', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) { container.innerHTML = ''; return; }
    const { transactions } = await res.json();
    if (!transactions || !transactions.length) {
      container.innerHTML = '<p class="inv-empty">Sin movimientos aún</p>';
      return;
    }
    container.innerHTML = '';
    transactions.slice(0, 30).forEach(t => {
      const div = document.createElement('div');
      div.className = 'tx-item';
      const isPositive = (t.amount || 0) > 0;
      const amt = t.amount || 0;
      // Formatear fecha (validar que sea válida)
      const ts = t.created_at ? Number(t.created_at) : 0;
      const d = new Date(ts > 0 ? ts : Date.now());
      const isValid = !isNaN(d.getTime());
      const dateStr = isValid ? d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '—';
      const timeStr = isValid ? d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '';
      div.innerHTML = `
        <div class="tx-icon">${isPositive ? '🪙' : '🛒'}</div>
        <div class="tx-info">
          <span class="tx-reason">${esc(t.reason || 'Transacción')}</span>
          <span class="tx-date">${dateStr} ${timeStr}</span>
        </div>
        <span class="tx-amount ${isPositive ? 'pos' : 'neg'}">${isPositive ? '+' : ''}${amt.toLocaleString()}</span>
      `;
      container.appendChild(div);
    });
  } catch (err) {
    container.innerHTML = '';
  }
}

/* ── Equipar item desde perfil ──────────────────────── */
async function equipItemFromProfile(itemId, category) {
  const token = localStorage.getItem('gameToken');
  if (!token) return;
  try {
    const res = await fetch('/api/user/equip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ itemId, category })
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error);
    // Efecto de sonido al equipar
    SFX.equip();
    // Efecto visual: flash en el item clickeado
    const allItems = document.querySelectorAll('.inv-item');
    allItems.forEach(el => {
      el.classList.remove('equip-flash');
      void el.offsetWidth; // Forzar reflow
    });
    // Encontrar el item clickeado por el toast que sigue
    setTimeout(() => {
      const equippedItem = document.querySelector('.inv-item.equipped');
      if (equippedItem) {
        equippedItem.classList.add('equip-flash');
        setTimeout(() => equippedItem.classList.remove('equip-flash'), 800);
      }
    }, 100);
    toast('✔ Equipado correctamente');
    loadProfile(); // Recargar perfil (usa loadInventoryData internamente)
    loadEquippedItems(); // Actualizar items equipados en S
    saveEquippedCache(); // Guardar inmediatamente en cache local
  } catch (err) {
    toast('⚠ ' + err.message);
  }
}

/* ── Cargar insignias ───────────────────────────────── */
async function loadBadges() {
  const token = localStorage.getItem('gameToken');
  if (!token) return;
  const container = $('profile-badges');
  if (!container) return;
  try {
    const res = await authenticatedFetch('/api/user/missions');
    if (!res.ok) { container.innerHTML = ''; return; }
    const { missions } = await res.json();
    const achievements = missions.filter(m => m.type === 'achievement');
    if (!achievements.length) { container.innerHTML = '<p class="inv-empty">Sin insignias aún</p>'; return; }
    container.innerHTML = '';
    achievements.forEach(m => {
      const div = document.createElement('div');
      div.className = 'badge-item' + (m.completed ? '' : ' locked');
      const icons = { 'a1': '🏆', 'a2': '🎖️', 'a3': '🔥', 'a4': '👑', 'a6': '💎', 'a7': '⚡', 'a8': '💯' };
      div.innerHTML = `
        <div class="badge-icon">${icons[m.id] || '🏅'}</div>
        <div class="badge-info">
          <span class="badge-name">${esc(m.name)}</span>
          <span class="badge-desc">${esc(m.desc)}</span>
        </div>
        <span class="badge-status">${m.completed ? '✅' : '🔒'}</span>
      `;
      container.appendChild(div);
    });
  } catch (err) {
    container.innerHTML = '';
  }
}

/* ── Cargar misiones ───────────────────────────────── */
async function loadMissions() {
  const token = localStorage.getItem('gameToken');
  if (!token) return;

  const container = $('missions-container');
  if (!container) return;
  container.innerHTML = '<p style="color:var(--text3);text-align:center;padding:20px">Cargando misiones...</p>';

  try {
    const res = await authenticatedFetch('/api/user/missions');
    if (!res.ok) { container.innerHTML = '<p style="color:var(--text3)">Error al cargar</p>'; return; }
    const { missions } = await res.json();
    if (!missions?.length) { container.innerHTML = '<p style="color:var(--text3)">Sin misiones disponibles</p>'; return; }

    container.innerHTML = '';

    // Agrupar por tipo
    const groups = { daily: [], weekly: [], achievement: [] };
    missions.forEach(m => {
      if (groups[m.type]) groups[m.type].push(m);
    });

    const typeLabels = { daily: 'Diarias', weekly: 'Semanales', achievement: 'Logros' };
    const typeIcons = { daily: '📅', weekly: '📆', achievement: '🏆' };

    for (const [typeKey, items] of Object.entries(groups)) {
      if (!items.length) continue;
      
      const section = document.createElement('div');
      section.className = 'missions-section';
      section.innerHTML = `<p class="shop-section-title">${typeIcons[typeKey]} <span>${typeLabels[typeKey]}</span></p>`;
      
      items.forEach(m => {
        const pct = m.req > 0 ? Math.round((m.progress / m.req) * 100) : 0;
        const isComplete = m.completed === 1;
        const isClaimed = m.claimed === 1;
        const div = document.createElement('div');
        div.className = 'mission-item' + (isComplete ? ' completed' : '') + (isClaimed ? ' claimed' : '');
        div.innerHTML = `
          <div class="mission-info">
            <span class="mission-name">${esc(m.name)}</span>
            <span class="mission-desc">${esc(m.desc)}</span>
          </div>
          <div class="mission-progress-wrap">
            <div class="mission-bar-bg"><div class="mission-bar-fill" style="width:${Math.min(pct, 100)}%"></div></div>
            <span class="mission-pct">${m.progress}/${m.req}</span>
          </div>
          <div class="mission-reward">
            ${isClaimed ? '✅' : isComplete ? `<button class="btn btn-gold btn-claim" data-mid="${esc(m.id)}" style="padding:5px 12px;font-size:11px">🪙 Cobrar</button>` : `🪙 ${Number(m.coins) || 0}`}
          </div>
        `;
        section.appendChild(div);
      });
      
      container.appendChild(section);
    }

    // Cobro puntual: no recarga la tienda completa.
    container.querySelectorAll('.btn-claim').forEach(btn => {
      btn.onclick = () => claimMission(btn.dataset.mid, btn, async () => {
        const row = btn.closest('.mission-item');
        row?.classList.add('claimed');
        const reward = row?.querySelector('.mission-reward');
        if (reward) reward.textContent = '✅';
        await loadLobbyMissions();
      });
    });
  } catch (err) {
    container.innerHTML = '<p style="color:var(--text3)">Error al cargar</p>';
  }
}

/* ── Verificar misiones completadas ─────────────────── */
async function checkPendingMissions() {
  const token = localStorage.getItem('gameToken');
  if (!token) return;
  try {
    const res = await authenticatedFetch('/api/user/missions');
    if (!res.ok) return;
    const { missions } = await res.json();
    const completed = missions.filter(m => m.completed === 1 && m.claimed === 0);
    completed.forEach(m => {
      // Mostrar notificación de misión completada
      showMissionComplete(m);
    });
  } catch (e) {}
}

/* ── Notificación de misión ─────────────────────────── */
function showMissionComplete(mission) {
  const overlay = document.createElement('div');
  overlay.className = 'entry-banner-overlay';
  overlay.style.zIndex = '700';
  overlay.style.pointerEvents = 'auto';
  overlay.innerHTML = `
    <div class="entry-banner-box" style="border-color:var(--gold)">
      <div class="entry-banner-icon" style="font-size:40px">🎯</div>
      <div class="entry-banner-title" style="color:var(--gold);font-size:16px">¡Misión completada!</div>
      <div class="entry-banner-sub">
        <strong>${esc(mission.name)}</strong><br>
        🪙 +${Number(mission.coins) || 0} monedas ${Number(mission.xp) > 0 ? '· ⚡ +'+Number(mission.xp)+'XP' : ''}
      </div>
      <button class="btn btn-gold" style="margin-top:12px;padding:8px 16px;font-size:12px" onclick="this.closest('.entry-banner-overlay').remove()">🎉 Reclamar</button>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => {
    overlay.classList.add('fade-out');
    setTimeout(() => overlay.remove(), 600);
  }, 5000);
}

/* ── Cargar estado del cofre diario ─────────────────── */
let _chestReadyAt = 0;
let _chestTimer = null;

function renderChestCountdown() {
  const btn = $('btn-chest');
  if (!btn || !_chestReadyAt) return;
  const remaining = Math.max(0, _chestReadyAt - Date.now());
  if (remaining <= 0) {
    clearInterval(_chestTimer);
    _chestTimer = null;
    _chestReadyAt = 0;
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-chest-icon">🎁</span><span class="btn-chest-copy"><strong>Cofre listo</strong><small>Reclamar</small></span>';
    btn.title = '¡Reclamá tu cofre diario!';
    return;
  }
  const totalMinutes = Math.ceil(remaining / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  btn.disabled = true;
  btn.innerHTML = `<span class="btn-chest-icon">⏳</span><span class="btn-chest-copy"><strong>Nuevo cofre</strong><small>${hours}h ${mins}m</small></span>`;
  btn.title = `Cofre disponible en ${hours}h ${mins}min`;
}

async function loadChestStatus() {
  const token = localStorage.getItem('gameToken');
  if (!token) return;
  const btn = $('btn-chest');
  if (!btn) return;
  try {
    const res = await authenticatedFetch('/api/user/chest-status');
    if (!res.ok) return;
    const d = await res.json();
    if (d.canClaim) {
      _chestReadyAt = 0;
      clearInterval(_chestTimer);
      _chestTimer = null;
      btn.disabled = false;
      btn.innerHTML = '<span class="btn-chest-icon">🎁</span><span class="btn-chest-copy"><strong>Cofre listo</strong><small>Reclamar</small></span>';
      btn.title = '¡Reclamá tu cofre diario!';
    } else {
      _chestReadyAt = Date.now() + Number(d.remaining || 0);
      renderChestCountdown();
      clearInterval(_chestTimer);
      _chestTimer = setInterval(renderChestCountdown, 30000);
    }
  } catch (e) {}
}

/* ── Aplicar Tema Oscuro Ultra ───────────────────────── */
function applyUltraDarkTheme(enable) {
  document.body.classList.toggle('ultra-dark', enable);
}

/* ── Aplicar marco dorado premium en TODOS los avatares ── */
function applyPremiumMarcoToAll() {
  const hasPremium = hasSpecial('15');
  // Perfil
  const profileAv = $('profile-avatar');
  if (profileAv) profileAv.classList.toggle('premium-marco', hasPremium);
  // Lobby avatar
  const lobbyAv = $('lobby-avatar');
  if (lobbyAv) lobbyAv.classList.toggle('avatar-premium', hasPremium);
  // Scoreboard avatars (se actualizan dinamicamente, se aplica en renderSB)
  // Room players avatars (se actualizan dinamicamente, se aplica en renderRoom)
}

/* ── Actualizar badges de boosts con tiempo restante ── */
let _boostTimer = null;

async function updateBoostBadge() {
  const badge = $('boost-badge');
  if (!badge) return;
  const token = localStorage.getItem('gameToken');
  if (!token) {
    badge.classList.add('hidden');
    if (_boostTimer) { clearInterval(_boostTimer); _boostTimer = null; }
    return;
  }
  try {
    const res = await fetch('/api/user/boost-status', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) { badge.classList.add('hidden'); return; }
    const data = await res.json();
    const boosts = data.boosts || {};
    const now = Date.now();
    // Encontrar el boost activo más cercano a expirar
    const active = Object.entries(boosts).filter(([k,v]) => v > now);
    if (!active.length) {
      badge.classList.add('hidden');
      if (_boostTimer) { clearInterval(_boostTimer); _boostTimer = null; }
      return;
    }
    badge.classList.remove('hidden');
    const earliestExpiry = Math.min(...active.map(([_,v]) => v));
    const updateTime = () => {
      const remaining = earliestExpiry - Date.now();
      if (remaining <= 0) {
        badge.classList.add('hidden');
        if (_boostTimer) { clearInterval(_boostTimer); _boostTimer = null; }
        loadInventoryData(); // Recargar inventario al expirar boost
        return;
      }
      const hours = Math.floor(remaining / 3600000);
      const mins = Math.floor((remaining % 3600000) / 60000);
      const labels = active.map(([k]) => ({ coins_all:'🪙+50%', xp:'⚡x2', coins_win_50:'🪙+50%W', coins_win_100:'🪙x2W' }[k] || '⚡')).join(' ');
      badge.textContent = `${labels} ${hours}h ${mins}m`;
    };
    updateTime();
    if (_boostTimer) clearInterval(_boostTimer);
    _boostTimer = setInterval(updateTime, 10000);
  } catch (e) {
    badge.classList.add('hidden');
  }
}

/* ── Cache local de items equipados (fallback si match state no tiene datos) ── */
function saveEquippedCache() {
  try {
    localStorage.setItem('macko_equipped', JSON.stringify({
      dice: S.diceEquipped,
      avatar: S.avatarEquipped,
      special: S.specialEquipped,
      specials: S.specialsEquipped,
      specialSlots: S.specialSlots,
      ts: Date.now()
    }));
  } catch(e) {}
}

function loadEquippedCache() {
  try {
    const raw = localStorage.getItem('macko_equipped');
    if (!raw) return false;
    const d = JSON.parse(raw);
    // Cache válido por 1 hora
    if (Date.now() - d.ts > 3600000) {
      localStorage.removeItem('macko_equipped');
      return false;
    }
    if (d.dice && !S.diceEquipped) S.diceEquipped = d.dice;
    if (d.avatar && !S.avatarEquipped) S.avatarEquipped = d.avatar;
    if (!S.specialsEquipped.length) setEquippedSpecials(d.specials, d.special, d.specialSlots);
    return true;
  } catch(e) { return false; }
}

/* ── Cargar items equipados del usuario ─────────────── */
async function loadEquippedItems() {
  const token = localStorage.getItem('gameToken');
  if (!token) return;
  try {
    const invRes = await authenticatedFetch('/api/user/inventory');
    if (!invRes.ok) {
      // Fallback: cargar del cache local
      loadEquippedCache();
      return;
    }
    const inv = await invRes.json();
    if (!inv || !inv.equipped) return;
    console.log('📦 loadEquippedItems:', JSON.stringify(inv.equipped));
    S.diceEquipped = inv.equipped.dice || null;
    setEquippedSpecials(inv.equipped.specials, inv.equipped.special, inv.equipped.specialSlots);
    // Avatar equipado
    let avatarLoaded = false;
    if (inv.equipped.avatar) {
      const item = inv.owned.find(i => i.id === parseInt(inv.equipped.avatar));
      if (item) {
        S.avatarEquipped = item.icon;
        avatarLoaded = true;
      }
    }
    if (!avatarLoaded) {
      S.avatarEquipped = null;
    }
    // Guardar en cache local
    saveEquippedCache();
    // Actualizar avatar en lobby si estamos en él
    const lobbyAv = $('lobby-avatar');
    if (lobbyAv) {
      lobbyAv.textContent = S.avatarEquipped || getInitial(S.name);
      lobbyAv.classList.toggle('avatar-icon', !!S.avatarEquipped);
    }
    // Aplicar Tema Oscuro Ultra (item 17)
    applyUltraDarkTheme(hasSpecial('17'));
    // Item 15: Marco Premium en todos los avatares
    applyPremiumMarcoToAll();
    // Mostrar/ocultar picker Emotes VIP (item 3)
    const vipEmojis = $('vip-emojis');
    if (vipEmojis) {
      vipEmojis.classList.toggle('hidden', !hasSpecial('3'));
    }
    // Actualizar badge de boost +50% con tiempo restante
    updateBoostBadge();
  } catch (e) { 
    console.error('Error loading equipped:', e);
    // Fallback: cargar del cache local
    loadEquippedCache();
  }
}

/* ── Cargar saldo real del usuario ───────────────────── */
async function loadUserBalance() {
  const token = localStorage.getItem('gameToken');
  if (!token) return;
  
  try {
    const res = await authenticatedFetch('/api/user/balance');
    if (res.ok) {
      const data = await res.json();
      updateUserPanel(S.name, data.coins);
    }
  } catch (err) {
    console.error("Error al cargar saldo:", err);
  }
}

/* ── Cargar items Ultra (exclusivos del cofre) ────── */
async function equipShopItem(itemId, category) {
  const token = localStorage.getItem('gameToken');
  if (!token) return;
  try {
    const res = await fetch('/api/user/equip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ itemId: String(itemId), category })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo equipar');
    await loadEquippedItems();
    updateUserPanel(S.name, parseInt($('lobby-coins')?.textContent) || 0);
    toast('✔ Item aplicado en el lobby');
    // Recargar pestaña activa
    const activeTab = document.querySelector('.shop-tab.active');
    if (activeTab && ['dados','avatares','efectos','consumibles'].includes(activeTab.dataset.tab)) {
      loadShopTab(activeTab.dataset.tab);
    }
  } catch (err) {
    toast('⚠ ' + err.message);
  }
}

/* ── Cargar tienda por pestaña (dados/avatares/efectos/consumibles) ── */
let _shopLoadController = null;
let _shopLoadRequest = 0;

async function loadShopTab(tabName) {
  const token = localStorage.getItem('gameToken');
  if (!token) return;
  const container = $('shop-items-' + tabName);
  if (!container) return;
  const catMap = { dados:'dados', avatares:'avatares', efectos:'especiales', consumibles:'consumibles' };
  const mainCat = catMap[tabName];
  if (!mainCat) { container.innerHTML = ''; return; }
  const requestId = ++_shopLoadRequest;
  _shopLoadController?.abort();
  const controller = new AbortController();
  _shopLoadController = controller;
  let timeout = null;
  container.innerHTML = '<p class="shop-desc shop-loading">Cargando tienda...</p>';
  try {
    timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch('/api/shop/catalog', {
      headers: { 'Authorization': `Bearer ${token}` },
      cache: 'no-store',
      signal: controller.signal
    });
    clearTimeout(timeout);
    timeout = null;
    if (requestId !== _shopLoadRequest) return;
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) {
        throw new Error('Tu sesión necesita volver a conectarse');
      }
      throw new Error(errorData.error || 'No se pudo cargar la tienda');
    }
    const { items, ownedIds, equipped, boosts } = await res.json();
    if (requestId !== _shopLoadRequest) return;
    if (!Array.isArray(items)) throw new Error('El catálogo llegó incompleto');
    const ownedSet = new Set((ownedIds || []).map(Number));
    window._lastBoosts = window._lastBoosts || {};
    if (boosts) window._lastBoosts = boosts;
    const filtered = items.filter(i => i.category === mainCat);
    if (!filtered.length) { container.innerHTML = '<p class="shop-desc">Sin items en esta categoría</p>'; return; }
    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'shop-grid';
    container.appendChild(grid);
    filtered.forEach(item => {
      const isOwned = ownedSet.has(Number(item.id));
      const cat = item.category === 'avatares' || (item.category === 'ultra' && /^Avatar/i.test(item.name)) ? 'avatar'
        : item.category === 'dados' || (item.category === 'ultra' && /^Dados/i.test(item.name)) ? 'dice' : 'special';
      const isEquipped = equipped && equipped[cat] === String(item.id);
      const div = document.createElement('div');
      div.className = 'shop-item' + (isOwned ? ' owned' : '');
      div.dataset.category = cat;
      div.dataset.id = String(item.id);
      if (isOwned) {
        const isConsumable = mainCat === 'consumibles';
        const boostKey = { '31':'coins_all', '52':'xp', '53':'coins_win_50', '54':'coins_win_100' }[String(item.id)];
        const boosts = window._lastBoosts || {};
        const boostActive = boostKey && boosts[boostKey] > Date.now();
        div.innerHTML = `
          <div class="shop-item-preview">${esc(item.icon)}</div>
          <h3>${esc(item.name)}</h3>
          <p class="shop-item-desc">${esc(item.desc)}</p>
          ${isConsumable
            ? (boostActive ? '<span class="shop-item-timer" data-boost="'+boostKey+'">✅ Activo</span>' : '<button class="btn btn-gold btn-equip-shop" data-id="'+esc(item.id)+'" data-cat="special">Usar</button>')
            : '<button class="btn btn-ghost btn-equip-shop" data-id="'+esc(item.id)+'" data-cat="'+esc(cat)+'" '+(isEquipped ? 'disabled' : '')+'>'+(isEquipped ? '✔ Equipado' : 'Aplicar')+'</button>'}
        `;
        if (boostActive) {
          const timerEl = div.querySelector('.shop-item-timer');
          if (timerEl) {
            const updateTimer = () => {
              const rem = (boosts[boostKey] || 0) - Date.now();
              if (rem <= 0) { timerEl.textContent = '⏳ Expirado'; return; }
              timerEl.textContent = `⏱ ${Math.floor(rem/3600000)}h ${Math.floor((rem%3600000)/60000)}m`;
            };
            updateTimer();
            setInterval(updateTimer, 30000);
          }
        }
      } else {
        div.innerHTML = `
          <div class="shop-item-preview">${esc(item.icon)}</div>
          <h3>${esc(item.name)}</h3>
          <p class="shop-item-desc">${esc(item.desc)}</p>
          <p class="shop-item-hint" style="font-size:10px;color:var(--text3);margin-top:4px;opacity:.7">Click para ver preview</p>
          <button class="btn btn-gold btn-buy" data-id="${esc(item.id)}">🪙 ${esc(item.priceDisplay)}</button>
        `;
      }
      grid.appendChild(div);
    });
    // Handlers de compra
    grid.querySelectorAll('.btn-buy').forEach(btn => {
      btn.onclick = async (e) => {
        const itemId = e.target.getAttribute('data-id');
        if (!token) { toast('Debes iniciar sesión'); return; }
        const originalText = e.target.textContent;
        e.target.textContent = '⏳';
        e.target.disabled = true;
        try {
          const r = await fetch('/api/shop/buy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ itemId })
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error);
          SFX.purchase();
          const boughtItem = e.target.closest('.shop-item');
          if (boughtItem) {
            boughtItem.classList.add('shop-item-bought');
            const rect = boughtItem.getBoundingClientRect();
            for (let i = 0; i < 12; i++) {
              const spark = document.createElement('div');
              spark.className = 'buy-sparkle';
              spark.style.cssText = `left:${rect.left + rect.width/2}px;top:${rect.top + rect.height/2}px;--tx:${(Math.random() - .5) * 120}px;--ty:${(Math.random() - .5) * 120}px;background:${['#D4AF37','#F0D060','#fff','#52c87a'][Math.floor(Math.random()*4)]};animation-duration:${.4 + Math.random() * .4}s;`;
              document.body.appendChild(spark);
              setTimeout(() => spark.remove(), 800);
            }
          }
          toast('🎉 ' + d.message);
          loadShopTab(tabName);
        } catch (err) {
          toast('⚠ ' + err.message);
          e.target.textContent = originalText;
          e.target.disabled = false;
        }
      };
    });
    // Handlers de equipar/aplicar
    grid.querySelectorAll('.btn-equip-shop:not([disabled])').forEach(btn => {
      btn.onclick = () => equipShopItem(btn.dataset.id, btn.dataset.cat);
    });
  } catch (err) {
    if (requestId !== _shopLoadRequest) return;
    const message = err?.name === 'AbortError'
      ? 'La tienda tardó demasiado en responder'
      : (err?.message || 'No se pudo cargar la tienda');
    container.innerHTML = '';
    const errorBox = document.createElement('div');
    errorBox.className = 'shop-load-error';
    errorBox.innerHTML = `<p>⚠ ${esc(message)}</p><button class="btn btn-ghost">Reintentar</button>`;
    errorBox.querySelector('button').onclick = () => loadShopTab(tabName);
    container.appendChild(errorBox);
    ensureRealtimeConnection();
  } finally {
    if (timeout) clearTimeout(timeout);
    if (_shopLoadController === controller) _shopLoadController = null;
  }
}

/* ── Cargar catálogo de tienda (dinámico desde backend) ─── */
// La tienda por categorías usa loadShopTab. Esta función recarga la pestaña activa.
async function loadShopCatalog() {
  const activeTab = document.querySelector('.shop-tab.active');
  if (activeTab && ['dados','avatares','efectos','consumibles'].includes(activeTab.dataset.tab)) {
    return loadShopTab(activeTab.dataset.tab);
  }
}

/* ── Cargar paquetes de monedas (Mercado Pago) ─────── */
async function loadCoinPacks() {
  const token = localStorage.getItem('gameToken');
  if (!token) return;
  
  try {
    const res = await fetch('/api/mercadopago/packs', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const { packs } = await res.json();
    const grid = $('coin-packs-grid');
    if (!grid) return;
    
    grid.innerHTML = '';
    for (const [id, pack] of Object.entries(packs)) {
      const div = document.createElement('div');
      div.className = 'coin-pack' + (pack.badge ? ' premium' : '');
      const icon = pack.icon || '💎';
      const contents = [pack.coins ? `🪙 ${pack.coins.toLocaleString()}` : '', pack.xp ? `⚡ ${pack.xp} XP` : '', ...(pack.items || []).map(item => `${item.icon} ${item.name}`)].filter(Boolean);
      div.innerHTML = `
        <div class="coin-pack-icon">${icon}</div>
        ${pack.badge ? `<span class="pack-badge">${esc(pack.badge)}</span>` : ''}
        <div class="coin-pack-label">${esc(pack.name)}</div>
        <div class="coin-pack-contents">${contents.map(esc).join('<br>')}</div>
        <div class="coin-pack-price">${esc(pack.priceDisplay)}</div>
        <button class="btn btn-gold btn-buy-coins" data-pack="${esc(id)}" style="margin-top:4px" ${IS_NATIVE_APP ? 'disabled' : ''}>${IS_NATIVE_APP ? 'Próximamente en la tienda móvil' : 'Comprar'}</button>
      `;
      grid.appendChild(div);
    }
    
    // Handlers para comprar con Mercado Pago
    document.querySelectorAll('.btn-buy-coins').forEach(btn => {
      btn.onclick = async (e) => {
        const packId = e.target.dataset.pack;
        e.target.textContent = '⏳';
        e.target.disabled = true;
        
        try {
          const res = await fetch('/api/mercadopago/create-preference', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ packId })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          
          // En app nativa el checkout se abre seguro fuera del WebView.
          if (IS_NATIVE_APP && window.openMackoExternalUrl) await window.openMackoExternalUrl(data.redirectUrl);
          else window.location.href = data.redirectUrl;
        } catch (err) {
          toast('⚠ ' + err.message);
          e.target.textContent = 'Comprar';
          e.target.disabled = false;
        }
      };
    });
  } catch (err) {
    console.error("Error cargando paquetes:", err);
  }
}

window.addEventListener('macko-native-resume', () => {
  if (!IS_NATIVE_APP || !isLogged()) return;
  loadUserBalance();
  ensureRealtimeConnection();
});

/* ════════════════════════════════════════════════════════
   REGLAS Y TUTORIAL
   ════════════════════════════════════════════════════════ */

/* ── Modal de reglas ───────────────────────────────── */
function openRules() {
  $('modal-rules')?.classList.remove('hidden');
}

function closeRules() {
  $('modal-rules')?.classList.add('hidden');
}

// Inicializar tabs del modal de reglas
function initRulesTabs() {
  const tabs = document.querySelectorAll('.rules-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.rules-tab-content').forEach(c => c.classList.remove('active'));
      const target = document.getElementById('rules-tab-' + tab.dataset.rulesTab);
      if (target) target.classList.add('active');
    });
  });
}

/* ── Tour interactivo ───────────────────────────────── */
const TOUR_STEPS = [
  {
    icon: '🎲',
    title: '¡Bienvenido a Los 10.000!',
    desc: 'Este es el <strong>lobby principal</strong>. Acá podés crear una sala, unirte a una partida, o explorar el portal social. ¡Vamos a mostrarte cómo funciona!'
  },
  {
    icon: '🎯',
    title: 'Crear o unirse',
    desc: 'Tocá <strong>"+ Crear sala"</strong> para crear tu propia partida, o <strong>"→ Unirse"</strong> para ingresar un código de sala. Necesitás al menos <strong>2 jugadores</strong> para jugar.',
    highlight: 'btn-create',
    highlightPadding: 8
  },
  {
    icon: '🏛️',
    title: 'Portal social',
    desc: 'En el <strong>Portal social</strong> podés ver tus amigos, chatear con ellos, buscar jugadores, y ver partidas activas para unirte.',
    highlight: 'btn-portal',
    highlightPadding: 8
  },
  {
    icon: '🏆',
    title: 'Torneos y Ranking',
    desc: 'Competí en <strong>torneos automáticos</strong> y subí en el <strong>ranking global</strong>. Ganá monedas, skins y demostrá quién es el mejor.',
    highlight: 'btn-tournaments',
    highlightPadding: 8
  },
  {
    icon: '🎲',
    title: 'Cómo se juega',
    desc: 'En tu turno, tirá los <strong>6 dados</strong>. Separá los que puntúen (1 = 100pts, 5 = 50pts). Podés <strong>seguir tirando</strong> o <strong>plantarte</strong>. ¡Llegá a <strong>10.000 exactos</strong> para ganar!',
    highlight: 'btn-rules',
    highlightPadding: 8
  },
  {
    icon: '🚀',
    title: '¡A jugar!',
    desc: 'Ya sabés lo básico. Creá una sala o unite a una partida existente. Recordá: necesitás <strong>1.000+ pts</strong> para entrar al juego. ¡Suerte! 🍀'
  }
];

let _tourStep = 0;
let _tourActive = false;

function startTour(fromStep) {
  _tourStep = fromStep || 0;
  _tourActive = true;
  const overlay = $('tour-overlay');
  const spotlight = $('tour-spotlight');
  if (overlay) overlay.classList.remove('hidden');
  
  // Cerrar modal de reglas si está abierto
  closeRules();
  
  renderTourStep();
}

function renderTourStep() {
  const step = TOUR_STEPS[_tourStep];
  if (!step) { endTour(); return; }
  
  $('tour-step-badge').textContent = (_tourStep + 1) + '/' + TOUR_STEPS.length;
  $('tour-icon').textContent = step.icon;
  $('tour-title').textContent = step.title;
  $('tour-desc').innerHTML = step.desc;
  
  // Navegación
  $('tour-prev').disabled = _tourStep === 0;
  $('tour-next').textContent = _tourStep === TOUR_STEPS.length - 1 ? '🎉 ¡Listo!' : 'Siguiente →';
  
  // Spotlight highlight (doble RAF para asegurar layout final)
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const spotlight = $('tour-spotlight');
    const padding = step.highlightPadding || 4;
    if (step.highlight) {
      const target = $(step.highlight);
      if (target) {
        const rect = target.getBoundingClientRect();
        spotlight.classList.remove('hidden');
        spotlight.style.left = (rect.left - padding) + 'px';
        spotlight.style.top = (rect.top - padding) + 'px';
        spotlight.style.width = (rect.width + padding * 2) + 'px';
        spotlight.style.height = (rect.height + padding * 2) + 'px';
      } else {
        spotlight.classList.add('hidden');
      }
    } else {
      spotlight.classList.add('hidden');
    }
  }));
}

function nextTourStep() {
  if (_tourStep < TOUR_STEPS.length - 1) {
    _tourStep++;
    renderTourStep();
  } else {
    endTour();
    toast('🎲 ¡Ya estás listo para jugar!', 3500);
  }
}

function prevTourStep() {
  if (_tourStep > 0) {
    _tourStep--;
    renderTourStep();
  }
}

function endTour() {
  _tourActive = false;
  _tourStep = 0;
  const overlay = $('tour-overlay');
  const spotlight = $('tour-spotlight');
  if (overlay) overlay.classList.add('hidden');
  if (spotlight) spotlight.classList.add('hidden');
  // Marcar que el tour ya se vio
  localStorage.setItem('macko_tour_seen', '1');
}

/* ── Detectar primer ingreso ────────────────────────── */
function checkFirstTimeTutorial() {
  const tourSeen = localStorage.getItem('macko_tour_seen');
  if (!tourSeen) {
    // Esperar hasta que el lobby esté visible (el usuario puede estar en Auth)
    const waitForLobby = setInterval(() => {
      const lobby = $('screen-lobby');
      if (lobby && lobby.classList.contains('active')) {
        clearInterval(waitForLobby);
        setTimeout(() => startTour(0), 800);
      }
    }, 300);
    // Timeout de seguridad por si nunca llega al lobby
    setTimeout(() => clearInterval(waitForLobby), 15000);
  }
}

/* ── Compartir victoria en redes ─────────────────────── */
function shareWin() {
  const playerName = $('win-name')?.textContent?.replace('¡','').replace('!','').trim() || 'Alguien';
  const gameUrl = window.location.href.split('?')[0].split('#')[0];
  const roomCode = S.roomCode ? `\n📋 Código de sala: ${S.roomCode}` : '';
  const text = `🎲 ¡${playerName} ganó una partida de Los 10.000 de Macko! 🏆${roomCode}\n\nJugá online gratis en: ${gameUrl}\n#Los10000DeMacko #JuegoDeDados`;
  
  if (navigator.share) {
    navigator.share({ title: 'Los 10.000 de Macko', text, url: gameUrl })
      .then(() => toast('📤 Publicado', 2500))
      .catch(() => {});
  } else if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      toast('📋 Texto copiado al portapapeles', 3000);
    }).catch(() => {
      // Fallback manual
      fallbackCopy(text);
    });
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed'; ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); toast('📋 Copiado al portapapeles', 3000); }
  catch(e) { toast('Copiá este texto manualmente: ' + text.slice(0, 60) + '...', 4000); }
  document.body.removeChild(ta);
}

// Cerrar tour con Escape (con cleanup para evitar duplicados)
function _tourKeydown(e) {
  if (e.key === 'Escape' && _tourActive) endTour();
}
document.removeEventListener('keydown', _tourKeydown);
document.addEventListener('keydown', _tourKeydown);

/* ── Arranque ────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  const authSessionValid = await validateStoredAuthSession();
  initRulesTabs();
  // Detectar primer ingreso para tour guiado
  checkFirstTimeTutorial();
  
  // Bind rules button
  const rulesBtn = $('btn-rules');
  if (rulesBtn) rulesBtn.onclick = openRules;
  
  const closeRulesBtn = $('btn-close-rules');
  if (closeRulesBtn) closeRulesBtn.onclick = closeRules;
  
  const closeRulesBtn2 = $('btn-rules-close');
  if (closeRulesBtn2) closeRulesBtn2.onclick = closeRules;
  
  // Share win button
  const shareWinBtn = $('btn-share-win');
  if (shareWinBtn) shareWinBtn.onclick = shareWin;
  
  const tourBtn = $('btn-rules-tour');
  if (tourBtn) tourBtn.onclick = () => startTour(0);
  
  // Tour navigation
  const tourNext = $('tour-next');
  if (tourNext) tourNext.onclick = nextTourStep;
  
  const tourPrev = $('tour-prev');
  if (tourPrev) tourPrev.onclick = prevTourStep;
  
  const tourSkip = $('tour-skip');
  if (tourSkip) tourSkip.onclick = endTour;
  
  // Click on backdrop to skip tour
  const tourBackdrop = document.querySelector('.tour-backdrop');
  if (tourBackdrop) tourBackdrop.onclick = endTour;
  initUI();
  setInterval(checkUpdateIndicator, 5 * 60 * 1000);
  if (sessionStorage.getItem('macko_show_changelog_after_update') === '1') {
    sessionStorage.removeItem('macko_show_changelog_after_update');
    setTimeout(() => loadChangelog(), 900);
  }

  const auth = loadAuthenticatedIdentity();

  if(isLogged() && authSessionValid && auth?.id){
    S.logged = true;
    S.userId = auth.id;
    S.id = auth.id;
    S.name = auth.username;
    // LLAMADA CLAVE: Al cargar, pedimos el saldo al backend
    if (_validatedBalance) updateUserPanel(S.name, _validatedBalance.coins || 0);
    else loadUserBalance();
    loadEquippedItems();
  } else if (isLogged()) {
    clearAuth();
  }

  const session = loadSession();
  const guest = !isLogged() ? loadGuestIdentity() : null;
  if (session?.id && session?.roomId) {
    S.id     = session.id;
    S.name   = session.name;
    S.roomId = session.roomId;
    S.roomCode = session.roomCode;
    const inp  = $('input-name');
    if (inp) inp.value = session.name || '';
    
    if(isLogged()){
      loadEquippedCache(); // Carga instantánea desde localStorage
      showScreen('screen-lobby');
    } else if (guest) {
      S.id = guest.id;
      showScreen('screen-lobby');
      updateUserPanel(null, 0);
    } else {
      showScreen('screen-auth');
    }
    if (isLogged() || guest) {
      toast('🔄 Restaurando sesión...', 2000);
      connect();
    }
  } else if (session?.id) {
    S.id   = session.id;
    S.name = session.name;
    const inp = $('input-name');
    if (inp) inp.value = session.name || '';
    if(isLogged()){
      loadEquippedCache();
      showScreen('screen-lobby');
      loadLobbyMissions();
      updateUserPanel(S.name, 0);
      connect();
    } else if (guest) {
      S.id = guest.id;
      showScreen('screen-lobby');
      updateUserPanel(null, 0);
      connect();
    }
  } else if (isLogged()) {
    // Usuario logueado sin sesion de sala: mostrar lobby directamente
    loadEquippedCache();
    showScreen('screen-lobby');
    loadLobbyMissions();
    updateUserPanel(S.name, 0);
    connect();
  } else if (guest) {
    S.id = guest.id;
    S.name = guest.username || '';
    const inp = $('input-name');
    if (inp) inp.value = S.name;
    showScreen('screen-lobby');
    updateUserPanel(null, 0);
    saveSession();
    connect();
  }
});

/* ── Navegación Maestra ────────────────────────────── */
function navigateToLobbyOrAuth() {
  if (isLogged()) {
    showScreen('screen-lobby');
    // Recargar items equipados al navegar al lobby
    loadEquippedCache();
    loadEquippedItems().then(() => {
      const coins = parseInt($('lobby-coins')?.textContent) || 0;
      updateUserPanel(S.name, coins);
    }).catch(() => {});
  } else if (hasGuestSession()) {
    showScreen('screen-lobby');
    updateUserPanel(null, 0);
    ensureRealtimeConnection();
  } else {
    clearAuth();
    clearSession();
    showScreen('screen-auth');
  }
}

$('btn-back-to-auth').onclick = () => {
  disconnectSocketForIdentityChange();
  clearAuth();
  clearSession();
  showScreen('screen-auth');
};

/* ── Recuperación de contraseña ─────────────────────── */
$('btn-forgot').onclick = () => {
  $('modal-forgot').classList.remove('hidden');
};

// Función llamada desde el onclick del HTML: onclick="sendRecoveryEmail(event)"
async function sendRecoveryEmail(event) {
  const email = $('forgot-email').value;
  if (!email) {
    toast("Ingresa un correo válido");
    return;
  }

  const btn = event.target;
  btn.textContent = "Enviando...";
  btn.disabled = true;

  try {
    const res = await fetch('/api/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json'},
      body: JSON.stringify({ email })
    });

    if (res.ok) {
      toast("✅ Instrucciones enviadas a tu correo.");
      $('modal-forgot').classList.add('hidden');
    } else {
      const data = await res.json();
      toast("❌ " + (data.error || "Error al enviar"));
    }
  } catch (e) {
    toast("❌ Error de conexión");
  } finally {
    btn.textContent = "Enviar instrucciones";
    btn.disabled = false;
  }
}

/* ── Inicializar previews de dados en la tienda ────────── */
function initShopDicePreviews() {
  // Escanear items de la tienda y reemplazar previews de dados por dados reales
  document.querySelectorAll('.shop-item[data-category="dice"], .shop-item.owned[data-category="dice"]').forEach(item => {
    const skinId = item.dataset.id;
    if (!skinId) return;
    const previewEl = item.querySelector('.shop-item-preview');
    if (!previewEl || previewEl.querySelector('.dice-preview-container')) return;
    if (typeof createDicePreviewDiv !== 'function') return;
    const preview = createDicePreviewDiv(skinId, 'small');
    const container = document.createElement('div');
    container.className = 'dice-preview-container';
    container.appendChild(preview);
    previewEl.innerHTML = '';
    previewEl.appendChild(container);
  });
}

/* ── Preview de items en la tienda ───────────────────── */
const SPECIAL_EFFECTS = {
  '3': { name:'Emotes VIP', desc:'Usá emojis exclusivos en el chat de sala' },
  '15': { name:'Marco Premium', desc:'Tu avatar brilla con marco dorado en toda la interfaz' },
  '16': { name:'Efecto Victoria', desc:'Confetti extra al ganar una partida' },
  '17': { name:'Tema Oscuro Ultra', desc:'Fondo más oscuro y elegante en el lobby' },
  '28': { name:'Nick Dorado', desc:'Tu nombre brilla en dorado en el chat' },
  '29': { name:'Dados Mágicos', desc:'Brillo mágico al rodar los dados' },
  '30': { name:'Racha Visible', desc:'Mostrá tu racha de victorias' },
  '31': { name:'+50% Monedas', desc:'50% más de monedas en cada partida' },
  '36': { name:'Efecto Láser', desc:'Rayos laser cruzan la pantalla al ganar' },
  '45': { name:'Estela Cósmica', desc:'Anillos orbitales giran alrededor de tu avatar' },
  '46': { name:'Aura Real', desc:'Aura dorada pulsante con corona flotante' },
  '47': { name:'Confeti Arcoíris', desc:'Arcoíris giratorio + confetti explosivo al ganar' },
  '48': { name:'Entrada Relámpago', desc:'Rayos eléctricos envuelven tu avatar al entrar' },
  '51': { name:'Efecto Eclipse', desc:'Oscuridad envuelve tu avatar con brillo púrpura' },
};

function openInventoryPreview(item, equipCategory, isEquipped) {
  try {
    const old = document.querySelector('.shop-preview-overlay');
    if (old) old.remove();
    const overlay = document.createElement('div');
    overlay.className = 'shop-preview-overlay';
    let dispose3DPreview = null;
    const closePreview = () => { try { dispose3DPreview?.(); } catch(e) {} overlay.remove(); };
    overlay.onclick = (e) => { if (e.target === overlay) closePreview(); };
    const box = document.createElement('div');
    box.className = 'shop-preview-box';
    const cat = equipCategory === 'dice' ? 'dados' : equipCategory === 'avatar' ? 'avatares' : 'especiales';
    let bodyHtml = '';
    if (cat === 'dados') {
      bodyHtml = buildDicePreviewHTML(String(item.id), item.name || '', item.icon || '');
    } else if (cat === 'avatares') {
      const isPremium = hasSpecial('15');
      bodyHtml = '<div class="avatar-preview-display' + (isPremium ? ' avatar-premium' : '') + '">' + esc(String(item.icon || '')) + '</div><p style="text-align:center;font-size:12px;color:var(--text3)">Así se ve tu avatar en el juego</p>';
    } else if (cat === 'especiales') {
      const effect = SPECIAL_EFFECTS[String(item.id)];
      const demoAvatars = ['🧙‍♂️','👻','🤖','🦹','🧛','🧟','🧞','🧚'];
      const randAvatar = demoAvatars[Math.floor(Math.random()*demoAvatars.length)];
      const specialClass = 'special-' + item.id;
      bodyHtml = '<div class="special-preview-demo"><span class="demo-avatar sc-av ' + specialClass + '">' + esc(randAvatar) + '</span></div><div class="special-preview-desc">' + esc(item.name || '') + '</div>' + (effect ? '<div class="special-preview-effect">✨ ' + esc(effect.desc) + '</div>' : '') + '<p style="font-size:11px;color:var(--text3);text-align:center;margin-top:8px">Así se ve tu avatar con este efecto</p>';
    }
    const equipBtnHtml = isEquipped
      ? '<button class="btn btn-ghost" disabled style="width:100%;opacity:.5;margin-top:12px">Ya equipado ✔</button>'
      : '<button class="btn btn-gold inv-equip-btn" style="width:100%;margin-top:12px">Equipar</button>';
    box.innerHTML = '<div class="shop-preview-header"><h2>' + esc(item.name || '') + '</h2><button class="shop-preview-close">✕</button></div>' + bodyHtml + equipBtnHtml;
    box.querySelector('.shop-preview-close').onclick = closePreview;
    const equipBtn = box.querySelector('.inv-equip-btn');
    if (equipBtn) {
      equipBtn.onclick = () => {
        equipItemFromProfile(String(item.id), equipCategory);
        closePreview();
      };
    }
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    if (cat === 'dados') {
      const stage = box.querySelector('.dice-3d-shop-stage');
      if (stage && typeof loadDice3D === 'function') {
        loadDice3D().then(renderer3D => {
          if (!renderer3D || !stage.isConnected) return;
          dispose3DPreview = renderer3D.createPreview(stage, String(item.id), 5);
          stage.classList.toggle('is-fallback', !dispose3DPreview);
        });
      }
    }
  } catch(e) { toast('⚠ Error: ' + e.message); }
}
window.openInventoryPreview = openInventoryPreview;

function openItemPreview(category, itemId, itemName, itemIcon) {
  // Ensure global access even if SW serves stale cache
  window.openItemPreview = openItemPreview;
  try {
    const old = document.querySelector('.shop-preview-overlay');
    if (old) old.remove();
    const overlay = document.createElement('div');
    overlay.className = 'shop-preview-overlay';
    let dispose3DPreview = null;
    const closePreview = () => {
      try { dispose3DPreview?.(); } catch(e) {}
      overlay.remove();
    };
    overlay.onclick = (e) => { if (e.target === overlay) closePreview(); };
    const box = document.createElement('div');
    box.className = 'shop-preview-box';
    let bodyHtml = '';
    if (category === 'dados' || category === 'dice') {
      bodyHtml = buildDicePreviewHTML(itemId, itemName, itemIcon);
    } else if (category === 'avatares' || category === 'avatar') {
      const isPremium = hasSpecial('15');
      bodyHtml = '<div class="avatar-preview-display' + (isPremium ? ' avatar-premium' : '') + '">' + esc(itemIcon) + '</div><p style="text-align:center;font-size:13px;color:var(--text3)">Preview del avatar — así se ve en el juego</p>';
    } else if (category === 'especiales' || category === 'special') {
      const effect = SPECIAL_EFFECTS[itemId];
      const demoAvatars = ['🧙‍♂️','👻','🤖','🦹','🧛','🧟','🧞','🧚'];
      const randAvatar = demoAvatars[Math.floor(Math.random()*demoAvatars.length)];
      const specialClass = 'special-' + itemId;
      bodyHtml = '<div class="special-preview-demo"><span class="demo-avatar sc-av ' + specialClass + '">' + esc(randAvatar) + '</span></div><div class="special-preview-desc">' + esc(itemName) + '</div>' + (effect ? '<div class="special-preview-effect">✨ ' + esc(effect.desc) + '</div>' : '') + '<p style="font-size:11px;color:var(--text3);text-align:center;margin-top:8px">Así se verá tu avatar con este efecto activo</p>';
    }
    box.innerHTML = '<div class="shop-preview-header"><h2>' + esc(itemName) + '</h2><button class="shop-preview-close">✕</button></div>' + bodyHtml;
    box.querySelector('.shop-preview-close').onclick = closePreview;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    if (category === 'dados' || category === 'dice') {
      const stage = box.querySelector('.dice-3d-shop-stage');
      const previewVal = Number(stage?.dataset.value || 5);
      if (stage && typeof loadDice3D === 'function') {
        loadDice3D().then(renderer3D => {
          if (!renderer3D || !stage.isConnected) return;
          dispose3DPreview = renderer3D.createPreview(stage, String(itemId), previewVal);
          stage.classList.toggle('is-fallback', !dispose3DPreview);
        });
      }
    }
  } catch(e) {
    toast('⚠ Error al mostrar preview: ' + e.message);
  }
}
window.openItemPreview = openItemPreview;

function buildDicePreviewHTML(skinId, itemName, itemIcon) {
  try {
    const skin = typeof DICE_SKINS !== 'undefined' ? DICE_SKINS[skinId] : null;
    const skinName = skin ? skin.name : itemName;
    const previewVal = (typeof SHOP_DICE_PREVIEW !== 'undefined' && SHOP_DICE_PREVIEW[skinId] && SHOP_DICE_PREVIEW[skinId].val) || 5;
    const states = [
      { id: 'dead', label: 'Sin puntuar / Sin entrar', icon: '⚫', val: previewVal },
      { id: 'normal', label: 'En juego (neutral)', icon: '🔵', val: previewVal },
      { id: 'scoring', label: 'Sumando puntos', icon: '🟢', val: previewVal },
      { id: 'hot', label: 'Dados calientes / Victoria', icon: '🔥', val: previewVal },
    ];
    const diceHtml = states.map(s => {
      const dieEl = makeDie(s.val, s.id, skinId);
      dieEl.classList.remove('rolling');
      dieEl.style.cssText = 'margin:0 auto;width:52px;height:52px';
      return '<div class="dice-state-card">' + dieEl.outerHTML + '<div class="dice-state-label"><span class="dice-state-icon">' + s.icon + '</span>' + esc(s.label) + '</div></div>';
    }).join('');
    return '<p style="font-size:12px;color:var(--text3);text-align:center;margin-bottom:8px">🎲 Así se ve <strong>' + esc(skinName) + '</strong> en el juego</p><div class="dice-3d-shop-stage" data-value="' + previewVal + '"><span>Preparando preview 3D…</span></div><div class="dice-states-title">Estados durante la partida</div><div class="dice-states-grid">' + diceHtml + '</div>';
  } catch(e) {
    return '<p style="text-align:center;color:var(--red);padding:20px">Error al generar preview: ' + esc(e.message) + '</p>';
  }
}
