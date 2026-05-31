"use strict";

/**
 * ============================================================
 * LOS 10.000 DE MACKO — backend/diceManager.js
 *
 * REGLAS:
 * ──────────────────────────────────────────────────────────
 * ENTRADA:
 *   ≤5 jugadores: 3 intentos por turno para sacar ≥1000
 *   >5 jugadores: 1 intento
 *   Si saca ≥1000 → entra. Se restan 1000 y eso queda anotado.
 *   Ej: saca 1200 → queda con 200 pts.
 *   Al entrar, el turno TERMINA. Próximo turno empieza a sumar.
 *   11111 sin score acumulado → victoria instantánea.
 *
 * TIROS NORMALES (ya entrado):
 *   Máximo 3 tiros normales por turno.
 *   Tiro 1 y 2 con puntos → puede elegir plantar o tirar.
 *   Tiro 3 con puntos → banco automático.
 *   Tirada muerta (0 pts) → pierde puntos del turno, pasa turno.
 *   Bust (supera 10000) → pierde puntos, pasa turno.
 *   Llega exactamente a 10000 → gana.
 *
 * DADOS CALIENTES:
 *   Si los 5 dados puntúan (en cualquier tiro, incluso el 3ro)
 *   → tiro extra con los 5 dados (NO cuenta como tiro normal).
 *   En ese tiro extra:
 *     - Si puntúa algo → banco automático, termina turno.
 *     - Si es muerto → pierde todo, pasa turno.
 *     - Si es caliente de nuevo → otro tiro extra.
 * ============================================================
 */

const {
  TOTAL_DICE, DICE_MIN, DICE_MAX,
  MAX_SCORE, TURN_TIMEOUT_MS, MOVE_HISTORY_LIMIT
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

function resetTurnTimer(roomId, onTimeout) {
  clearTurnTimer(roomId);
  const id = setTimeout(() => onTimeout(roomId), TURN_TIMEOUT_MS);
  turnTimers.set(roomId, id);
}

/* ── Snapshot para el cliente ────────────────────────────── */
function snapshotMatch(match) {
  return {
    roomId:             match.roomId,
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
      isHotDiceTurn:     p.isHotDiceTurn
    }))
  };
}

/* ── Avanzar turno ───────────────────────────────────────────
 * FIX: No llamar nextTurn (que internamente llama startTurn).
 * Hacemos el avance de índice manualmente para poder saltear
 * jugadores sin resetear sus datos, y solo hacemos startTurn
 * en el jugador que realmente va a jugar.
 * ──────────────────────────────────────────────────────────── */
function _advanceTurn(match, roomId, broadcast) {
  clearTurnTimer(roomId);

  const total = match.players.length;
  if (total === 0) return;

  // Buscar el siguiente jugador activo (no eliminado, no desconectado)
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

  if (!found) return; // todos eliminados/desconectados

  // Resetear datos de turno del jugador que va a jugar ahora
  startTurn(match);

  const next = getCurrentPlayer(match);
  if (!next) return;

  pushHistory(match, "TURN_START", { playerId: next.id });
  broadcast(roomId, "TURN_START", {
    playerId:   next.id,
    playerName: next.name,
    match:      snapshotMatch(match)
  });

  resetTurnTimer(roomId, id => _handleTimeout(id, broadcast));
}

/* ── Banco + avanzar ─────────────────────────────────────── */
function _bank(match, roomId, broadcast, auto = false) {
  const cur = getCurrentPlayer(match);
  if (!cur) return;
  clearTurnTimer(roomId);

  const gained   = cur.turnPoints;
  cur.score     += gained;
  cur.turnPoints = 0;

  pushHistory(match, "BANKED", { playerId: cur.id, gained, totalScore: cur.score, auto });
  broadcast(roomId, "BANKED", {
    playerId:   cur.id,
    playerName: cur.name,
    gained,
    totalScore: cur.score,
    auto,
    match:      snapshotMatch(match)
  });

  _advanceTurn(match, roomId, broadcast);
}

