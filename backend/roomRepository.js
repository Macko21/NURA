// backend/roomRepository.js
// Simple data‑access layer for rooms, players and betting using PostgreSQL
// Uses the shared pool defined in src/lib/neon.js (DATABASE_URL / Supabase)

const db = require('../src/lib/neon');

/** Insert a new room and return the generated id */
async function createRoomDB({ code, isPrivate = true, maxPlayers = 10 }) {
  const result = await db.query(
    `INSERT INTO rooms (code, private, max_players)
     VALUES ($1, $2, $3)
     RETURNING id, created_at, updated_at`,
    [code, isPrivate, maxPlayers]
  );
  return result.rows[0];
}

/** Load all rooms (including players) into memory */
async function loadAllRooms() {
  const roomsResult = await db.query(`SELECT * FROM rooms`);
  const rooms = new Map();
  for (const r of roomsResult.rows) {
    const playersRes = await db.query(
      `SELECT * FROM room_players WHERE room_id = $1`,
      [r.id]
    );
    const players = playersRes.rows.map(p => ({
      id: p.player_id,
      name: p.name,
      alias: p.alias,
      ready: p.ready,
      score: p.score,
      entered: p.entered,
      connected: p.connected,
      isGuest: p.is_guest,
      inactivityStrikes: p.inactivity_strikes,
      reconnectAttempts: p.reconnect_attempts,
      bet: p.bet,
      betConfirmed: p.bet_confirmed,
    }));
    rooms.set(r.id, {
      id: r.id,
      code: r.code,
      private: r.private,
      status: r.status,
      maxPlayers: r.max_players,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      players,
      // los campos de contador y chat que antes estaban en memoria se inicializan vacíos
      chat: [],
      history: [],
      currentTurnIndex: 0,
    });
  }
  return rooms;
}

/** Update a room's mutable fields */
async function updateRoomDB(roomId, fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const setClauses = keys.map((k, i) => `${snakeCase(k)} = $${i + 1}`).join(', ');
  const values = keys.map(k => fields[k]);
  await db.query(
    `UPDATE rooms SET ${setClauses} WHERE id = $${keys.length + 1}`,
    [...values, roomId]
  );
}

/** Upsert a player (insert or update) */
async function upsertPlayerDB(roomId, player) {
  await db.query(
    `INSERT INTO room_players (
        room_id, player_id, name, alias, ready, score, entered,
        connected, is_guest, inactivity_strikes, reconnect_attempts, bet, bet_confirmed
     ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13
     )
     ON CONFLICT (room_id, player_id) DO UPDATE SET
        name = EXCLUDED.name,
        alias = EXCLUDED.alias,
        ready = EXCLUDED.ready,
        score = EXCLUDED.score,
        entered = EXCLUDED.entered,
        connected = EXCLUDED.connected,
        is_guest = EXCLUDED.is_guest,
        inactivity_strikes = EXCLUDED.inactivity_strikes,
        reconnect_attempts = EXCLUDED.reconnect_attempts,
        bet = EXCLUDED.bet,
        bet_confirmed = EXCLUDED.bet_confirmed;`,
    [
      roomId,
      player.id,
      player.name,
      player.alias,
      player.ready,
      player.score,
      player.entered,
      player.connected,
      player.isGuest,
      player.inactivityStrikes,
      player.reconnectAttempts,
      player.bet,
      player.betConfirmed,
    ]
  );
}

/** Delete a room (cascades to players) */
async function deleteRoomDB(roomId) {
  await db.query('DELETE FROM rooms WHERE id = $1', [roomId]);
}

/** Helper: convert camelCase to snake_case for DB columns */
function snakeCase(str) {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

module.exports = {
  createRoomDB,
  loadAllRooms,
  updateRoomDB,
  upsertPlayerDB,
  deleteRoomDB,
};
