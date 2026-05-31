/**
 * ═══════════════════════════════════════════════════════
 * LOS 10.000 DE MACKO — app.js
 * ═══════════════════════════════════════════════════════
 */

/* ── Estado global ───────────────────────────────────── */
const S = {
  id:null, name:null, roomId:null, roomCode:null,
  match:null, myTurn:false, entered:false,
  ws:null,
  joiningRoom:false, isOwner:false
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
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _deferredInstall = e;
  // Mostrar banner de instalación
  const bar = $('pwa-install-bar');
  if (bar) bar.classList.remove('hidden');
});

/* Esconder banner si ya se instaló */
window.addEventListener('appinstalled', () => {
  _deferredInstall = null;
  const bar = $('pwa-install-bar');
  if (bar) bar.classList.add('hidden');
});

/* ── Persistencia de sesión ──────────────────────────── */
const SESSION_KEY = 'macko_session';

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

/* ── SVG dados realistas ─────────────────────────────── */
const DOT_POSITIONS = {
  1: [[25,25]],
  2: [[12,12],[38,38]],
  3: [[12,12],[25,25],[38,38]],
  4: [[12,12],[38,12],[12,38],[38,38]],
  5: [[12,12],[38,12],[25,25],[12,38],[38,38]],
  6: [[12,10],[38,10],[12,25],[38,25],[12,40],[38,40]]
};

function makeDieSVG(value, scoring=false) {
  const dots = DOT_POSITIONS[value] || [];
  const dotColor = scoring ? '#1a5010' : '#1a1a2e';
  const circles = dots.map(([cx,cy]) =>
    `<circle cx="${cx}" cy="${cy}" r="4.5" fill="${dotColor}"/>`
  ).join('');
  return `<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">${circles}</svg>`;
}

function makeDie(value, state='normal') {
  const el = document.createElement('div');
  el.className = 'die rolling'
    + (state === 'scoring' ? ' scoring' : '')
    + (state === 'dead'    ? ' dead'    : '');
  el.innerHTML = makeDieSVG(value, state === 'scoring');
  el.dataset.val = value;
  return el;
}

function showDice(dice, mode) {
  const row = $('dice-row');
  row.innerHTML = '';
  dice.forEach((val, i) => {
    let state = 'normal';
    if (mode === 'all')  state = 'scoring';
    if (mode === 'dead') state = 'dead';
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
  showScreen('screen-lobby');
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
function connect(cb) {
  const proto = location.protocol==='https:' ? 'wss' : 'ws';
  S.ws = new WebSocket(`${proto}://${location.host}`);
  S.ws.onopen = () => {
    wsSend('IDENTIFY', { playerId:S.id, playerName:S.name, roomId:S.roomId });
    cb?.();
  };
  S.ws.onmessage = e => {
    try { const {type,data}=JSON.parse(e.data); handle(type,data); }
    catch(x){ console.error(x); }
  };
  S.ws.onclose = () => setTimeout(()=>connect(), 2500);
  S.ws.onerror = ()=>{};
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
      saveSession();
      showScreen('screen-game');
      // Resetear botones al iniciar partida nueva
      $('btn-roll').disabled = false;
      $('btn-bank').disabled = true;
      renderSB(data.match);
      updateTurnUI(data.match);
      clearDice();
      updateGameRoomCode();
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
      renderSB(data.match);
      showDice(data.dice,'normal');
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
      stopTimer();
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
  match.players.forEach(p => {
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
    d.innerHTML = makeDieSVG(v, false);
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
    }
    _deferredInstall = null;
  };
  $('pwa-install-close').onclick = () => {
    $('pwa-install-bar').classList.add('hidden');
  };

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

  $('btn-ranking').onclick = () => {
    showScreen('screen-ranking');
    if (!S.ws || S.ws.readyState !== WebSocket.OPEN) {
      S.name = S.name||'Visitante'; S.id = S.id||uid();
      connect(() => setTimeout(() => wsSend('GET_RANKING'), 300));
    } else {
      wsSend('GET_RANKING');
    }
  };

  /* Unirse */
  $('btn-back-join').onclick = () => showScreen('screen-lobby');
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
    if (!S.myTurn || $('btn-roll').disabled) return;
    clearDice();
    setMsg('','');
    SFX.roll();
    $('btn-roll').disabled = true;
    wsSend('ROLL', { roomId:S.roomId, playerId:S.id });
    // Safety: si en 8s no llega respuesta del servidor, rehabilitar el botón
    setTimeout(() => {
      if (S.myTurn && $('btn-roll') && $('btn-roll').disabled) {
        $('btn-roll').disabled = false;
      }
    }, 8000);
  };

  $('btn-bank').onclick = () => {
    if (!S.myTurn || $('btn-bank').disabled) return;
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
  $('chat-send').onclick    = sendChat;
  $('chat-input').onkeydown = e => { if (e.key==='Enter') sendChat(); };

  /* Ranking */
  $('btn-back-ranking').onclick = () => showScreen('screen-lobby');

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

/* ── Arranque ────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initUI();

  const session = loadSession();
  if (session?.id && session?.roomId) {
    S.id       = session.id;
    S.name     = session.name;
    S.roomId   = session.roomId;
    S.roomCode = session.roomCode;
    const inp  = $('input-name');
    if (inp) inp.value = session.name || '';
    showScreen('screen-lobby');
    toast('🔄 Restaurando sesión...', 2000);
    connect();
  } else if (session?.id) {
    S.id   = session.id;
    S.name = session.name;
    const inp = $('input-name');
    if (inp) inp.value = session.name || '';
  }
});
