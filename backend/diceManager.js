"use strict";

/**
 * ============================================================
 * LOS 10.000 DE MACKO — backend/diceManager.js
 * ============================================================
 */

const {
  TOTAL_DICE, DICE_MIN, DICE_MAX,
  MAX_SCORE, TURN_TIMEOUT_MS, AUTO_BANK_DELAY_MS, MOVE_HISTORY_LIMIT
} = require("./constants");

const {
  calculateScore, canEnterGame, getEntryScore, isInstantWin
} = require("./gameEngine");

const {
  createMatchState, getCurrentPlayer, getPlayerById,
  startTurn, addHistoryEvent, setWinner
} = require("./matchState");

const matches    = new Map();
const turnTimers = new Map();
const autoBankTimers = new Map();
const finishHandlers = new Map();
const turnCallbacks = new Map(); // roomId → function(roomId): se llama después de cada cambio de turno

// Lock por sala: evita que _advanceTurn corra dos veces en paralelo
const advancing  = new Set();

/* ── Dados ───────────────────────────────────────────────── */
function rollDice(count = TOTAL_DICE) {
  const r = [];
  for (let i = 0; i < count; i++)
    r.push(Math.floor(Math.random() * (DICE_MAX - DICE_MIN + 1)) + DICE_MIN);
  return r;
}

/* ── Historial ───────────────────────────────────────────── */
function pushHistory(match, type, payload = {}) {
  addHistoryEvent(match, type, payload);
  if (match.history.length > MOVE_HISTORY_LIMIT) match.history.shift();
}

/* ── Timers ──────────────────────────────────────────────── */
function clearTurnTimer(roomId) {
  if (turnTimers.has(roomId)) {
    clearTimeout(turnTimers.get(roomId));
    turnTimers.delete(roomId);
  }
}

function clearAutoBankTimer(roomId) {
  if (autoBankTimers.has(roomId)) {
    clearTimeout(autoBankTimers.get(roomId));
    autoBankTimers.delete(roomId);
  }
}

function notifyFinished(match, roomId) {
  const handler = finishHandlers.get(roomId);
  if (!handler || match.finishNotified) return;
  match.finishNotified = true;
  Promise.resolve(handler(match, roomId)).catch(err => {
    console.error("Error finalizando partida:", err.message);
  });
}

function scheduleAutoBank(match, roomId, playerId, broadcast) {
  clearAutoBankTimer(roomId);
  const timer = setTimeout(() => {
    autoBankTimers.delete(roomId);
    const activeMatch = matches.get(roomId);
    if (activeMatch !== match || activeMatch.status !== "playing") return;
    if (advancing.has(roomId)) return;
    const current = getCurrentPlayer(activeMatch);
    if (!current || current.id !== playerId || !current.mustStop) return;
    _bank(activeMatch, roomId, broadcast, true);
  }, AUTO_BANK_DELAY_MS);
  autoBankTimers.set(roomId, timer);
}

function resetTurnTimer(roomId, onTimeout) {
  clearTurnTimer(roomId);
  const id = setTimeout(() => {
    const match = matches.get(roomId);
    if (!match || match.status !== "playing") return;
    onTimeout(roomId);
  }, TURN_TIMEOUT_MS);
  turnTimers.set(roomId, id);
}

/* ── Snapshot para el cliente ────────────────────────────── */
function snapshotMatch(match) {
  return {
    roomId:             match.roomId,
    roomCode:           match.roomCode,
    status:             match.status,
    currentPlayerIndex: match.currentPlayerIndex,
    entryAttempts:      match.entryAttempts,
    winner:             match.winner,
    players: match.players.map(p => ({
      id:                p.id,
      name:              p.name,
      alias:             p.alias,
      entered:           p.entered,
      score:             p.score,
      eliminated:        p.eliminated,
      disconnected:      p.disconnected,
      turnPoints:        p.turnPoints,
      rollCount:         p.rollCount,
      extraRolls:        p.extraRolls,
      remainingDice:     p.remainingDice,
      canContinue:       p.canContinue,
      mustStop:          p.mustStop,
      lastRoll:          p.lastRoll,
      entryAttemptsUsed: p.entryAttemptsUsed,
      isHotDiceTurn:     p.isHotDiceTurn,
      equippedAvatar:    p.equippedAvatar || null,
      equippedDice:      p.equippedDice || null,
      equippedSpecial:   p.equippedSpecial || null,
      equippedSpecials:  Array.isArray(p.equippedSpecials) ? p.equippedSpecials : [],
      winStreak:         p.winStreak || 0,
      level:             Number(p.level) || 1,
      lives:             p.lives != null ? p.lives : 5,
      isBot:             p.isBot || false
      ,
      isGuest:           !!p.isGuest,
      joinedLate:        !!p.joinedLate,
      turnsPlayed:       Number(p.turnsPlayed) || 0,
      combo:             Number(p.combo) || 0
    }))
  };
}

