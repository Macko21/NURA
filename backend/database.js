"use strict";

/**
 * ============================================================
 * LOS 10.000 DE MACKO
 * database.js
 * ------------------------------------------------------------
 * Conexión SQLite
 * Creación automática de tablas
 * ============================================================
 */

const path = require("path");
const sqlite3 = require("sqlite3").verbose();

/**
 * ============================================================
 * Ruta BD
 * ============================================================
 */

const dbPath = path.join(
  __dirname,
  "../database/los10000.db"
);

/**
 * ============================================================
 * Conexión
 * ============================================================
 */

const db = new sqlite3.Database(
  dbPath,
  err => {

    if (err) {
      console.error(
        "❌ Error SQLite:",
        err.message
      );
      return;
    }

    console.log(
      "✅ SQLite conectado"
    );
  }
);

/**
 * ============================================================
 * Inicializar tablas
 * ============================================================
 */

function initializeDatabase() {

  db.serialize(() => {

    /**
     * ========================================================
     * JUGADORES
     * ========================================================
     */

    db.run(`
      CREATE TABLE IF NOT EXISTS players (

        id TEXT PRIMARY KEY,

        alias TEXT NOT NULL,

        name TEXT NOT NULL,

        created_at INTEGER NOT NULL,

        games_played INTEGER DEFAULT 0,

        games_won INTEGER DEFAULT 0,

        ranking_points INTEGER DEFAULT 0,

        total_score INTEGER DEFAULT 0,

        highest_score INTEGER DEFAULT 0,

        coins INTEGER DEFAULT 0,

        coins_won INTEGER DEFAULT 0,

        coins_bet INTEGER DEFAULT 0,

        stairs INTEGER DEFAULT 0,

        five_ones INTEGER DEFAULT 0,

        inactivity_kicks INTEGER DEFAULT 0,

        disconnects INTEGER DEFAULT 0,

        win_streak INTEGER DEFAULT 0
      )
    `);

    /**
     * ========================================================
     * PARTIDAS
     * ========================================================
     */

    db.run(`
      CREATE TABLE IF NOT EXISTS matches (

        id TEXT PRIMARY KEY,

        room_code TEXT,

        winner_id TEXT,

        winner_alias TEXT,

        players_count INTEGER,

        duration_seconds INTEGER,

        started_at INTEGER,

        finished_at INTEGER
      )
    `);

    /**
     * ========================================================
     * HISTORIAL DE MOVIMIENTOS
     * ========================================================
     */

    db.run(`
      CREATE TABLE IF NOT EXISTS moves (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        match_id TEXT,

        player_id TEXT,

        player_alias TEXT,

        dice TEXT,

        score INTEGER,

        created_at INTEGER
      )
    `);

    /**
     * ========================================================
     * APUESTAS
     * ========================================================
     */

    db.run(`
      CREATE TABLE IF NOT EXISTS bets (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        match_id TEXT,

        player_id TEXT,

        amount INTEGER,

        created_at INTEGER
      )
    `);

    /**
     * ========================================================
     * TORNEOS FUTUROS
     * ========================================================
     */

    db.run(`
      CREATE TABLE IF NOT EXISTS tournaments (

        id TEXT PRIMARY KEY,

        name TEXT,

        created_at INTEGER,

        status TEXT
      )
    `);

    console.log(
      "✅ Tablas verificadas"
    );

  });
}

/**
 * ============================================================
 * Crear jugador
 * ============================================================
 */

function createPlayer(player) {

  return new Promise((resolve, reject) => {

    db.run(
      `
      INSERT OR IGNORE INTO players (
        id,
        alias,
        name,
        created_at
      )
      VALUES (?, ?, ?, ?)
      `,
      [
        player.id,
        player.alias,
        player.name,
        Date.now()
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
 * Obtener jugador
 * ============================================================
 */

function getPlayer(playerId) {

  return new Promise((resolve, reject) => {

    db.get(
      `
      SELECT *
      FROM players
      WHERE id = ?
      `,
      [playerId],
      (err, row) => {

        if (err) {
          reject(err);
          return;
        }

        resolve(row);
      }
    );

  });
}

/**
 * ============================================================
 * Ranking Top 100
 * ============================================================
 */

function getRanking() {

  return new Promise((resolve, reject) => {

    db.all(
      `
      SELECT *
      FROM players
      ORDER BY ranking_points DESC
      LIMIT 100
      `,
      [],
      (err, rows) => {

        if (err) {
          reject(err);
          return;
        }

        resolve(rows);
      }
    );

  });
}

/**
 * ============================================================
 * Exportaciones
 * ============================================================
 */

module.exports = {
  db,
  initializeDatabase,
  createPlayer,
  getPlayer,
  getRanking
};