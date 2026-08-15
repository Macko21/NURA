"use strict";

const { randomUUID } = require("crypto");

/**

* ============================================================
* Todas las salas activas en memoria
* ============================================================
  */
  const rooms = new Map();

// ── Temporizadores de countdown para auto-start ──
const readyCountdowns = new Map();   // roomId -> setInterval id
const readyCountdownSec = new Map(); // roomId -> seconds left
const READY_COUNTDOWN_TOTAL = 15;

function startReadyCountdown(roomId, broadcastFn, onAutoStart) {
  if (readyCountdowns.has(roomId)) return;
  readyCountdownSec.set(roomId, READY_COUNTDOWN_TOTAL);
  broadcastFn(roomId, 'READY_COUNTDOWN', { seconds: READY_COUNTDOWN_TOTAL });
  const timer = setInterval(() => {
    const left = (readyCountdownSec.get(roomId) || 0) - 1;
    readyCountdownSec.set(roomId, left);
    broadcastFn(roomId, 'READY_COUNTDOWN', { seconds: left });
    if (left <= 0) {
      clearInterval(timer);
      readyCountdowns.delete(roomId);
      readyCountdownSec.delete(roomId);
      const room = rooms.get(roomId);
      if (room && room.status === 'waiting' && room.players.filter(p => p.ready).length >= 2) {
        room.players = room.players.filter(p => p.ready);
        if (onAutoStart) onAutoStart(roomId);
      }
    }
  }, 1000);
  readyCountdowns.set(roomId, timer);
}

function cancelReadyCountdown(roomId) {
  if (readyCountdowns.has(roomId)) {
    clearInterval(readyCountdowns.get(roomId));
    readyCountdowns.delete(roomId);
    readyCountdownSec.delete(roomId);
  }
}

function hasReadyCountdown(roomId) {
  return readyCountdowns.has(roomId);
}

/**

* ============================================================
* Genera código de sala
* Ejemplo: A7X92K
* ============================================================
  */
  function generateRoomCode(length = 6) {
  const chars = "0123456789";

let code = "";

for (let i = 0; i < length; i++) {
code += chars.charAt(
Math.floor(Math.random() * chars.length)
);
}

return code;
}

/**

* ============================================================
* Genera alias único temporal
* Ejemplo:
* Macko#1847
* ============================================================
  */
  function generateAlias(name) {
  const suffix =
  Math.floor(1000 + Math.random() * 9000);

return `${name}#${suffix}`;
}

/**

* ============================================================
* Crear sala
* ============================================================
  */
  function createRoom({
  ownerId,
  ownerName,
  isPrivate = true,
  maxPlayers = 10,
  ownerIsGuest = false
  }) {

const roomId = randomUUID();

const room = {
id: roomId,
code: generateRoomCode(),
private: isPrivate,
status: "waiting",
maxPlayers,
createdAt: Date.now(),
currentTurnIndex: 0,
players: [],
chat: [],
history: []
};

room.players.push({
id: ownerId,
name: ownerName,
alias: generateAlias(ownerName),
ready: false,
score: 0,
entered: false,
connected: true,
reconnectAttempts: 0,
inactivityStrikes: 0
,
isGuest: !!ownerIsGuest
});

rooms.set(roomId, room);

return room;
}

/**

* ============================================================
* Buscar sala por código
* ============================================================
  */
  function getRoomByCode(code) {

for (const room of rooms.values()) {
if (room.code === code) {
return room;
}
}

return null;
}

/**

* ============================================================
* Obtener sala
* ============================================================
  */
  function getRoom(roomId) {
  return rooms.get(roomId) || null;
  }

/**

* ============================================================
* Agregar jugador
* ============================================================
  */
  function addPlayer(
  roomId,
  playerId,
  playerName,
  options = {}
  ) {

const room = rooms.get(roomId);

if (!room) {
throw new Error("Sala inexistente");
}

if (room.players.length >= room.maxPlayers) {
throw new Error("Sala llena");
}

const player = {
  id: playerId,
  name: playerName,
  alias: generateAlias(playerName),
  ready: false,
  score: 0,
  entered: false,
  connected: true,
  reconnectAttempts: 0,
  inactivityStrikes: 0
  ,
  isGuest: !!options.isGuest
};

room.players.push(player);

return player;
}

/**

* ============================================================
* Marcar listo
* ============================================================
  */
  function setReady(
  roomId,
  playerId,
  ready = true
  ) {

const room = rooms.get(roomId);

if (!room) {
return false;
}

const player =
room.players.find(
p => p.id === playerId
);

if (!player) {
return false;
}

player.ready = ready;

return true;
}

/**

* ============================================================
* Verificar si todos están listos
* ============================================================
  */
  function allPlayersReady(roomId) {

const room = rooms.get(roomId);

if (!room) {
return false;
}

if (room.players.length < 2) {
return false;
}

return room.players.every(
player => player.ready
);
}

/**

* ============================================================
* Iniciar partida
* ============================================================
  */
  function startGame(roomId) {

const room = rooms.get(roomId);

if (!room) {
throw new Error("Sala inexistente");
}

if (!allPlayersReady(roomId)) {
throw new Error(
"No todos los jugadores están listos"
);
}

room.status = "playing";

room.currentTurnIndex =
Math.floor(
Math.random() *
room.players.length
);

return room.players[
room.currentTurnIndex
];
}

