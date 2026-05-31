"use strict";

/**
 * ============================================================
 * LOS 10.000 DE MACKO — backend/server.js
 * ============================================================
 * - Reconexión: 30s de gracia al desconectarse
 * - JOIN en partida activa: cualquiera con el código entra
 *   como jugador nuevo (necesita entrar con 1000+ igual)
 * - LEAVE_ROOM: salir de sala de espera
 * - CANCEL_ROOM: el dueño cancela la sala
 * - No duplica jugadores
 * ============================================================
 */

const { initializeDatabase } = require("./database");
const path      = require("path");
const http      = require("http");
const express   = require("express");
const WebSocket = require("ws");

const {
  rooms,
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

const { createPlayerState } = require("./matchState");

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
const clients      = new Map(); // playerId → socket
const reconnTimers = new Map(); // playerId → timeoutId
const RECONN_MS    = 30_000;   // 30s para reconectarse

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

  // Notificar fin de partida
  broadcastRoom(roomId, "GAME_OVER", {
    winner, match: snapshotMatch(match)
  });

  // Destruir el match pero mantener la sala
  destroyMatch(roomId);

  // Resetear sala para revancha: volver a "waiting", limpiar listos
  const room = getRoom(roomId);
  if (room) {
    room.status = "waiting";
    for (const p of room.players) {
      p.ready  = false;
      p.score  = 0;
      p.entered = false;
    }
    // Mandar a todos a la sala de espera con la misma sala
    setTimeout(() => {
      broadcastRoom(roomId, "PLAY_AGAIN", { room });
    }, 4000); // 4s para que vean el modal de victoria
  }
}

