/**
 * ═══════════════════════════════════════════════════════
 * LOS 10.000 DE MACKO — audio.js
 * Sistema de audio: tonos sintetizados, SFX y música
 * ═══════════════════════════════════════════════════════
 *
 * CANALES DE AUDIO:
 *   🎵 Música  — tema principal, lobby, partida
 *   🔊 Efectos — dados, UI, notificaciones
 *
 * Cada canal tiene su propio toggle on/off.
 * La música tiene un slider de volumen global.
 * ═══════════════════════════════════════════════════════
 */

let AC = null;
const ac = () => AC || (AC = new (window.AudioContext||window.webkitAudioContext)());

// ── Volumen y toggles ─────────────────────────────────
let _masterGain = null;
let _masterVolume = 1.0;
let _musicVolume = 0.3;     // volumen de la música (0-1)
let _sfxVolume = 0.8;       // volumen de SFX (0-1)
let _musicMuted = false;    // música silenciada?
let _sfxMuted = false;      // efectos silenciados?

// Persistencia
function loadAudioPrefs() {
  try {
    _musicMuted = localStorage.getItem('macko_music_muted') === 'true';
    _sfxMuted = localStorage.getItem('macko_sfx_muted') === 'true';
    const musicVol = localStorage.getItem('macko_music_vol');
    if (musicVol !== null) _musicVolume = parseFloat(musicVol);
  } catch(e) {}
}
function saveAudioPrefs() {
  try {
    localStorage.setItem('macko_music_muted', String(_musicMuted));
    localStorage.setItem('macko_sfx_muted', String(_sfxMuted));
    localStorage.setItem('macko_music_vol', String(_musicVolume));
  } catch(e) {}
}
loadAudioPrefs();

function getMasterGain() {
  if (!_masterGain) {
    const ctx = ac();
    _masterGain = ctx.createGain();
    _masterGain.gain.value = _masterVolume;
    _masterGain.connect(ctx.destination);
  }
  return _masterGain;
}

