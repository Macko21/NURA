"use strict";

/**
 * ============================================================
 * LOS 10.000 DE MACKO — backend/diceManager.js
 *
 * REGLAS IMPLEMENTADAS:
 * ─────────────────────
 * ENTRADA:
 *   - ≤5 jugadores: 3 intentos por turno para sacar ≥1000
 *   - >5 jugadores: 1 intento
 *   - Al entrar el turno TERMINA (aunque haya sobrado puntos)
 *   - Recién en el próximo turno puede sumar
 *   - 11111 sin puntos acumulados → victoria instantánea
 *
 * TIROS NORMALES (ya entrado):
 *   - Máximo 3 tiros por turno
 *   - Tiro 1 y 2: si puntúa → puede elegir plantarse o tirar
 *   - Tiro 3: si puntúa sin ser caliente → banco automático
 *   - Tiro muerto (0 pts) → pierde puntos del turno, pasa turno
 *   - Bust (supera 10000) → pierde puntos del turno, pasa turno
 *   - Victoria exacta en 10000
 *
 * DADOS CALIENTES:
 *   - Si los 5 dados suman en cualquier tiro (incluso el 3ro)
 *     → tiro extra con los 5 dados (no cuenta como tiro normal)
 *   - En ese tiro extra, si saca ALGO (≥1 dado puntúa) → banco
 *     automático y termina el turno
 *   - Si el tiro extra es muerto → pierde todo y pasa turno
 *   - Si el tiro extra también es caliente → otro tiro extra
 *
 * VICTORIA ESPECIAL con 11111:
 *   - Sin puntos acumulados (score=0) → victoria instantánea
 *   - Con 0 pts acumulados en turno pero score>0 → vale 10000, 
 *     chequear suma exacta
 *   - Con pts acumulados en turno → puede pasar de 10000 = bust
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
  startTurn, nextTurn, addHistoryEvent, setWinner
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

/* ── Snapshot para cliente ───────────────────────────────── */
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

/* ── Avanzar al siguiente turno ──────────────────────────── */
function _advanceTurn(match, roomId, broadcast) {
  clearTurnTimer(roomId);
  let attempts = 0, next;
  do {
    next = nextTurn(match);
    attempts++;
    if (attempts > match.players.length) return;
  } while (next && (next.eliminated || next.disconnected));
  if (!next) return;

  pushHistory(match, "TURN_START", { playerId: next.id });
  broadcast(roomId, "TURN_START", {
    playerId:   next.id,
    playerName: next.name,
    match:      snapshotMatch(match)
  });
  resetTurnTimer(roomId, id => _handleTimeout(id, broadcast));
}

/* ── Banco automático o voluntario + avanzar ─────────────── */
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

/* ── Timeout por inactividad ─────────────────────────────── */
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
  match.status = "playing";
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

  // Victoria instantánea: 11111 sin score acumulado
  if (isInstantWin(dice, cur.score)) {
    cur.score = MAX_SCORE;
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

  // Entró al juego con ≥1000
  if (canEnterGame(rollScore)) {
    const gained  = getEntryScore(rollScore); // rollScore - 1000
    cur.score     = gained;
    cur.entered   = true;
    cur.turnPoints = 0;

    pushHistory(match, "PLAYER_ENTERED", { playerId, dice, rollScore, gained });
    broadcast(roomId, "PLAYER_ENTERED", {
      playerId, playerName: cur.name, dice, rollScore, gained,
      totalScore: cur.score,
      entryAttemptsUsed: cur.entryAttemptsUsed,
      entryAttempts: maxAttempts,
      match: snapshotMatch(match)
    });

    // REGLA: al entrar el turno TERMINA siempre
    _advanceTurn(match, roomId, broadcast);
    return { ok: true, event: "PLAYER_ENTERED", dice, gained };
  }

  // Falló — quedan intentos
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
    return { ok: false, error: "Debés plantarte" };

  const diceCount = cur.remainingDice || TOTAL_DICE;
  const dice      = rollDice(diceCount);
  cur.lastRoll    = dice;
  cur.rollCount++;

  const { score: rollScore, scoringDice, allDiceScoring, straight } = calculateScore(dice);

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

  // ── Victoria exacta en 10000 ───────────────────────────
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

  // ── DADOS CALIENTES: todos los dados puntúan ───────────
  if (allDiceScoring) {
    cur.extraRolls++;
    cur.remainingDice = TOTAL_DICE;
    cur.lockedDice    = [];
    cur.isHotDiceTurn = true; // próximo tiro es tiro extra
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

  // ── Si venía de dados calientes (tiro extra) ───────────
  // En el tiro extra, cualquier punto → banco automático
  if (cur.isHotDiceTurn) {
    cur.isHotDiceTurn = false;
    cur.mustStop = true;
    cur.canContinue = false;

    // Emitir resultado y bancar automáticamente
    broadcast(roomId, "ROLL_RESULT", {
      playerId, playerName: cur.name, dice, rollScore,
      turnPoints: cur.turnPoints, remainingDice: diceCount - scoringDice,
      canContinue: false, mustStop: true, rollCount: cur.rollCount,
      autoBank: true,
      match: snapshotMatch(match)
    });
    // Delay para que el cliente vea los dados antes del banco automático
    setTimeout(() => _bank(match, roomId, broadcast, true), 1600);
    return { ok: true, event: "ROLL_RESULT_AUTOBANK", dice };
  }

  // ── Tirada normal con puntos ───────────────────────────
  cur.remainingDice = diceCount - scoringDice;

  // Contar tiros normales (sin contar extras por dados calientes)
  const normalRolls = cur.rollCount - cur.extraRolls;

  if (normalRolls >= 3) {
    // 3er tiro con puntos → banco automático
    cur.canContinue = false;
    cur.mustStop    = true;

    broadcast(roomId, "ROLL_RESULT", {
      playerId, playerName: cur.name, dice, rollScore,
      turnPoints: cur.turnPoints, remainingDice: cur.remainingDice,
      canContinue: false, mustStop: true, rollCount: cur.rollCount,
      autoBank: true,
      match: snapshotMatch(match)
    });
    // Delay para que el cliente vea los dados antes del banco automático
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

module.exports = {
  createMatch, startFirstTurnTimer, getMatch, destroyMatch,
  handleEntryRoll, handleRoll, handleBank,
  handleDisconnect, snapshotMatch, rollDice
};