/* ── Timeout ─────────────────────────────────────────────── */
function _handleTimeout(roomId, broadcast) {
  const match = matches.get(roomId);
  if (!match || match.status !== "playing") return;
  const cur = getCurrentPlayer(match);
  if (!cur) return;
  cur.turnPoints = 0;
  pushHistory(match, "TIMEOUT", { playerId: cur.id });
  broadcast(roomId, "TIMEOUT", { playerId: cur.id, playerName: cur.name });
  _advanceTurn(match, roomId, broadcast);
}

/* ════════════════════════════════════════════════════════════
   API PÚBLICA
   ════════════════════════════════════════════════════════════ */

function createMatch(room) {
  const match = createMatchState(room);
  match.status    = "playing";
  match.startedAt = Date.now();
  match.currentPlayerIndex = room.currentTurnIndex;
  startTurn(match);
  matches.set(room.id, match);
  pushHistory(match, "MATCH_STARTED", { firstPlayer: getCurrentPlayer(match)?.id });
  return match;
}

function startFirstTurnTimer(roomId, broadcast) {
  resetTurnTimer(roomId, id => _handleTimeout(id, broadcast));
}

function getMatch(roomId)     { return matches.get(roomId) || null; }
function destroyMatch(roomId) { clearTurnTimer(roomId); matches.delete(roomId); }

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

  // Victoria instantánea: 11111 con score acumulado = 0
  if (isInstantWin(dice, cur.score)) {
    cur.score   = MAX_SCORE;
    cur.entered = true;
    setWinner(match, cur);
    clearTurnTimer(roomId);
    pushHistory(match, "INSTANT_WIN", { playerId, dice });
    broadcast(roomId, "INSTANT_WIN", {
      playerId, playerName: cur.name, dice, match: snapshotMatch(match)
    });
    return { ok: true, event: "INSTANT_WIN", dice };
  }

  const { score: rollScore } = calculateScore(dice);

  // ── Entró con ≥1000 puntos ──────────────────────────────
  // Se restan 1000 (costo de entrada) y el resto se anota.
  // Ej: saca 1200 → entra con 200 pts anotados.
  // El turno TERMINA siempre al entrar (recién el próximo suma).
  if (canEnterGame(rollScore)) {
    const gained   = getEntryScore(rollScore); // rollScore - 1000
    cur.score      = gained;
    cur.entered    = true;
    cur.turnPoints = 0;

    pushHistory(match, "PLAYER_ENTERED", { playerId, dice, rollScore, gained });
    broadcast(roomId, "PLAYER_ENTERED", {
      playerId, playerName: cur.name, dice, rollScore, gained,
      totalScore: cur.score,
      entryAttemptsUsed: cur.entryAttemptsUsed,
      entryAttempts: maxAttempts,
      match: snapshotMatch(match)
    });

    _advanceTurn(match, roomId, broadcast);
    return { ok: true, event: "PLAYER_ENTERED", dice, gained };
  }

  // ── Falló el intento ────────────────────────────────────
  pushHistory(match, "ENTRY_FAILED", { playerId, dice, rollScore, attemptsLeft });

  if (attemptsLeft > 0) {
    // Puede reintentar en este turno
    resetTurnTimer(roomId, id => _handleTimeout(id, broadcast));
    broadcast(roomId, "ENTRY_FAILED", {
      playerId, playerName: cur.name, dice, rollScore, attemptsLeft,
      entryAttemptsUsed: cur.entryAttemptsUsed, entryAttempts: maxAttempts,
      match: snapshotMatch(match)
    });
    return { ok: true, event: "ENTRY_FAILED", dice, attemptsLeft };
  }

  // Sin más intentos → pasa turno
  broadcast(roomId, "ENTRY_FAILED", {
    playerId, playerName: cur.name, dice, rollScore, attemptsLeft: 0,
    entryAttemptsUsed: cur.entryAttemptsUsed, entryAttempts: maxAttempts,
    match: snapshotMatch(match)
  });
  _advanceTurn(match, roomId, broadcast);
  return { ok: true, event: "ENTRY_FAILED_TURN_OVER", dice };
}