function ensureAudioContext() {
  const ctx = ac();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// ── Getters / Setters ─────────────────────────────────
function getMusicVolume() { return _musicVolume; }
function isMusicMuted() { return _musicMuted; }
function isSfxMuted() { return _sfxMuted; }

function setMusicVolume(vol) {
  _musicVolume = Math.max(0, Math.min(1, vol));
  _refreshMusicVolume();
  saveAudioPrefs();
}

function toggleMusicMute() {
  _musicMuted = !_musicMuted;
  if (_musicMuted) {
    _stopMusic();
  } else {
    const active = document.querySelector('.screen.active');
    startMusicForScreen(active ? active.id : 'screen-lobby');
  }
  saveAudioPrefs();
  _updateMusicBtns();
  return _musicMuted;
}

function toggleSfxMute() {
  _sfxMuted = !_sfxMuted;
  saveAudioPrefs();
  return _sfxMuted;
}

// ── Tone helper (usa canal SFX) ──────────────────────
function tone(freq, type='sine', dur=.12, vol=.2, delay=0) {
  if (_sfxMuted) return;
  try {
    const ctx = ensureAudioContext();
    const master = getMasterGain();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(master);
    o.type = type;
    o.frequency.value = freq;
    const t = ctx.currentTime + delay;
    const adjustedVol = vol * _sfxVolume;
    g.gain.setValueAtTime(adjustedVol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.start(t);
    o.stop(t + dur);
  } catch(e) {}
}

// ── Efectos de sonido (SFX) ──────────────────────────
const SFX = {
  roll: () => {
    tone(200,'sawtooth',.08,.35);
    tone(280,'sawtooth',.06,.28,.04);
    tone(350,'sawtooth',.05,.2,.08);
    tone(150,'triangle',.04,.15,.02);
  },
  score: () => {
    tone(523,'sine',.12,.28);
    tone(659,'sine',.12,.22,.1);
    tone(784,'sine',.08,.15,.18);
  },
  bank: () => {
    tone(440,'sine',.1,.25);
    tone(554,'sine',.12,.25,.1);
    tone(659,'sine',.18,.3,.2);
  },
  fail: () => {
    tone(200,'sawtooth',.25,.35);
    tone(160,'sawtooth',.25,.25,.12);
    tone(120,'sawtooth',.3,.15,.25);
  },
  hot: () => {
    [523,659,784,1047].forEach((f,i)=>tone(f,'sine',.18,.38,i*.08));
  },
  win: () => {
    [523,587,659,784,880,1047,1318].forEach((f,i)=>{
      tone(f,'triangle',.35,.45,i*.1);
      tone(f*0.5,'sine',.4,.12,i*.1);
    });
    setTimeout(() => {
      [523,659,784].forEach(f => tone(f,'sine',.6,.3,.05));
    }, 720);
  },
  chat: () => tone(880,'sine',.06,.1),
  enter: () => {
    tone(440,'sine',.12,.3);
    tone(659,'sine',.18,.35,.15);
  },
  tick: () => tone(1200,'sine',.04,.08),
  equip: () => {
    tone(660,'sine',.08,.25);
    tone(880,'sine',.08,.2,.08);
    tone(1100,'sine',.12,.18,.16);
  },
  purchase: () => {
    tone(600,'triangle',.1,.25);
    tone(800,'triangle',.08,.2,.08);
    tone(1000,'triangle',.15,.3,.2);
  },
  click: () => tone(1000,'sine',.03,.06),
  hover: () => tone(660,'sine',.015,.025),
  countdown: () => tone(440,'square',.08,.15),
  error: () => {
    tone(300,'sawtooth',.15,.25);
    tone(250,'sawtooth',.2,.2,.1);
  },
  // Game-over: sonido descendente triste para cuando se pierde contra bots
  gameOver: () => {
    tone(440,'sawtooth',.25,.25);
    tone(370,'sawtooth',.2,.2,.2);
    tone(311,'sawtooth',.2,.15,.35);
    tone(261,'sawtooth',.3,.1,.5);
    tone(220,'sawtooth',.5,.08,.7);
    // Nota final grave como "derrota"
    setTimeout(() => {
      tone(110,'sine',.8,.15,0);
    }, 950);
  }
};

// ── Sistema de música ─────────────────────────────────
let _musicNodes = [];
let _musicType = null; // 'principal' | 'lobby' | 'partida' | 'win' | null
let _musicInterval = null;

function _stopMusic() {
  if (_musicInterval) { clearInterval(_musicInterval); _musicInterval = null; }
  _musicNodes.forEach(n => {
    try {
      if (n.oscNode) { n.oscNode.stop(); n.oscNode.disconnect(); }
      if (n.gainNode) n.gainNode.disconnect();
      if (n.lfoNode) { n.lfoNode.stop(); n.lfoNode.disconnect(); }
    } catch(e) {}
  });
  _musicNodes = [];
}

function _createDroneNote(freq, type, baseGain, lfoFreq, lfoDepth) {
  if (_musicMuted) return null;
  try {
    const ctx = ensureAudioContext();
    const master = getMasterGain();
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = baseGain * _musicVolume;
    if (lfoFreq && lfoDepth) {
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = lfoFreq;
      lfoGain.gain.value = lfoDepth;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      lfo.start();
      _musicNodes.push({ lfoNode: lfo });
    }
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    const nodeInfo = { oscNode: osc, gainNode: gain, rawGain: baseGain };
    _musicNodes.push(nodeInfo);
    return nodeInfo;
  } catch(e) { return null; }
}

function _createArpeggio(notes, type, baseVolume, interval) {
  let noteIndex = 0;
  let stopped = false;
  function playNext() {
    if (stopped || _musicNodes.length === 0) return;
    if (_musicMuted) { noteIndex = (noteIndex + 1) % notes.length; return; }
    const note = notes[noteIndex];
    // Los arpegios usan ondas senoidales muy suaves, no pasan por tone()
    const ctx = ensureAudioContext();
    const master = getMasterGain();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(master);
    o.type = type;
    o.frequency.value = note;
    const vol = baseVolume * _musicVolume;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + interval * 0.8);
    o.start(ctx.currentTime);
    o.stop(ctx.currentTime + interval * 0.8);
    noteIndex = (noteIndex + 1) % notes.length;
  }
  if (_musicInterval) clearInterval(_musicInterval);
  _musicInterval = setInterval(playNext, interval * 1000);
  return () => { stopped = true; };
}

// ── TEMAS MUSICALES ───────────────────────────────────

// 🎵 principal.mp3 — Tema principal para navegación (lobby, shop, portal, perfil, ranking)
function _startPrincipalMusic() {
  _stopMusic();
  _musicType = 'principal';
  if (_musicMuted) return;
  const ctx = ensureAudioContext();
  if (!ctx) return;
  // Drone en Do mayor — tono acogedor y versátil
  _createDroneNote(130.81, 'sine', 0.06, 0.25, 0.2);   // C3
  _createDroneNote(261.63, 'sine', 0.04, 0.15, 0.15);  // C4
  _createDroneNote(392.00, 'sine', 0.02, 0.1, 0.08);   // G4
  // Arpegio pausado cada 3s
  _createArpeggio([261.63, 329.63, 392.00, 523.25], 'triangle', 0.08, 3.0);
}

// 🎵 lobby.mp3 — Sala de espera (cuando se junta con jugadores o revancha)
function _startLobbyMusic() {
  _stopMusic();
  _musicType = 'lobby';
  if (_musicMuted) return;
  const ctx = ensureAudioContext();
  if (!ctx) return;
  // Drone expectante en La menor — anticipación
  _createDroneNote(110.00, 'sine', 0.05, 0.2, 0.15);  // A2
  _createDroneNote(220.00, 'sine', 0.04, 0.15, 0.1);  // A3
  // Arpegio cada 2.5s — ligera tensión
  _createArpeggio([220.00, 261.63, 329.63, 261.63], 'triangle', 0.07, 2.5);
}

// 🎵 partida.mp3 — Durante la partida (sutil, la música bajita para que se escuchen los dados)
function _startPartidaMusic() {
  _stopMusic();
  _musicType = 'partida';
  if (_musicMuted) return;
  const ctx = ensureAudioContext();
  if (!ctx) return;
  // Drone muy suave en Re mayor — casi imperceptible, solo atmósfera
  _createDroneNote(146.83, 'sine', 0.03, 0.15, 0.1);   // D3
  _createDroneNote(220.00, 'sine', 0.02, 0.1, 0.08);   // A3
  // Arpegio lentísimo cada 4s — solo un susurro de fondo
  _createArpeggio([293.66, 369.99, 440.00], 'sine', 0.04, 4.0);
}

// ── API pública ───────────────────────────────────────

/** Inicia la música según la pantalla activa */
function startMusicForScreen(screenId) {
  if (screenId === 'screen-game') {
    _startPartidaMusic();
  } else if (screenId === 'screen-room') {
    _startLobbyMusic();
  } else {
    // screen-auth, screen-lobby, screen-join, screen-ranking, screen-profile, screen-portal
    _startPrincipalMusic();
  }
}

/** Detiene toda la música */
function stopMusic() {
  _stopMusic();
  _musicType = null;
}

/** Reproduce game-over (solo bots) */
function playGameOver() {
  SFX.gameOver();
}

function getMusicType() { return _musicType; }

function _refreshMusicVolume() {
  _musicNodes.forEach(n => {
    if (n.gainNode && n.rawGain != null) {
      const target = n.rawGain * _musicVolume * (_musicMuted ? 0 : 1);
      n.gainNode.gain.setTargetAtTime(target, ac().currentTime, 0.1);
    }
  });
}

// ── Botones de música en UI ──────────────────────────
function _updateMusicBtns() {
  // Botón del topbar (lobby)
  const btn = document.getElementById('btn-music-toggle');
  if (btn) {
    btn.textContent = _musicMuted ? '🔇' : '🎵';
    btn.title = _musicMuted ? 'Música desactivada' : `Música ${Math.round(_musicVolume * 100)}%`;
  }
  // Botones de la partida (juego)
  const musicBtn = document.getElementById('btn-game-music');
  if (musicBtn) {
    musicBtn.textContent = _musicMuted ? '🔇' : '🎵';
    musicBtn.title = _musicMuted ? 'Música desactivada' : `Música ${Math.round(_musicVolume * 100)}%`;
  }
  const sfxBtn = document.getElementById('btn-game-sfx');
  if (sfxBtn) {
    sfxBtn.textContent = _sfxMuted ? '🔇' : '🔊';
    sfxBtn.title = _sfxMuted ? 'Efectos desactivados' : 'Efectos activados';
  }
  // Slider de volumen
  const slider = document.getElementById('music-volume-slider');
  if (slider) slider.value = Math.round(_musicVolume * 100);
  const icon = document.getElementById('music-vol-icon');
  if (icon) icon.textContent = _musicMuted ? '🔇' : '🎵';
}

// Exponer para que app.js lo use
function updateMusicBtns() { _updateMusicBtns(); }

// ── Skin sounds ───────────────────────────────────────
const SKIN_SOUND = {
  '1':  { freq: 500, wave: 'square' },
  '2':  { freq: 180, wave: 'sawtooth' },
  '4':  { freq: 660, wave: 'sine' },
  '5':  { freq: 880, wave: 'sine' },
  '6':  { freq: 1100, wave: 'sine' },
  '18': { freq: 160, wave: 'sawtooth' },
  '19': { freq: 440, wave: 'sine' },
  '20': { freq: 520, wave: 'sine' },
  '21': { freq: 140, wave: 'sawtooth' },
  '22': { freq: 770, wave: 'triangle' },
  '32': { freq: 1200, wave: 'sine' },
  '33': { freq: 200, wave: 'triangle' },
};

function getActiveSkinAudio() {
  const gameState = typeof S !== 'undefined' ? S : null;
  if (!gameState?.match?.players || gameState.match.currentPlayerIndex === undefined) return null;
  const player = gameState.match.players[gameState.match.currentPlayerIndex];
  if (!player?.equippedDice) return null;
  const skinId = String(player.equippedDice);
  return SKIN_SOUND[skinId] || null;
}

function playSkinRoll() {
  const s = getActiveSkinAudio();
  if (!s) { SFX.roll(); return; }
  tone(s.freq,          s.wave, .06, .28);
  tone(s.freq * 1.4,    s.wave, .05, .22, .05);
  tone(s.freq * 1.75,   s.wave, .04, .16, .1);
}

function playSkinScore() {
  const s = getActiveSkinAudio();
  if (!s) { SFX.score(); return; }
  tone(s.freq,          'sine', .12, .28);
  tone(s.freq * 1.26,   'sine', .12, .22, .1);
}

function playSkinHot() {
  const s = getActiveSkinAudio();
  if (!s) { SFX.hot(); return; }
  [s.freq, s.freq * 1.26, s.freq * 1.5, s.freq * 2].forEach((f,i) =>
    tone(f, 'sine', .18, .38, i * .08)
  );
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SKIN_SOUND };
}
