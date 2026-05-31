/**
 * ═══════════════════════════════════════════════════════
 * LOS 10.000 DE MACKO — app.js
 * ═══════════════════════════════════════════════════════
 */

/* ── Estado ──────────────────────────────────────────── */
const S = {
  id:null, name:null, roomId:null, roomCode:null,
  match:null, myTurn:false, entered:false,
  ws:null, chatOpen:false, chatUnread:0
};

/* ── Persistencia de sesión en localStorage ──────────── */
const SESSION_KEY = 'macko_session';

function saveSession() {
  if (!S.id) return;
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    id:       S.id,
    name:     S.name,
    roomId:   S.roomId,
    roomCode: S.roomCode,
    entered:  S.entered,
    ts:       Date.now()
  }));
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Sesión válida por 4 horas
    if (Date.now() - data.ts > 4 * 60 * 60 * 1000) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return data;
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
  const dotColor = scoring ? '#8B6914' : '#1a1a2e';
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
  // mode: 'all'=todos puntúan | 'dead'=ninguno | 'normal'=mostrar solo
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

    // gradiente radial
    const g = ctx.createRadialGradient(
      canvas.width * .4, 0, 0,
      canvas.width * .4, canvas.height * .5, canvas.height
    );
    g.addColorStop(0, 'rgba(26,20,48,.8)');
    g.addColorStop(1, 'rgba(11,11,18,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // partículas doradas
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

/* ── Confetti victoria ───────────────────────────────── */
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
  enter: ()=>{ tone(440,'sine',.12,.3); tone(659,'sine',.18,.35,.15); }
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

/* ── WebSocket ───────────────────────────────────────── */
function connect(cb) {
  const proto = location.protocol==='https:' ? 'wss' : 'ws';
  S.ws = new WebSocket(`${proto}://${location.host}`);
  S.ws.onopen = () => {
    // Siempre mandar roomId para que el servidor pueda reconectar
    wsSend('IDENTIFY', { playerId:S.id, playerName:S.name, roomId:S.roomId });
    cb?.();
  };
  S.ws.onmessage = e => { try{ const {type,data}=JSON.parse(e.data); handle(type,data); }catch(x){console.error(x);} };
  S.ws.onclose   = () => setTimeout(()=>connect(), 2500);
  S.ws.onerror   = ()=>{};
}

function wsSend(type, data={}) {
  if (S.ws?.readyState === WebSocket.OPEN)
    S.ws.send(JSON.stringify({type,data}));
}

/* ── Manejador de mensajes ───────────────────────────── */
function handle(type, data) {
  switch(type) {

    case 'IDENTIFIED': break;

    case 'RECONNECTED':
      // Reconexión exitosa en partida activa
      S.roomId  = data.match.roomId;
      S.match   = data.match;
      S.entered = data.match.players.find(p=>p.id===S.id)?.entered || false;
      saveSession();
      showScreen('screen-game');
      renderSB(data.match);
      updateTurnUI(data.match);
      toast('🔄 Reconectado a la partida', 3000);
      sys('Reconectado');
      break;

    case 'RECONNECTED_LOBBY':
      // Reconexión en sala de espera
      S.roomId   = data.room.id;
      S.roomCode = data.room.code;
      saveSession();
      renderRoom(data.room);
      showScreen('screen-room');
      toast('🔄 Reconectado a la sala', 3000);
      break;

    case 'PLAYER_RECONNECTED':
      sys(`${data.playerName} volvió a conectarse`);
      break;

    case 'PLAYER_DISCONNECTED':
      sys(`Un jugador se desconectó — esperando reconexión...`);
      break;

    case 'PLAYER_LEFT':
      sys(`Un jugador abandonó la partida`);
      break;

    case 'ROOM_CREATED':
      S.roomId=data.room.id; S.roomCode=data.room.code;
      saveSession();
      renderRoom(data.room); showScreen('screen-room'); break;

    case 'JOIN_SUCCESS':
      S.roomId=data.room.id; S.roomCode=data.room.code;
      saveSession();
      renderRoom(data.room); showScreen('screen-room'); break;

    case 'ROOM_STATE':
      renderRoom(data.room); break;

    case 'GAME_STARTED':
      S.match=data.match; S.entered=false;
      saveSession();
      showScreen('screen-game');
      renderSB(data.match); updateTurnUI(data.match); clearDice();
      sys('¡La partida comenzó!');
      SFX.score(); break;

    case 'PLAYER_ENTERED':
      S.match=data.match; renderSB(data.match);
      showDice(data.dice,'all'); {
        // rollScore = lo que sacó, gained = lo que queda (rollScore - 1000)
        const msg = `Sacó ${data.rollScore} pts → Costo entrada: 1000 → Queda con ${data.gained} pts`;
        setMsg(msg,'good');
        updateTurnUI(data.match);
        if (data.playerId===S.id){
          S.entered=true;
          const t = data.gained>0
            ? `🎉 Entraste. Sacaste ${data.rollScore} pts, costó 1000, quedás con ${data.gained}. Próximo turno sumás.`
            : `🎉 Entraste con exactamente 1000 pts. Quedás con 0. Próximo turno sumás.`;
          toast(t, 4000);
          SFX.enter();
        }
        sys(`${data.playerName} entró — sacó ${data.rollScore} pts, costo 1000, queda con ${data.gained}`);
      } break;

    case 'ENTRY_FAILED':
      S.match=data.match; renderSB(data.match);
      showDice(data.dice,'dead');
      setMsg(
        data.attemptsLeft>0
          ? `Intento ${data.entryAttemptsUsed}/${data.entryAttempts} — Necesitás 1000+`
          : 'Sin intentos — turno perdido',
        'bad'
      );
      if (data.playerId===S.id){
        SFX.fail();
        $('roll-count').textContent = data.entryAttemptsUsed+' / '+data.entryAttempts;
        toast(data.attemptsLeft>0
          ? `Faltan ${data.attemptsLeft} intento(s)`
          : 'Turno perdido');
      }
      updateTurnUI(data.match); break;

    case 'ROLL_RESULT':
      S.match=data.match; renderSB(data.match);
      showDice(data.dice,'normal'); {
        const tirada = `Tiro ${data.rollCount}/3 — +${data.rollScore} pts`;
        if (data.autoBank) {
          setMsg(tirada + ' — Banco automático...','good');
        } else {
          setMsg(tirada,'good');
        }
        $('turn-points').textContent=data.turnPoints;
        $('roll-count').textContent=data.rollCount+' / 3';
        $('bank-pts').textContent=data.turnPoints>0?'+'+data.turnPoints:'';
        if (!data.autoBank) updateTurnUI(data.match);
        syncMyScore(data.match);
        if (data.playerId===S.id) SFX.score();
      } break;

    case 'DEAD_ROLL':
      S.match=data.match; renderSB(data.match);
      showDice(data.dice,'dead'); setMsg('¡Sin puntos! Turno perdido 💀','bad');
      updateTurnUI(data.match);
      sys(`${data.playerName} tiró muerto 💀`); SFX.fail(); break;

    case 'BUST':
      S.match=data.match; renderSB(data.match);
      showDice(data.dice,'dead'); setMsg('¡Te pasaste de 10.000! 💥','bad');
      updateTurnUI(data.match);
      sys(`${data.playerName} se pasó de 10.000 — pierde el turno`);
      if (data.playerId===S.id){ SFX.fail(); toast('💥 ¡Te pasaste! Perdiste los puntos del turno'); } break;

    case 'HOT_DICE':
      S.match=data.match; renderSB(data.match);
      showDice(data.dice,'all');
      setMsg('🔥 DADOS CALIENTES — Tiro extra. Si saca algo, suma y termina','hot');
      $('turn-points').textContent=data.turnPoints;
      $('bank-pts').textContent=data.turnPoints>0?'+'+data.turnPoints:'';
      updateTurnUI(data.match); syncMyScore(data.match);
      sys(`🔥 ${data.playerName} dados calientes! +${data.rollScore} pts acumulados`);
      SFX.hot(); break;

    case 'BANKED':
      S.match=data.match; renderSB(data.match);
      updateTurnUI(data.match); syncMyScore(data.match);
      if (data.auto) {
        setMsg(`Banco automático — +${data.gained} pts anotados ✔`,'good');
      }
      sys(`${data.playerName} anotó ${data.gained} pts → total ${data.totalScore}`);
      if (data.playerId===S.id){
        SFX.bank();
        if (!data.auto) toast(`✔ Anotaste ${data.gained} puntos. Total: ${data.totalScore}`);
      } break;

    case 'TURN_START':
      S.match=data.match; renderSB(data.match);
      updateTurnUI(data.match);
      $('turn-points').textContent='0';
      $('roll-count').textContent='— / 3';
      $('bank-pts').textContent='';
      // Solo limpiar dados cuando empieza el turno del nuevo jugador
      // así el último tiro del jugador anterior queda visible
      if (data.playerId === S.id) {
        clearDice();
        setMsg('','');
      } else {
        // Mostrar un indicador de qué jugador toca ahora
        setMsg(`Turno de ${data.playerName}`, '');
      }
      sys(`Turno de ${data.playerName}`); break;

    case 'TIMEOUT':
      sys(`⏰ ${data.playerName} tardó demasiado`); toast('⏰ Tiempo agotado'); break;

    case 'INSTANT_WIN':
      S.match=data.match; renderSB(data.match);
      showDice(data.dice,'all');
      showWin(data.playerName,'¡Sacó cinco 1s — Victoria instantánea! 🎊',data.dice);
      SFX.win(); break;

    case 'WIN':
      S.match=data.match; renderSB(data.match);
      showDice(data.dice,'all');
      showWin(data.playerName,'¡Llegó a 10.000 exactos y ganó! 🏆',data.dice);
      SFX.win(); break;

    case 'GAME_OVER':
      showWin(data.winner?.alias||data.winner?.name||'?',
              `Ganó la partida con ${data.winner?.score} puntos`,[]);
      SFX.win(); break;

    case 'CHAT_MESSAGE':
      addChat(data.playerName,data.message); SFX.chat(); break;

    case 'RANKING':
      renderRanking(data.ranking); break;

    case 'ERROR':
      toast('⚠ '+data.message); break;
  }
}

/* ── Render sala ─────────────────────────────────────── */
function renderRoom(room) {
  $('room-code-display').textContent = room.code;
  const list=$('players-list');
  list.innerHTML='';
  room.players.forEach(p=>{
    const d=document.createElement('div');
    d.className='p-item';
    d.innerHTML=`<div class="p-av">${esc(p.name.slice(0,2).toUpperCase())}</div>
      <span class="p-name">${esc(p.name)}</span>
      <span class="p-tag ${p.ready?'tag-ready':'tag-wait'}">${p.ready?'Listo ✓':'Esperando'}</span>`;
    list.appendChild(d);
  });
}

/* ── Scoreboard ──────────────────────────────────────── */
function renderSB(match) {
  if (!match) return;
  const sb=$('scoreboard');
  const curId=match.players[match.currentPlayerIndex]?.id;
  sb.innerHTML='';
  match.players.forEach(p=>{
    const chip=document.createElement('div');
    chip.className='sc-chip'+(p.id===curId?' cur':'')+(p.entered?' in':'');
    const sub=p.entered
      ?(p.turnPoints>0?`+${p.turnPoints}`:`${p.score}`)
      :(p.entryAttemptsUsed>0?'intentando...':'sin entrar');
    chip.innerHTML=`<span class="sc-nm">${esc(p.name)}</span>
      <span class="sc-sc">${p.score}</span>
      <span class="sc-sb">${sub}</span>`;
    sb.appendChild(chip);
  });
}

/* ── Update UI de turno ──────────────────────────────── */
function updateTurnUI(match) {
  if (!match) return;
  S.match=match;
  const cur=match.players[match.currentPlayerIndex];
  const me=match.players.find(p=>p.id===S.id);
  if (!cur) return;

  S.myTurn = cur.id===S.id;
  if (me) S.entered=me.entered;

  // Banner
  const banner=$('turn-banner');
  if (S.myTurn) {
    if (!me?.entered) {
      const left=(match.entryAttempts||3)-(me?.entryAttemptsUsed||0);
      banner.textContent=`🎲 Tu turno — Necesitás 1000+ para entrar (${left} intento${left!==1?'s':''})`;
    } else {
      banner.textContent='🎲 Es tu turno — tirá los dados';
    }
    banner.className='turn-banner me';
  } else {
    banner.textContent=`Turno de ${cur.name}...`;
    banner.className='turn-banner';
  }

  // Botones
  const az=$('action-zone'), wz=$('waiting-zone');
  const btnRoll=$('btn-roll'), btnBank=$('btn-bank');

  if (S.myTurn && match.status==='playing') {
    az.classList.remove('hidden'); wz.classList.add('hidden');
    const canRoll = !cur.mustStop;
    btnRoll.disabled=!canRoll;
    // Puede plantarse voluntariamente entre tiro 1 y 2 (no en tiro 3 ni hot dice)
    const canBank = me?.entered && (cur.turnPoints>0) && cur.canContinue && !cur.mustStop && !cur.isHotDiceTurn;
    btnBank.disabled=!canBank;
  } else {
    az.classList.add('hidden'); wz.classList.remove('hidden');
    $('waiting-text').textContent=`Turno de ${cur.name}...`;
  }

  // Stats
  if (me) {
    $('turn-points').textContent=me.turnPoints||0;
    $('my-score').textContent=me.score||0;
    $('bank-pts').textContent=me.turnPoints>0?'+'+me.turnPoints:'';
    if (!me.entered) {
      const max=match.entryAttempts||3;
      $('roll-count').textContent=(me.entryAttemptsUsed||0)+' / '+max;
    } else {
      $('roll-count').textContent=(me.rollCount||0)+' / 3';
    }
  }
}

function syncMyScore(match) {
  const me=match?.players?.find(p=>p.id===S.id);
  if (me) $('my-score').textContent=me.score||0;
}

/* ── Chat ────────────────────────────────────────────── */
function addChat(name,text) {
  const msgs=$('chat-msgs');
  const d=document.createElement('div');
  d.className='cm';
  d.innerHTML=`<span class="cn">${esc(name)}</span>: ${esc(text)}`;
  msgs.appendChild(d);
  msgs.scrollTop=msgs.scrollHeight;
  if (!S.chatOpen){
    S.chatUnread++;
    const b=$('chat-badge');
    b.textContent=S.chatUnread; b.classList.remove('hidden');
  }
}
function sys(text) {
  const msgs=$('chat-msgs');
  const d=document.createElement('div');
  d.className='cm sys'; d.textContent=text;
  msgs.appendChild(d);
  msgs.scrollTop=msgs.scrollHeight;
}
function sendChat() {
  const inp=$('chat-input');
  const msg=inp.value.trim();
  if (!msg||!S.roomId) return;
  wsSend('CHAT_MESSAGE',{roomId:S.roomId,playerId:S.id,playerName:S.name,message:msg});
  inp.value='';
}

/* ── Ranking ─────────────────────────────────────────── */
function renderRanking(rows) {
  const list=$('ranking-list');
  list.innerHTML='';
  if (!rows?.length){
    list.innerHTML='<p style="color:var(--text2);text-align:center;padding:30px 0">Sin datos aún</p>';
    return;
  }
  rows.forEach((r,i)=>{
    const pos=i+1, cls=pos===1?'g1':pos===2?'g2':pos===3?'g3':'gn';
    const d=document.createElement('div');
    d.className='rk-item';
    d.innerHTML=`<div class="rk-pos ${cls}">${pos}</div>
      <div class="rk-info"><div class="rk-nm">${esc(r.alias||r.name)}</div>
      <div class="rk-mt">${r.games_played||0} partidas</div></div>
      <div class="rk-wins"><div class="rk-w">${r.games_won||0}</div><div class="rk-wl">victorias</div></div>`;
    list.appendChild(d);
  });
}

/* ── Modal victoria ──────────────────────────────────── */
function showWin(playerName, desc, dice) {
  $('win-name').textContent='¡'+playerName+'!';
  $('win-desc').textContent=desc;
  const wr=$('win-dice');
  wr.innerHTML='';
  (dice||[]).forEach(v=>{
    const d=document.createElement('div');
    d.className='win-die';
    d.innerHTML=makeDieSVG(v,false);
    wr.appendChild(d);
  });
  $('modal-win').classList.remove('hidden');
  launchConfetti();
}

/* ── Init UI ─────────────────────────────────────────── */
function initUI() {
  initBgCanvas();

  // Lobby
  $('btn-create').onclick=()=>{
    const name=$('input-name').value.trim();
    if (!name){toast('Ingresá tu nombre'); return;}
    S.name=name; S.id=uid();
    connect(()=>setTimeout(()=>wsSend('CREATE_ROOM',{playerId:S.id,playerName:S.name,isPrivate:true,maxPlayers:10}),200));
  };

  $('btn-join-open').onclick=()=>{
    const name=$('input-name').value.trim();
    if (!name){toast('Ingresá tu nombre'); return;}
    S.name=name; S.id=uid();
    showScreen('screen-join');
  };

  $('btn-ranking').onclick=()=>{
    showScreen('screen-ranking');
    if (!S.ws||S.ws.readyState!==WebSocket.OPEN){
      S.name=S.name||'Visitante'; S.id=S.id||uid();
      connect(()=>setTimeout(()=>wsSend('GET_RANKING'),300));
    } else wsSend('GET_RANKING');
  };

  // Unirse
  $('btn-back-join').onclick=()=>showScreen('screen-lobby');
  $('input-code').oninput=function(){this.value=this.value.toUpperCase();};
  $('btn-join-confirm').onclick=()=>{
    const code=$('input-code').value.trim().toUpperCase();
    if (code.length<4){toast('Código inválido'); return;}
    const doJoin=()=>wsSend('JOIN_ROOM',{playerId:S.id,playerName:S.name,code});
    if (!S.ws||S.ws.readyState!==WebSocket.OPEN) connect(()=>setTimeout(doJoin,300));
    else doJoin();
  };

  // Sala espera
  $('btn-copy-code').onclick=()=>{
    navigator.clipboard?.writeText(S.roomCode||'')
      .then(()=>toast('Código copiado: '+S.roomCode))
      .catch(()=>toast('Código: '+S.roomCode));
  };
  $('btn-ready').onclick=()=>{
    wsSend('PLAYER_READY',{roomId:S.roomId,playerId:S.id});
    $('btn-ready').disabled=true;
    $('btn-ready').textContent='Esperando...';
  };

  // Juego
  $('btn-roll').onclick=()=>{
    if (!S.myTurn||$('btn-roll').disabled) return;
    clearDice(); // limpiar dados anteriores al tirar
    setMsg('','');
    SFX.roll();
    $('btn-roll').disabled=true;
    wsSend('ROLL',{roomId:S.roomId,playerId:S.id});
  };

  $('btn-bank').onclick=()=>{
    if (!S.myTurn||$('btn-bank').disabled) return;
    wsSend('BANK',{roomId:S.roomId,playerId:S.id});
  };

  // Chat
  $('chat-toggle').onclick=()=>{
    const p=$('chat-panel');
    S.chatOpen=p.classList.contains('hidden');
    p.classList.toggle('hidden');
    if (S.chatOpen){
      S.chatUnread=0;
      $('chat-badge').classList.add('hidden');
      $('chat-msgs').scrollTop=$('chat-msgs').scrollHeight;
    }
  };
  $('chat-close').onclick=()=>{ $('chat-panel').classList.add('hidden'); S.chatOpen=false; };
  $('chat-send').onclick=sendChat;
  $('chat-input').onkeydown=e=>{ if(e.key==='Enter') sendChat(); };

  // Ranking
  $('btn-back-ranking').onclick=()=>showScreen('screen-lobby');

  // Modal victoria
  $('btn-new-game').onclick=()=>{
    $('modal-win').classList.add('hidden');
    S.match=null; S.roomId=null; S.roomCode=null; S.entered=false; S.myTurn=false;
    $('btn-ready').disabled=false;
    $('btn-ready').textContent='Estoy listo ✓';
    $('chat-msgs').innerHTML='';
    clearDice();
    clearSession();
    showScreen('screen-lobby');
  };

  // Enter en inputs
  $('input-name').onkeydown=e=>{ if(e.key==='Enter') $('btn-create').click(); };
  $('input-code').onkeydown=e=>{ if(e.key==='Enter') $('btn-join-confirm').click(); };
}

document.addEventListener('DOMContentLoaded', () => {
  initUI();

  // Intentar restaurar sesión guardada
  const session = loadSession();
  if (session?.id && session?.roomId) {
    // Mostrar pantalla de reconexión mientras cargamos
    S.id       = session.id;
    S.name     = session.name;
    S.roomId   = session.roomId;
    S.roomCode = session.roomCode;

    // Prellenar el nombre en el lobby por si acaso
    const inp = $('input-name');
    if (inp) inp.value = session.name || '';

    // Mostrar toast y conectar
    showScreen('screen-lobby'); // pantalla segura mientras conecta
    toast('🔄 Restaurando sesión...', 2000);

    connect(); // el IDENTIFY mandará roomId → servidor responderá RECONNECTED o IDENTIFIED
  } else if (session?.id) {
    // Hay sesión pero sin sala — restaurar solo el nombre
    S.id   = session.id;
    S.name = session.name;
    const inp = $('input-name');
    if (inp) inp.value = session.name || '';
  }
});