/* ── TIRADA NORMAL (ya entrado) ──────────────────────────── */
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

  const diceCount = cur.remainingDice || TOTAL_DICE;
  const dice      = rollDice(diceCount);
  cur.lastRoll    = dice;
  cur.rollCount++;

  const { score: rollScore, scoringDice, allDiceScoring, straight } =
    calculateScore(dice);

  // ── Tirada muerta ──────────────────────────────────────
  if (rollScore === 0) {
    cur.turnPoints = 0;
    pushHistory(match, "DEAD_ROLL", { playerId, dice });
    broadcast(roomId, "DEAD_ROLL", {
      playerId, playerName: cur.name, dice, match: snapshotMatch(match)
    });
    _advanceTurn(match, roomId, broadcast);
    return { ok: true, event: "DEAD_ROLL", dice };
  }

  // ── Acumular puntos ────────────────────────────────────
  cur.turnPoints += rollScore;
  const projected = cur.score + cur.turnPoints;

  // ── Bust ───────────────────────────────────────────────
  if (projected > MAX_SCORE) {
    cur.turnPoints = 0;
    pushHistory(match, "BUST", { playerId, dice, rollScore, projected });
    broadcast(roomId, "BUST", {
      playerId, playerName: cur.name, dice, rollScore, projected,
      match: snapshotMatch(match)
    });
    _advanceTurn(match, roomId, broadcast);
    return { ok: true, event: "BUST", dice };
  }

  // ── Victoria exacta ────────────────────────────────────
  if (projected === MAX_SCORE) {
    cur.score = MAX_SCORE;
    setWinner(match, cur);
    clearTurnTimer(roomId);
    pushHistory(match, "WIN", { playerId, dice, rollScore });
    broadcast(roomId, "WIN", {
      playerId, playerName: cur.name, dice, rollScore,
      match: snapshotMatch(match)
    });
    return { ok: true, event: "WIN", dice };
  }

  // ── DADOS CALIENTES ────────────────────────────────────
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

  // ── Tiro extra de dados calientes ─────────────────────
  if (cur.isHotDiceTurn) {
    cur.isHotDiceTurn = false;
    cur.mustStop      = true;
    cur.canContinue   = false;

    broadcast(roomId, "ROLL_RESULT", {
      playerId, playerName: cur.name, dice, rollScore,
      turnPoints: cur.turnPoints, remainingDice: diceCount - scoringDice,
      canContinue: false, mustStop: true, rollCount: cur.rollCount,
      autoBank: true,
      match: snapshotMatch(match)
    });
    setTimeout(() => _bank(match, roomId, broadcast, true), 1600);
    return { ok: true, event: "ROLL_RESULT_AUTOBANK", dice };
  }

  // ── Tirada normal con puntos ───────────────────────────
  cur.remainingDice = diceCount - scoringDice;
  const normalRolls = cur.rollCount - cur.extraRolls;

  if (normalRolls >= 3) {
    // 3er tiro → banco automático
    cur.canContinue = false;
    cur.mustStop    = true;

    broadcast(roomId, "ROLL_RESULT", {
      playerId, playerName: cur.name, dice, rollScore,
      turnPoints: cur.turnPoints, remainingDice: cur.remainingDice,
      canContinue: false, mustStop: true, rollCount: cur.rollCount,
      autoBank: true,
      match: snapshotMatch(match)
    });
    setTimeout(() => _bank(match, roomId, broadcast, true), 1600);
    return { ok: true, event: "ROLL_RESULT_AUTOBANK", dice };

  } else {
    // Tiro 1 o 2 → puede elegir
    cur.canContinue = true;
    cur.mustStop    = false;

    broadcast(roomId, "ROLL_RESULT", {
      playerId, playerName: cur.name, dice, rollScore,
      turnPoints: cur.turnPoints, remainingDice: cur.remainingDice,
      canContinue: true, mustStop: false, rollCount: cur.rollCount,
      autoBank: false,
      match: snapshotMatch(match)
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

  const cur = getCurrentPlayer(match);
  if (!cur || cur.id !== playerId)
    return { ok: false, error: "No es tu turno" };
  if (!cur.entered)
    return { ok: false, error: "Aún no entraste al juego" };
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

module.exports = {
  createMatch, startFirstTurnTimer, getMatch, destroyMatch,
  handleEntryRoll, handleRoll, handleBank,
  handleDisconnect, handleReconnect, snapshotMatch, rollDice
};
