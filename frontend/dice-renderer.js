/**
 * ═══════════════════════════════════════════════════════
 * LOS 10.000 DE MACKO — dice-renderer.js
 * Renderizado de dados SVG, skins, partículas y animaciones
 * ═══════════════════════════════════════════════════════
 */

/* ── SVG dados realistas ─────────────────────────────── */
const DOT_POSITIONS = {
  1: [[25,25]],
  2: [[12,12],[38,38]],
  3: [[12,12],[25,25],[38,38]],
  4: [[12,12],[38,12],[12,38],[38,38]],
  5: [[12,12],[38,12],[25,25],[12,38],[38,38]],
  6: [[12,10],[38,10],[12,25],[38,25],[12,40],[38,40]]
};

let _dice3DPromise = null;
let _diceRenderRequest = 0;
let _lastDiceView = null;
// Incrementar cuando se modifique dice-renderer-3d.mjs para forzar recarga del cache
const _3D_CACHE_BUST = '5';

function loadDice3D() {
  if (window.MackoDice3D) return Promise.resolve(window.MackoDice3D);
  if (!_dice3DPromise) {
    const version = typeof GAME_VERSION !== 'undefined' ? GAME_VERSION : 'current';
    _dice3DPromise = import(`/dice-renderer-3d.mjs?v=${encodeURIComponent(version)}&b=${_3D_CACHE_BUST}`)
      .then(() => window.MackoDice3D)
      .catch(err => {
        console.warn('Dados 3D no disponibles; usando renderer 2D:', err.message);
        return null;
      });
  }
  return _dice3DPromise;
}

// Mapa de skins de dados: ID del item → colores
const DICE_SKINS = {
  '1':  { bg: ['#F8F4EE','#E8E0D0'], dot:'#1a1a2e', sh:'#C4BAA2', name:'Neón',       icon:'🎲' },
  '2':  { bg: ['#FF6B35','#E05020'], dot:'#fff',    sh:'#B03010', name:'Fuego',      icon:'🔥' },
  '4':  { bg: ['#B8D8F8','#88B8E8'], dot:'#1a2a4e', sh:'#6898C8', name:'Élite',      icon:'💎' },
  '5':  { bg: ['#70E8FF','#10C0E0'], dot:'#003A4A', sh:'#0090B0', name:'Fantasma',   icon:'👻' },
  '6':  { bg: ['#C8E8F8','#A8D0E8'], dot:'#1a3a4e', sh:'#78B0C8', name:'Hielo',      icon:'❄️' },
  '18': { bg: ['#FF2222','#CC0000'], dot:'#fff',    sh:'#880000', name:'Láser',      icon:'🔴' },
  '19': { bg: ['#FFD700','#DAA520'], dot:'#5a3a00', sh:'#B8860B', name:'Dorados',    icon:'🏅' },
  '20': { bg: ['#50C878','#2EA85E'], dot:'#fff',    sh:'#1A7840', name:'Esmeralda',  icon:'💚' },
  '21': { bg: ['#6B8E23','#4A6E10'], dot:'#d0d0a0', sh:'#2A4E00', name:'Zombie',     icon:'🧟' },
  '22': { bg: ['#FF6B9D','#FFD700'], dot:'#3a1a4e', sh:'#CC5599', name:'Arcoíris',   icon:'🌈' },
  '32': { bg: ['#B9F2FF','#7FE0F8'], dot:'#003344', sh:'#40C0E0', name:'Diamante',   icon:'💠' },
  '33': { bg: ['#1A0533','#4A1A7A'], dot:'#fff',    sh:'#2A0055', name:'Galácticos', icon:'🌌' },
  '37': { bg: ['#39D6E8','#126DB5'], dot:'#fff',    sh:'#0A4C86', name:'Océano',     icon:'🌊' },
  '38': { bg: ['#FFD2E4','#EF80B2'], dot:'#542039', sh:'#C95689', name:'Sakura',     icon:'🌸' },
  '39': { bg: ['#C8FF28','#4E8F00'], dot:'#102000', sh:'#315F00', name:'Tóxicos',    icon:'☢️' },
  '40': { bg: ['#FF4FD8','#4A35D8'], dot:'#fff',    sh:'#2DE2E6', name:'Vaporwave',  icon:'🕹️' },
  '49': { bg: ['#F5ECFF','#56D9FF','#D762FF'], dot:'#28134A', sh:'#8DEBFF', name:'Prisma', icon:'🔮' },
};

