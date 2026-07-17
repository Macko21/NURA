"use strict";

/**
 * ============================================================
 * LOS 10.000 DE MACKO
 * constants.js
 * ------------------------------------------------------------
 * Configuración central del juego.
 * Todas las reglas globales se definen aquí.
 * ============================================================
 */

/**
 * ============================================================
 * PUNTOS
 * ============================================================
 */

const MAX_SCORE = 10000;

const ENTRY_SCORE = 1000;

/**
 * ============================================================
 * JUGADORES
 * ============================================================
 */

const MIN_PLAYERS = 2;

const MAX_PLAYERS = 10;

/**
 * ============================================================
 * DADOS
 * ============================================================
 */

const TOTAL_DICE = 5;

const DICE_MIN = 1;

const DICE_MAX = 6;

/**
 * ============================================================
 * TURNOS
 * ============================================================
 */

const TURN_TIMEOUT_MS = 15000;

// Pausa para que el cliente muestre los puntos antes del banco automatico.
const AUTO_BANK_DELAY_MS = 1600;

const INACTIVITY_LIMIT = 3;

const MAX_RECONNECT_ATTEMPTS = 5;

/**
 * ============================================================
 * ENTRADA AL JUEGO
 * ============================================================
 */

/**
 * Hasta 5 jugadores:
 * 3 intentos para entrar.
 */
const ENTRY_ATTEMPTS_SMALL_ROOM = 3;

/**
 * Siempre 3 intentos sin importar la cantidad de jugadores.
 * (Se eliminó la regla de 1 intento para salas grandes)
 */
const ENTRY_ATTEMPTS_BIG_ROOM = 3;

/**
 * ============================================================
 * RANKING
 * ============================================================
 */

const WIN_RANKING_POINTS = 100;

const FAST_WIN_RANKING_POINTS = 50;

/**
 * ============================================================
 * MONEDAS
 * ============================================================
 */

const MAX_MATCH_BET = 25;

/**
 * ============================================================
 * ESCALERAS
 * ============================================================
 */

const STRAIGHTS = [
  "12345",
  "23456",
  "13456"
];

const STRAIGHT_SCORE = 500;

/**
 * ============================================================
 * COMBINACIONES
 * ============================================================
 */

const FIVE_ONES_SCORE = 10000;

const FOUR_ONES_SCORE = 1100;

/**
 * ============================================================
 * CHAT
 * ============================================================
 */

const CHAT_MAX_LENGTH = 500;

const CHAT_HISTORY_LIMIT = 200;

/**
 * ============================================================
 * HISTORIAL
 * ============================================================
 */

const MOVE_HISTORY_LIMIT = 500;

/**
 * ============================================================
 * SALAS
 * ============================================================
 */

const ROOM_CODE_LENGTH = 6;

/**
 * ============================================================
 * EXPORTS
 * ============================================================
 */

module.exports = {

  MAX_SCORE,

  ENTRY_SCORE,

  MIN_PLAYERS,
  MAX_PLAYERS,

  TOTAL_DICE,
  DICE_MIN,
  DICE_MAX,

  TURN_TIMEOUT_MS,

  AUTO_BANK_DELAY_MS,

  INACTIVITY_LIMIT,

  MAX_RECONNECT_ATTEMPTS,

  ENTRY_ATTEMPTS_SMALL_ROOM,
  ENTRY_ATTEMPTS_BIG_ROOM,

  WIN_RANKING_POINTS,
  FAST_WIN_RANKING_POINTS,

  MAX_MATCH_BET,

  STRAIGHTS,
  STRAIGHT_SCORE,

  FIVE_ONES_SCORE,
  FOUR_ONES_SCORE,

  CHAT_MAX_LENGTH,
  CHAT_HISTORY_LIMIT,

  MOVE_HISTORY_LIMIT,

  ROOM_CODE_LENGTH
};
