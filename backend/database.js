"use strict";

/**
 * ============================================================
 * LOS 10.000 DE MACKO — database.js
 * Almacenamiento en JSON puro. Sin dependencias nativas.
 * Compatible con Node.js 18, 20, 22, 24 y cualquier hosting.
 * ============================================================
 */

const path = require("path");
const fs   = require("fs");

const DB_DIR  = path.join(__dirname, "../database");
const DB_FILE = path.join(DB_DIR, "players.json");

// Crear carpeta si no existe
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Crear archivo si no existe
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ players: {} }, null, 2), "utf8");
}

/* ── Leer / escribir ─────────────────────────────────────── */
function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch(e) {
    return { players: {} };
  }
}

function writeDB(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch(e) {
    console.error("Error escribiendo DB:", e.message);
  }
}

/* ── API ─────────────────────────────────────────────────── */
function initializeDatabase() {
  // Verificar que el archivo existe y es válido
  readDB();
  console.log("✅ Base de datos JSON lista:", DB_FILE);
}

function createPlayer(player) {
  try {
    const db = readDB();
    if (!db.players[player.id]) {
      db.players[player.id] = {
        id:             player.id,
        alias:          player.alias || player.name,
        name:           player.name,
        created_at:     Date.now(),
        games_played:   0,
        games_won:      0,
        ranking_points: 0,
        total_score:    0,
        highest_score:  0,
        win_streak:     0,
        disconnects:    0
      };
      writeDB(db);
    }
    return Promise.resolve(true);
  } catch(e) { return Promise.reject(e); }
}

function getPlayer(playerId) {
  try {
    const db = readDB();
    return Promise.resolve(db.players[playerId] || null);
  } catch(e) { return Promise.reject(e); }
}

function updatePlayer(playerId, fields) {
  try {
    const db = readDB();
    if (!db.players[playerId]) return Promise.resolve(false);
    Object.assign(db.players[playerId], fields);
    writeDB(db);
    return Promise.resolve(true);
  } catch(e) { return Promise.reject(e); }
}

function getRanking() {
  try {
    const db   = readDB();
    const rows = Object.values(db.players)
      .sort((a, b) => b.games_won - a.games_won || b.ranking_points - a.ranking_points)
      .slice(0, 100);
    return Promise.resolve(rows);
  } catch(e) { return Promise.reject(e); }
}

module.exports = { initializeDatabase, createPlayer, getPlayer, updatePlayer, getRanking };
