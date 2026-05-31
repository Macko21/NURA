"use strict";

/**
 * ============================================================
 * LOS 10.000 DE MACKO — gameEngine.js
 * Motor de reglas y puntuación. Sin WebSocket, sin BD.
 * ============================================================
 *
 * TABLA DE PUNTAJES
 * -----------------
 * 1 suelto            = 100
 * 5 suelto            = 50
 * Escalera 12345      = 500  (dados calientes)
 * Escalera 23456      = 500  (dados calientes)
 * Escalera 13456      = 500  (el 1 actúa como 2)
 * Trío de 1s          = 1000
 * Trío de 2s          = 200
 * Trío de 3s          = 300
 * Trío de 4s          = 400
 * Trío de 5s          = 500
 * Trío de 6s          = 600
 * Cuarteto de X       = trío × 2
 * Quinteto de 1s      = 10000 (victoria instantánea)
 * Quinteto de X       = trío × ~1.83  (face * 1100 para no-1s)
 * ============================================================
 */

const VALID_STRAIGHTS = ["12345", "23456", "13456"];
const STRAIGHT_SCORE  = 500;

function normalizeDice(dice) {
  return [...dice].sort((a, b) => a - b).join("");
}

function isStraight(dice) {
  if (!Array.isArray(dice) || dice.length !== 5) return false;
  return VALID_STRAIGHTS.includes(normalizeDice(dice));
}

function countDice(dice) {
  const counts = {};
  for (const d of dice) counts[d] = (counts[d] || 0) + 1;
  return counts;
}

/**
 * Calcula el puntaje de una tirada.
 * Devuelve: { score, scoringDice, allDiceScoring, straight }
 */
function calculateScore(dice) {
  if (!Array.isArray(dice) || dice.length === 0) {
    return { score: 0, scoringDice: 0, allDiceScoring: false, straight: false };
  }

  // Escalera (usa todos los dados)
  if (dice.length === 5 && isStraight(dice)) {
    return { score: STRAIGHT_SCORE, scoringDice: 5, allDiceScoring: true, straight: true };
  }

  const counts = countDice(dice);
  let score = 0;
  let scoringDice = 0;

  for (const faceStr of Object.keys(counts)) {
    const face  = Number(faceStr);
    const count = counts[face];

    if (count === 5) {
      // Quinteto
      if (face === 1) {
        score += 10000;  // Victoria instantánea
      } else {
        score += face * 1100;
      }
      scoringDice += 5;

    } else if (count === 4) {
      // Cuarteto = face × 1000
      if (face === 1) {
        score += 2000;
      } else {
        score += face * 1000;
      }
      scoringDice += 4;

    } else if (count === 3) {
      // Trío
      if (face === 1) {
        score += 1000;
      } else {
        score += face * 100;
      }
      scoringDice += 3;

    } else {
      // Dados sueltos: solo cuentan 1 y 5
      if (face === 1) {
        score      += count * 100;
        scoringDice += count;
      } else if (face === 5) {
        score      += count * 50;
        scoringDice += count;
      }
      // 2, 3, 4, 6 sueltos no puntúan
    }
  }

  return {
    score,
    scoringDice,
    allDiceScoring: scoringDice === dice.length,
    straight: false
  };
}

/** Necesita >= 1000 para entrar */
function canEnterGame(turnScore) {
  return turnScore >= 1000;
}

/** Puntos al entrar: descuenta los 1000 del costo */
function getEntryScore(turnScore) {
  if (turnScore < 1000) return 0;
  return turnScore - 1000;
}

/** Victoria exacta */
function isWinningScore(score) {
  return score === 10000;
}

/** Se pasó */
function isBustByExceeding(currentScore, turnPoints) {
  return (currentScore + turnPoints) > 10000;
}

/**
 * Victoria instantánea: cinco 1s con score acumulado = 0.
 * Solo válido si el jugador no tiene puntos acumulados aún.
 */
function isInstantWin(dice, currentScore) {
  if (currentScore !== 0) return false;
  return dice.length === 5 && dice.every(d => d === 1);
}

/** Tirada sin ningún punto */
function isDeadRoll(dice) {
  return calculateScore(dice).score === 0;
}

module.exports = {
  calculateScore,
  canEnterGame,
  getEntryScore,
  isWinningScore,
  isBustByExceeding,
  isInstantWin,
  isDeadRoll,
  isStraight,
  countDice
};