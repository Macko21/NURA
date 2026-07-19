/**
 * ═══════════════════════════════════════════════════════
 * LOS 10.000 DE MACKO — audio.js
 * Sistema de audio: música mp3 + SFX sintetizados
 * ═══════════════════════════════════════════════════════
 *
 * CANALES:
 *   🎵 Música  — principal.mp3, lobby.mp3, partida.mp3
 *   🔊 Efectos — dados, UI, notificaciones (sintetizados)
 *                game-over.mp3 (se reproduce por este canal)
 *
 * Cada canal tiene su propio slider de volumen y mute toggle.
 * ═══════════════════════════════════════════════════════
 */

// ── AudioContext (solo para SFX sintetizados) ───────
let AC = null;
const ac = () => AC || (AC = new (window.AudioContext||window.webkitAudioContext)());

// ── Volumen y toggles ────────────────────────────────
let _musicVolume = 0.3;     // volumen música (0-1)
let _sfxVolume = 0.8;       // volumen efectos (0-1)
let _musicMuted = false;    // siempre empieza activo
let _sfxMuted = false;      // siempre empieza activo
let _audioInitialized = false; // primera interacción del usuario

// ── Estado de la música mp3 ──────────────────────────
let _musicPlayer = null;    // Audio element actual
let _currentTrack = null;   // 'principal' | 'lobby' | 'partida' | null

const TRACKS = {
  principal: '/sounds/principal.mp3',
  lobby: '/sounds/lobby.mp3',
  partida: '/sounds/partida.mp3'
};

// ── Persistencia (solo volúmenes, NO mute) ───────────
function loadAudioPrefs() {
  try {
    const mv = localStorage.getItem('macko_music_vol');
    const sv = localStorage.getItem('macko_sfx_vol');
    if (mv !== null) _musicVolume = parseFloat(mv);
    if (sv !== null) _sfxVolume = parseFloat(sv);
    // Ignoramos mute guardado — siempre arranca activo
  } catch(e) {}
}
function saveAudioPrefs() {
  try {
    localStorage.setItem('macko_music_vol', String(_musicVolume));
    localStorage.setItem('macko_sfx_vol', String(_sfxVolume));
  } catch(e) {}
}
loadAudioPrefs();

// ── Inicializar audio en la primera interacción ──────
function initAudio() {
  if (_audioInitialized) return;
  _audioInitialized = true;
  // Iniciar AudioContext (para SFX sintetizados)
  ensureAudioContext();
  // Arrancar música según la pantalla actual
  const active = document.querySelector('.screen.active');
  startMusicForScreen(active ? active.id : 'screen-lobby');
  _updateSoundUI();
}

// ── Getters / Setters ────────────────────────────────
function getMusicVolume() { return _musicVolume; }
function getSfxVolume() { return _sfxVolume; }
function isMusicMuted() { return _musicMuted; }
function isSfxMuted() { return _sfxMuted; }

function setMusicVolume(vol) {
  _musicVolume = Math.max(0, Math.min(1, vol));
  if (_musicGain) _musicGain.gain.value = _musicMuted ? 0 : _musicVolume;
  saveAudioPrefs();
  _updateSoundUI();
}

function setSfxVolume(vol) {
  _sfxVolume = Math.max(0, Math.min(1, vol));
  saveAudioPrefs();
  _updateSoundUI();
}

function toggleMusicMute() {
  _musicMuted = !_musicMuted;
  if (_musicGain) _musicGain.gain.value = _musicMuted ? 0 : _musicVolume;
  if (_musicMuted) _stopMusic();
  else {
    const active = document.querySelector('.screen.active');
    startMusicForScreen(active ? active.id : 'screen-lobby');
  }
  saveAudioPrefs();
  _updateSoundUI();
  return _musicMuted;
}

function toggleSfxMute() {
  _sfxMuted = !_sfxMuted;
  saveAudioPrefs();
  _updateSoundUI();
  return _sfxMuted;
}

// ── Música mp3 (Web Audio API para volumen cross-platform) ──
let _musicSource = null;  // AudioBufferSourceNode activo
let _musicGain = null;    // GainNode para controlar volumen
let _musicBuffers = {};   // Cache de AudioBuffer por track

function _stopMusic() {
  if (_musicSource) {
    try { _musicSource.stop(); _musicSource.disconnect(); } catch(e) {}
    _musicSource = null;
  }
  if (_musicGain) {
    try { _musicGain.disconnect(); } catch(e) {}
    _musicGain = null;
  }
  _currentTrack = null;
}

