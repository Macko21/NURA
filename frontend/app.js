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
  rolling:false,
  banking:false
};
let _playAgainTimer  = null;
let _deferredInstall = null; // evento beforeinstallprompt

/* ── Service Worker + PWA ────────────────────────────── */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      console.log('SW registrado:', reg.scope);
    }).catch(err => {
      console.warn('SW error:', err);
    });
  });
}

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
    // Auto-ocultar después de 8s para no molestar
    clearTimeout(_pwaAutoTimer);
    _pwaAutoTimer = setTimeout(() => {
      bar.classList.add('hidden');
      updatePwaOffset();
    }, 8000);
  }
});

/* Esconder banner si ya se instaló */
window.addEventListener('appinstalled', () => {
  _deferredInstall = null;
  const bar = $('pwa-install-bar');
  if (bar) { bar.classList.add('hidden'); updatePwaOffset(); }
});

/* ── Persistencia de sesión ──────────────────────────── */
const SESSION_KEY = 'macko_session';
const AUTH_KEY = 'macko_auth';
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
/* ── SVG dados realistas ─────────────────────────────── */
const DOT_POSITIONS = {
  1: [[25,25]],
  2: [[12,12],[38,38]],
  3: [[12,12],[25,25],[38,38]],
  4: [[12,12],[38,12],[12,38],[38,38]],
  5: [[12,12],[38,12],[25,25],[12,38],[38,38]],
  6: [[12,10],[38,10],[12,25],[38,25],[12,40],[38,40]]
};

function makeDieSVG(value, hot=false) {
  const dots = DOT_POSITIONS[value] || [];
  const dotColor = hot ? '#6b3400' : '#1a1a2e';
  const circles = dots.map(([cx,cy]) =>
    `<circle cx="${cx}" cy="${cy}" r="4.5" fill="${dotColor}"/>`
  ).join('');
  return `<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">${circles}</svg>`;
}

function makeDie(value, state='normal') {
  const el = document.createElement('div');
  el.className = 'die rolling'
    + (state === 'scoring' ? ' scoring' : '')  // verde individual
    + (state === 'hot'     ? ' hot'     : '')  // dorado caliente
    + (state === 'dead'    ? ' dead'    : '');
  el.innerHTML = makeDieSVG(value, state === 'hot');
  el.dataset.val = value;
  return el;
}

/* Calcula cuáles dados puntúan individualmente (sin ser todos calientes) */
function scoringIndices(dice) {
  const counts = {};
  dice.forEach(d => counts[d] = (counts[d]||0)+1);
  const result = [];
  dice.forEach((val, i) => {
    const c = counts[val];
    // Trio o más → todos los de ese valor puntúan
    if (c >= 3) { result.push(i); return; }
    // Sueltos: solo 1 y 5
    if (val === 1 || val === 5) result.push(i);
  });
  return result;
}

function showDice(dice, mode) {
  const row = $('dice-row');
  row.innerHTML = '';

  // Para tiradas normales, calcular cuáles dados puntúan para ponerlos verdes
  let greenIdx = [];
  if (mode === 'scored') {
    // Verificar primero si es escalera (todos calientes)
    const sorted = [...dice].sort((a,b)=>a-b).join('');
    const isStr  = dice.length===5 && ['12345','23456','13456'].includes(sorted);
    if (isStr) {
      // Escalera = todos calientes → usar modo 'all' (dorado)
      mode = 'all';
    } else {
      greenIdx = scoringIndices(dice);
    }
  }

  dice.forEach((val, i) => {
    let state = 'normal';
    if (mode === 'all')    state = 'hot';     // todos calientes → dorado
    if (mode === 'dead')   state = 'dead';
    if (mode === 'scored' && greenIdx.includes(i)) state = 'scoring'; // verdes individuales
    const die = makeDie(val, state);
    die.style.animationDelay = (i * 55) + 'ms';
    row.appendChild(die);
  });
}

function clearDice() {
  $('dice-row').innerHTML = '';
  setMsg('', '');
}

function setMsg(text, type) {
  const el = $('roll-msg');
  el.textContent = text;
  el.className = 'roll-msg' + (type ? ' ' + type : '');
}