function addLatePlayer(roomId, roomPlayer) {
  const match = matches.get(roomId);
  if (!match || match.status !== "playing") {
    return { ok:false, error:"Partida no activa" };
  }
  if (match.players.some(player => player.id === roomPlayer.id)) {
    return { ok:false, error:"El jugador ya pertenece a la partida" };
  }
  const player = createPlayerState({ ...roomPlayer, joinedLate:true });
  const insertAt = Math.min(match.players.length, match.currentPlayerIndex + 1);
  match.players.splice(insertAt, 0, player);
  return { ok:true, player, match:snapshotMatch(match) };
}

/* ── Avanzar turno ───────────────────────────────────────── */
function _advanceTurn(match, roomId, broadcast) {
  // LOCK: si ya está avanzando esta sala, ignorar
  if (advancing.has(roomId)) return;
  advancing.add(roomId);

  try {
    clearTurnTimer(roomId);
    clearAutoBankTimer(roomId);

    const total = match.players.length;
    if (total === 0) return;

    let found = null;
    for (let i = 1; i <= total; i++) {
      const idx = (match.currentPlayerIndex + i) % total;
      const p   = match.players[idx];
      if (!p.eliminated && !p.disconnected) {
        match.currentPlayerIndex = idx;
        found = p;
        break;
      }
    }

    if (!found) {
      // Ningún jugador activo — terminar la partida automáticamente.
      // Buscar al último jugador no eliminado (incluso si está desconectado)
      // o al último jugador en la lista.
      let lastAlive = match.players.find(p => !p.eliminated);
      if (!lastAlive && match.players.length > 0) lastAlive = match.players[match.players.length - 1];
      if (lastAlive && match.status === 'playing') {
        setWinner(match, lastAlive);
        pushHistory(match, 'WIN', { playerId: lastAlive.id, reason: 'last_standing' });
        broadcast(roomId, 'WIN', {
          playerId: lastAlive.id, playerName: lastAlive.name, dice: [],
          match: snapshotMatch(match)
        });
        const handler = finishHandlers.get(roomId);
        if (handler && !match.finishNotified) {
          match.finishNotified = true;
          Promise.resolve(handler(match, roomId)).catch(err => {
            console.error('Error finalizando partida (last_standing):', err.message);
          });
        }
      }
      return;
    }

    startTurn(match);

    const next = getCurrentPlayer(match);
    if (!next) return;

    pushHistory(match, "TURN_START", { playerId: next.id });
    broadcast(roomId, "TURN_START", {
      playerId:   next.id,
      playerName: next.name,
      match:      snapshotMatch(match)
    });

    // Resetear el flag de turno expirado para el nuevo jugador
    match.players.forEach(p => { p.turnExpired = false; });

    resetTurnTimer(roomId, id => _handleTimeout(id, broadcast));

    // Notificar a quien corresponda que hubo un cambio de turno (ej: bots)
    const cb = turnCallbacks.get(roomId);
    if (typeof cb === 'function') {
      try { cb(roomId); } catch(e) { console.error('Error en turnCallback:', e.message); }
    }
  } finally {
    // SIEMPRE liberar el lock, incluso si broadcast lanza error
    advancing.delete(roomId);
  }
}

