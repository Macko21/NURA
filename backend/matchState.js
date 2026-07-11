"use strict";

/**
 * ============================================================
 * LOS 10.000 DE MACKO
 * matchState.js
 * ------------------------------------------------------------
 * Estado completo de una partida.
 * ============================================================
 */

const {
  TOTAL_DICE,
  ENTRY_ATTEMPTS_SMALL_ROOM,
  ENTRY_ATTEMPTS_BIG_ROOM
} = require("./constants");

/**
 * ============================================================
 * Crear estado inicial de un jugador
 * ============================================================
 */
function createPlayerState(player) {

  return {
    id: player.id,

    name: player.name,

    alias: player.alias,

    /**
     * Estado general
     */
    entered: false,

    score: 0,

    eliminated: false,

    disconnected: false,

    /**
     * Entrada al juego
     */
    entryAttemptsUsed: 0,

    /**
     * Estadísticas de partida
     */
    straights: 0,

    fiveOnes: 0,

    turnsPlayed: 0,

    /**
     * Turno actual
     */
    turnPoints: 0,

    rollCount: 0,

    extraRolls: 0,

    remainingDice: TOTAL_DICE,

    lastRoll: [],

    lockedDice: [],

    canContinue: false,

    mustStop: false,

    /**
     * Sistema de vidas por timeout
     */
    lives: 5,

    isHotDiceTurn: false,

    turnExpired: false,

    /**
     * Items equipados (se cargan desde la BD o del room player como fallback)
     */
    equippedAvatar: player.equippedAvatar || null,
    equippedDice: player.equippedDice || null,
    equippedSpecial: player.equippedSpecial || null,

    /**
     * Racha de victorias (cargada desde BD)
     */
    winStreak: player.winStreak || 0
  };
}

/**
 * ============================================================
 * Crear estado completo de partida
 * ============================================================
 */
function createMatchState(room) {

  const entryAttempts =
    room.players.length > 5
      ? ENTRY_ATTEMPTS_BIG_ROOM
      : ENTRY_ATTEMPTS_SMALL_ROOM;

  return {

    /**
     * Información general
     */
    roomId: room.id,

    roomCode: room.code,

    createdAt: Date.now(),

    startedAt: null,

    finishedAt: null,

    status: "waiting",

    /**
     * Turnos
     */
    currentPlayerIndex: 0,

    turnStartedAt: null,

    /**
     * Configuración
     */
    entryAttempts,

    /**
     * Historial
     */
    history: [],

    /**
     * Chat asociado
     */
    chat: [],

    /**
     * Ganador
     */
    winner: null,

    /**
     * Jugadores
     */
    players: room.players.map(
      createPlayerState
    )
  };
}

/**
 * ============================================================
 * Obtener jugador actual
 * ============================================================
 */
function getCurrentPlayer(match) {

  if (
    !match ||
    !match.players.length
  ) {
    return null;
  }

  return match.players[
    match.currentPlayerIndex
  ];
}

/**
 * ============================================================
 * Obtener jugador por id
 * ============================================================
 */
function getPlayerById(
  match,
  playerId
) {

  return match.players.find(
    p => p.id === playerId
  ) || null;
}

/**
 * ============================================================
 * Reiniciar datos temporales de turno
 * ============================================================
 */
function resetTurnData(player) {

  player.turnPoints = 0;

  player.rollCount = 0;

  player.extraRolls = 0;

  player.remainingDice = TOTAL_DICE;

  player.lastRoll = [];

  player.lockedDice = [];

  player.canContinue = false;

  player.mustStop = false;

  player.isHotDiceTurn = false;

  // Resetear intentos de entrada para el nuevo turno
  // (solo si el jugador aún no entró)
  if (!player.entered) {
    player.entryAttemptsUsed = 0;
  }
}

/**
 * ============================================================
 * Iniciar turno
 * ============================================================
 */
function startTurn(match) {

  const player =
    getCurrentPlayer(match);

  if (!player) {
    return null;
  }

  resetTurnData(player);

  player.turnsPlayed++;

  match.turnStartedAt =
    Date.now();

  return player;
}

/**
 * ============================================================
 * Pasar turno
 * ============================================================
 */
function nextTurn(match) {

  if (
    !match ||
    !match.players.length
  ) {
    return null;
  }

  match.currentPlayerIndex =
    (
      match.currentPlayerIndex + 1
    ) %
    match.players.length;

  return startTurn(match);
}

/**
 * ============================================================
 * Registrar evento
 * ============================================================
 */
function addHistoryEvent(
  match,
  type,
  payload = {}
) {

  match.history.push({

    timestamp: Date.now(),

    type,

    payload
  });

  return true;
}

/**
 * ============================================================
 * Marcar ganador
 * ============================================================
 */
function setWinner(
  match,
  player
) {

  match.winner = {

    id: player.id,

    alias: player.alias,

    score: player.score
  };

  match.finishedAt =
    Date.now();

  match.status = "finished";
}

/**
 * ============================================================
 * Exportaciones
 * ============================================================
 */
module.exports = {

  createPlayerState,

  createMatchState,

  getCurrentPlayer,

  getPlayerById,

  resetTurnData,

  startTurn,

  nextTurn,

  addHistoryEvent,

  setWinner
};