// Preview de dados para la tienda: valores de dados emblemáticos para cada skin
// y sus variantes de color en estado normal
const SHOP_DICE_PREVIEW = {
  '1':  { val: 5, label: '5 pts' },
  '2':  { val: 1, label: '100 pts' },
  '4':  { val: 6, label: 'Dado de la suerte' },
  '5':  { val: 3, label: 'Triple amenaza' },
  '6':  { val: 4, label: 'Frío mortal' },
  '18': { val: 6, label: 'Precisión láser' },
  '19': { val: 5, label: '50 pts' },
  '20': { val: 2, label: 'Doble esmeralda' },
  '21': { val: 1, label: 'Mordida zombie' },
  '22': { val: 5, label: 'Arcoíris total' },
  '32': { val: 3, label: 'Brillo puro' },
  '33': { val: 6, label: 'Nebulosa cósmica' },
  '37': { val: 5, label: 'Marea de suerte' },
  '38': { val: 3, label: 'Flor triple' },
  '39': { val: 6, label: 'Carga tóxica' },
  '40': { val: 5, label: 'Retro bonus' },
  '49': { val: 1, label: 'Prisma Ultra' },
};

function makeDieSVG(value, state='normal', skinId=null, dotColor=null) {
  const dots = DOT_POSITIONS[value] || [];

  let finalDotColor = dotColor;
  if (!finalDotColor) {
    if (state === 'scoring')      finalDotColor = '#103808';
    else if (state === 'hot')     finalDotColor = '#6b3400';
    else                          finalDotColor = '#1a1a2e';
  }

  const circles = dots.map(([cx,cy]) =>
    `<circle cx="${cx}" cy="${cy}" r="4.5" fill="${finalDotColor}" stroke="rgba(255,255,255,.5)" stroke-width="1.2"/>`
  ).join('');
  return `<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">${circles}</svg>`;
}