/**

* ============================================================
* Obtener jugador actual
* ============================================================
  */
  function getCurrentPlayer(roomId) {

const room = rooms.get(roomId);

if (!room) {
return null;
}

return room.players[
room.currentTurnIndex
];
}

/**

* ============================================================
* Pasar al siguiente turno
* ============================================================
  */
  function nextTurn(roomId) {

const room = rooms.get(roomId);

if (!room) {
return null;
}

if (room.players.length === 0) {
return null;
}

room.currentTurnIndex =
(room.currentTurnIndex + 1) %
room.players.length;

return getCurrentPlayer(roomId);
}

/**

* ============================================================
* Agregar strike por inactividad
* ============================================================
  */
  function addInactivityStrike(
  roomId,
  playerId
  ) {

const room = rooms.get(roomId);

if (!room) {
return false;
}

const player =
room.players.find(
p => p.id === playerId
);

if (!player) {
return false;
}

player.inactivityStrikes++;

return player.inactivityStrikes;
}

/**

* ============================================================
* Verificar expulsión
* ============================================================
  */
  function shouldKickForInactivity(
  roomId,
  playerId
  ) {

const room = rooms.get(roomId);

if (!room) {
return false;
}

const player =
room.players.find(
p => p.id === playerId
);

if (!player) {
return false;
}

return (
player.inactivityStrikes >= 3
);
}

/**

* ============================================================
* Eliminar jugador
* ============================================================
  */
  function removePlayer(
  roomId,
  playerId
  ) {

const room = rooms.get(roomId);

if (!room) {
return false;
}

room.players =
room.players.filter(
player =>
player.id !== playerId
);

if (room.players.length === 0) {
cancelReadyCountdown(roomId);
rooms.delete(roomId);
return true;
}

// Si se fue el creador (primer jugador), el nuevo index 0 es el nuevo dueño implícitamente
// La reassignación es automática por el orden del array

if (
room.currentTurnIndex >=
room.players.length
) {
room.currentTurnIndex = 0;
}

return true;
}

/**

* ============================================================
* Si queda un solo jugador gana automáticamente
* ============================================================
  */
  function getAutomaticWinner(
  roomId
  ) {

const room = rooms.get(roomId);

if (!room) {
return null;
}

if (room.players.length === 1) {
return room.players[0];
}

return null;
}

/**

* ============================================================
* Exportaciones
* ============================================================
  */
  module.exports = {
  rooms,

createRoom,

getRoom,

getRoomByCode,

addPlayer,

removePlayer,

setReady,

allPlayersReady,

startGame,

getCurrentPlayer,

nextTurn,

addInactivityStrike,

shouldKickForInactivity,

getAutomaticWinner,

generateAlias,

startReadyCountdown,

cancelReadyCountdown,

hasReadyCountdown,

// Apuestas
setPlayerBet,
confirmPlayerBet,
getBettingState,
getBetPot
};

/* ── Apuestas ─────────────────────────────────────── */

// Límites de apuesta
const BET_LIMITS = { min: 0, max: 5000 };
const BET_PRESETS = [0, 100, 200, 500, 1000, 2000, 5000];
const HOUSE_EDGE = 0.1; // 10% comisión

function setPlayerBet(roomId, playerId, amount) {
  const room = rooms.get(roomId);
  if (!room || room.status !== 'waiting') return { ok: false, error: 'Sala no disponible' };
  const player = room.players.find(p => p.id === playerId);
  if (!player) return { ok: false, error: 'Jugador no encontrado en la sala' };

  amount = Math.max(BET_LIMITS.min, Math.min(BET_LIMITS.max, Math.floor(Number(amount) || 0)));
  player.bet = amount;
  player.betConfirmed = false; // Reset confirmación al cambiar monto

  // Inicializar estado de apuestas de la sala
  if (!room.betting) room.betting = { enabled: false, pot: 0 };

  return { ok: true, bet: amount, presets: BET_PRESETS };
}

function confirmPlayerBet(roomId, playerId) {
  const room = rooms.get(roomId);
  if (!room || room.status !== 'waiting') return { ok: false, error: 'Sala no disponible' };
  const player = room.players.find(p => p.id === playerId);
  if (!player) return { ok: false, error: 'Jugador no encontrado' };

  player.betConfirmed = true;

  // Calcular pot total
  const pot = room.players.reduce((sum, p) => sum + (p.bet || 0), 0);
  room.betting = { enabled: pot > 0, pot };

  // Verificar si todos apostaron
  const allBet = room.players.every(p => p.betConfirmed || (p.bet || 0) === 0);

  return { ok: true, bet: player.bet || 0, pot, allBet };
}

function getBettingState(roomId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  const pot = room.players.reduce((sum, p) => sum + (p.bet || 0), 0);
  return {
    enabled: pot > 0,
    pot,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      bet: p.bet || 0,
      confirmed: !!p.betConfirmed
    })),
    presets: BET_PRESETS,
    houseEdge: HOUSE_EDGE
  };
}

function getBetPot(roomId) {
  const room = rooms.get(roomId);
  if (!room) return 0;
  return room.players.reduce((sum, p) => sum + (p.bet || 0), 0);
}