/* ── Eliminar jugador definitivamente ────────────────────── */
function eliminatePlayer(roomId, playerId) {
  reconnTimers.delete(playerId);
  clients.delete(playerId);

  const match = getMatch(roomId);

  // Solo avanzar turno si hay partida activa
  if (match) {
    diceDisconnect(roomId, playerId, broadcastRoom);
  }

  removePlayer(roomId, playerId);

  // Ganador automático SOLO si la partida ya empezó
  // En sala de espera (sin match) no hay ganador automático
  if (match) {
    const winner = getAutomaticWinner(roomId);
    if (winner) {
      broadcastRoom(roomId, "GAME_OVER", {
        winner, match: snapshotMatch(match)
      });
      destroyMatch(roomId);
      return;
    }
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
        if (!room) {
          send(socket, "ERROR", { message: "Sala no encontrada" });
          return;
        }

        // Evitar que el mismo jugador entre dos veces
        const alreadyIn = room.players.find(p => p.id === data.playerId);
        if (alreadyIn) {
          // Ya está en la sala — reconectar socket
          clients.set(data.playerId, socket);
          socket.playerId = data.playerId;
          socket.roomId   = room.id;
          const match = getMatch(room.id);
          if (match) {
            send(socket, "RECONNECTED", {
              room,
              match: snapshotMatch(match),
              playerId: data.playerId
            });
          } else {
            send(socket, "JOIN_SUCCESS", { room, player: alreadyIn });
          }
          return;
        }

        if (room.players.length >= room.maxPlayers) {
          send(socket, "ERROR", { message: "La sala está llena" });
          return;
        }

        // ── SALA DE ESPERA: entrada normal ─────────────────
        if (room.status === "waiting") {
          const player = addPlayer(room.id, data.playerId, data.playerName);
          clients.set(data.playerId, socket);
          socket.playerId = data.playerId;
          socket.roomId   = room.id;
          send(socket, "JOIN_SUCCESS", { room, player });
          broadcastRoomState(room.id);
          return;
        }

        // ── PARTIDA EN CURSO: unirse como jugador nuevo ────
        if (room.status === "playing") {
          const match = getMatch(room.id);
          if (!match) {
            send(socket, "ERROR", { message: "No se encontró la partida activa" });
            return;
          }

          // Crear jugador en la sala
          const newPlayer = {
            id:                data.playerId,
            name:              data.playerName,
            alias:             data.playerName + "#" + Math.floor(1000 + Math.random() * 9000),
            ready:             true,
            score:             0,
            entered:           false,
            connected:         true,
            reconnectAttempts: 0,
            inactivityStrikes: 0
          };
          room.players.push(newPlayer);

          // Crear estado del jugador en el match (al final de la cola)
          const playerState = createPlayerState(newPlayer);
          match.players.push(playerState);

          clients.set(data.playerId, socket);
          socket.playerId = data.playerId;
          socket.roomId   = room.id;

          // Informar al nuevo jugador
          send(socket, "JOINED_ACTIVE_GAME", {
            room,
            match:    snapshotMatch(match),
            playerId: data.playerId
          });

          // Informar a todos los demás
          broadcastRoom(room.id, "PLAYER_JOINED_GAME", {
            playerId:   data.playerId,
            playerName: data.playerName,
            match:      snapshotMatch(match)
          });

          console.log(`➕ ${data.playerName} se unió a partida en curso: ${room.code}`);
          return;
        }

        send(socket, "ERROR", { message: "No se puede unir a esta sala" });
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

      /* ── ESTADO DE SALA (para revancha manual) ────────── */
      if (type === "GET_ROOM_STATE") {
        const room = getRoom(data.roomId);
        if (room) {
          send(socket, "PLAY_AGAIN", { room });
        }
        return;
      }

      /* ── SALIR DE PARTIDA EN CURSO ─────────────────────── */
      if (type === "LEAVE_GAME") {
        const { roomId, playerId } = data;
        const match = getMatch(roomId);
        if (!match) return;

        // Informar al jugador que salió
        send(socket, "LEFT_GAME", { playerId });

        // Eliminar de sala y match
        eliminatePlayer(roomId, playerId);
        socket.roomId = null;
        return;
      }

      /* ── SALIR DE SALA (jugador no dueño, solo lobby) ──── */
      if (type === "LEAVE_ROOM") {
        const { roomId, playerId } = data;
        const room = getRoom(roomId);
        if (!room || room.status !== "waiting") return;

        send(socket, "PLAYER_REMOVED", { playerId });
        removePlayer(roomId, playerId);
        socket.roomId = null;
        clients.delete(playerId);
        broadcastRoomState(roomId);
        return;
      }

      /* ── CANCELAR SALA (solo el dueño, solo lobby) ──────── */
      if (type === "CANCEL_ROOM") {
        const { roomId, playerId } = data;
        const room = getRoom(roomId);
        if (!room || room.status !== "waiting") return;

        const isOwner = room.players[0]?.id === playerId;
        if (!isOwner) return;

        broadcastRoom(roomId, "ROOM_CANCELLED", { roomId });

        for (const p of room.players) {
          const sock = clients.get(p.id);
          if (sock) sock.roomId = null;
        }
        rooms.delete(roomId);
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

    broadcastRoom(roomId, "PLAYER_DISCONNECTED", { playerId });

    // Si era su turno, avanzar para no bloquear la partida
    const match = getMatch(roomId);
    if (match) {
      const cur = match.players[match.currentPlayerIndex];
      if (cur?.id === playerId) {
        diceDisconnect(roomId, playerId, broadcastRoom);
      }
    }

    // Timer: 30s para reconectarse antes de ser eliminado
    const timerId = setTimeout(() => {
      console.log(`❌ Eliminado por timeout: ${playerId}`);
      const currentRoom = getRoom(roomId);
      if (currentRoom) {
        broadcastRoom(roomId, "PLAYER_LEFT", { playerId });
        eliminatePlayer(roomId, playerId);
      } else {
        reconnTimers.delete(playerId);
        clients.delete(playerId);
      }
    }, RECONN_MS);

    reconnTimers.set(playerId, timerId);
  });
});

/* ── Init ────────────────────────────────────────────────── */
initializeDatabase();
server.listen(PORT, () => console.log(`🚀 Servidor en http://localhost:${PORT}`));