/* ── Banco + avanzar ─────────────────────────────────────── */
function _bank(match, roomId, broadcast, auto = false) {
  if (advancing.has(roomId)) return;

  const cur = getCurrentPlayer(match);
  if (!cur) return;

  clearTurnTimer(roomId);

  const gained   = cur.turnPoints;
  cur.score     += gained;
  cur.turnPoints = 0;

  // Verificar si llegó a 10.000 exactos (victoria por banco)
  if (cur.score === MAX_SCORE) {
    setWinner(match, cur);
    pushHistory(match, "WIN", { playerId: cur.id, gained });
    broadcast(roomId, "WIN", {
      playerId: cur.id, playerName: cur.name, dice: [],
      rollScore: gained, match: snapshotMatch(match)
    });
    notifyFinished(match, roomId);
    return; // No avanzar turno, la partida terminó
  }

  // Incrementar combo: turno consecutivo anotando puntos
  cur.combo = (cur.combo || 0) + 1;

  pushHistory(match, "BANKED", { playerId: cur.id, gained, totalScore: cur.score, auto, combo: cur.combo });
  broadcast(roomId, "BANKED", {
    playerId:   cur.id,
    playerName: cur.name,
    gained,
    totalScore: cur.score,
    auto,
    combo:      cur.combo,
    match:      snapshotMatch(match)
  });

  _advanceTurn(match, roomId, broadcast);
}

/* ── Timeout ─────────────────────────────────────────────── */
function _handleTimeout(roomId, broadcast) {
  if (advancing.has(roomId)) return;

  const match = matches.get(roomId);
  if (!match || match.status !== "playing") return;
  const cur = getCurrentPlayer(match);
  if (!cur) return;

  // Marcar turno como expirado ANTES de broadcast para evitar race con ROLL/BANK
  cur.turnExpired = true;
  cur.turnPoints = 0;

  // Auto-roll: tirar dados automáticamente al expirar
  if (cur.entered && !cur.mustStop) {
    const diceCount = cur.remainingDice || TOTAL_DICE;
    const dice = rollDice(diceCount);
    cur.lastRoll = dice;
    cur.rollCount++;

    const { score: rollScore } = calculateScore(dice);

    if (rollScore === 0) {
      // Tirada muerta en auto-roll
      cur.combo = 0;
      pushHistory(match, "TIMEOUT_AUTO_ROLL", { playerId: cur.id, dice, result: "dead", combo: 0 });
      broadcast(roomId, "TIMEOUT_AUTO_ROLL", {
        playerId: cur.id, playerName: cur.name, dice,
        result: "dead", lives: cur.lives, combo: 0,
        match: snapshotMatch(match)
      });
    } else {
      cur.turnPoints += rollScore;
      const projected = cur.score + cur.turnPoints;

      if (projected > MAX_SCORE) {
        // Bust en auto-roll
        cur.turnPoints = 0;
        cur.combo = 0;
        pushHistory(match, "TIMEOUT_AUTO_ROLL", { playerId: cur.id, dice, result: "bust", combo: 0 });
        broadcast(roomId, "TIMEOUT_AUTO_ROLL", {
          playerId: cur.id, playerName: cur.name, dice,
          result: "bust", lives: cur.lives, combo: 0,
          match: snapshotMatch(match)
        });
      } else if (projected === MAX_SCORE) {
        // Victoria exacta en auto-roll
        cur.score = MAX_SCORE;
        setWinner(match, cur);
        pushHistory(match, "TIMEOUT_AUTO_ROLL", { playerId: cur.id, dice, result: "win" });
        broadcast(roomId, "TIMEOUT_AUTO_ROLL", {
          playerId: cur.id, playerName: cur.name, dice,
          result: "win", lives: cur.lives,
          match: snapshotMatch(match)
        });
        notifyFinished(match, roomId);
        return;
      } else {
        // Puntos normales en auto-roll — bancar automáticamente
        cur.score += cur.turnPoints;
        cur.turnPoints = 0;
        pushHistory(match, "TIMEOUT_AUTO_ROLL", { playerId: cur.id, dice, result: "scored", gained: rollScore });
        broadcast(roomId, "TIMEOUT_AUTO_ROLL", {
          playerId: cur.id, playerName: cur.name, dice,
          result: "scored", gained: rollScore, totalScore: cur.score, lives: cur.lives,
          match: snapshotMatch(match)
        });
      }
    }
  } else {
    pushHistory(match, "TIMEOUT", { playerId: cur.id });
    broadcast(roomId, "TIMEOUT", { playerId: cur.id, playerName: cur.name, lives: cur.lives });
  }

  // Decrementar vida
  if (cur.lives != null) {
    cur.lives--;
    if (cur.lives <= 0) {
      // Eliminar jugador por quedarse sin vidas
      cur.eliminated = true;
      pushHistory(match, "ELIMINATED_TIMEOUT", { playerId: cur.id });
      broadcast(roomId, "ELIMINATED_TIMEOUT", {
        playerId: cur.id, playerName: cur.name,
        match: snapshotMatch(match)
      });

      // Verificar si queda solo 1 jugador → victoria automática
      const alive = match.players.filter(p => !p.eliminated && !p.disconnected);
      if (alive.length === 1) {
        setWinner(match, alive[0]);
        pushHistory(match, "WIN", { playerId: alive[0].id, reason: "last_alive" });
        broadcast(roomId, "WIN", {
          playerId: alive[0].id, playerName: alive[0].name, dice: [],
          match: snapshotMatch(match)
        });
        notifyFinished(match, roomId);
        return;
      }
    }
  }

  _advanceTurn(match, roomId, broadcast);
}

