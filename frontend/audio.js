/**
 * ═══════════════════════════════════════════════════════
 * LOS 10.000 DE MACKO — audio.js
 * Sistema de audio: tonos sintetizados, SFX y música ambiente
 * ═══════════════════════════════════════════════════════
 */

let AC = null;
const ac = () => AC || (AC = new (window.AudioContext||window.webkitAudioContext)());

// ── Volumen y mute ─────────────────────────────────────
let _masterGain = null; // nodo de ganancia maestro
let _masterVolume = 1.0;
let _musicVolume = 0.35; // volumen relativo de la música (0-1)
let _sfxVolume = 0.8;    // volumen relativo de SFX (0-1)
let _isMuted = false;    // mute global

// Persistencia
function loadAudioPrefs() {
  try {
    const muted = localStorage.getItem('macko_audio_muted');
    const musicVol = localStorage.getItem('macko_music_vol');
    _isMuted = muted === 'true';
    if (musicVol !== null) _musicVolume = parseFloat(musicVol);
  } catch(e) {}
}
function saveAudioPrefs() {
  try {
    localStorage.setItem('macko_audio_muted', String(_isMuted));
    localStorage.setItem('macko_music_vol', String(_musicVolume));
  } catch(e) {}
}
loadAudioPrefs();

// Obtener o crear el nodo de ganancia maestro
function getMasterGain() {
  if (!_masterGain) {
    const ctx = ac();
    _masterGain = ctx.createGain();
    _masterGain.gain.value = _isMuted ? 0 : _masterVolume;
    _masterGain.connect(ctx.destination);
  }
  return _masterGain;
}

