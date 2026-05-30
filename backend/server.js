"use strict";

/**
 * ============================================================
 * LOS 10.000 DE MACKO — backend/server.js
 * Con soporte de reconexión: al desconectarse el jugador
 * tiene 30s para volver antes de ser eliminado de la sala.
 * ============================================================
 */

const { initializeDatabase } = require("./database");
const path    = require("path");
const http    = require("http");
const express = require("express");
const WebSocket = require("ws");

const {
  createRoom, getRoom, getRoomByCode,
  addPlayer, removePlayer,
  setReady, allPlayersReady,
  startGame, getAutomaticWinner
} = require("./roomManager");

const {
  createOrLoadPlayer, registerGamePlayed,
  registerWin, resetWinStreak,
  registerStraight, registerFiveOnes,
  registerDisconnect, getTopRanking
} = require("./playerManager");

const {
  createMatch, startFirstTurnTimer, getMatch, destroyMatch,
  handleEntryRoll, handleRoll, handleBank,
  handleDisconnect: diceDisconnect,
  snapshotMatch
} = require("./diceManager");

/* ── Express ─────────────────────────────────────────────── */
const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "../frontend")));
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "../frontend/index.html"))
);
app.get("/ranking", async (req, res) => {
  try { res.json(await getTopRanking()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── HTTP + WS ───────────────────────────────────────────── */
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

console.log("🎲 Iniciando Los 10.000 de Macko...");

/* ── Clientes y timers de reconexión ────────────────────── */
const clients       = new Map(); // playerId → socket
const reconnTimers  = new Map(); // playerId → timeoutId
const RECONN_MS     = 30_000;   // 30s para reconectarse

/* ── Helpers de comunicación ─────────────────────────────── */
function send(socket, type, data = {}) {
  if (socket?.readyState === WebSocket.OPEN)
    socket.send(JSON.stringify({ type, data }));
}

function broadcastRoom(roomId, type, data) {
  const room = getRoom(roomId);
  if (!room) return;
  for (const p of room.players) {
    const sock = clients.get(p.id);
    if (sock) send(sock, type, data);
  }
}

function broadcastRoomState(roomId) {
  const room = getRoom(roomId);
  if (!room) return;
  broadcastRoom(roomId, "ROOM_STATE", { room });
}

/* ── Post-victoria ───────────────────────────────────────── */
async function onMatchWon(match, roomId) {
  const winner = match.winner;
  if (!winner) return;
  try {
    await registerWin(winner.id);
    for (const p of match.players) {
      await registerGamePlayed(p.id, p.score);
      if (p.id !== winner.id) await resetWinStreak(p.id);
      if (p.straights > 0) await registerStraight(p.id);
      if (p.fiveOnes  > 0) await registerFiveOnes(p.id);
    }
  } catch (e) { console.error("DB post-win:", e.message); }

  broadcastRoom(roomId, "GAME_OVER", {
    winner, match: snapshotMatch(match)
  });
  destroyMatch(roomId);
}

/* ── Eliminar jugador definitivamente ────────────────────── */
function eliminatePlayer(roomId, playerId) {
  reconnTimers.delete(playerId);
  clients.delete(playerId);

  diceDisconnect(roomId, playerId, broadcastRoom);
  removePlayer(roomId, playerId);

  const winner = getAutomaticWinner(roomId);
  if (winner) {
    const match = getMatch(roomId);
    broadcastRoom(roomId, "GAME_OVER", {
      winner, match: match ? snapshotMatch(match) : null
    });
    destroyMatch(roomId);
    return;
  }
  broadcastRoomState(roomId);
}

/* ══════════════════════════════════════════════════════════
   CONEXIÓN WS
   ══════════════════════════════════════════════════════════ */
wss.on("connection", socket => {

  socket.on("message", async rawMsg => {
    try {
      const { type, data } = JSON.parse(rawMsg.toString());

      /* ── IDENTIFY / RECONEXIÓN ─────────────────────────── */
      if (type === "IDENTIFY") {
        const { playerId, playerName, roomId } = data;

        socket.playerId = playerId;
        socket.roomId   = roomId || null;
        clients.set(playerId, socket);

        // Cancelar timer de eliminación si estaba pendiente
        if (reconnTimers.has(playerId)) {
          clearTimeout(reconnTimers.get(playerId));
          reconnTimers.delete(playerId);
          console.log(`🔄 Reconectado: ${playerId}`);
        }

        try {
          await createOrLoadPlayer({ id: playerId, alias: playerName, name: playerName });
        } catch (e) { console.error("DB identify:", e.message); }

        // Si viene con roomId, intentar restaurar su sesión
        if (roomId) {
          const room  = getRoom(roomId);
          const match = getMatch(roomId);

          if (room && match) {
            // Jugador reconectado en partida activa
            const player = room.players.find(p => p.id === playerId);
            if (player) {
              player.connected = true;
              send(socket, "RECONNECTED", {
                room,
                match: snapshotMatch(match),
                playerId
              });
              broadcastRoom(roomId, "PLAYER_RECONNECTED", {
                playerId, playerName: player.name
              });
              return;
            }
          }

          if (room && !match) {
            // Sala de espera — reconectar
            const player = room.players.find(p => p.id === playerId);
            if (player) {
              player.connected = true;
              send(socket, "RECONNECTED_LOBBY", { room, playerId });
              broadcastRoomState(roomId);
              return;
            }
          }
        }

        send(socket, "IDENTIFIED", { playerId });
        return;
      }

      /* ── RANKING ───────────────────────────────────────── */
      if (type === "GET_RANKING") {
        const rows = await getTopRanking();
        send(socket, "RANKING", { ranking: rows });
        return;
      }

      /* ── CREAR SALA ────────────────────────────────────── */
      if (type === "CREATE_ROOM") {
        const room = createRoom({
          ownerId:    data.playerId,
          ownerName:  data.playerName,
          isPrivate:  data.isPrivate,
          maxPlayers: data.maxPlayers || 10
        });
        clients.set(data.playerId, socket);
        socket.playerId = data.playerId;
        socket.roomId   = room.id;
        send(socket, "ROOM_CREATED", { room });
        return;
      }

      /* ── UNIRSE ────────────────────────────────────────── */
      if (type === "JOIN_ROOM") {
        const room = getRoomByCode(data.code);
        if (!room) { send(socket, "ERROR", { message: "Sala no encontrada" }); return; }
        if (room.status !== "waiting") { send(socket, "ERROR", { message: "La partida ya inició" }); return; }

        const player = addPlayer(room.id, data.playerId, data.playerName);
        clients.set(data.playerId, socket);
        socket.playerId = data.playerId;
        socket.roomId   = room.id;
        send(socket, "JOIN_SUCCESS", { room, player });
        broadcastRoomState(room.id);
        return;
      }

      /* ── LISTO ─────────────────────────────────────────── */
      if (type === "PLAYER_READY") {
        setReady(data.roomId, data.playerId, true);
        broadcastRoomState(data.roomId);
        if (allPlayersReady(data.roomId)) {
          const firstPlayer = startGame(data.roomId);
          const room  = getRoom(data.roomId);
          const match = createMatch(room);
          broadcastRoom(data.roomId, "GAME_STARTED", {
            firstPlayer, match: snapshotMatch(match)
          });
          startFirstTurnTimer(data.roomId, broadcastRoom);
        }
        return;
      }

      /* ── TIRAR ─────────────────────────────────────────── */
      if (type === "ROLL") {
        const { roomId, playerId } = data;
        const match = getMatch(roomId);
        if (!match) { send(socket, "ERROR", { message: "Partida no encontrada" }); return; }

        const player = match.players.find(p => p.id === playerId);
        let result;
        if (!player || !player.entered)
          result = handleEntryRoll(roomId, playerId, broadcastRoom);
        else
          result = handleRoll(roomId, playerId, broadcastRoom);

        if (!result.ok) { send(socket, "ERROR", { message: result.error }); return; }

        const updated = getMatch(roomId);
        if (updated?.status === "finished") await onMatchWon(updated, roomId);
        return;
      }

      /* ── BANCO ─────────────────────────────────────────── */
      if (type === "BANK") {
        const { roomId, playerId } = data;
        const result = handleBank(roomId, playerId, broadcastRoom);
        if (!result.ok) { send(socket, "ERROR", { message: result.error }); return; }
        const updated = getMatch(roomId);
        if (updated?.status === "finished") await onMatchWon(updated, roomId);
        return;
      }

      /* ── CHAT ──────────────────────────────────────────── */
      if (type === "CHAT_MESSAGE") {
        broadcastRoom(data.roomId, "CHAT_MESSAGE", {
          playerId:   data.playerId,
          playerName: data.playerName,
          message:    String(data.message || "").slice(0, 500),
          timestamp:  Date.now()
        });
        return;
      }

    } catch (err) {
      console.error("WS error:", err);
      send(socket, "ERROR", { message: "Error procesando mensaje" });
    }
  });

  /* ── DESCONEXIÓN ─────────────────────────────────────── */
  socket.on("close", async () => {
    const { roomId, playerId } = socket;
    if (!roomId || !playerId) return;

    console.log(`⚡ Desconectado: ${playerId} — esperando reconexión ${RECONN_MS/1000}s`);

    try { await registerDisconnect(playerId); } catch (e) {}

    // Notificar a la sala que el jugador se desconectó temporalmente
    broadcastRoom(roomId, "PLAYER_DISCONNECTED", { playerId });

    // Si era su turno en el match, avanzar después del período de gracia
    // (pero no eliminar aún — esperamos reconexión)
    const match = getMatch(roomId);
    if (match) {
      const cur = match.players[match.currentPlayerIndex];
      if (cur?.id === playerId) {
        // Avanzar el turno para no bloquear la partida
        diceDisconnect(roomId, playerId, broadcastRoom);
      }
    }

    // Timer: si no reconecta en RECONN_MS → eliminar definitivamente
    const timerId = setTimeout(() => {
      console.log(`❌ Eliminado por timeout: ${playerId}`);
      broadcastRoom(roomId, "PLAYER_LEFT", { playerId });
      eliminatePlayer(roomId, playerId);
    }, RECONN_MS);

    reconnTimers.set(playerId, timerId);
  });
});

/* ── Init ────────────────────────────────────────────────── */
initializeDatabase();
server.listen(PORT, () => console.log(`🚀 Servidor en http://localhost:${PORT}`));