/* ════════════════════════════════════════════════════════════
   API PÚBLICA
   ════════════════════════════════════════════════════════════ */

function createMatch(room, onFinished) {
  const match = createMatchState(room);
  match.status    = "playing";
  match.startedAt = Date.now();
  match.currentPlayerIndex = room.currentTurnIndex;
  startTurn(match);
  matches.set(room.id, match);
  if (typeof onFinished === "function") finishHandlers.set(room.id, onFinished);
  pushHistory(match, "MATCH_STARTED", { firstPlayer: getCurrentPlayer(match)?.id });
  return match;
}

function startFirstTurnTimer(roomId, broadcast) {
  clearTurnTimer(roomId);
  const id = setTimeout(() => {
    const match = matches.get(roomId);
    if (!match || match.status !== "playing") return;
    _handleTimeout(roomId, broadcast);
  }, TURN_TIMEOUT_MS);
  turnTimers.set(roomId, id);
}

function getMatch(roomId)     { return matches.get(roomId) || null; }

function destroyMatch(roomId) {
  clearTurnTimer(roomId);
  clearAutoBankTimer(roomId);
  advancing.delete(roomId);
  finishHandlers.delete(roomId);
  matches.delete(roomId);
}

/* ── ENTRADA AL JUEGO ────────────────────────────────────── */
function handleEntryRoll(roomId, playerId, broadcast) {
  const match = matches.get(roomId);
  if (!match || match.status !== "playing")
    return { ok: false, error: "Partida no activa" };

  const cur = getCurrentPlayer(match);
  if (!cur || cur.id !== playerId)
    return { ok: false, error: "No es tu turno" };
  if (cur.entered)
    return { ok: false, error: "Ya entraste al juego" };

  const maxAttempts = match.entryAttempts;
  if (cur.entryAttemptsUsed >= maxAttempts)
    return { ok: false, error: "Sin intentos de entrada disponibles" };

  const dice = rollDice(TOTAL_DICE);
  cur.lastRoll = dice;
  cur.entryAttemptsUsed++;
  const attemptsLeft = maxAttempts - cur.entryAttemptsUsed;

  console.log('🎲 ENTRY_ROLL - player:', playerId.slice(0,8), 'dice:', JSON.stringify(dice), 'TOTAL_DICE:', TOTAL_DICE, 'entryAttemptsUsed:', cur.entryAttemptsUsed, 'entered:', cur.entered);

  if (isInstantWin(dice, cur.score)) {
    cur.fiveOnes++;
    cur.score   = MAX_SCORE;
    cur.entered = true;
    setWinner(match, cur);
    clearTurnTimer(roomId);
    pushHistory(match, "INSTANT_WIN", { playerId, dice });
    broadcast(roomId, "INSTANT_WIN", {
      playerId, playerName: cur.name, dice, match: snapshotMatch(match)
    });
    notifyFinished(match, roomId);
    return { ok: true, event: "INSTANT_WIN", dice };
  }

  const { score: rollScore, scoringDice, allDiceScoring } = calculateScore(dice);
  console.log('📊 ENTRY_SCORE - player:', playerId.slice(0,8), 'dice:', JSON.stringify(dice), 'rollScore:', rollScore, 'scoringDice:', scoringDice, 'allDiceScoring:', allDiceScoring, 'canEnter:', rollScore >= 1000, 'attemptsLeft:', attemptsLeft);

  if (canEnterGame(rollScore)) {
    const gained   = getEntryScore(rollScore);
    console.log('✅ ENTRY_SUCCESS - player:', playerId.slice(0,8), 'gained:', gained, 'remainingDice:', TOTAL_DICE - scoringDice, 'allDiceScoring:', allDiceScoring);
    cur.score      = gained;       // los pts de entrada se bankean automáticamente
    cur.entered    = true;
    cur.turnPoints = 0;
    cur.remainingDice = TOTAL_DICE - scoringDice;
    cur.canContinue = cur.remainingDice > 0;
    cur.mustStop    = false;

    // Si todos los dados puntuaron → dados calientes (se puede tirar todo de nuevo)
    if (allDiceScoring) {
      cur.remainingDice = TOTAL_DICE;
      cur.canContinue = true;
      cur.isHotDiceTurn = true;
    }

    pushHistory(match, "PLAYER_ENTERED", { playerId, dice, rollScore, gained });
    broadcast(roomId, "PLAYER_ENTERED", {
      playerId, playerName: cur.name, dice, rollScore, gained,
      totalScore: cur.score,
      turnPoints: 0,
      remainingDice: cur.remainingDice,
      canContinue: cur.canContinue,
      entryAttemptsUsed: cur.entryAttemptsUsed,
      entryAttempts: maxAttempts,
      match: snapshotMatch(match)
    });

    // Entró al juego → el turno termina y pasa al siguiente jugador
    _advanceTurn(match, roomId, broadcast);
    return { ok: true, event: "PLAYER_ENTERED", dice, gained };
  }

  console.log('❌ ENTRY_FAILED - player:', playerId.slice(0,8), 'rollScore:', rollScore, 'attemptsLeft:', attemptsLeft);
  pushHistory(match, "ENTRY_FAILED", { playerId, dice, rollScore, attemptsLeft });

  if (attemptsLeft > 0) {
    resetTurnTimer(roomId, id => _handleTimeout(id, broadcast));
    broadcast(roomId, "ENTRY_FAILED", {
      playerId, playerName: cur.name, dice, rollScore, attemptsLeft,
      entryAttemptsUsed: cur.entryAttemptsUsed, entryAttempts: maxAttempts,
      match: snapshotMatch(match)
    });
    return { ok: true, event: "ENTRY_FAILED", dice, attemptsLeft };
  }

  broadcast(roomId, "ENTRY_FAILED", {
    playerId, playerName: cur.name, dice, rollScore, attemptsLeft: 0,
    entryAttemptsUsed: cur.entryAttemptsUsed, entryAttempts: maxAttempts,
    match: snapshotMatch(match)
  });
  _advanceTurn(match, roomId, broadcast);
  return { ok: true, event: "ENTRY_FAILED_TURN_OVER", dice };
}

