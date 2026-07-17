/**
 * ═══════════════════════════════════════════════════════
 * LOS 10.000 DE MACKO — audio.js
 * Sistema de audio: tonos sintetizados y SFX
 * ═══════════════════════════════════════════════════════
 */

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
  tick:  ()=>tone(1200,'sine',.04,.08),
  equip: ()=>{ tone(660,'sine',.08,.25); tone(880,'sine',.08,.2,.08); tone(1100,'sine',.12,.18,.16); },
  purchase: ()=>{ tone(600,'triangle',.1,.25); tone(800,'triangle',.08,.2,.08); tone(1000,'triangle',.15,.3,.2); }
};

// ── Sonidos únicos por skin de dados ────────────────────
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

// Obtener perfil de audio del jugador que está tirando
function getActiveSkinAudio() {
  const gameState = typeof S !== 'undefined' ? S : null;
  if (!gameState?.match?.players || gameState.match.currentPlayerIndex === undefined) return null;
  const player = gameState.match.players[gameState.match.currentPlayerIndex];
  if (!player?.equippedDice) return null;
  const skinId = String(player.equippedDice);
  return SKIN_SOUND[skinId] || null;
}

// Sonido de tirada con skin: 3 tonos ascendentes con la frecuencia/fondo de la skin
function playSkinRoll() {
  const s = getActiveSkinAudio();
  if (!s) { SFX.roll(); return; }
  tone(s.freq,          s.wave, .06, .28);
  tone(s.freq * 1.4,    s.wave, .05, .22, .05);
  tone(s.freq * 1.75,   s.wave, .04, .16, .1);
}

// Sonido de puntuar con skin: 2 tonos armónicos
function playSkinScore() {
  const s = getActiveSkinAudio();
  if (!s) { SFX.score(); return; }
  tone(s.freq,          'sine', .12, .28);
  tone(s.freq * 1.26,   'sine', .12, .22, .1);
}

// Sonido de dados calientes con skin: 4 tonos ascendentes
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
