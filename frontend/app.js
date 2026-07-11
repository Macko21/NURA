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

/* ── Sistema de notificaciones ───────────────────────── */
let _notifications = [];
const MAX_NOTIFICATIONS = 50;

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
  } catch(e) { _notifications = []; }
  // Limpiar formato viejo
  let changed = false;
  _notifications = _notifications.filter(n => {
    if (!n && n !== 0) return false;
    if (typeof n !== 'object') return false;
    if (!n.msg && n.message) { n.msg = n.message; delete n.message; changed = true; }
    if (!n.ts && n.timestamp) { n.ts = n.timestamp; delete n.timestamp; changed = true; }
    return n.msg;
  });
  if (changed) _saveNotifs();
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
    wsSend('GAME_INVITE_ACCEPT', { roomId: notif.data.roomId, roomCode: notif.data.roomCode });
    toast('Uniéndote a la partida...', 'success');
  } else if (action === 'reject_invite' && notif.data) {
    wsSend('GAME_INVITE_REJECT', { inviteId: notif.data.inviteId, fromId: notif.data.fromId });
    toast('Invitación rechazada', 'info');
  }
  notif.read = true;
  _saveNotifs();
  _updateBadge();
  renderNotifPanel();
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
    const notifications = data.notifications;
    if (!notifications || !notifications.length) return;
    const existingMsgs = new Set(_notifications.map(n => n.msg));
    let added = 0;
    for (const n of notifications) {
      if (!existingMsgs.has(n.message)) {
        _notifications.unshift({
          id: 'srv_' + new Date(n.created_at).getTime(),
          title: n.username || '📢 CEO',
          msg: n.message,
          type: 'broadcast',
          ts: new Date(n.created_at).getTime(),
          read: true
        });
        added++;
      }
    }
    if (added > 0) {
      _notifications.sort((a, b) => b.ts - a.ts);
      if (_notifications.length > MAX_NOTIFICATIONS) _notifications.length = MAX_NOTIFICATIONS;
      _saveNotifs();
      _updateBadge();
    }
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
    }).catch(err => {
      console.warn('SW error:', err);
    });
  });
}

  // Escuchar mensajes del Service Worker (push recibidos, actualizaciones, etc.)
  navigator.serviceWorker.addEventListener('message', event => {
    const msg = event.data;
    if (!msg || !msg.type) return;
    if (msg.type === 'PUSH_RECEIVED') {
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
    if (msg.type === 'SW_UPDATED') {
      toast('🔄 Nueva versión ' + msg.version + ' disponible. Actualizando...', 3000);
      setTimeout(() => window.location.reload(), 1500);
    }
  });
/* ── Push Notifications ─────────────────────────────── */
let _pushSubscribed = localStorage.getItem('macko_push') === 'subscribed';

// Convertir VAPID key de base64 a Uint8Array (requerido por Push API)
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

async function subscribeToPush() {
  const token = localStorage.getItem('gameToken');
  if (!token || !_swRegistration) { toast('Debés iniciar sesión'); return; }
  try {
    // Obtener VAPID public key
    const keyRes = await fetch('/api/push/vapid-key');
    const keyData = await keyRes.json();
    if (!keyData.publicKey) {
      toast('🔔 Push no disponible (sin configuración)', 'error');
      return;
    }
    // Subscription (convertir key a Uint8Array)
    const sub = await _swRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(keyData.publicKey)
    });
    await fetch('/api/push/subscribe', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ subscription: sub.toJSON() })
    });
    _pushSubscribed = true;
    localStorage.setItem('macko_push', 'subscribed');
    updatePushBtn();
    toast('🔔 Notificaciones activadas', 'success');
  } catch (e) {
    if (e.name === 'NotAllowedError' || e.code === 20) {
      toast('🔔 Permití las notificaciones en el navegador', 'error');
    } else {
      toast('Error al activar push: ' + e.message, 'error');
    }
  }
}