/* ── Cartelito de entrada ────────────────────────────── */
function showEntryBanner(gained) {
  const overlay = document.createElement('div');
  overlay.className = 'entry-banner-overlay';
  overlay.innerHTML = `
    <div class="entry-banner-box">
      <div class="entry-banner-icon">🎉</div>
      <div class="entry-banner-title">¡ENTRASTE AL JUEGO!</div>
      <div class="entry-banner-sub">${gained > 0
        ? `Quedás con <strong>${gained} pts</strong> — próximo turno sumás`
        : 'Quedás con 0 pts — próximo turno empezás a sumar'
      }</div>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => {
    overlay.classList.add('fade-out');
    setTimeout(() => overlay.remove(), 600);
  }, 2800);
}

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

/* ── Audio ───────────────────────────────────────────── */
let AC = null;
const ac = () => AC || (AC = new (window.AudioContext||window.webkitAudioContext)());

function tone(freq, type='sine', dur=.12, vol=.2, delay=0) {
  try {
    const ctx=ac(), o=ctx.createOscillator(), g=ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type=type; o.frequency.value=freq;
    const t=ctx.currentTime+delay;
    g.gain.setValueAtTime(vol,t);
    g.gain.exponentialRampToValueAtTime(.001,t+dur);
    o.start(t); o.stop(t+dur);
  } catch(e){}
}

const SFX = {
  roll:  ()=>{ tone(200,'sawtooth',.06,.25); tone(280,'sawtooth',.05,.2,.05); tone(350,'sawtooth',.04,.15,.1); },
  score: ()=>{ tone(523,'sine',.12,.28); tone(659,'sine',.12,.22,.1); },
  bank:  ()=>{ tone(440,'sine',.1,.25); tone(554,'sine',.12,.25,.1); tone(659,'sine',.18,.3,.2); },
  fail:  ()=>{ tone(200,'sawtooth',.2,.3); tone(160,'sawtooth',.2,.2,.12); },
  hot:   ()=>{ [523,659,784,1047].forEach((f,i)=>tone(f,'sine',.18,.38,i*.08)); },
  win:   ()=>{ [523,659,784,1047,1318].forEach((f,i)=>tone(f,'triangle',.35,.45,i*.12)); },
  chat:  ()=>tone(880,'sine',.06,.1),
  enter: ()=>{ tone(440,'sine',.12,.3); tone(659,'sine',.18,.35,.15); },
  tick:  ()=>tone(1200,'sine',.04,.08)
};

/* ── Helpers ─────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const uid = () => 'p' + Math.random().toString(36).slice(2,9) + Date.now().toString(36);

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
    $('lobby-avatar').textContent = name.charAt(0).toUpperCase();
    $('lobby-coins').textContent = coins || 0;
    
    $('guest-name-field').classList.add('hidden');
    $('btn-logout').classList.remove('hidden');
  } else {
    // Si no está logueado, ocultamos la barra de usuario y mostramos el campo para nombre
    topBar.classList.add('hidden');
    $('btn-logout').classList.add('hidden');
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
  clearDice();
  const hint = $('play-again-hint');
  if (hint) hint.classList.add('hidden');
  if (msg) toast(msg, 2500);
  if(isLogged()){
   showScreen('screen-lobby');
}else{
   showScreen('screen-auth');
}
}

/* ── Ir a sala de revancha ───────────────────────────── */
function goToPlayAgain(room) {
  clearInterval(_playAgainTimer);
  _playAgainTimer = null;
  $('modal-win').classList.add('hidden');
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

/* ════════════════════════════════════════════════════════
   MANEJADOR DE MENSAJES
   ════════════════════════════════════════════════════════ */
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

    /* ── Inicio de partida ───────────────────────────── */
    case 'GAME_STARTED':
      S.match=data.match; S.entered=false;
      S.rolling = false;
      S.banking = false;
      saveSession();
      showScreen('screen-game');
      // Resetear botones al iniciar partida nueva
      $('btn-roll').disabled = false;
      $('btn-bank').disabled = true;
      renderSB(data.match);
      updateTurnUI(data.match);
      clearDice();
      updateGameRoomCode();
      updateGameCoins();
      sys('¡La partida comenzó!');
      SFX.score();
      if (data.firstPlayer?.id === S.id) startTimer(TURN_SECS);
      break;

    /* ── Entrada al juego ────────────────────────────── */
    case 'PLAYER_ENTERED':
      S.match=data.match;
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
      if (data.playerId===S.id) {
        S.rolling = false; // Liberar flag anti-click
      }
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
      if (!data.autoBank) updateTurnUI(data.match);
      syncMyScore(data.match);
      if (data.playerId===S.id) SFX.score();
      break;

    case 'DEAD_ROLL':
      S.match=data.match;
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
      renderSB(data.match);
      showDice(data.dice,'all');
      setMsg('🔥 DADOS CALIENTES — Tiro extra. Si saca algo, suma y termina','hot');
      $('turn-points').textContent = data.turnPoints;
      $('bank-pts').textContent    = data.turnPoints>0 ? '+'+data.turnPoints : '';
      if (data.playerId===S.id) { flashTurnPoints(); startTimer(TURN_SECS); }
      updateTurnUI(data.match);
      syncMyScore(data.match);
      sys(`🔥 ${data.playerName} dados calientes! +${data.rollScore} pts acumulados`);
      SFX.hot();
      break;

    case 'BANKED':
      S.match=data.match;
      if (data.playerId===S.id) {
        S.banking = false; // Liberar flag anti-click
      }
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
      S.rolling = false; // Reset anti-click al cambiar turno
      S.banking = false;
      renderSB(data.match);
      // Siempre resetear el botón tirar al cambiar de turno
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

    /* ── Victorias ───────────────────────────────────── */
    case 'INSTANT_WIN':
      S.match=data.match;
      renderSB(data.match);
      showDice(data.dice,'all');
      stopTimer();
      showWin(data.playerName,'¡Sacó cinco 1s — Victoria instantánea! 🎊',data.dice);
      SFX.win();
      break;

    case 'WIN':
      S.match=data.match;
      renderSB(data.match);
      showDice(data.dice,'all');
      stopTimer();
      showWin(data.playerName,'¡Llegó a 10.000 exactos y ganó! 🏆',data.dice);
      SFX.win();
      break;

    case 'GAME_OVER':
      S.rolling = false;
      S.banking = false;
      stopTimer();
      updateGameCoins();
      showWin(
        data.winner?.alias||data.winner?.name||'?',
        `Ganó la partida con ${data.winner?.score} puntos`,
        []
      );
      SFX.win();
      break;

    /* ── Revancha ────────────────────────────────────── */
    case 'PLAY_AGAIN': {
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

    /* ── Chat ────────────────────────────────────────── */
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
    d.innerHTML = `<div class="p-av">${esc(p.name.slice(0,2).toUpperCase())}</div>
      <span class="p-name">${esc(p.name)}</span>
      <span class="p-tag ${p.ready?'tag-ready':'tag-wait'}">${p.ready?'Listo ✓':'Esperando'}</span>`;
    list.appendChild(d);
  });
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
    chip.innerHTML = `
      <div class="sc-top">${yoTag}<span class="sc-nm">${esc(p.name)}</span></div>
      <span class="sc-sc">${p.score}</span>
      <span class="sc-sb">${sub}</span>`;
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
  d.innerHTML = `<span class="cn">${esc(name)}</span>: ${esc(text)}`;
  msgs.appendChild(d);
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
function showWin(playerName, desc, dice) {
  $('win-name').textContent = '¡'+playerName+'!';
  $('win-desc').textContent = desc;
  const wr = $('win-dice');
  wr.innerHTML = '';
  (dice||[]).forEach(v => {
    const d = document.createElement('div');
    d.className = 'win-die';
    d.innerHTML = makeDieSVG(v, true);
    wr.appendChild(d);
  });
  $('modal-win').classList.remove('hidden');
  launchConfetti();
}

/* ── Init UI ─────────────────────────────────────────── */
function initUI() {
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

  /* ── Tienda ─────────────────────────────────────────── */
  $('btn-open-shop').onclick = () => {
    $('modal-shop').classList.remove('hidden');
    loadShopCatalog();
  };
  $('btn-close-shop').onclick = () => $('modal-shop').classList.add('hidden');

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
    };
  });

  /* Lobby */
  $('btn-create').onclick = () => {
    const name = $('input-name').value.trim();
    if (!name) { toast('Ingresá tu nombre'); return; }
    S.name = name; S.id = uid();
    connect(() => setTimeout(() =>
      wsSend('CREATE_ROOM', { playerId:S.id, playerName:S.name, isPrivate:true, maxPlayers:10 })
    , 200));
  };

  $('btn-join-open').onclick = () => {
    const name = $('input-name').value.trim();
    if (!name) { toast('Ingresá tu nombre'); return; }
    S.name = name; S.id = uid();
    showScreen('screen-join');
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
  $('btn-logout').onclick = () => {
    clearAuth();
    clearSession();
    
    // RESET TOTAL DEL ESTADO
    S.logged = false;
    S.userId = null;
    S.id = null;
    S.name = null; // IMPORTANTE: Borramos el nombre guardado
    
    // Limpiar campos visuales
    $('input-name').value = ''; 
    
    showScreen('screen-auth');
    toast('Sesión cerrada');
  };

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
      
      updateUserPanel(data.player.alias, data.player.coins);
      
      const inp = $('input-name');
      if (inp) inp.value = S.name;

      $('btn-login').textContent = 'Ingresar';
      showScreen('screen-lobby');
      toast('¡Bienvenido, ' + S.name + '!');
      
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
    const doJoin = () => wsSend('JOIN_ROOM', { playerId:S.id, playerName:S.name, code });
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
    wsSend('PLAYER_READY', { roomId:S.roomId, playerId:S.id });
    $('btn-ready').disabled    = true;
    $('btn-ready').textContent = 'Esperando...';
  };

  /* Juego */
  $('btn-roll').onclick = () => {
    if (!S.myTurn || $('btn-roll').disabled || S.rolling) return;
    S.rolling = true;
    $('btn-roll').disabled = true;
    clearDice();
    setMsg('','');
    SFX.roll();
    wsSend('ROLL', { roomId:S.roomId, playerId:S.id });
    // Safety timeout: rehabilitar botón si no hay respuesta en 10s
    setTimeout(() => {
      S.rolling = false;
      if (S.myTurn && $('btn-roll') && $('btn-roll').disabled) {
        $('btn-roll').disabled = false;
      }
    }, 10000);
  };
  
  $('btn-bank').onclick = () => {
    if (!S.myTurn || $('btn-bank').disabled || S.banking) return;
    S.banking = true;
    $('btn-bank').disabled = true;
    wsSend('BANK', { roomId:S.roomId, playerId:S.id });
    // Safety timeout
    setTimeout(() => {
      S.banking = false;
    }, 5000);
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

/* ── Cargar catálogo de tienda (dinámico desde backend) ─── */
async function loadShopCatalog() {
  const token = localStorage.getItem('gameToken');
  if (!token) return;
  
  try {
    const res = await fetch('/api/shop/catalog', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const { items } = await res.json();
    if (!items) return;
    
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
        const div = document.createElement('div');
        div.className = 'shop-item';
        div.innerHTML = `
          <div class="shop-item-preview">${item.icon}</div>
          <h3>${item.name}</h3>
          <p class="shop-item-desc">${item.desc}</p>
          <button class="btn btn-gold btn-buy" data-id="${item.id}">🪙 ${item.priceDisplay}</button>
        `;
        grid.appendChild(div);
      });
    }
    
    // Handlers de compra
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
          toast('¡Compra exitosa! 🎉');
          $('lobby-coins').textContent = d.newBalance;
          $('game-coins-amount').textContent = d.newBalance;
          e.target.textContent = '✔ Tuyo';
          e.target.classList.remove('btn-gold');
          e.target.classList.add('btn-ghost');
        } catch (err) {
          toast('⚠ ' + err.message);
          e.target.textContent = originalText;
        }
        e.target.disabled = false;
      };
    });
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
  }
});

/* ── Navegación Maestra ────────────────────────────── */
function navigateToLobbyOrAuth() {
  if (isLogged()) {
    showScreen('screen-lobby');
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