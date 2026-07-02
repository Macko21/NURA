"use strict";

/**
 * ============================================================
 * LOS 10.000 DE MACKO — backend/diceManager.js
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
      winStreak:         p.winStreak || 0
    }))
  };
}

/* ── Avanzar turno ───────────────────────────────────────── */
function _advanceTurn(match, roomId, broadcast) {
  // LOCK: si ya está avanzando esta sala, ignorar
  if (advancing.has(roomId)) return;
  advancing.add(roomId);

  try {
    clearTurnTimer(roomId);

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

    if (!found) return;

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
  if (advancing.has(roomId)) return;

  const match = matches.get(roomId);
  if (!match || match.status !== "playing") return;
  const cur = getCurrentPlayer(match);
  if (!cur) return;

  // Marcar turno como expirado ANTES de broadcast para evitar race con ROLL/BANK
  cur.turnExpired = true;
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
  advancing.delete(roomId);
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

  if (canEnterGame(rollScore)) {
    const gained   = getEntryScore(rollScore);
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

  const { score: rollScore, scoringDice, allDiceScoring, straight } =
    calculateScore(dice);

  // Tirada muerta
  if (rollScore === 0) {
    cur.turnPoints = 0;
    clearTurnTimer(roomId);
    pushHistory(match, "DEAD_ROLL", { playerId, dice });
    broadcast(roomId, "DEAD_ROLL", {
      playerId, playerName: cur.name, dice, match: snapshotMatch(match)
    });
    _advanceTurn(match, roomId, broadcast);
    return { ok: true, event: "DEAD_ROLL", dice };
  }

  cur.turnPoints += rollScore;
  const projected = cur.score + cur.turnPoints;

  // Bust
  if (projected > MAX_SCORE) {
    cur.turnPoints = 0;
    clearTurnTimer(roomId);
    pushHistory(match, "BUST", { playerId, dice, rollScore, projected });
    broadcast(roomId, "BUST", {
      playerId, playerName: cur.name, dice, rollScore, projected,
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
    return { ok: true, event: "WIN", dice };
  }

  // Dados calientes
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

  // Tiro extra caliente → banco automático
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

    setTimeout(() => {
      const m = matches.get(roomId);
      if (!m || m.status !== "playing") return;
      if (advancing.has(roomId)) return;
      _bank(match, roomId, broadcast, false);
    }, 1500);

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

    setTimeout(() => {
      const m = matches.get(roomId);
      if (!m || m.status !== "playing") return;
      if (advancing.has(roomId)) return;
      _bank(match, roomId, broadcast, false);
    }, 1500);

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

module.exports = {
  createMatch, startFirstTurnTimer, getMatch, destroyMatch,
  handleEntryRoll, handleRoll, handleBank,
  handleDisconnect, handleReconnect, snapshotMatch, rollDice
};