async function unsubscribeFromPush() {
  const token = localStorage.getItem('gameToken');
  if (!token || !_swRegistration) return;
  try {
    const sub = await _swRegistration.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
    await fetch('/api/push/unsubscribe', {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}` }
    });
  } catch(e) {}
  _pushSubscribed = false;
  localStorage.removeItem('macko_push');
  updatePushBtn();
  toast('🔔 Notificaciones desactivadas', 'info');
}

async function checkPushStatus() {
  if (!_swRegistration || !isLogged()) return;
  try {
    const sub = await _swRegistration.pushManager.getSubscription();
    const browserSubscribed = !!sub;
    const savedPref = localStorage.getItem('macko_push') === 'subscribed';
    if (savedPref && !browserSubscribed) {
      subscribeToPush();
    } else {
      _pushSubscribed = browserSubscribed;
      updatePushBtn();
    }
  } catch(e) {}
}

function updatePushBtn() {
  const sw = $('notif-push-switch');
  if (sw) sw.checked = _pushSubscribed;
}

// También llamar al login y después de register SW
setTimeout(() => {
  if (localStorage.getItem('macko_push') === 'subscribed') {
    subscribeToPush(); // re-suscribir si ya estaba
  }
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
    // Nueva versión: limpiar todo lo que no sea sesión activa
    const keptKeys = [AUTH_KEY, 'gameToken', SESSION_KEY, GAME_CACHE_KEY, 'macko_push'];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
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

/* ── Helpers ─────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const uid = () => 'p' + Math.random().toString(36).slice(2,9) + Date.now().toString(36);
const formatNum = n => Number(n).toLocaleString('es-AR');

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

let _toastT;
function toast(msg, ms=2800) {
  const el=$('toast');
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
      lobbyAv.textContent = name.charAt(0).toUpperCase();
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
    $('btn-changelog-outside')?.classList.remove('hidden');
    $('btn-check-update')?.classList.remove('hidden');
    $('btn-logout')?.classList.add('hidden'); // ocultar el viejo del form
  } else {
    // No logueado: ocultar topbar, mostrar campo nombre
    topBar.classList.add('hidden');
    $('btn-logout-topbar')?.classList.add('hidden');
    const notifWrapper = document.querySelector('.notif-wrapper');
    if (notifWrapper) notifWrapper.classList.add('hidden');
    $('btn-back-to-auth')?.classList.remove('hidden');
    $('btn-changelog-outside')?.classList.remove('hidden');
    $('btn-check-update')?.classList.remove('hidden');
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
  $('btn-ready').textContent = 'Estoy listo ✓';
  const cm = $('chat-msgs'); if(cm) cm.innerHTML = '';
  $('modal-win').classList.add('hidden');
  $('ready-countdown')?.classList.add('hidden');
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
  clearInterval(_playAgainTimer);
  _playAgainTimer = null;
  $('modal-win').classList.add('hidden');
  $('ready-countdown')?.classList.add('hidden');
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
  const c2 = $('chat-msgs'); if(c2) c2.innerHTML = '';
  clearDice();
  renderRoom(room);
  const amOwner = room.players[0]?.id === S.id;
  S.isOwner = amOwner;
  $('btn-cancel-room').classList.toggle('hidden', !amOwner);
  $('btn-leave-room').classList.toggle('hidden', amOwner);
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
    wsSend('IDENTIFY', { playerId:S.id, playerName:S.name, roomId:S.roomId });
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

// Flag para evitar doble cartel de victoria (WIN + GAME_OVER duplicados)
let _winShown = false;

function handle(type, data) {
  switch(type) {

    case 'IDENTIFIED':
      // Si había un joiningRoom pendiente, puede reintentar
      if (S.joiningRoom) {
        S.joiningRoom = false;
        resetJoinBtn();
      }
      break;

    /* ── Reconexión ─────────────────────────────────── */
    case 'RECONNECTED':
      S.roomId      = data.match.roomId;
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
      goLobby('Saliste de la sala');
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
      break;

    case 'ROOM_STATE':
      renderRoom(data.room);
      break;

    /* ── Countdown para auto-start ────────────────── */
    case 'READY_COUNTDOWN': {
      const cdEl = $('ready-countdown');
      if (cdEl) {
        if (data.seconds > 0) {
          cdEl.textContent = '⏳ Iniciando en ' + data.seconds + 's';
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
      saveSession();
      showScreen('screen-game');
      $('ready-countdown')?.classList.add('hidden');
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
      setMsg(
        `Tiro ${data.rollCount}/3 — +${data.rollScore} pts` +
        (data.autoBank ? ' — Banco automático...' : ''),
        'good'
      );
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
      setMsg('🔥 DADOS CALIENTES — Tiro extra. Si saca algo, suma y termina','hot');
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
      if (data.playerId === S.id) {
        clearDice();
        setMsg('','');
        startTimer(TURN_SECS);
      } else {
        stopTimer();
        setMsg(`Turno de ${data.playerName}`, '');
      }
      sys(`Turno de ${data.playerName}`);
      break;

    case 'TIMEOUT':
      stopTimer();
      sys(`⏰ ${data.playerName} tardó demasiado`);
      toast('⏰ Tiempo agotado');
      break;

    /* ── Victorias (con flag para evitar duplicados) ───── */
    case 'INSTANT_WIN': {
      _winShown = true;
      S.match=data.match;
      S.banking=false;
      syncEquippedFromMatch(data.match);
      renderSB(data.match);
      showDice(data.dice,'all');
      stopTimer();
      const winP = S.match.players.find(p => p.id === data.playerId);
      showWin(data.playerName,'¡Sacó cinco 1s — Victoria instantánea! 🎊',data.dice, winP?.equippedDice || null);
      SFX.win();
      break;
    }

    case 'WIN': {
      _winShown = true;
      S.match=data.match;
      S.banking=false;
      syncEquippedFromMatch(data.match);
      renderSB(data.match);
      showDice(data.dice,'all');
      stopTimer();
      const winP = S.match.players.find(p => p.id === data.playerId);
      showWin(data.playerName,'¡Llegó a 10.000 exactos y ganó! 🏆',data.dice, winP?.equippedDice || null);
      SFX.win();
      break;
    }

    case 'GAME_OVER': {
      // Si ya se mostró WIN/INSTANT_WIN, ignorar GAME_OVER duplicado
      if (_winShown) { _winShown = false; break; }
      S.banking = false;
      $('btn-roll').disabled = true;
      stopTimer();
      updateGameCoins();
      checkPendingMissions();
      const winnerId = data.winner?.id;
      const winSkin = winnerId && S.match 
        ? (S.match.players.find(p => p.id === winnerId)?.equippedDice || null)
        : null;
      showWin(
        data.winner?.alias||data.winner?.name||'?',
        `Ganó la partida con ${data.winner?.score} puntos`,
        [],
        winSkin
      );
      SFX.win();
      break;
    }

    /* ── Revancha ────────────────────────────────────── */
    case 'PLAY_AGAIN': {
      _winShown = false; // Resetear flag para próxima partida
      S.match = null; S.entered = false; S.myTurn = false;
      stopTimer();
      const hint  = $('play-again-hint');
      const cdEl  = $('play-again-countdown');
      const btnPA = $('btn-play-again');
      if (hint)  hint.classList.remove('hidden');
      if (btnPA) btnPA.textContent = '🎲 ¡Jugar de nuevo!';
      let cd = 4;
      if (cdEl) cdEl.textContent = cd;
      clearInterval(_playAgainTimer);
      _playAgainTimer = setInterval(() => {
        cd--;
        if (cdEl) cdEl.textContent = cd;
        if (cd <= 0) {
          clearInterval(_playAgainTimer);
          _playAgainTimer = null;
          goToPlayAgain(data.room);
        }
      }, 1000);
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
      break;

    case 'FRIEND_ACCEPTED_OK':
      toast('✅ Amigo agregado', 'success');
      break;

    case 'FRIEND_REJECTED_OK':
      break;

    /* ── Invitaciones a partida ────────────────────────── */
    case 'GAME_INVITE':
      toast(`🎮 ${data.fromName} te invitó a jugar`, 6000);
      addNotification(`${data.fromName}`, `Te invitó a una partida (${data.playerCount}/${data.maxPlayers} jugadores)`, 'game_invite', {
        id: 'gi_' + data.inviteId,
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
      addChat(data.playerName, data.message);
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
    if (p.equippedAvatar) {
      avContent = p.equippedAvatar;
    } else if (p.id === S.id && S.avatarEquipped) {
      avContent = S.avatarEquipped;
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
}

/* ── Sincronizar items equipados desde match state ──── */
function syncEquippedFromMatch(match) {
  if (!match || !match.players) return;
  const me = match.players.find(p => p.id === S.id);
  if (!me) return;
  if (me.equippedDice)    S.diceEquipped    = me.equippedDice;
  if (me.equippedAvatar)  S.avatarEquipped  = me.equippedAvatar;
  if (me.equippedSpecial) S.specialEquipped = me.equippedSpecial;
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
    } else {
      sub = '✅ en juego';
    }
    const yoTag = isMe ? '<span class="sc-yo">YO</span>' : '';
    // Mostrar avatar equipado (del match state para todos, o local si es el jugador actual)
    let avContent = esc(p.name ? p.name.charAt(0).toUpperCase() : '?');
    if (p.equippedAvatar) {
      avContent = p.equippedAvatar;
    } else if (isMe && S.avatarEquipped) {
      avContent = S.avatarEquipped;
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
function addChat(name, text) {
  const msgs = $('chat-msgs');
  const d    = document.createElement('div');
  d.className = 'cm';
  // Nick Dorado: si el que habla tiene el item especial 28 equipado, su nombre brilla
  const hasNickDorado = S.specialEquipped === '28';
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
    // Online check: el server devuelve is_online según si tiene WebSocket activo
    list.innerHTML = friends.map(f => {
      const isOnline = f.is_online || false;
      const timeAgo = f.last_seen > 0 ? formatTimeAgo(f.last_seen) : 'nunca conectado';
      return `
      <div class="portal-friend-item">
        <span class="portal-friend-status ${isOnline ? 'online' : 'offline'}"></span>
        <span class="portal-friend-av">${f.equipped_avatar ? f.equipped_avatar : '👤'}</span>
        <span class="portal-friend-name">${esc(f.alias || f.name)}</span>
        <span class="portal-friend-stats">
          ${isOnline ? '<span class="friend-online-tag">En línea</span>' : `<span class="friend-offline-tag">${timeAgo}</span>`}
          ${f.games_won || 0}🏆
        </span>
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
  try {
    const res = await fetch('/api/user/missions', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) { 
      $('btn-missions-mobile')?.classList.add('hidden');
      $('lobby-missions-desktop')?.classList.add('hidden');
      return;
    }
    const { missions } = await res.json();
    const dailies = missions.filter(m => m.type === 'daily');
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
    const desktopList = $('lobby-missions-list-desktop');
    if (desktopList) { 
      desktopList.innerHTML = html;
      $('lobby-missions-desktop')?.classList.remove('hidden');
    }
  } catch(e) { 
    $('btn-missions-mobile')?.classList.add('hidden');
    $('lobby-missions-desktop')?.classList.add('hidden');
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

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function checkUpdateIndicator() {
  const btn = document.getElementById('btn-changelog-outside');
  if (!btn) return;
  fetch('/api/version').then(r => r.json()).then(d => {
    if (!d.version) return;
    const currentVersion = d.version;
    const lastSeen = localStorage.getItem(GAME_LAST_SEEN_KEY);
    // Actualizar texto del botón con la versión real del server
    btn.textContent = '📋 v' + currentVersion;
    // Badge si hay versión nueva no vista
    if (!lastSeen || compareVersions(currentVersion, lastSeen) > 0) {
      let badge = btn.querySelector('.game-update-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'game-update-badge';
        btn.appendChild(badge);
      }
      btn.title = '📢 ¡Nueva versión disponible!';
    } else {
      btn.title = 'Versiones';
      const badge = btn.querySelector('.game-update-badge');
      if (badge) badge.remove();
    }
  }).catch(() => {});
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
      const badge = document.getElementById('btn-changelog-outside')?.querySelector('.game-update-badge');
      if (badge) badge.remove();
      const btn = document.getElementById('btn-changelog-outside');
      if (btn) btn.title = 'Versiones';
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
function showWin(playerName, desc, dice, skinId) {
  if (!$('modal-win').classList.contains('hidden')) return;
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
  if (S.specialEquipped === '16') {
    setTimeout(() => launchConfetti(), 1000);
    setTimeout(() => launchConfetti(), 2000);
  }
}

/* ── Init UI ─────────────────────────────────────────── */
function initUI() {
  // Actualizar versión dinámica desde version.js
  const appVersion = typeof GAME_VERSION !== 'undefined' ? GAME_VERSION : '2.3.0';
  const authSub = document.querySelector('.auth-sub');
  if (authSub) authSub.textContent = 'Juego de dados · 2 a 10 jugadores · v' + appVersion;
  const appVerEl = document.querySelector('.app-version');
  if (appVerEl) appVerEl.textContent = 'v' + appVersion;
  $('btn-changelog-outside') && ($('btn-changelog-outside').textContent = '📋 v' + appVersion);
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
          const av = p.equipped_avatar || (p.alias ? p.alias.charAt(0).toUpperCase() : '?');
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
  $('lobby-username').onclick = () => {
    if (isLogged()) { loadProfile(); }
  };
  // Click en avatar del perfil → scrollear al inventario
  $('profile-avatar').onclick = () => {
    const inv = $('profile-inventory-section');
    if (inv) inv.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /* Lobby */
  $('btn-create').onclick = () => {
    const name = $('input-name').value.trim();
    if (!name) { toast('Ingresá tu nombre'); return; }
    S.name = name; S.id = uid();
    connect(() => setTimeout(() =>
      wsSend('CREATE_ROOM', { playerId:S.id, playerName:S.name, isPrivate:true, maxPlayers:10, equippedDice: S.diceEquipped, equippedAvatar: S.avatarEquipped, equippedSpecial: S.specialEquipped })
    , 200));
  };

  $('btn-join-open').onclick = () => {
    const name = $('input-name').value.trim();
    if (!name) { toast('Ingresá tu nombre'); return; }
    S.name = name; S.id = uid();
    showScreen('screen-join');
  };

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
      loadChestStatus();
      loadUserBalance();
    } catch (err) {
      toast('⚠ ' + err.message);
    }
    btn.disabled = false;
    btn.textContent = '🎁';
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
  $('btn-changelog-outside').onclick = () => loadChangelog();
  $('btn-close-changelog').onclick = () => $('modal-changelog').classList.add('hidden');

  /* ── Check for updates ──────────────────────────────── */
  $('btn-check-update').onclick = async () => {
    if (!_swRegistration) { toast('Service Worker no disponible'); return; }
    try {
      await _swRegistration.update();
      toast('🔄 Buscando actualizaciones...', 2000);
      setTimeout(() => {
        if (_swRegistration.waiting) {
          _swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
        } else {
          toast('✅ Estás en la última versión', 2000);
        }
      }, 2000);
    } catch(e) { toast('Error al buscar actualización'); }
  };

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
    pushSwitch.addEventListener('change', () => {
      if (pushSwitch.checked) subscribeToPush();
      else unsubscribeFromPush();
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
      updatePushBtn(); // Sync switch cada vez que se abre
    }
  });
  $('btn-notif-mark-read')?.addEventListener('click', () => {
    markAllRead();
    renderNotifPanel();
  });
  // Cerrar panel al hacer click afuera
  document.addEventListener('click', (e) => {
    const panel = $('notif-panel');
    const wrapper = e.target.closest('.notif-wrapper');
    if (panel && !wrapper) panel.classList.add('hidden');
  });

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
      $('btn-changelog-outside')?.classList.remove('hidden');
      $('btn-check-update')?.classList.remove('hidden');
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
    const code = $('input-code').value.trim().replace(/[^0-9]/g, '');
    if (code.length < 4 || !/^[0-9]+$/.test(code)) { toast('Código inválido — solo números'); return; }
    if (S.joiningRoom)   { toast('Ya estás intentando entrar...'); return; }
    S.joiningRoom = true;
    $('btn-join-confirm').disabled    = true;
    $('btn-join-confirm').textContent = 'Entrando...';
    const doJoin = () => wsSend('JOIN_ROOM', { playerId:S.id, playerName:S.name, code, equippedDice: S.diceEquipped, equippedAvatar: S.avatarEquipped, equippedSpecial: S.specialEquipped });
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
    $('btn-ready').disabled    = true;
    $('btn-ready').textContent = 'Esperando...';
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
    $('modal-win').classList.add('hidden');
    if (S.roomId) wsSend('GET_ROOM_STATE', { roomId:S.roomId });
    else goLobby(null);
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
    let avatarDisplay = (p.alias || '?').charAt(0).toUpperCase();
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
    const xpNext = p.xpForNext || 200;
    const xpThisLevel = xp - ((p.level - 1) * 200);
    const xpNeeded = xpNext;
    const pct = Math.min(100, Math.round((xpThisLevel / Math.max(xpNeeded, 1)) * 100));
    $('profile-xp').textContent = `${xp} XP`;
    const bar = $('xp-bar-fill');
    if (bar) bar.style.width = pct + '%';

    // Stats
    $('ps-coins').textContent = (p.coins || 0).toLocaleString();
    $('ps-wins').textContent = p.gamesWon || 0;
    $('ps-games').textContent = p.gamesPlayed || 0;
    $('ps-streak').textContent = p.winStreak || 0;
    $('ps-total').textContent = (p.totalScore || 0).toLocaleString();
    $('ps-highest').textContent = (p.highestScore || 0).toLocaleString();

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
  const categories = { avatares: 'Avatares', dados: 'Dados', especiales: 'Especiales' };
  container.innerHTML = '';
  for (const [catKey, catLabel] of Object.entries(categories)) {
    const items = owned.filter(i => i.category === catKey);
    if (!items.length) continue;
    const section = document.createElement('div');
    section.className = 'inv-cat';
    section.innerHTML = `<p class="inv-cat-title">${catLabel}</p><div class="inv-items"></div>`;
    container.appendChild(section);
    const grid = section.querySelector('.inv-items');
    // Botón para default
    const isAvatar = catKey === 'avatares';
    const defaultDiv = document.createElement('div');
    defaultDiv.className = 'inv-item' + (equipped[catKey === 'avatares' ? 'avatar' : catKey === 'dados' ? 'dice' : 'special'] === '' ? ' equipped' : '');
    defaultDiv.innerHTML = `<div class="inv-item-icon">${isAvatar ? '👤' : '🎲'}</div><span class="inv-item-name">Original</span>`;
    defaultDiv.onclick = () => equipItemFromProfile('default', catKey === 'avatares' ? 'avatar' : catKey === 'dados' ? 'dice' : 'special');
    grid.appendChild(defaultDiv);
    items.forEach(item => {
      const cat = item.category === 'avatares' ? 'avatar' : item.category === 'dados' ? 'dice' : 'special';
      const isEquipped = equipped[cat] === String(item.id);
      const div = document.createElement('div');
      div.className = 'inv-item' + (isEquipped ? ' equipped' : '');
      div.innerHTML = `
        <div class="inv-item-icon">${item.icon}</div>
        <span class="inv-item-name">${item.name}</span>
        ${isEquipped ? '<span class="inv-equipped-badge">✔</span>' : ''}
      `;
      div.onclick = () => !isEquipped && equipItemFromProfile(String(item.id), cat);
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
      btn.disabled = false;
      btn.textContent = '🎁';
      btn.title = '¡Reclamá tu cofre diario!';
    } else {
      btn.disabled = true;
      const hours = Math.floor(d.remaining / 3600000);
      const mins = Math.floor((d.remaining % 3600000) / 60000);
      btn.innerHTML = `⏳<span class="btn-chest-timer">${hours}h ${mins}m</span>`;
      btn.title = `Cofre disponible en ${hours}h ${mins}min`;
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
    if (inv.equipped.avatar) {
      const item = inv.owned.find(i => i.id === parseInt(inv.equipped.avatar));
      if (item) S.avatarEquipped = item.icon;
    }
    // Guardar en cache local
    saveEquippedCache();
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
    const { items } = await res.json();
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
      const div = document.createElement('div');
      div.className = 'shop-item ultra-teaser';
      div.innerHTML = `
        <div class="shop-item-preview" style="font-size:44px">${item.icon}</div>
        <h3>${item.name}</h3>
        <p class="shop-item-desc">${item.desc}</p>
        <span class="shop-item-price" style="font-size:12px;color:var(--gold2);font-weight:600">💰 ${item.priceDisplay}</span>
        <span class="ultra-badge">🎁 Solo Cofre</span>
      `;
      grid.appendChild(div);
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
            <span class="shop-owned-badge">${isEquipped ? '✔ Equipado' : '✔ Tuyo'}</span>
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

/* ── Arranque ────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initUI();

  const auth = loadAuth();

  if(isLogged()){
    S.logged = true;
    S.userId = auth.id;
    S.name = auth.username;
    // LLAMADA CLAVE: Al cargar, pedimos el saldo al backend
    loadUserBalance();
    loadEquippedItems();
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
};

function openItemPreview(category, itemId, itemName, itemIcon) {
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



}
