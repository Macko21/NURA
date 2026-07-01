"use strict";

/**
 * ============================================================
 * LOS 10.000 DE MACKO — database.js
 * Almacenamiento en JSON puro. Sin dependencias nativas.
 * Compatible con Node.js 18, 20, 22, 24 y cualquier hosting.
 * ============================================================
 */


const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function initializeDatabase() {
  try {
    // Crear tablas si no existen (migraciones automáticas)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        reset_token TEXT,
        reset_expires TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        alias TEXT,
        name TEXT,
        user_id UUID REFERENCES users(id),
        coins INTEGER DEFAULT 0,
        games_played INTEGER DEFAULT 0,
        games_won INTEGER DEFAULT 0,
        total_score INTEGER DEFAULT 0,
        highest_score INTEGER DEFAULT 0,
        ranking_points INTEGER DEFAULT 0,
        win_streak INTEGER DEFAULT 0,
        disconnects INTEGER DEFAULT 0,
        created_at BIGINT NOT NULL
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        player_id TEXT NOT NULL,
        amount INTEGER NOT NULL,
        reason TEXT,
        created_at BIGINT NOT NULL
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS redemptions (
        id SERIAL PRIMARY KEY,
        player_id TEXT NOT NULL,
        reward_id INTEGER NOT NULL,
        status TEXT DEFAULT 'completed',
        created_at BIGINT NOT NULL
      );
    `);

    console.log("✅ PostgreSQL conectado y esquemas creados");
  } catch (err) {
    console.error("❌ Error PostgreSQL:", err);
    throw err;
  }
}

async function createPlayer(player) {
  await pool.query(
    `
    INSERT INTO players(
      id,
      alias,
      name,
      created_at
    )
    VALUES($1,$2,$3,$4)
    ON CONFLICT(id) DO NOTHING
    `,
    [
      player.id,
      player.alias || player.name,
      player.name,
      Date.now()
    ]
  );

  return true;
}

async function getPlayer(playerId) {
  const result = await pool.query(
    `
    SELECT *
    FROM players
    WHERE id = $1
    `,
    [playerId]
  );

  return result.rows[0] || null;
}

async function updatePlayer(playerId, fields) {
  const keys = Object.keys(fields);

  if (!keys.length) {
    return true;
  }

  const values = [];
  const sets = [];

  keys.forEach((key, index) => {
    sets.push(`${key} = $${index + 1}`);
    values.push(fields[key]);
  });

  values.push(playerId);

  await pool.query(
    `
    UPDATE players
    SET ${sets.join(", ")}
    WHERE id = $${values.length}
    `,
    values
  );

  return true;
}

async function getRanking() {
  const result = await pool.query(`
    SELECT *
    FROM players
    ORDER BY games_won DESC,
             ranking_points DESC
    LIMIT 100
  `);

  return result.rows;
}

const crypto = require("crypto"); // Nativo de Node.js, para generar UUIDs

// --- NUEVAS FUNCIONES DE AUTENTICACIÓN ---

async function createUserTransaction(email, username, passwordHash) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const userId = crypto.randomUUID();
    const createdAt = Date.now();

    // 1. Crear el usuario
    await client.query(
      `INSERT INTO users (id, email, username, password_hash, created_at) 
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, email, username, passwordHash, createdAt]
    );

    // 2. Crear el perfil de jugador vinculado
    // Usamos el username como ID del jugador para mantener compatibilidad con tu juego
    await client.query(
      `INSERT INTO players (id, alias, name, created_at, user_id) 
       VALUES ($1, $2, $3, $4, $5)`,
      [username, username, username, createdAt, userId]
    );

    await client.query("COMMIT");
    return { userId, playerId: username };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function getUserByEmailOrUsername(identifier) {
  const result = await pool.query(
    `SELECT * FROM users WHERE email = $1 OR username = $1`,
    [identifier]
  );
  return result.rows[0];
}

async function getPlayerByUserId(userId) {
  const result = await pool.query(
    `SELECT * FROM players WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0];
}

// --- LÓGICA DE TIENDA ---
// --- SISTEMA DE RECOMPENSAS ---
async function rewardWinner(playerId, coinsAmount) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    
    // Sumar las monedas al jugador
    await client.query(
      `UPDATE players SET coins = coins + $1 WHERE id = $2`,
      [coinsAmount, playerId]
    );

    // Guardar en el historial de transacciones
    await client.query(
      `INSERT INTO transactions (player_id, amount, reason, created_at) 
       VALUES ($1, $2, $3, $4)`,
      [playerId, coinsAmount, 'Victoria en partida', Date.now()]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error al entregar recompensa:", err);
  } finally {
    client.release();
  }
}

async function buyShopItem(userId, itemId) {
  const client = await pool.connect();
  
  // Precios hardcodeados (1: Neón, 2: Fuego, 3: Emotes, 4: Élite)
  const prices = { "1": 500, "2": 1500, "3": 800, "4": 3000 };
  const cost = prices[itemId];

  if (!cost) throw new Error("Ítem no válido");

  try {
    await client.query("BEGIN");

    // 1. Obtener el jugador y bloquear la fila para evitar compras duplicadas simultáneas
    const playerRes = await client.query(
      `SELECT id, coins FROM players WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );

    const player = playerRes.rows[0];
    if (!player) throw new Error("Jugador no encontrado");
    if (player.coins < cost) throw new Error("No tienes suficientes monedas 🪙");

    // 2. Restar las monedas
    const newBalance = player.coins - cost;
    await client.query(
      `UPDATE players SET coins = $1 WHERE user_id = $2`,
      [newBalance, userId]
    );

    // 3. Registrar la compra en redemptions
    await client.query(
      `INSERT INTO redemptions (player_id, reward_id, status, created_at) 
       VALUES ($1, $2, $3, $4)`,
      [player.id, parseInt(itemId), 'completed', Date.now()]
    );

    await client.query("COMMIT");
    return { success: true, newBalance };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  initializeDatabase,
  createPlayer,
  getPlayer,
  updatePlayer,
  getRanking,
  createUserTransaction,
  getUserByEmailOrUsername,
  getPlayerByUserId,
  buyShopItem,
  pool
};