function makeDie(value, state='normal', skinId=null) {
  const el = document.createElement('div');
  const skin = skinId && DICE_SKINS[skinId] ? DICE_SKINS[skinId] : null;

  el.className = 'die rolling'
    + (state === 'scoring' ? ' scoring' : '')
    + (state === 'hot'     ? ' hot'     : '')
    + (state === 'dead'    ? ' dead'    : '');

  if (skin) {
    let dotColor;

    if (state === 'dead') {
      // Dead: misma skin con colores normales
      el.style.background = `linear-gradient(145deg,${skin.bg[0]},${skin.bg[1]})`;
      el.style.boxShadow = `2px 2px 0 ${skin.sh}, 3px 3px 0 ${skin.sh}, 0 6px 16px rgba(0,0,0,.6), 0 2px 4px rgba(0,0,0,.3), inset 0 1px 2px rgba(255,255,255,.9)`;
      dotColor = skin.dot || '#1a1a2e';
      el.classList.add('die-skin-' + skinId);
    } else if (state === 'scoring') {
      // Scoring: dado NORMAL + borde LED verde neón brillante
      el.style.background = `linear-gradient(145deg,${skin.bg[0]},${skin.bg[1]})`;
      el.style.boxShadow = `2px 2px 0 ${skin.sh}, 3px 3px 0 ${skin.sh}, 0 6px 16px rgba(0,0,0,.6), 0 2px 4px rgba(0,0,0,.3), inset 0 1px 2px rgba(255,255,255,.9), 0 0 0 2.5px rgba(0,255,100,.75), 0 0 14px 6px rgba(0,255,100,.45)`;
      dotColor = skin.dot || '#1a1a2e';
      el.classList.add('die-skin-' + skinId);
    } else if (state === 'hot') {
      // Hot: dado NORMAL + borde LED dorado intenso
      el.style.background = `linear-gradient(145deg,${skin.bg[0]},${skin.bg[1]})`;
      el.style.boxShadow = `2px 2px 0 ${skin.sh}, 3px 3px 0 ${skin.sh}, 0 6px 16px rgba(0,0,0,.6), 0 2px 4px rgba(0,0,0,.3), inset 0 1px 2px rgba(255,255,255,.9), 0 0 0 3px rgba(255,220,50,.85), 0 0 18px 8px rgba(255,220,50,.55)`;
      dotColor = skin.dot || '#1a1a2e';
      el.classList.add('die-skin-' + skinId);
    } else {
      el.style.background = `linear-gradient(145deg,${skin.bg[0]},${skin.bg[1]})`;
      el.style.boxShadow = `2px 2px 0 ${skin.sh}, 3px 3px 0 ${skin.sh}, 0 6px 16px rgba(0,0,0,.6), 0 2px 4px rgba(0,0,0,.3), inset 0 1px 2px rgba(255,255,255,.9)`;
      dotColor = skin.dot || '#1a1a2e';
      el.classList.add('die-skin-' + skinId);
    }

    el.innerHTML = `<span class="die-icon-bg">${skin.icon}</span>` + makeDieSVG(value, state, skinId, dotColor);
  } else if (state === 'scoring') {
    // Sin skin: fondo default + borde LED verde neón + dots scoring
    el.style.background = 'linear-gradient(145deg,#F8F4EE,#E8E0D0)';
    el.style.boxShadow = '2px 2px 0 #C4BAA2, 3px 3px 0 #A49470, 0 6px 16px rgba(0,0,0,.6), 0 2px 4px rgba(0,0,0,.3), inset 0 1px 2px rgba(255,255,255,.9), 0 0 0 2.5px rgba(0,255,100,.75), 0 0 14px 6px rgba(0,255,100,.45)';
    el.innerHTML = makeDieSVG(value, state, skinId);
  } else if (state === 'hot') {
    // Sin skin: fondo default + borde LED dorado intenso + dots hot
    el.style.background = 'linear-gradient(145deg,#F8F4EE,#E8E0D0)';
    el.style.boxShadow = '2px 2px 0 #C4BAA2, 3px 3px 0 #A49470, 0 6px 16px rgba(0,0,0,.6), 0 2px 4px rgba(0,0,0,.3), inset 0 1px 2px rgba(255,255,255,.9), 0 0 0 3px rgba(255,220,50,.85), 0 0 18px 8px rgba(255,220,50,.55)';
    el.innerHTML = makeDieSVG(value, state, skinId);
  } else if (state === 'dead') {
    el.style.background = 'linear-gradient(145deg,#F8F4EE,#E8E0D0)';
    el.style.boxShadow = '2px 2px 0 #C4BAA2, 3px 3px 0 #A49470, 0 6px 16px rgba(0,0,0,.6), 0 2px 4px rgba(0,0,0,.3), inset 0 1px 2px rgba(255,255,255,.9)';
    el.innerHTML = makeDieSVG(value, 'normal', skinId, '#1a1a2e');
  } else {
    el.innerHTML = makeDieSVG(value, state, skinId);
  }

  el.dataset.val = value;
  return el;
}

/** Crear dado pequeño para preview en la tienda (sin animación rolling) */
function makeShopDie(value, skinId) {
  const el = document.createElement('div');
  const skin = skinId && DICE_SKINS[skinId] ? DICE_SKINS[skinId] : null;

  el.className = 'die';
  el.style.width = '44px';
  el.style.height = '44px';
  el.style.animation = 'none';

  if (skin) {
    el.style.background = `linear-gradient(145deg,${skin.bg[0]},${skin.bg[1]})`;
    el.style.boxShadow = `1.5px 1.5px 0 ${skin.sh}, 2px 2px 0 ${skin.sh}, 0 3px 8px rgba(0,0,0,.5), inset 0 1px 2px rgba(255,255,255,.9)`;
    el.classList.add('die-skin-' + skinId);
    el.innerHTML = `<span class="die-icon-bg" style="font-size:24px">${skin.icon}</span>` + makeDieSVG(value, 'normal', skinId, skin.dot || '#1a1a2e');
    el.querySelector('svg').setAttribute('viewBox', '0 0 50 50');
    el.querySelectorAll('circle').forEach(c => c.setAttribute('r', '4'));
  } else {
    el.style.background = 'linear-gradient(145deg,#F8F4EE,#E8E0D0)';
    el.style.boxShadow = '1.5px 1.5px 0 #C4BAA2, 2px 2px 0 #A49470, 0 3px 8px rgba(0,0,0,.5), inset 0 1px 2px rgba(255,255,255,.9)';
    el.innerHTML = makeDieSVG(value, 'normal', null, '#1a1a2e');
  }

  el.dataset.val = value;
  return el;
}