/* ── TIRADA NORMAL ───────────────────────────────────────── */
function handleRoll(roomId, playerId, broadcast) {
  const match = matches.get(roomId);
  if (!match || match.status !== "playing")
    return { ok: false, error: "Partida no activa" };

  const cur = getCurrentPlayer(match);
  if (!cur || cur.id !== playerId)
    return { ok: false, error: "No es tu turno" };
  if (!cur.entered)
    return { ok: false, error: "Primero debés entrar al juego" };
  if (cur.mustStop)
    return { ok: false, error: "Esperá el banco automático" };
  if (cur.turnExpired)
    return { ok: false, error: "Tu turno expiró" };
  if (advancing.has(roomId))
    return { ok: false, error: "Esperá el turno siguiente" };

  const diceCount = cur.remainingDice || TOTAL_DICE;
  const dice      = rollDice(diceCount);
  cur.lastRoll    = dice;
  cur.rollCount++;

  const rolledFiveOnes = dice.length === TOTAL_DICE && dice.every(d => d === 1);
  if (rolledFiveOnes) {
    cur.fiveOnes++;
    // Cinco 1s solo gana de inmediato si el puntaje bancado sigue en cero.
    // Con cualquier puntaje previo, los 10.000 de la tirada provocaran bust.
    if (isInstantWin(dice, cur.score)) {
      cur.score = MAX_SCORE;
      cur.turnPoints = 0;
      setWinner(match, cur);
      clearTurnTimer(roomId);
      pushHistory(match, "INSTANT_WIN", { playerId, dice });
      broadcast(roomId, "INSTANT_WIN", {
        playerId, playerName: cur.name, dice, match: snapshotMatch(match)
      });
      notifyFinished(match, roomId);
      return { ok: true, event: "INSTANT_WIN", dice };
    }
  }

  const { score: rollScore, scoringDice, allDiceScoring, straight } =
    calculateScore(dice);

  // Tirada muerta
  if (rollScore === 0) {
    cur.turnPoints = 0;
    cur.combo = 0; // Reset combo al fallar
    clearTurnTimer(roomId);
    pushHistory(match, "DEAD_ROLL", { playerId, dice, combo: 0 });
    broadcast(roomId, "DEAD_ROLL", {
      playerId, playerName: cur.name, dice, combo: 0, match: snapshotMatch(match)
    });
    _advanceTurn(match, roomId, broadcast);
    return { ok: true, event: "DEAD_ROLL", dice };
  }

  cur.turnPoints += rollScore;
  const projected = cur.score + cur.turnPoints;

  // Bust
  if (projected > MAX_SCORE) {
    cur.turnPoints = 0;
    cur.combo = 0; // Reset combo al pasarse
    clearTurnTimer(roomId);
    pushHistory(match, "BUST", { playerId, dice, rollScore, projected, combo: 0 });
    broadcast(roomId, "BUST", {
      playerId, playerName: cur.name, dice, rollScore, projected, combo: 0,
      match: snapshotMatch(match)
    });
    _advanceTurn(match, roomId, broadcast);
    return { ok: true, event: "BUST", dice };
  }

  // Victoria exacta
  if (projected === MAX_SCORE) {
    cur.score = MAX_SCORE;
    setWinner(match, cur);
    clearTurnTimer(roomId);
    pushHistory(match, "WIN", { playerId, dice, rollScore });
    broadcast(roomId, "WIN", {
      playerId, playerName: cur.name, dice, rollScore,
      match: snapshotMatch(match)
    });
    notifyFinished(match, roomId);
    return { ok: true, event: "WIN", dice };
  }

  // Dados calientes: si todos los dados vuelven a puntuar, el beneficio se
  // encadena y habilita otro tiro completo, sin limite mientras siga ocurriendo.
  if (allDiceScoring) {
    cur.extraRolls++;
    cur.remainingDice = TOTAL_DICE;
    cur.lockedDice    = [];
    cur.isHotDiceTurn = true;
    cur.canContinue   = true;
    cur.mustStop      = false;
    if (straight) cur.straights = (cur.straights || 0) + 1;

    pushHistory(match, "HOT_DICE", { playerId, dice, rollScore, turnPoints: cur.turnPoints });
    broadcast(roomId, "HOT_DICE", {
      playerId, playerName: cur.name, dice, rollScore,
      turnPoints: cur.turnPoints, match: snapshotMatch(match)
    });
    resetTurnTimer(roomId, id => _handleTimeout(id, broadcast));
    return { ok: true, event: "HOT_DICE", dice };
  }

  // En un tiro extra caliente, una puntuacion parcial se muestra y luego se
  // banca automaticamente. Una tirada muerta ya fue resuelta arriba y pierde
  // todos los puntos acumulados del turno.
  if (cur.isHotDiceTurn) {
    cur.isHotDiceTurn = false;
    cur.mustStop      = true;
    cur.canContinue   = false;
    clearTurnTimer(roomId);

    broadcast(roomId, "ROLL_RESULT", {
      playerId, playerName: cur.name, dice, rollScore,
      turnPoints: cur.turnPoints, remainingDice: diceCount - scoringDice,
      canContinue: false, mustStop: true, rollCount: cur.rollCount,
      autoBank: true, match: snapshotMatch(match)
    });

    scheduleAutoBank(match, roomId, playerId, broadcast);
    return { ok: true, event: "ROLL_RESULT_AUTOBANK", dice };
  }

  // Tirada normal
  cur.remainingDice = diceCount - scoringDice;
  const normalRolls = cur.rollCount - cur.extraRolls;

  if (normalRolls >= 3) {
    cur.canContinue = false;
    cur.mustStop    = true;

    clearTurnTimer(roomId);

    broadcast(roomId, "ROLL_RESULT", {
      playerId, playerName: cur.name, dice, rollScore,
      turnPoints: cur.turnPoints, remainingDice: cur.remainingDice,
      canContinue: false, mustStop: true, rollCount: cur.rollCount,
      autoBank: true, match: snapshotMatch(match)
    });

    scheduleAutoBank(match, roomId, playerId, broadcast);

    return { ok: true, event: "ROLL_RESULT_AUTOBANK", dice };

  } else {
    cur.canContinue = true;
    cur.mustStop    = false;

    broadcast(roomId, "ROLL_RESULT", {
      playerId, playerName: cur.name, dice, rollScore,
      turnPoints: cur.turnPoints, remainingDice: cur.remainingDice,
      canContinue: true, mustStop: false, rollCount: cur.rollCount,
      autoBank: false, match: snapshotMatch(match)
    });
    resetTurnTimer(roomId, id => _handleTimeout(id, broadcast));
    return { ok: true, event: "ROLL_RESULT", dice };
  }
}