async function _loadTrack(track) {
  if (_musicBuffers[track]) return _musicBuffers[track];
  const src = TRACKS[track];
  if (!src) return null;
  try {
    const ctx = ac();
    const resp = await fetch(src);
    const arrayBuffer = await resp.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    _musicBuffers[track] = audioBuffer;
    return audioBuffer;
  } catch(e) {
    console.warn('Error loading track:', e.message);
    return null;
  }
}

async function _playTrack(track) {
  _stopMusic();
  if (_musicMuted) return;
  const ctx = ac();
  if (!ctx) return;
  const buffer = await _loadTrack(track);
  if (!buffer) return;
  try {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = _musicVolume;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(0);
    _musicSource = source;
    _musicGain = gain;
    _currentTrack = track;
  } catch(e) {
    console.warn('Audio error:', e.message);
  }
}

function _getTargetTrack(screenId) {
  if (screenId === 'screen-game') return 'partida';
  if (screenId === 'screen-room') return 'lobby';
  return 'principal';
}

/** Inicia la música según la pantalla activa.
 *  Si el mismo tema ya está sonando, no lo reinicia. */
function startMusicForScreen(screenId) {
  const target = _getTargetTrack(screenId);
  if (_currentTrack === target) {
    // Ya estamos reproduciendo este tema — no reiniciar
    return;
  }
  _playTrack(target);
}

/** Detiene toda la música */
function stopMusic() {
  _stopMusic();
}

/** Reproduce game-over (solo bots) — usa el canal SFX */
function playGameOver() {
  if (_sfxMuted) return;
  try {
    const audio = new Audio('/sounds/game-over.mp3');
    audio.volume = _sfxVolume;
    audio.play().catch(() => {});
  } catch(e) {
    console.warn('Audio error:', e.message);
  }
}

function getMusicType() { return _currentTrack; }

// ── SFX sintetizados ─────────────────────────────────
function ensureAudioContext() {
  const ctx = ac();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, type='sine', dur=.12, vol=.2, delay=0) {
  if (_sfxMuted) return;
  try {
    const ctx = ensureAudioContext();
    // Crear un nodo de ganancia para este tono
    const masterGain = ctx.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(ctx.destination);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(masterGain);
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
  }
};

// ── UI del panel de sonido ───────────────────────────
function _updateSoundUI() {
  const anyMuted = _musicMuted || _sfxMuted;
  // Botón principal de sonido (pantalla de juego)
  const btn = document.getElementById('btn-sound');
  if (btn) {
    btn.textContent = anyMuted ? '🔇' : '🔊';
    btn.classList.toggle('muted', anyMuted);
    btn.title = anyMuted ? 'Sonido desactivado' : 'Ajustar sonido';
  }
  // Botón de música en el topbar (lobby / salas)
  const topbarBtn = document.getElementById('btn-music-toggle');
  if (topbarBtn) {
    topbarBtn.classList.toggle('muted', anyMuted);
    topbarBtn.title = anyMuted ? '🔇 Sonido desactivado' : '🎵 Ajustar sonido';
  }
  // Sliders del flyout
  const musicSlider = document.getElementById('sound-music-slider');
  if (musicSlider) musicSlider.value = Math.round(_musicVolume * 100);
  const sfxSlider = document.getElementById('sound-sfx-slider');
  if (sfxSlider) sfxSlider.value = Math.round(_sfxVolume * 100);
  // Porcentajes del flyout
  const musicPct = document.getElementById('sound-music-pct');
  if (musicPct) musicPct.textContent = Math.round(_musicVolume * 100) + '%';
  const sfxPct = document.getElementById('sound-sfx-pct');
  if (sfxPct) sfxPct.textContent = Math.round(_sfxVolume * 100) + '%';
  // Botones mute del flyout
  const musicMuteBtn = document.getElementById('sound-music-mute');
  if (musicMuteBtn) {
    musicMuteBtn.textContent = _musicMuted ? '🔇' : '🔊';
    musicMuteBtn.classList.toggle('muted', _musicMuted);
  }
  const sfxMuteBtn = document.getElementById('sound-sfx-mute');
  if (sfxMuteBtn) {
    sfxMuteBtn.textContent = _sfxMuted ? '🔇' : '🔊';
    sfxMuteBtn.classList.toggle('muted', _sfxMuted);
  }
  // Slider del menú de usuario (topbar)
  const menuSlider = document.getElementById('music-volume-slider');
  if (menuSlider) menuSlider.value = Math.round(_musicVolume * 100);
}

// Exponer para uso externo
function updateMusicBtns() { _updateSoundUI(); }
function updateSoundUI() { _updateSoundUI(); }

// ── Skin sounds ──────────────────────────────────────
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