// Asegurar que el AudioContext esté iniciado (requiere interacción del usuario)
function ensureAudioContext() {
  const ctx = ac();
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

function setMasterVolume(vol) {
  _masterVolume = Math.max(0, Math.min(1, vol));
  if (_masterGain) _masterGain.gain.value = _isMuted ? 0 : _masterVolume;
}

function setMusicVolume(vol) {
  _musicVolume = Math.max(0, Math.min(1, vol));
  // Actualizar ganancia de la música si está sonando
  if (_musicNodes.length > 0) {
    _musicNodes.forEach(n => {
      if (n.gainNode && n.rawGain != null) {
        const target = n.rawGain * _musicVolume * (_isMuted ? 0 : 1);
        n.gainNode.gain.setTargetAtTime(target, ac().currentTime, 0.1);
      }
    });
  }
  saveAudioPrefs();
}

function getMusicVolume() { return _musicVolume; }
function isMuted() { return _isMuted; }

function toggleMute() {
  _isMuted = !_isMuted;
  if (_masterGain) _masterGain.gain.value = _isMuted ? 0 : _masterVolume;
  saveAudioPrefs();
  return _isMuted;
}

// ── Tone helper (conectado al master gain) ────────────
function tone(freq, type='sine', dur=.12, vol=.2, delay=0) {
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

// ── Efectos de sonido (SFX) ────────────────────────────
const SFX = {
  roll: () => {
    // Tirada con más cuerpo: 3 sonidos superpuestos
    tone(200,'sawtooth',.08,.35);
    tone(280,'sawtooth',.06,.28,.04);
    tone(350,'sawtooth',.05,.2,.08);
    tone(150,'triangle',.04,.15,.02); // más grave para peso
  },
  score: () => {
    tone(523,'sine',.12,.28);
    tone(659,'sine',.12,.22,.1);
    tone(784,'sine',.08,.15,.18); // tercera nota
  },
  bank: () => {
    tone(440,'sine',.1,.25);
    tone(554,'sine',.12,.25,.1);
    tone(659,'sine',.18,.3,.2);
  },
  fail: () => {
    tone(200,'sawtooth',.25,.35);
    tone(160,'sawtooth',.25,.25,.12);
    tone(120,'sawtooth',.3,.15,.25); // descendente
  },
  hot: () => {
    [523,659,784,1047].forEach((f,i)=>tone(f,'sine',.18,.38,i*.08));
  },
  win: () => {
    // Victoria épica: arpegio ascendente de 7 notas
    [523,587,659,784,880,1047,1318].forEach((f,i)=>{
      tone(f,'triangle',.35,.45,i*.1);
      tone(f*0.5,'sine',.4,.12,i*.1); // sub-octava para cuerpo
    });
    // Final con acorde completo
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
  click: () => tone(1000,'sine',.03,.06), // Click UI sutil
  hover: () => tone(660,'sine',.015,.025), // Hover menú — muy sutil, casi imperceptible
  countdown: () => tone(440,'square',.08,.15), // tick de countdown
  error: () => {
    tone(300,'sawtooth',.15,.25);
    tone(250,'sawtooth',.2,.2,.1);
  }
};

// ── Sistema de música de fondo ──────────────────────────
let _musicNodes = [];
let _musicType = null; // 'lobby' | 'game' | 'win' | null
let _musicInterval = null;

// Limpiar todos los nodos de música activos
function _clearMusicNodes() {
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

// Crear una nota continua (drone) con modulación
function _createDroneNote(freq, type, baseGain, lfoFreq, lfoDepth) {
  try {
    const ctx = ensureAudioContext();
    const master = getMasterGain();
    
    // Oscilador principal
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    
    // Ganancia del oscilador
    const gain = ctx.createGain();
    const adjustedGain = baseGain * _musicVolume;
    gain.gain.value = adjustedGain;
    
    // LFO para modulación de ganancia (tremolo)
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

// Crear un arpegio en loop
function _createArpeggio(notes, type, baseVolume, interval, loop = true) {
  let noteIndex = 0;
  let stopped = false;
  
  function playNext() {
    if (stopped || _musicNodes.length === 0) return;
    if (_isMuted) { noteIndex = (noteIndex + 1) % notes.length; return; }
    
    const note = notes[noteIndex];
    const vol = baseVolume * _musicVolume;
    tone(note, type, interval * 0.8, vol);
    noteIndex = (noteIndex + 1) % notes.length;
  }
  
  if (_musicInterval) clearInterval(_musicInterval);
  _musicInterval = setInterval(playNext, interval * 1000);
  
  return () => { stopped = true; };
}

// Iniciar música del lobby — ambiente relajante
function startLobbyMusic() {
  _clearMusicNodes();
  _musicType = 'lobby';
  if (_isMuted) return;
  
  const ctx = ensureAudioContext();
  if (!ctx) return;
  
  // Drone ambiente en C mayor (notas suaves)
  _createDroneNote(130.81, 'sine', 0.08, 0.3, 0.3);   // C3 - grave
  _createDroneNote(261.63, 'sine', 0.06, 0.2, 0.25);  // C4 - media
  _createDroneNote(392.00, 'sine', 0.03, 0.15, 0.2);  // G4 - aguda
  
  // Arpegio lento de 4 notas cada 2.5s
  _createArpeggio([261.63, 329.63, 392.00, 523.25], 'triangle', 0.12, 2.5);
}

// Iniciar música del juego — más tensión y energía
function startGameMusic() {
  _clearMusicNodes();
  _musicType = 'game';
  if (_isMuted) return;
  
  const ctx = ensureAudioContext();
  if (!ctx) return;
  
  // Drone más grave y presente
  _createDroneNote(98.00, 'sawtooth', 0.04, 0.5, 0.35);   // G2 - pulso grave
  _createDroneNote(196.00, 'square', 0.025, 0.3, 0.2);     // G3 - armónico
  
  // Arpegio más rápido cada 1.2s - sensación de urgencia
  _createArpeggio([196.00, 261.63, 293.66, 392.00], 'triangle', 0.1, 1.2);
}

// Iniciar música de sala de espera — tranquila, expectante
function startRoomMusic() {
  _clearMusicNodes();
  _musicType = 'room';
  if (_isMuted) return;
  
  const ctx = ensureAudioContext();
  if (!ctx) return;
  
  // Drone suave y expectante
  _createDroneNote(220.00, 'sine', 0.05, 0.2, 0.2);  // A3
  _createDroneNote(329.63, 'sine', 0.03, 0.15, 0.15); // E4
  
  // Arpegio cada 3s - relajado
  _createArpeggio([220.00, 261.63, 329.63], 'triangle', 0.08, 3.0);
}

// Iniciar música del perfil — introspectiva, suave
function startProfileMusic() {
  _clearMusicNodes();
  _musicType = 'profile';
  if (_isMuted) return;
  
  const ctx = ensureAudioContext();
  if (!ctx) return;
  
  // Drone en Re menor (D3 + A3) — tono íntimo y reflexivo
  _createDroneNote(146.83, 'sine', 0.05, 0.2, 0.2);  // D3
  _createDroneNote(220.00, 'sine', 0.03, 0.15, 0.15); // A3
  
  // Arpegio muy lento cada 4s — notas altas como pensamientos
  _createArpeggio([293.66, 349.23, 440.00, 349.23], 'sine', 0.06, 4.0);
}

// Iniciar música del ranking — ambiente de logro y aspiración
function startRankingMusic() {
  _clearMusicNodes();
  _musicType = 'ranking';
  if (_isMuted) return;
  
  const ctx = ensureAudioContext();
  if (!ctx) return;
  
  // Drone en Mi mayor (E2 + B3 + E4) — tono brillante y de logro
  _createDroneNote(82.41, 'sine', 0.04, 0.3, 0.25);   // E2 - pulso grave
  _createDroneNote(246.94, 'sine', 0.05, 0.2, 0.2);   // B3 - medio
  _createDroneNote(329.63, 'sine', 0.03, 0.1, 0.1);   // E4 - brillo
  
  // Arpegio pausado cada 3.5s — sensación de ascenso
  _createArpeggio([329.63, 392.00, 523.25, 659.25], 'triangle', 0.08, 3.5);
}

// Iniciar música del portal social — ambiente abierto y social
function startPortalMusic() {
  _clearMusicNodes();
  _musicType = 'portal';
  if (_isMuted) return;
  
  const ctx = ensureAudioContext();
  if (!ctx) return;
  
  // Drone en La mayor (A3 + E4) — tono cálido y acogedor
  _createDroneNote(220.00, 'sine', 0.06, 0.25, 0.2);  // A3
  _createDroneNote(329.63, 'sine', 0.04, 0.15, 0.15); // E4
  _createDroneNote(440.00, 'sine', 0.02, 0.1, 0.1);   // A4 - toque brillante
  
  // Arpegio amigable cada 2.8s — movimiento social
  _createArpeggio([261.63, 329.63, 392.00, 523.25], 'triangle', 0.08, 2.8);
}

// Música de victoria (se reproduce UNA vez, no loop)
function playWinMusic() {
  _clearMusicNodes();
  _musicType = 'win';
  if (_isMuted) return;
  
  const ctx = ensureAudioContext();
  if (!ctx) return;
  
  // Acorde de victoria sostenido
  _createDroneNote(261.63, 'sine', 0.1, 0.1, 0.1);   // C4
  _createDroneNote(329.63, 'sine', 0.08, 0.05, 0.05); // E4
  _createDroneNote(392.00, 'sine', 0.06, 0.02, 0.02); // G4
  
  // Detener después de 3s y volver al lobby/game
  setTimeout(() => {
    // Hacer fade out
    _musicNodes.forEach(n => {
      if (n.gainNode) {
        try {
          n.gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5);
        } catch(e) {}
      }
    });
    setTimeout(() => {
      _clearMusicNodes();
      _musicType = null;
    }, 2000);
  }, 3000);
}

// Detener toda la música
function stopMusic() {
  _clearMusicNodes();
  _musicType = null;
}

function getMusicType() { return _musicType; }

// Actualizar volumen de la música en tiempo real (cuando se cambia mute)
function refreshMusicVolume() {
  _musicNodes.forEach(n => {
    if (n.gainNode && n.rawGain != null) {
      const target = n.rawGain * _musicVolume * (_isMuted ? 0 : 1);
      n.gainNode.gain.setTargetAtTime(target, ac().currentTime, 0.1);
    }
  });
}

// ── Skin sounds ─────────────────────────────────────────
const SKIN_SOUND = {
  '1':  { freq: 500, wave: 'square' },
  '2':  { freq: 180, wave: 'sawtooth' },
  '4':  { freq: 660, wave: 'sine' },
  '5':  { freq: 880, wave: 'sine' },
  '6':  { freq: 1100,wave: 'sine' },
  '18': { freq: 160, wave: 'sawtooth' },
  '19': { freq: 440, wave: 'sine' },
  '20': { freq: 520, wave: 'sine' },
  '21': { freq: 140, wave: 'sawtooth' },
  '22': { freq: 770, wave: 'triangle' },
  '32': { freq: 1200,wave: 'sine' },
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

// ── Init al cargar ─────────────────────────────────────
// No inicializar el AudioContext aquí (debe hacerse con interacción del usuario)
// Solo restaurar preferencias

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SKIN_SOUND };
}