function scoringIndices(dice) {
  const counts = {};
  dice.forEach(d => counts[d] = (counts[d]||0)+1);
  const result = [];
  dice.forEach((val, i) => {
    const c = counts[val];
    if (c >= 3) { result.push(i); return; }
    if (val === 1 || val === 5) result.push(i);
  });
  return result;
}

function showDice(dice, mode) {
  const row = document.getElementById('dice-row');
  if (!row) return;
  row.closest('.dice-tray')?.classList.remove('is-empty');
  const renderRequest = ++_diceRenderRequest;
  row.classList.remove('dice-row-3d');
  row.innerHTML = '';

  let activeSkinId = null;
  let activeSpecialId = null;
  // S es un binding global de app.js, pero los `const` globales no viven en
  // window. Consultarlo directamente permite usar la skin del jugador que tira.
  const gameState = typeof S !== 'undefined' ? S : null;
  if (gameState?.match?.players && gameState.match.currentPlayerIndex !== undefined) {
    const rollingPlayer = gameState.match.players[gameState.match.currentPlayerIndex];
    if (rollingPlayer && rollingPlayer.equippedDice) {
      activeSkinId = String(rollingPlayer.equippedDice);
    }
    if (rollingPlayer && rollingPlayer.equippedSpecial) {
      activeSpecialId = String(rollingPlayer.equippedSpecial);
    }
  }

  _lastDiceView = { dice:[...dice], mode, diceStates:[], skinId:activeSkinId, specialId:activeSpecialId };

  let greenIdx = [];
  if (mode === 'scored') {
    const sorted = [...dice].sort((a,b)=>a-b).join('');
    const isStr  = dice.length===5 && ['12345','23456','13456'].includes(sorted);
    if (isStr) {
      mode = 'all';
    } else {
      greenIdx = scoringIndices(dice);
    }
  }

  const diceStates = [];
  dice.forEach((val, i) => {
    let state = 'normal';
    if (mode === 'all')    state = 'hot';
    if (mode === 'dead')   state = 'dead';
    if (mode === 'scored' && greenIdx.includes(i)) state = 'scoring';
    diceStates.push(state);
    _lastDiceView.diceStates.push(state);
    const die = makeDie(val, state, activeSkinId);
    die.style.animationDelay = (i * 55) + 'ms';
    if (activeSpecialId === '29' && mode !== 'dead') {
      die.classList.add('magic-dice');
    }
    if (activeSpecialId === '48' && mode !== 'dead') {
      die.classList.add('electric-dice');
    }
    row.appendChild(die);
  });
  loadDice3D().then(renderer3D => {
    if (!renderer3D || renderRequest !== _diceRenderRequest || !row.isConnected) return;
    try {
      const ok = renderer3D.renderDice({ container: row, dice, states: diceStates, skinId: activeSkinId, specialId: activeSpecialId });
      if (!ok) restore2D();
      syncDiceQualityUI();
    } catch (err) {
      console.warn('Fallback a dados 2D:', err.message);
      restore2D();
    }
  });
  function restore2D() {
    if (renderRequest !== _diceRenderRequest || !row.isConnected) return;
    if (row.querySelector('.die')) return;
    row.innerHTML = '';
    row.classList.remove('dice-row-3d');
    dice.forEach((val, i) => {
      const die = makeDie(val, diceStates[i], activeSkinId);
      die.style.animationDelay = (i * 55) + 'ms';
      if (activeSpecialId === '29' && diceStates[i] !== 'dead') die.classList.add('magic-dice');
      if (activeSpecialId === '48' && diceStates[i] !== 'dead') die.classList.add('electric-dice');
      row.appendChild(die);
    });
  }
  if (activeSkinId && SKIN_PARTICLES[activeSkinId] && mode !== 'dead') {
    setTimeout(() => {
      if (!row.classList.contains('dice-row-3d') && renderRequest === _diceRenderRequest) spawnSkinParticles(activeSkinId, row);
    }, 400);
  }
}

function clearDice() {
  _diceRenderRequest++;
  _lastDiceView = null;
  document.querySelector('.entry-banner-toast')?.remove();
  window.MackoDice3D?.clear();
  const el = document.getElementById('dice-row');
  if (el) { el.classList.remove('dice-row-3d'); el.innerHTML = ''; el.closest('.dice-tray')?.classList.add('is-empty'); }
  setMsg('', '');
}