/* ── BANCO VOLUNTARIO ────────────────────────────────────── */
function handleBank(roomId, playerId, broadcast) {
  const match = matches.get(roomId);
  if (!match || match.status !== "playing")
    return { ok: false, error: "Partida no activa" };

  if (advancing.has(roomId))
    return { ok: true, event: "BANK_IGNORED" };

  const cur = getCurrentPlayer(match);
  if (!cur || cur.id !== playerId)
    return { ok: false, error: "No es tu turno" };
  if (!cur.entered)
    return { ok: false, error: "Aún no entraste al juego" };
  if (cur.mustStop)
    return { ok: true, event: "BANK_IGNORED_MUSTSSTOP" };
  if (cur.turnExpired)
    return { ok: true, event: "BANK_IGNORED_EXPIRED" };
  if (cur.turnPoints === 0)
    return { ok: false, error: "Sin puntos para anotar" };

  _bank(match, roomId, broadcast, false);
  return { ok: true, event: "BANKED" };
}

/* ── DESCONEXIÓN ─────────────────────────────────────────── */
function handleDisconnect(roomId, playerId, broadcast) {
  const match = matches.get(roomId);
  if (!match) return;
  const player = getPlayerById(match, playerId);
  if (!player) return;
  player.disconnected = true;
  const cur = getCurrentPlayer(match);
  if (cur?.id === playerId) {
    cur.turnPoints = 0;
    cur.turnExpired = true;
    _advanceTurn(match, roomId, broadcast);
  }
}

/* ── RECONEXIÓN ──────────────────────────────────────────── */
function handleReconnect(roomId, playerId) {
  const match = matches.get(roomId);
  if (!match) return;
  const player = getPlayerById(match, playerId);
  if (!player) return;
  player.disconnected = false;
}

function setTurnCallback(roomId, cb) {
  if (typeof cb === 'function') turnCallbacks.set(roomId, cb);
  else turnCallbacks.delete(roomId);
}

function removeTurnCallback(roomId) {
  turnCallbacks.delete(roomId);
}

module.exports = {
  createMatch, startFirstTurnTimer, getMatch, destroyMatch,
  handleEntryRoll, handleRoll, handleBank,
  handleDisconnect, handleReconnect, snapshotMatch, addLatePlayer, rollDice,
  setTurnCallback, removeTurnCallback
};
