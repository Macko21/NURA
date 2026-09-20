'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { rollDice } = require('../backend/diceManager');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const server = read('backend/server.js');
const database = read('backend/database.js');
const auth = read('backend/authManager.js');
const room = read('backend/roomManager.js');
const html = read('frontend/index.html');
const resetHtml = read('frontend/reset-password.html');

assert(server.includes("res.status(410).json({ error: 'El resultado se confirma automáticamente"),
  'daily challenge must reject client-authored results');
assert(database.includes('reward_claimed = FALSE') && database.includes('reward_claimed = TRUE'),
  'daily reward must have an idempotent server-side claim');
assert(server.includes('coins = coins - $1') && server.includes('coins >= $1'),
  'bets and power-ups must debit atomically with a sufficient-balance condition');
assert(server.includes("room.players.some(player => player.id === req.user.playerId)"),
  'HTTP invites must verify room membership');
assert(server.includes('if (room.private || room.status !== "playing"'),
  'active-game discovery must not expose private room identifiers');
assert(server.includes('socket.gameActionPending'), 'game actions must have a concurrency guard');
assert(auth.includes('session_version') && auth.includes('sessionVersion'),
  'JWTs must be checked against a revocable server session');
assert(database.includes('DATABASE_SSL_REJECT_UNAUTHORIZED') && !database.includes('rejectUnauthorized: false'),
  'database TLS verification must be enabled by default');
assert(server.includes("script-src 'self'") && server.includes("connect-src 'self'") && server.includes("object-src 'none'"),
  'CSP must block untrusted scripts and plugins');
assert(!/onclick\s*=/.test(html + resetHtml), 'HTML must not contain inline click handlers');
assert(room.includes('randomInt('), 'room codes and turn selection must use crypto randomness');
assert(read('backend/diceManager.js').includes('let diceRandomInt = randomInt'),
  'dice must default to crypto randomness');

for (let i = 0; i < 250; i++) {
  const dice = rollDice(5);
  assert.strictEqual(dice.length, 5);
  assert(dice.every(value => Number.isInteger(value) && value >= 1 && value <= 6));
}

console.log('Security regression checks OK');