function syncDiceQualityUI() {
  const select = document.getElementById('dice-quality-select');
  const status = document.getElementById('dice-quality-status');
  const renderer3D = window.MackoDice3D;
  if (!select || !status) return;
  if (!renderer3D) {
    status.textContent = 'Renderer 2D activo';
    return;
  }
  select.disabled = false;
  select.value = renderer3D.getQuality();
  const resolved = renderer3D.getResolvedQuality();
  const labels = { high:'3D alta activa', low:'3D ahorro activo', off:'2D clásica activa' };
  status.textContent = renderer3D.isSupported() ? labels[resolved] : '2D clásica · WebGL no disponible';
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('macko-dice-3d-lost', () => {
  const select = document.getElementById('dice-quality-select');
  if (select && !select.disabled) { select.value = 'off'; select.disabled = true; }
  const status = document.getElementById('dice-quality-status');
  if (status) status.textContent = '2D clásica · WebGL perdido';
  const container = document.getElementById('dice-row');
  if (!container) return;
  container.classList.remove('dice-row-3d');
  const lv = _lastDiceView;
  if (lv && lv.dice && lv.dice.length) {
    container.innerHTML = '';
    lv.dice.forEach((val, i) => {
      const st = lv.diceStates ? lv.diceStates[i] : 'normal';
      const die = makeDie(val, st, lv.skinId);
      die.style.animationDelay = (i * 55) + 'ms';
      if (lv.specialId === '29' && st !== 'dead') die.classList.add('magic-dice');
      if (lv.specialId === '48' && st !== 'dead') die.classList.add('electric-dice');
      container.appendChild(die);
    });
  }
  });

  window.addEventListener('macko-dice-3d-ready', syncDiceQualityUI);
  window.addEventListener('macko-dice-quality', () => {
    syncDiceQualityUI();
    if (_lastDiceView) setTimeout(() => showDice(_lastDiceView.dice, _lastDiceView.mode), 0);
  });
  document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('dice-quality-select');
    if (select) {
      select.value = localStorage.getItem('macko_dice_quality') || 'auto';
      select.addEventListener('change', () => loadDice3D().then(renderer3D => renderer3D?.setQuality(select.value)));
    }
    const warmRenderer = () => loadDice3D().then(syncDiceQualityUI);
    if ('requestIdleCallback' in window) window.requestIdleCallback(warmRenderer, { timeout: 4000 });
    else setTimeout(warmRenderer, 1200);
  });
}

function setMsg(text, type) {
  const el = document.getElementById('roll-msg');
  if (!el) return;
  el.textContent = text;
  el.className = 'roll-msg' + (type ? ' ' + type : '');
}

/* ── Cartelito de entrada ────────────────────────────── */
function showEntryBanner(gained) {
  const host = document.getElementById('entry-banner-host');
  document.querySelector('.entry-banner-toast')?.remove();
  const banner = document.createElement('div');
  banner.className = 'entry-banner-toast';
  banner.innerHTML = `
    <div class="entry-banner-inner">
      <span class="entry-banner-icon">🎉</span>
      <span class="entry-banner-title">¡ENTRASTE!</span>
      <span class="entry-banner-sub">${gained > 0
        ? `<strong>${gained} pts</strong> — en tu próximo turno sumás`
        : '0 pts — en tu próximo turno sumás'
      }</span>
    </div>
  `;
  (host || document.body).appendChild(banner);
  requestAnimationFrame(() => banner.classList.add('show'));
  setTimeout(() => {
    banner.classList.remove('show');
    setTimeout(() => banner.remove(), 500);
  }, 3000);
}

