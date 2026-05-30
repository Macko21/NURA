"use strict";

/**
 * ============================================================
 * LOS 10.000 DE MACKO
 * playerManager.js
 * ------------------------------------------------------------
 * Gestión de jugadores y estadísticas
 * ============================================================
 */

const {
  db,
  createPlayer,
  getPlayer,
  getRanking
} = require("./database");

/**
 * ============================================================
 * Crear o cargar jugador
 * ============================================================
 */

async function createOrLoadPlayer(player) {

  await createPlayer(player);

  return await getPlayer(player.id);
}

/**
 * ============================================================
 * Obtener perfil
 * ============================================================
 */

async function getPlayerProfile(playerId) {
  return await getPlayer(playerId);
}

/**
 * ============================================================
 * Agregar monedas
 * ============================================================
 */

function addCoins(playerId, amount) {

  return new Promise((resolve, reject) => {

    db.run(
      `
      UPDATE players
      SET
        coins = coins + ?,
        coins_won = coins_won + ?
      WHERE id = ?
      `,
      [
        amount,
        amount,
        playerId
      ],
      err => {

        if (err) {
          reject(err);
          return;
        }

        resolve(true);
      }
    );

  });
}

/**
 * ============================================================
 * Descontar monedas
 * ============================================================
 */

function removeCoins(playerId, amount) {

  return new Promise((resolve, reject) => {

    db.run(
      `
      UPDATE players
      SET
        coins = CASE
          WHEN coins >= ?
          THEN coins - ?
          ELSE coins
        END,

        coins_bet = coins_bet + ?
      WHERE id = ?
      `,
      [
        amount,
        amount,
        amount,
        playerId
      ],
      err => {

        if (err) {
          reject(err);
          return;
        }

        resolve(true);
      }
    );

  });
}

/**
 * ============================================================
 * Registrar partida jugada
 * ============================================================
 */

function registerGamePlayed(
  playerId,
  score
) {

  return new Promise((resolve, reject) => {

    db.run(
      `
      UPDATE players
      SET

        games_played =
          games_played + 1,

        total_score =
          total_score + ?,

        highest_score =
          CASE
            WHEN ? > highest_score
            THEN ?
            ELSE highest_score
          END

      WHERE id = ?
      `,
      [
        score,
        score,
        score,
        playerId
      ],
      err => {

        if (err) {
          reject(err);
          return;
        }

        resolve(true);
      }
    );

  });
}

/**
 * ============================================================
 * Registrar victoria
 * ============================================================
 */

function registerWin(playerId) {

  return new Promise((resolve, reject) => {

    db.run(
      `
      UPDATE players
      SET

        games_won =
          games_won + 1,

        ranking_points =
          ranking_points + 100,

        win_streak =
          win_streak + 1

      WHERE id = ?
      `,
      [playerId],
      err => {

        if (err) {
          reject(err);
          return;
        }

        resolve(true);
      }
    );

  });
}

/**
 * ============================================================
 * Reiniciar racha
 * ============================================================
 */

function resetWinStreak(playerId) {

  return new Promise((resolve, reject) => {

    db.run(
      `
      UPDATE players
      SET win_streak = 0
      WHERE id = ?
      `,
      [playerId],
      err => {

        if (err) {
          reject(err);
          return;
        }

        resolve(true);
      }
    );

  });
}

/**
 * ============================================================
 * Registrar escalera
 * ============================================================
 */

function registerStraight(playerId) {

  return new Promise((resolve, reject) => {

    db.run(
      `
      UPDATE players
      SET stairs = stairs + 1
      WHERE id = ?
      `,
      [playerId],
      err => {

        if (err) {
          reject(err);
          return;
        }

        resolve(true);
      }
    );

  });
}

/**
 * ============================================================
 * Registrar cinco unos
 * ============================================================
 */

function registerFiveOnes(playerId) {

  return new Promise((resolve, reject) => {

    db.run(
      `
      UPDATE players
      SET five_ones = five_ones + 1
      WHERE id = ?
      `,
      [playerId],
      err => {

        if (err) {
          reject(err);
          return;
        }

        resolve(true);
      }
    );

  });
}

/**
 * ============================================================
 * Registrar expulsión
 * ============================================================
 */

function registerKick(playerId) {

  return new Promise((resolve, reject) => {

    db.run(
      `
      UPDATE players
      SET inactivity_kicks =
          inactivity_kicks + 1
      WHERE id = ?
      `,
      [playerId],
      err => {

        if (err) {
          reject(err);
          return;
        }

        resolve(true);
      }
    );

  });
}

/**
 * ============================================================
 * Registrar desconexión
 * ============================================================
 */

function registerDisconnect(playerId) {

  return new Promise((resolve, reject) => {

    db.run(
      `
      UPDATE players
      SET disconnects =
          disconnects + 1
      WHERE id = ?
      `,
      [playerId],
      err => {

        if (err) {
          reject(err);
          return;
        }

        resolve(true);
      }
    );

  });
}

/**
 * ============================================================
 * Top ranking
 * ============================================================
 */

async function getTopRanking() {
  return await getRanking();
}

/**
 * ============================================================
 * Exportaciones
 * ============================================================
 */

module.exports = {
  createOrLoadPlayer,
  getPlayerProfile,

  addCoins,
  removeCoins,

  registerGamePlayed,
  registerWin,
  resetWinStreak,

  registerStraight,
  registerFiveOnes,

  registerKick,
  registerDisconnect,

  getTopRanking
};