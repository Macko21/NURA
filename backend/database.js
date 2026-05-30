"use strict";

/**
 * ============================================================
 * LOS 10.000 DE MACKO — database.js
 * Usa better-sqlite3 (síncrono, compatible con todos los entornos)
 * ============================================================
 */

const path = require("path");
const fs   = require("fs");

// Asegurar que existe la carpeta database/
const dbDir = path.join(__dirname, "../database");
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const Database = require("better-sqlite3");
const db = new Database(path.join(dbDir, "los10000.db"));

// WAL mode = mejor performance
db.pragma("journal_mode = WAL");

/* ── Inicializar tablas ──────────────────────────────────── */
function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id              TEXT PRIMARY KEY,
      alias           TEXT NOT NULL,
      name            TEXT NOT NULL,
      created_at      INTEGER NOT NULL,
      games_played    INTEGER DEFAULT 0,
      games_won       INTEGER DEFAULT 0,
      ranking_points  INTEGER DEFAULT 0,
      total_score     INTEGER DEFAULT 0,
      highest_score   INTEGER DEFAULT 0,
      coins           INTEGER DEFAULT 0,
      coins_won       INTEGER DEFAULT 0,
      coins_bet       INTEGER DEFAULT 0,
      stairs          INTEGER DEFAULT 0,
      five_ones       INTEGER DEFAULT 0,
      inactivity_kicks INTEGER DEFAULT 0,
      disconnects     INTEGER DEFAULT 0,
      win_streak      INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS matches (
      id               TEXT PRIMARY KEY,
      room_code        TEXT,
      winner_id        TEXT,
      winner_alias     TEXT,
      players_count    INTEGER,
      duration_seconds INTEGER,
      started_at       INTEGER,
      finished_at      INTEGER
    );
  `);
  console.log("✅ SQLite listo (better-sqlite3)");
}

/* ── Queries ─────────────────────────────────────────────── */
function createPlayer(player) {
  try {
    db.prepare(`
      INSERT OR IGNORE INTO players (id, alias, name, created_at)
      VALUES (?, ?, ?, ?)
    `).run(player.id, player.alias, player.name, Date.now());
    return Promise.resolve(true);
  } catch(e) { return Promise.reject(e); }
}

function getPlayer(playerId) {
  try {
    const row = db.prepare("SELECT * FROM players WHERE id = ?").get(playerId);
    return Promise.resolve(row);
  } catch(e) { return Promise.reject(e); }
}

function getRanking() {
  try {
    const rows = db.prepare(
      "SELECT * FROM players ORDER BY ranking_points DESC LIMIT 100"
    ).all();
    return Promise.resolve(rows);
  } catch(e) { return Promise.reject(e); }
}

function runUpdate(sql, params) {
  try {
    db.prepare(sql).run(...params);
    return Promise.resolve(true);
  } catch(e) { return Promise.reject(e); }
}

module.exports = {
  db,
  initializeDatabase,
  createPlayer,
  getPlayer,
  getRanking,
  runUpdate
};