// ── Partículas visuales únicas por skin de dados ────────
const SKIN_PARTICLES = {
  '1':  { colors:['#fff','#f0e0c0'],           shape:'circle', count:5,  size:[2,5],  dur:[1.2,2.0], rise:'up' },
  '2':  { colors:['#FF6B35','#FFD700','#FF4500'], shape:'spark',  count:8,  size:[2,4],  dur:[.8,1.6], rise:'up' },
  '4':  { colors:['#88D8FF','#B8E8FF'],        shape:'spark',  count:5,  size:[2,4],  dur:[1.5,2.5], rise:'up' },
  '5':  { colors:['#70E8FF','#fff','#b0f0ff'], shape:'circle', count:7,  size:[2,4],  dur:[1.8,3.0], rise:'float' },
  '6':  { colors:['#c0e8ff','#fff','#80d0ff'], shape:'circle', count:6,  size:[2,4],  dur:[1.5,2.5], rise:'float' },
  '18': { colors:['#FF2222','#FF6666','#FF0000'], shape:'spark',  count:10, size:[2,5],  dur:[.6,1.2], rise:'up' },
  '19': { colors:['#FFD700','#FFF0A0','#DAA520'], shape:'circle', count:6,  size:[2,4],  dur:[1.2,2.0], rise:'up' },
  '20': { colors:['#50C878','#90E8A0','#2EA85E'], shape:'circle', count:5,  size:[2,4],  dur:[1.2,2.0], rise:'up' },
  '21': { colors:['#6B8E23','#8FB830','#4A6E10'], shape:'circle', count:6,  size:[3,5],  dur:[1.0,1.8], rise:'up' },
  '22': { colors:['#FF6B9D','#FFD700','#88D8FF'], shape:'spark',  count:8,  size:[2,4],  dur:[1.0,2.0], rise:'float' },
  '32': { colors:['#B9F2FF','#fff','#7FE0F8'],  shape:'spark',  count:7,  size:[2,3],  dur:[1.5,2.8], rise:'float' },
  '33': { colors:['#9B59B6','#8E44AD','#fff'],   shape:'circle', count:8,  size:[2,5],  dur:[1.5,3.0], rise:'float' },
  '34': { colors:['#CC4444','#fff','#1A1A1A'],   shape:'spark',  count:6,  size:[2,4],  dur:[.8,1.5], rise:'up' }
};

function spawnSkinParticles(skinId, container) {
  const cfg = SKIN_PARTICLES[skinId];
  if (!cfg || !container) return;
  const rect = container.getBoundingClientRect();
  const tray = container.closest('.dice-tray');
  const area = tray || container;
  const areaRect = area.getBoundingClientRect();
  for (let i = 0; i < cfg.count; i++) {
    const p = document.createElement('div');
    p.className = 'skin-particle';
    const color = cfg.colors[Math.floor(Math.random() * cfg.colors.length)];
    const size = cfg.size[0] + Math.random() * (cfg.size[1] - cfg.size[0]);
    const dur = cfg.dur[0] + Math.random() * (cfg.dur[1] - cfg.dur[0]);
    const x = rect.left - areaRect.left + Math.random() * rect.width;
    const y = rect.top - areaRect.top + Math.random() * rect.height;
    const tx = (Math.random() - 0.5) * 80;
    const ty = -40 - Math.random() * 60;
    p.style.cssText = `
      left:${x}px; top:${y}px;
      width:${size}px; height:${size}px;
      background:${color};
      border-radius:${cfg.shape === 'circle' ? '50%' : '2px'};
      animation-duration:${dur}s;
      --tx:${tx}px; --ty:${ty}px;
      box-shadow:0 0 ${size * 2}px ${color};
    `;
    p.dataset.rise = cfg.rise;
    area.appendChild(p);
    setTimeout(() => p.remove(), dur * 1000 + 200);
  }
}

/**
 * Genera un contenedor de preview animado para un dado con skin
 * Útil para la tienda: muestra un dado girando/animado
 */
function createDicePreviewDiv(skinId, size = 'small') {
  const container = document.createElement('div');
  container.className = 'dice-preview-container';

  const val = (SHOP_DICE_PREVIEW[skinId] && SHOP_DICE_PREVIEW[skinId].val) || 5;
  const die = makeShopDie(val, skinId);

  if (size === 'large') {
    die.style.width = '60px';
    die.style.height = '60px';
    die.querySelectorAll('circle').forEach(c => c.setAttribute('r', '5.5'));
  }

  // Clon animado que rota los valores
  container.appendChild(die);

  // Agregar tooltip con el nombre del skin
  const skin = DICE_SKINS[skinId];
  const label = document.createElement('div');
  label.className = 'dice-preview-label';
  label.textContent = skin ? skin.name : '';
  container.appendChild(label);

  return container;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DICE_SKINS, SHOP_DICE_PREVIEW };
}
