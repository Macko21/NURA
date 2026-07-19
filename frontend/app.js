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
  specialEquipped: null  // ID del item especial equipado
};

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
        '<button class="notif-action-btn ' + (a.style || '') + '" data-nid="' + n.id + '" data-action="' + a.action + '">' + a.label + '</button>'
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
    const token = localStorage.getItem('gameToken');
    const res = await fetch('/api/notifications', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
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
if ('serviceWorker' in navigator) {
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

if ('serviceWorker' in navigator) {
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
  if (_swRegistration) return _swRegistration;
  if (!('serviceWorker' in navigator)) return null;
  try {
    _swRegistration = await navigator.serviceWorker.ready;
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
    let sub = await registration.pushManager.getSubscription();
    if (!sub) {
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyData.publicKey)
      });
    }
    const saveRes = await fetch('/api/push/subscribe', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ subscription: sub.toJSON() })
    });
    if (!saveRes.ok) throw new Error('No se pudo guardar la suscripción');
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
  try {
    const registration = await getServiceWorkerRegistration();
    if (!registration) return false;
    const sub = await registration.pushManager.getSubscription();
    const browserSubscribed = !!sub;
    if (browserSubscribed) {
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

// Cache busting: limpiar localStorage viejo de versiones anteriores
const GAME_CACHE_KEY = 'macko_cache_ver';
function checkCacheVersion() {
  const appVersion = typeof GAME_VERSION !== 'undefined' ? GAME_VERSION : '0.0.0';
  const cachedVersion = localStorage.getItem(GAME_CACHE_KEY);
  if (cachedVersion !== appVersion) {
    if (cachedVersion) sessionStorage.setItem('macko_show_changelog_after_update', '1');
    // Nueva versión: limpiar todo lo que no sea sesión activa
    const keptKeys = [AUTH_KEY, 'gameToken', SESSION_KEY, GAME_CACHE_KEY, 'macko_push', 'macko_equipped', 'macko_notifs', 'game_last_seen_version'];
    for (const key of Object.keys(localStorage)) {
      if (key && !keptKeys.includes(key)) {
        localStorage.removeItem(key);
      }
    }
    localStorage.setItem(GAME_CACHE_KEY, appVersion);
    console.log('🧹 Cache local limpiado para versión', appVersion);
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

function clearAuth() {
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem('gameToken');
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
    ctx.fillStyle = '#0b0b12';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const g = ctx.createRadialGradient(
      canvas.width * .4, 0, 0,
      canvas.width * .4, canvas.height * .5, canvas.height
    );
    g.addColorStop(0, 'rgba(26,20,48,.8)');
    g.addColorStop(1, 'rgba(11,11,18,0)');
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
      ctx.fillStyle = `rgba(212,175,55,${p.alpha})`;
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  draw();
}

/* ── Confetti ────────────────────────────────────────── */
function launchConfetti() {
  const area = $('confetti-area');
  if (!area) return;
  area.innerHTML = '';
  const colors = ['#D4AF37','#f5d060','#52c87a','#e05555','#5580e0','#ffffff'];
  for (let i = 0; i < 60; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.cssText = `
      left:${Math.random()*100}%;
      background:${colors[Math.floor(Math.random()*colors.length)]};
      animation-duration:${1.2 + Math.random()*1.5}s;
      animation-delay:${Math.random()*.8}s;
      transform:rotate(${Math.random()*360}deg);
    `;
    area.appendChild(p);
  }
}

// ── Sistema de audio → audio.js ───────────────────────
// (AC, ac, tone, SFX, SKIN_PARTICLES, spawnSkinParticles, SKIN_SOUND, getActiveSkinAudio, playSkinRoll, playSkinScore, playSkinHot)
// Funciones de música (definidas en audio.js):
// startLobbyMusic, startGameMusic, startRoomMusic, playWinMusic, stopMusic,
// toggleMute, isMuted, getMusicVolume, setMusicVolume, SFX, ensureAudioContext

/* ── Helpers ─────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const uid = () => 'p' + Math.random().toString(36).slice(2,9) + Date.now().toString(36);
const formatNum = n => Number(n).toLocaleString('es-AR');

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
  // Gestión de música de fondo según la pantalla
  if (id === 'screen-lobby') {
    startLobbyMusic();
  } else if (id === 'screen-room') {
    startRoomMusic();
  } else if (id === 'screen-game') {
    startGameMusic();
  } else if (id === 'screen-ranking') {
    startRankingMusic();
  } else if (id === 'screen-profile') {
    startProfileMusic();
  } else if (id === 'screen-portal') {
    startPortalMusic();
  } else {
    // Pantallas de auth, join, ranking, etc. → silencio
    stopMusic();
  }
  // Actualizar estado del botón de música
  updateMusicBtn();
}

// ── Botón de música ────────────────────────────────────
function updateMusicBtn() {
  const btn = $('btn-music-toggle');
  if (!btn) return;
  const vol = getMusicVolume();
  if (_isMuted || vol === 0) {
    btn.textContent = '🔇';
    btn.title = 'Sonido desactivado';
  } else if (vol < 0.33) {
    btn.textContent = '🔈';
    btn.title = `Volumen ${Math.round(vol * 100)}%`;
  } else if (vol < 0.66) {
    btn.textContent = '🔉';
    btn.title = `Volumen ${Math.round(vol * 100)}%`;
  } else {
    btn.textContent = '🔊';
    btn.title = `Volumen ${Math.round(vol * 100)}%`;
  }
  // Sincronizar slider si existe
  const slider = $('music-volume-slider');
  if (slider) slider.value = Math.round(vol * 100);
  const icon = $('music-vol-icon');
  if (icon) icon.textContent = btn.textContent;
}

function toggleMusic() {
  ensureAudioContext();
  const nowMuted = toggleMute(); // toggleMute() devuelve el NUEVO estado
  if (!nowMuted && _musicType) {
    // Se acaba de desmutear → reiniciar música según pantalla actual
    const activeScreen = document.querySelector('.screen.active');
    if (activeScreen) showScreen(activeScreen.id);
    else startLobbyMusic();
  } else if (nowMuted) {
    // Se acaba de mutear → detener música
    stopMusic();
  }
  updateMusicBtn();
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
    lobbyAv?.classList.toggle('avatar-premium', S.specialEquipped === '15');
    
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

function connect(cb) {
  // Cancelar cualquier reconexión pendiente
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
  if (_pingTimer)      { clearInterval(_pingTimer);     _pingTimer      = null; }

  // Si ya hay una conexión abierta o conectando, no abrir otra
  if (S.ws && (S.ws.readyState === WebSocket.OPEN || S.ws.readyState === WebSocket.CONNECTING)) {
    cb?.();
    return;
  }

// Protocolo dinámico (si es http pasa a ws, si es https pasa a wss)
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  
  // location.host toma automáticamente el dominio y puerto (ej: '10mildemacko.onrender.com' o 'localhost:3000')
  const host = window.location.host; 

  S.ws = new WebSocket(`${protocol}//${host}`);

  S.ws.onopen = () => {
    console.log('WS conectado');
    // Siempre mandar roomId para reconexión automática
    wsSend('IDENTIFY', { playerId:S.id, playerName:getPlayerName(), roomId:S.roomId });
    cb?.();

    // Ping cada 25s para mantener viva la conexión
    _pingTimer = setInterval(() => {
      if (S.ws?.readyState === WebSocket.OPEN) {
        try { S.ws.send(JSON.stringify({type:'PING'})); } catch(e){}
      }
    }, 25000);
  };

  S.ws.onmessage = e => {
    try { const {type,data}=JSON.parse(e.data); if(type!=='PONG') handle(type,data); }
    catch(x){ console.error(x); }
  };

  S.ws.onclose = (ev) => {
    console.log('WS cerrado, reconectando...');
    if (_pingTimer) { clearInterval(_pingTimer); _pingTimer = null; }
    // Reconectar en 2s, siempre con el roomId guardado para restaurar sesión
    _reconnectTimer = setTimeout(() => connect(), 2000);
  };

  S.ws.onerror = () => {};
}

function wsSend(type, data={}) {
  if (S.ws?.readyState === WebSocket.OPEN)
    S.ws.send(JSON.stringify({type,data}));
}

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
      // Si había un joiningRoom pendiente, puede reintentar
      if (S.joiningRoom) {
        S.joiningRoom = false;
        resetJoinBtn();
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
      S.joiningRoom = false;
      resetJoinBtn();
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
      S.joiningRoom = false;
      resetJoinBtn();
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
    case 'JOINED_ACTIVE_GAME':
      S.roomId      = data.match.roomId;
      S.roomCode    = data.room?.code || data.match.roomCode || null;
      S.match       = data.match;
      S.entered     = false;
      S.isOwner     = false;
      S.joiningRoom = false;
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

    case 'PLAYER_JOINED_GAME':
      S.match = data.match;
      syncEquippedFromMatch(data.match);
      renderSB(data.match);
      sys(`${data.playerName} se unió a la partida`);
      toast(`➕ ${data.playerName} se unió`, 2500);
      break;

    /* ── Sala ────────────────────────────────────────── */
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
      S.joiningRoom = false;
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
      showDice(data.dice,'all');
      setMsg(`Sacó ${data.rollScore} pts → Costo 1000 → Queda con ${data.gained} pts`, 'good');
      updateTurnUI(data.match);
      if (data.playerId===S.id) {
        S.entered=true;
        showEntryBanner(data.gained);
        stopTimer();
        SFX.enter();
      }
      renderSB(data.match);
      sys(`✅ ${data.playerName} entró al juego — queda con ${data.gained} pts`);
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
      $('btn-roll').disabled = true;
      stopTimer();
      // Envolver en try/catch para evitar que errores de red arruinen la pantalla de victoria
      try { updateGameCoins(); } catch(e) { console.warn('Error actualizando monedas:', e); }
      try { checkPendingMissions(); } catch(e) { console.warn('Error revisando misiones:', e); }
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
      SFX.win();
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
      toast('🔥 Tu match de torneo esta listo! Sala: ' + data.roomId, 5000);
      if (S.name && data.roomId) {
        S.roomId = data.roomId;
        saveSession();
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
      S.joiningRoom = false;
      const joinBtn = $('btn-join-confirm');
      if (joinBtn) { joinBtn.disabled=false; joinBtn.textContent='Entrar →'; }
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
  S.diceEquipped    = me.equippedDice || null;
  S.avatarEquipped  = me.equippedAvatar || null;
  S.specialEquipped = me.equippedSpecial || null;
  saveEquippedCache();
  // Aplicar efectos especiales INMEDIATAMENTE (sin esperar loadEquippedItems async)
  // Item 17: Tema Oscuro Ultra
  applyUltraDarkTheme(S.specialEquipped === '17');
  // Item 15: Marco Premium - aplicar en todos los avatares visibles
  applyPremiumMarcoToAll();
  // Item 3: Emotes VIP - mostrar/ocultar picker
  const vips = $('vip-emojis');
  if (vips) vips.classList.toggle('hidden', S.specialEquipped !== '3');
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
    if (p.equippedSpecial === '30' && p.entered) {
      const streakVal = p.winStreak || 0;
      if (streakVal > 0) {
        rachaHtml = `<span class="sc-streak">🔥${streakVal}</span>`;
      }
    }
    chip.innerHTML = `
      <span class="sc-av${hasCustomAvatar ? ' icon' : ''}">${avContent}</span>
      ${yoTag}
      <span class="sc-nm">${esc(p.name)}</span>
      <span class="sc-sc">${p.score}</span>
      ${rachaHtml}
      <span class="sc-sb">${sub}</span>`;
    // Marco Premium: avatar dorado en el jugador que tiene el item equipado
    if (p.equippedSpecial === '15') {
      const scAv = chip.querySelector('.sc-av');
      if (scAv) scAv.classList.add('avatar-premium');
    }
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
  fetch('/api/user/balance', { headers: { 'Authorization': `Bearer ${token}` } })
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
  
  d.innerHTML = `
    <span class="cn">${esc(name)}</span>
    <span class="audio-player">
      <button class="audio-play-btn">▶</button>
      <span class="audio-duration">${duration || 0}s</span>
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
        <span class="portal-friend-av">${f.equipped_avatar ? f.equipped_avatar : '👤'}</span>
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
        <span class="portal-friend-av">${p.equipped_avatar ? p.equipped_avatar : '👤'}</span>
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
      <div class="portal-game-item">
        <span class="portal-game-code">${esc(g.code)}</span>
        <span class="portal-game-players">${g.playerCount}/${g.maxPlayers} 👥</span>
      </div>
    `).join('');
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
    list.innerHTML = '<p style="text-align:center;padding:20px;color:var(--text3);font-size:13px">No hay torneos activos ahora</p>';
    return;
  }
  list.innerHTML = tournaments.map(t => {
    const statusIcon = t.status === 'active' ? '⚔️' : t.status === 'registration' ? '📝' : t.status === 'completed' ? '✅' : '❌';
    const feeText = parseInt(t.fee) > 0 ? `Fee: ${formatNum(parseInt(t.fee))} 🪙` : 'Gratis';
    const prizeText = parseInt(t.prize_pool) > 0 ? `Premios: ${formatNum(parseInt(t.prize_pool))} 🪙` : '';
    const startTime = t.start_time ? new Date(Number(t.start_time)) : null;
    const startTimeStr = startTime && !isNaN(startTime.getTime()) ? startTime.toLocaleString('es-AR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';
    const isReg = t.is_registered;
    return `<div class="tournament-card" style="
      background:var(--bg-card2);border:1px solid var(--border2);border-radius:10px;
      padding:14px;margin-bottom:8px;cursor:pointer;
      transition:border-color .2s
    " onclick="showTournamentBracket('${t.id}')">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
        <div>
          <div style="font-size:14px;font-weight:600;color:var(--text)">${statusIcon} ${esc(t.name)}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">${esc(t.description || '')}</div>
          ${startTimeStr ? `<div style="font-size:10px;color:var(--gold);margin-top:3px">🕐 Empieza: ${startTimeStr}</div>` : ''}
        </div>
        <div style="text-align:right;font-size:12px;color:var(--text2);white-space:nowrap">
          <div>${parseInt(t.registered_count || 0)}/${t.max_players}</div>
          <div style="font-size:10px;color:var(--gold)">${feeText}</div>
          ${prizeText ? `<div style="font-size:10px;color:var(--gold)">${prizeText}</div>` : ''}
        </div>
      </div>
      <div style="margin-top:6px;display:flex;gap:6px;font-size:11px">
        <span style="color:var(--text3);margin-right:auto">Ronda ${t.current_round || 0}/${t.rounds || '?'}</span>
        <button class="btn-ghost-sm" style="padding:2px 8px;font-size:10px;width:auto;color:var(--text2);border-color:rgba(255,255,255,.08)" 
          onclick="event.stopPropagation();showTournamentParticipantsModal('${t.id}','${esc(t.name).replace(/'/g,"\\'")}')">👥 Ver participantes</button>
        ${t.status === 'registration' && !isReg ? `<button class="btn btn-gold" style="padding:4px 12px;font-size:11px;width:auto;margin-left:auto" onclick="event.stopPropagation();registerTournament('${t.id}')">Inscribirme</button>` : ''}
        ${t.status === 'registration' && isReg ? `<span class="btn btn-gold" style="padding:4px 12px;font-size:11px;width:auto;margin-left:auto;opacity:.7;cursor:default">✅ Inscripto</span>` : ''}
        ${t.status === 'active' ? `<button class="btn btn-ghost" style="padding:4px 12px;font-size:11px;width:auto;margin-left:auto" onclick="event.stopPropagation();showTournamentBracket('${t.id}')">Ver bracket</button>` : ''}
      </div>
    </div>`;
  }).join('');
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



async function showTournamentParticipantsModal(tournamentId, tournamentName) {
  const token = localStorage.getItem('gameToken');
  if (!token) { toast('Debés iniciar sesión'); return; }
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
        <div style="font-size:16px;font-weight:700;color:var(--text)">👥 ${tournamentName || 'Participantes'}</div>
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
      return `<div class="bracket-round" style="margin-bottom:14px">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid var(--border2);padding-bottom:4px;margin-bottom:6px">Ronda ${round.round}</div>
        ${(round.matches || []).map(m => {
          const isCompleted = m.status === 'completed';
          const isBye = !m.player1_id || !m.player2_id;
          return `<div style="display:flex;gap:8px;padding:8px;background:rgba(255,255,255,.03);border-radius:6px;margin-bottom:4px;font-size:12px;border-left:3px solid ${isCompleted ? 'var(--green)' : (isBye ? 'var(--text3)' : 'var(--gold)')}">
            <div style="flex:1">
              <div style="color:${m.winner_id === m.player1_id ? 'var(--green)' : 'var(--text2)'};font-weight:${m.winner_id === m.player1_id ? '600' : '400'}">${esc(m.player1_name || 'BYE')} ${m.player1_score > 0 ? '<span style="color:var(--gold)">(' + m.player1_score + ')</span>' : ''}</div>
              <div style="color:${m.winner_id === m.player2_id ? 'var(--green)' : 'var(--text2)'};font-weight:${m.winner_id === m.player2_id ? '600' : '400'}">${esc(m.player2_name || 'BYE')} ${m.player2_score > 0 ? '<span style="color:var(--gold)">(' + m.player2_score + ')</span>' : ''}</div>
            </div>
            ${isCompleted ? '<span style="color:var(--green);font-size:10px">✅</span>' : (isBye ? '<span style="color:var(--text3);font-size:10px">—</span>' : '<span style="color:var(--gold);font-size:10px">⏳</span>')}
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
  $('lobby-missions-desktop')?.classList.remove('hidden');
  if (desktopList) desktopList.innerHTML = '<div class="lobby-missions-state">Cargando misiones...</div>';
  try {
    const res = await fetch('/api/user/missions', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('No se pudieron cargar las misiones');
    const { missions } = await res.json();
    const dailies = (Array.isArray(missions) ? missions : []).filter(m => m.type === 'daily');
    if (!dailies.length) { 
      $('btn-missions-mobile')?.classList.add('hidden');
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
        ${claimed ? '<span class="lm-check">✔</span>' : ''}
      </div>`;
    }).join('');
    
    // Móvil: mostrar botón que abre modal de misiones
    $('btn-missions-mobile')?.classList.remove('hidden');
    // Desktop: poblar tarjeta de misiones
    if (desktopList) { 
      desktopList.innerHTML = html;
      $('lobby-missions-desktop')?.classList.remove('hidden');
    }
  } catch(e) { 
    $('btn-missions-mobile')?.classList.remove('hidden');
    $('lobby-missions-desktop')?.classList.remove('hidden');
    if (desktopList) desktopList.innerHTML = '<button class="missions-retry" onclick="loadLobbyMissions()">Reintentar</button>';
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
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k.startsWith('macko-')).map(k => caches.delete(k)));
    }
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
      <div class="rk-mt">${r.games_played||0} partidas</div></div>
      <div class="rk-wins"><div class="rk-w">${r.games_won||0}</div><div class="rk-wl">victorias</div></div>`;
    list.appendChild(d);
  });
}

/* ── Modal victoria ──────────────────────────────────── */
function showWin(playerName, desc, dice, skinId, specialId) {
  if (!$('modal-win').classList.contains('hidden')) return;
  const playAgainBtn = $('btn-play-again');
  if (playAgainBtn) {
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
  launchConfetti();
  // Efecto Victoria: si el jugador local tiene item 16 equipado, confetti extra
  if (String(specialId || '') === '16') {
    setTimeout(() => launchConfetti(), 1000);
    setTimeout(() => launchConfetti(), 2000);
  }
  if (String(specialId || '') === '36') launchLaserVictory();
}

function launchLaserVictory() {
  const layer = document.createElement('div');
  layer.className = 'victory-laser-layer';
  for (let i = 0; i < 12; i++) {
    const beam = document.createElement('span');
    beam.style.setProperty('--angle', `${i * 30}deg`);
    beam.style.setProperty('--delay', `${(i % 4) * 0.08}s`);
    layer.appendChild(beam);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 2300);
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
  document.getElementById('shop-items-container')?.addEventListener('click', function shopPreviewClick(ev) {
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
            <div class="invite-player-av">${av}</div>
            <div class="invite-player-info">
              <div class="invite-player-name">${esc(p.alias || p.name || 'Jugador')}</div>
              <div class="invite-player-meta">${p.games_played || 0} partidas · ${p.games_won || 0} victorias</div>
            </div>
            <button class="invite-send-btn" onclick="sendGameInvite('${p.id}','${esc(p.alias || p.name || 'Jugador')}')">Invitar</button>
          </div>`;
        }).join('');
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
      if (tab.dataset.tab === 'coins') loadCoinPacks();
      if (tab.dataset.tab === 'items') loadShopCatalog();
      if (tab.dataset.tab === 'missions') loadMissions();
      if (tab.dataset.tab === 'ultra') loadUltraItems();
    };
  });

  /* ── Perfil ─────────────────────────────────────────── */
  $('btn-back-profile').onclick = navigateToLobbyOrAuth;
  $('lobby-avatar').onclick = () => {
    if (isLogged()) { loadProfile(); }
  };
  $('btn-user-menu')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = $('user-menu');
    const open = menu.classList.toggle('hidden') === false;
    $('btn-user-menu').setAttribute('aria-expanded', String(open));
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
    connect(() => setTimeout(() =>
      wsSend('CREATE_ROOM', { playerId:S.id, playerName:getPlayerName(), isPrivate:true, maxPlayers:10, equippedDice: S.diceEquipped, equippedAvatar: S.avatarEquipped, equippedSpecial: S.specialEquipped })
    , 200));
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
    if (S.ws?.readyState !== WebSocket.OPEN) {
      toast('Conectando al servidor...', 2000);
      connect(() => { setTimeout(() => $('btn-start-bot-game')?.click(), 500); });
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
  /* ── Music toggle ──────────────────────────────── */
  $('btn-music-toggle')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMusic();
    // SFX.click() lo maneja el handler global
  });

  /* ── Volume slider ─────────────────────────────── */
  const volSlider = $('music-volume-slider');
  if (volSlider) {
    // Sincronizar valor inicial
    volSlider.value = Math.round(getMusicVolume() * 100);
    volSlider.addEventListener('input', (e) => {
      e.stopPropagation();
      const vol = parseInt(e.target.value, 10) / 100;
      setMusicVolume(vol);
      // Si estaba muteado y sube el volumen, desmutear automáticamente
      if (isMuted() && vol > 0) {
        toggleMusic(); // desmutea
      }
      updateMusicBtn();
      SFX.tick();
    });
  }
  // Cerrar panel al hacer click afuera
  document.addEventListener('click', (e) => {
    const panel = $('notif-panel');
    const wrapper = e.target.closest('.notif-wrapper');
    if (panel && !wrapper) panel.classList.add('hidden');
    if (!e.target.closest('.user-menu-wrap')) {
      $('user-menu')?.classList.add('hidden');
      $('btn-user-menu')?.setAttribute('aria-expanded', 'false');
    }
  });

  /* ── Global click SFX ─────────────────────────────── */
  document.addEventListener('click', (e) => {
    const target = e.target;
    // Excluir inputs, sliders y elementos con data-no-sfx
    if (!target || target.closest('input, textarea, [type="range"], [data-no-sfx]')) return;
    // Solo reproducir en botones y links
    if (target.closest('button, a')) {
      SFX.click();
    }
  }, { capture: true });

  /* ── Global hover SFX (menú principal) ────────────── */
  let _lastHoverTime = 0;
  document.addEventListener('mouseover', (e) => {
    const target = e.target;
    // Excluir inputs, sliders y data-no-sfx
    if (!target || target.closest('input, textarea, [data-no-sfx]')) return;
    // Solo botones del menú principal (.btn-gold, .btn-ghost, .btn-link)
    const btn = target.closest('.btn-gold, .btn-ghost, .btn-link');
    if (!btn || !btn.closest('.lobby-form, .top-bar')) return;
    // Debounce: no repetir si pasaron menos de 80ms
    const now = Date.now();
    if (now - _lastHoverTime < 80) return;
    _lastHoverTime = now;
    SFX.hover();
  }, { capture: true });

  // Check push status after login — also triggered reliably inside btn-login's handler

  function doLogout() {
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
  $('btn-guest').onclick = () => {
    // Limpiamos todo antes de empezar como invitado
    clearAuth(); 
    clearSession();
    
    S.logged = false;
    S.userId = null;
    S.id = uid(); // Generamos un ID nuevo para este invitado
    S.name = null; // El nombre debe estar vacío para que el usuario lo escriba
    
    $('input-name').value = ''; // Limpiamos el input del lobby
    
    showScreen('screen-lobby');
    updateUserPanel(null, 0); // Panel vacío
    // Conectar WebSocket para que invitados puedan recibir mensajes/invitaciones
    connect();
  };

/* Alternar entre Login y Registro */
  $('auth-mode-btn').onclick = () => {
    const isRegistering = !$('login-email').classList.contains('hidden');
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

      toast('¡Registro exitoso! Ahora iniciá sesión.');
      $('login-pass').value = ''; 
      $('auth-mode-btn').click(); // Volver a la vista de login automáticamente
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
    const doJoin = () => wsSend('JOIN_ROOM', { playerId:S.id, playerName:getPlayerName(), code, equippedDice: S.diceEquipped, equippedAvatar: S.avatarEquipped, equippedSpecial: S.specialEquipped });
    if (!S.ws || S.ws.readyState !== WebSocket.OPEN) connect(() => setTimeout(doJoin, 300));
    else doJoin();
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
    wsSend('LEAVE_ROOM', { roomId:S.roomId, playerId:S.id });
    goLobby('Saliste de la sala');
  };

  $('btn-cancel-room').onclick = () => {
    if (!S.roomId || !S.isOwner) return;
    wsSend('CANCEL_ROOM', { roomId:S.roomId, playerId:S.id });
    goLobby(null);
  };

  $('btn-ready').onclick = () => {
    wsSend('PLAYER_READY', { roomId:S.roomId, playerId:S.id, equippedDice: S.diceEquipped, equippedAvatar: S.avatarEquipped, equippedSpecial: S.specialEquipped });
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
    clearDice();
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
      if (S.roomId) wsSend('LEAVE_GAME', { roomId:S.roomId, playerId:S.id });
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
      vipEmojis.classList.toggle('hidden', S.specialEquipped !== '3');
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
  if (S.roomId) {
    btn.disabled = true;
    btn.textContent = 'Preparando revancha...';
    wsSend('GET_ROOM_STATE', { roomId:S.roomId, immediate: true });
  } else {
    goLobby(null);
  }
};

  $('btn-new-game').onclick = () => {
    if (S.roomId) wsSend('LEAVE_ROOM', { roomId:S.roomId, playerId:S.id });
    goLobby(null);
  };

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
      fetch('/api/user/profile', { headers: { 'Authorization': `Bearer ${token}` } }),
      fetch('/api/user/inventory', { headers: { 'Authorization': `Bearer ${token}` } })
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
    $('ps-streak').textContent = p.winStreak || 0;
    $('ps-total').textContent = (p.totalScore || 0).toLocaleString();
    $('ps-highest').textContent = (p.highestScore || 0).toLocaleString();

    // Privacidad: toggle ocultar última conexión
    const hideLastSeenToggle = $('profile-hide-last-seen');
    if (hideLastSeenToggle) {
      hideLastSeenToggle.checked = !!p.hide_last_seen;
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
            toast(this.checked ? '🔒 Última conexión oculta' : '🔓 Última conexión visible', 'success');
          }
        } catch(e) {
          toast('Error al guardar preferencia', 'error');
        }
      });
    }

    $('profile-loading').classList.add('hidden');
    $('profile-content').classList.remove('hidden');
    
    // Cargar inventario, historial y badges después del perfil
    loadInventoryData(inv);
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

function getItemEquipCategory(item) {
  if (!item) return null;
  if (item.category === 'avatares') return 'avatar';
  if (item.category === 'dados') return 'dice';
  if (item.category === 'especiales') return 'special';
  return ULTRA_ITEM_EQUIP_CATEGORIES[Number(item.id)] || null;
}

function loadInventoryData(invData) {
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
    special: { label: 'Especiales', icon: '✨' }
  };
  container.innerHTML = '';
  for (const [equipCategory, categoryInfo] of Object.entries(categories)) {
    const items = owned.filter(item => getItemEquipCategory(item) === equipCategory);
    if (!items.length) continue;
    const section = document.createElement('div');
    section.className = 'inv-cat';
    section.innerHTML = `<p class="inv-cat-title">${categoryInfo.label}</p><div class="inv-items"></div>`;
    container.appendChild(section);
    const grid = section.querySelector('.inv-items');
    // Botón para default
    const defaultDiv = document.createElement('div');
    defaultDiv.className = 'inv-item' + (String(equipped[equipCategory] || '') === '' ? ' equipped' : '');
    defaultDiv.innerHTML = `<div class="inv-item-icon">${categoryInfo.icon}</div><span class="inv-item-name">Original</span>`;
    defaultDiv.onclick = () => equipItemFromProfile('default', equipCategory);
    grid.appendChild(defaultDiv);
    items.forEach(item => {
      const isEquipped = String(equipped[equipCategory] || '') === String(item.id);
      const div = document.createElement('div');
      div.className = 'inv-item' + (isEquipped ? ' equipped' : '');
      div.innerHTML = `
        <div class="inv-item-icon">${esc(String(item.icon || ''))}</div>
        <span class="inv-item-name">${esc(String(item.name || 'Cosmético'))}</span>
        ${isEquipped ? '<span class="inv-equipped-badge">✔</span>' : ''}
      `;
      div.onclick = () => !isEquipped && equipItemFromProfile(String(item.id), equipCategory);
      if (!isEquipped) div.style.cursor = 'pointer';
      grid.appendChild(div);
    });
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
    const res = await fetch('/api/user/missions', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
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
          <span class="badge-name">${m.name}</span>
          <span class="badge-desc">${m.desc}</span>
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
    const res = await fetch('/api/user/missions', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
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
            <span class="mission-name">${m.name}</span>
            <span class="mission-desc">${m.desc}</span>
          </div>
          <div class="mission-progress-wrap">
            <div class="mission-bar-bg"><div class="mission-bar-fill" style="width:${Math.min(pct, 100)}%"></div></div>
            <span class="mission-pct">${m.progress}/${m.req}</span>
          </div>
          <div class="mission-reward">
            ${isClaimed ? '✅' : isComplete ? `<button class="btn btn-gold btn-claim" data-mid="${m.id}" style="padding:5px 12px;font-size:11px">🪙 Cobrar</button>` : `🪙 ${m.coins}`}
          </div>
        `;
        section.appendChild(div);
      });
      
      container.appendChild(section);
    }

    // Handlers de cobro
    container.querySelectorAll('.btn-claim').forEach(btn => {
      btn.onclick = async (e) => {
        const mid = e.target.dataset.mid;
        e.target.textContent = '⏳';
        e.target.disabled = true;
        try {
          const r = await fetch('/api/user/missions/claim', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ missionId: mid })
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error);
          toast(`🎉 ${d.missionName}: +${d.coins}🪙 ${d.xp > 0 ? '+'+d.xp+'XP' : ''}`);
          loadMissions(); // Recargar para reflejar cambios
          loadUserBalance(); // Actualizar monedas
        } catch (err) {
          toast('⚠ ' + err.message);
        }
      };
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
    const res = await fetch('/api/user/missions', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
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
        <strong>${mission.name}</strong><br>
        🪙 +${mission.coins} monedas ${mission.xp > 0 ? '· ⚡ +'+mission.xp+'XP' : ''}
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
    const res = await fetch('/api/user/chest-status', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
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
  const hasPremium = S.specialEquipped === '15';
  // Perfil
  const profileAv = $('profile-avatar');
  if (profileAv) profileAv.classList.toggle('premium-marco', hasPremium);
  // Lobby avatar
  const lobbyAv = $('lobby-avatar');
  if (lobbyAv) lobbyAv.classList.toggle('avatar-premium', hasPremium);
  // Scoreboard avatars (se actualizan dinamicamente, se aplica en renderSB)
  // Room players avatars (se actualizan dinamicamente, se aplica en renderRoom)
}

/* ── Actualizar badge de boost +50% con tiempo restante ── */
let _boostTimer = null;

async function updateBoostBadge() {
  const badge = $('boost-badge');
  if (!badge) return;
  const token = localStorage.getItem('gameToken');
  if (!token || S.specialEquipped !== '31') {
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
    if (!data.active) {
      badge.classList.add('hidden');
      if (_boostTimer) { clearInterval(_boostTimer); _boostTimer = null; }
      return;
    }
    badge.classList.remove('hidden');
    // Actualizar tiempo restante cada segundo
    const updateTime = () => {
      const remaining = data.remaining - (Date.now() - _boostLastFetch);
      if (remaining <= 0) {
        badge.classList.add('hidden');
        if (_boostTimer) { clearInterval(_boostTimer); _boostTimer = null; }
        return;
      }
      const hours = Math.floor(remaining / 3600000);
      const mins = Math.floor((remaining % 3600000) / 60000);
      badge.textContent = `⏫ +50% - ${hours}h ${mins}m`;
    };
    const _boostLastFetch = Date.now();
    updateTime();
    if (_boostTimer) clearInterval(_boostTimer);
    _boostTimer = setInterval(updateTime, 10000); // actualizar cada 10s
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
    if (d.special && !S.specialEquipped) S.specialEquipped = d.special;
    return true;
  } catch(e) { return false; }
}

/* ── Cargar items equipados del usuario ─────────────── */
async function loadEquippedItems() {
  const token = localStorage.getItem('gameToken');
  if (!token) return;
  try {
    const invRes = await fetch('/api/user/inventory', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!invRes.ok) {
      // Fallback: cargar del cache local
      loadEquippedCache();
      return;
    }
    const inv = await invRes.json();
    if (!inv || !inv.equipped) return;
    console.log('📦 loadEquippedItems:', JSON.stringify(inv.equipped));
    S.diceEquipped = inv.equipped.dice || null;
    S.specialEquipped = inv.equipped.special || null;
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
    applyUltraDarkTheme(S.specialEquipped === '17');
    // Item 15: Marco Premium en todos los avatares
    applyPremiumMarcoToAll();
    // Mostrar/ocultar picker Emotes VIP (item 3)
    const vipEmojis = $('vip-emojis');
    if (vipEmojis) {
      vipEmojis.classList.toggle('hidden', S.specialEquipped !== '3');
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
    const res = await fetch('/api/user/balance', { 
      headers: { 'Authorization': `Bearer ${token}` } 
    });
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
    await Promise.all([loadShopCatalog(), loadUltraItems()]);
  } catch (err) {
    toast('⚠ ' + err.message);
  }
}

async function loadUltraItems() {
  const token = localStorage.getItem('gameToken');
  if (!token) return;
  const container = $('ultra-items-container');
  if (!container) return;
  try {
    const res = await fetch('/api/shop/catalog', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) { container.innerHTML = '<p class="shop-desc">Error al cargar</p>'; return; }
    const { items, ownedIds, equipped } = await res.json();
    const ownedSet = new Set((ownedIds || []).map(Number));
    const ultraItems = items.filter(i => i.category === 'ultra');
    if (!ultraItems.length) {
      container.innerHTML = '<p class="shop-desc" style="padding:20px;text-align:center">Próximamente...</p>';
      return;
    }
    container.innerHTML = `
      <p class="shop-section-title">💎 <span>Ultra Raros</span></p>
      <p class="shop-desc" style="font-size:11px;color:var(--gold2);text-align:center;margin-bottom:12px">
        🎁 Estos items solo se obtienen en el <strong>Cofre Diario</strong> (5% de chance)
      </p>
      <div class="shop-grid"></div>
    `;
    const grid = container.querySelector('.shop-grid');
    ultraItems.forEach(item => {
      const category = getItemEquipCategory(item);
      const owned = ownedSet.has(Number(item.id));
      const isEquipped = owned && String(equipped?.[category] || '') === String(item.id);
      const div = document.createElement('div');
      div.className = 'shop-item ultra-teaser' + (owned ? ' owned' : '');
      div.innerHTML = `
        <div class="shop-item-preview" style="font-size:44px">${item.icon}</div>
        <h3>${item.name}</h3>
        <p class="shop-item-desc">${item.desc}</p>
        <span class="shop-item-price" style="font-size:12px;color:var(--gold2);font-weight:600">💰 ${item.priceDisplay}</span>
        ${owned
          ? `<button class="btn btn-ghost btn-equip-shop" data-id="${item.id}" data-cat="${category}" ${isEquipped ? 'disabled' : ''}>${isEquipped ? '✔ Equipado' : 'Aplicar'}</button>`
          : '<span class="ultra-badge">🎁 Solo Cofre</span>'}
      `;
      grid.appendChild(div);
    });
    grid.querySelectorAll('.btn-equip-shop:not([disabled])').forEach(btn => {
      btn.onclick = () => equipShopItem(btn.dataset.id, btn.dataset.cat);
    });
  } catch (err) {
    container.innerHTML = '<p class="shop-desc">Error al cargar</p>';
  }
}

/* ── Cargar catálogo de tienda (dinámico desde backend) ─── */
async function loadShopCatalog() {
  const token = localStorage.getItem('gameToken');
  if (!token) return;
  
  try {
    const res = await fetch('/api/shop/catalog', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const { items, ownedIds, equipped } = await res.json();
    if (!items) return;
    
    const ownedSet = new Set(ownedIds || []);
    
    // Renderizar items por categoría
    const container = $('shop-items-container');
    if (!container) return;
    container.innerHTML = '';
    
    const categories = {
      dados: { label: '🎲 Skins de Dados', icon: '🎲', id: 'dados' },
      avatares: { label: '👤 Avatares', icon: '👤', id: 'avatares' },
      especiales: { label: '✨ Especiales', icon: '✨', id: 'especiales' }
    };
    
    for (const [catKey, catInfo] of Object.entries(categories)) {
      const catItems = items.filter(i => i.category === catKey);
      if (!catItems.length) continue;
      
      const section = document.createElement('div');
      section.className = 'shop-section';
      section.innerHTML = `
        <p class="shop-section-title">${catInfo.icon} <span>${catInfo.label}</span></p>
        <div class="shop-grid" id="shop-grid-${catKey}"></div>
      `;
      container.appendChild(section);
      
      const grid = section.querySelector('.shop-grid');
      catItems.forEach(item => {
        const isOwned = ownedSet.has(item.id);
        const cat = item.category === 'avatares' ? 'avatar' : item.category === 'dados' ? 'dice' : 'special';
        const isEquipped = equipped && equipped[cat] === String(item.id);
        const div = document.createElement('div');
        div.className = 'shop-item' + (isOwned ? ' owned' : '');
      div.dataset.category = cat;
      div.dataset.id = String(item.id);
        if (isOwned) {
          div.innerHTML = `
            <div class="shop-item-preview">${item.icon}</div>
            <h3>${item.name}</h3>
            <p class="shop-item-desc">${item.desc}</p>
            <button class="btn btn-ghost btn-equip-shop" data-id="${item.id}" data-cat="${cat}" ${isEquipped ? 'disabled' : ''}>${isEquipped ? '✔ Equipado' : 'Aplicar'}</button>
          `;
        } else {
          div.innerHTML = `
            <div class="shop-item-preview">${item.icon}</div>
            <h3>${item.name}</h3>
            <p class="shop-item-desc">${item.desc}</p>
            <button class="btn btn-gold btn-buy" data-id="${item.id}">🪙 ${item.priceDisplay}</button>
          `;
        }
        grid.appendChild(div);
      });
    }
    
    // Handlers de compra (solo para botones que no son "Tuyo")
    container.querySelectorAll('.btn-buy').forEach(btn => {
      btn.onclick = async (e) => {
        const itemId = e.target.getAttribute('data-id');
        if (!token) {
          toast('Debes iniciar sesión');
          return;
        }
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
          // Efecto de sonido de compra
          SFX.purchase();
          // Efecto visual: destello en el item comprado antes de recargar
          const boughtItem = e.target.closest('.shop-item');
          if (boughtItem) {
            boughtItem.classList.add('shop-item-bought');
            // Mini confetti localizado
            const rect = boughtItem.getBoundingClientRect();
            for (let i = 0; i < 12; i++) {
              const spark = document.createElement('div');
              spark.className = 'buy-sparkle';
              spark.style.cssText = `
                left:${rect.left + rect.width/2}px;
                top:${rect.top + rect.height/2}px;
                --tx:${(Math.random() - .5) * 120}px;
                --ty:${(Math.random() - .5) * 120}px;
                background:${['#D4AF37','#F0D060','#fff','#52c87a'][Math.floor(Math.random()*4)]};
                animation-duration:${.4 + Math.random() * .4}s;
              `;
              document.body.appendChild(spark);
              setTimeout(() => spark.remove(), 1000);
            }
          }
          toast('¡Compra exitosa! 🎉');
          $('lobby-coins').textContent = d.newBalance;
          $('game-coins-amount').textContent = d.newBalance;
          // Recargar el catálogo para mostrar "✔ Tuyo" (con delay para animación)
          setTimeout(async () => {
            await loadShopCatalog();
            e.target.disabled = false;
            e.target.textContent = originalText;
          }, 500);
          loadUserBalance();
          return; // evitar el finally que re-habilita el botón
        } catch (err) {
          toast('⚠ ' + err.message);
          e.target.textContent = originalText;
        }
        e.target.disabled = false;
      };
    });
    container.querySelectorAll('.btn-equip-shop:not([disabled])').forEach(btn => {
      btn.onclick = () => equipShopItem(btn.dataset.id, btn.dataset.cat);
    });
    
        // (event delegation moved to initUI)
  } catch (err) {
    console.error("Error cargando tienda:", err);
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
      div.className = 'coin-pack' + (id === 'large' || id === 'mega' ? ' premium' : '');
      const icon = id === 'mega' ? '👑' : id === 'large' ? '💰' : id === 'medium' ? '🪙' : '💎';
      div.innerHTML = `
        <div class="coin-pack-icon">${icon}</div>
        <div class="coin-pack-amount">${pack.coins.toLocaleString()}</div>
        <div class="coin-pack-label">${pack.name}</div>
        <div class="coin-pack-price">${pack.priceDisplay}</div>
        <button class="btn btn-gold btn-buy-coins" data-pack="${id}" style="margin-top:4px">Comprar</button>
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
          
          // Redirigir al checkout de Mercado Pago
          window.location.href = data.redirectUrl;
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
document.addEventListener('DOMContentLoaded', () => {
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

  if(isLogged() && auth?.id){
    S.logged = true;
    S.userId = auth.id;
    S.id = auth.id;
    S.name = auth.username;
    // LLAMADA CLAVE: Al cargar, pedimos el saldo al backend
    loadUserBalance();
    loadEquippedItems();
  } else if (isLogged()) {
    clearAuth();
  }

  const session = loadSession();
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
    } else {
      showScreen('screen-auth');
    }
    toast('🔄 Restaurando sesión...', 2000);
    connect();
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
    }
  } else if (isLogged()) {
    // Usuario logueado sin sesion de sala: mostrar lobby directamente
    loadEquippedCache();
    showScreen('screen-lobby');
    loadLobbyMissions();
    updateUserPanel(S.name, 0);
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
  } else {
    clearAuth();
    clearSession();
    showScreen('screen-auth');
  }
}

$('btn-back-to-auth').onclick = () => {
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
  '36': { name:'Efecto Láser', desc:'Una explosión de rayos ilumina tu victoria' },
};

function openItemPreview(category, itemId, itemName, itemIcon) {
  // Ensure global access even if SW serves stale cache
  window.openItemPreview = openItemPreview;
  try {
    const old = document.querySelector('.shop-preview-overlay');
    if (old) old.remove();
    const overlay = document.createElement('div');
    overlay.className = 'shop-preview-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    const box = document.createElement('div');
    box.className = 'shop-preview-box';
    let bodyHtml = '';
    if (category === 'dados' || category === 'dice') {
      bodyHtml = buildDicePreviewHTML(itemId, itemName, itemIcon);
    } else if (category === 'avatares' || category === 'avatar') {
      const isPremium = S.specialEquipped === '15';
      bodyHtml = '<div class="avatar-preview-display' + (isPremium ? ' avatar-premium' : '') + '">' + esc(itemIcon) + '</div><p style="text-align:center;font-size:13px;color:var(--text3)">Preview del avatar — así se ve en el juego</p>';
    } else if (category === 'especiales' || category === 'special') {
      const effect = SPECIAL_EFFECTS[itemId];
      bodyHtml = '<div class="special-preview-icon">' + esc(itemIcon) + '</div><div class="special-preview-desc">' + esc(itemName) + '</div>' + (effect ? '<div class="special-preview-effect">✨ ' + esc(effect.desc) + '</div>' : '');
    }
    box.innerHTML = '<div class="shop-preview-header"><h2>' + esc(itemName) + '</h2><button class="shop-preview-close">✕</button></div>' + bodyHtml;
    box.querySelector('.shop-preview-close').onclick = () => overlay.remove();
    overlay.appendChild(box);
    document.body.appendChild(overlay);
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
    return '<p style="font-size:12px;color:var(--text3);text-align:center;margin-bottom:8px">🎲 Así se ve <strong>' + esc(skinName) + '</strong> en cada estado del juego</p><div class="dice-states-grid">' + diceHtml + '</div>';
  } catch(e) {
    return '<p style="text-align:center;color:var(--red);padding:20px">Error al generar preview: ' + esc(e.message) + '</p>';
  }
}
