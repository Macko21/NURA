"use strict";
require("dotenv").config();
/**
 * ============================================================
 * LOS 10.000 DE MACKO — backend/server.js
 * ============================================================
 */

const { initializeDatabase, buyShopItem, getShopCatalog, rewardWinner, pool, getUserProfile, awardXP, getPlayerMissions, claimMissionReward, checkMissionsCompleted, getLevel, getRank, getOwnedItems, equipItem, claimDailyChest, getChestStatus, getPlayerTransactions } = require("./database");
const path      = require("path");
const http      = require("http");
const express   = require("express");
const WebSocket = require("ws");
const bcrypt    = require("bcrypt");
const { createCoinPurchase, handleStripeWebhook, getCoinPacks } = require("./paymentManager");
const { createCheckoutPreference, handleMPWebhook, getCoinPacks: getMPCoinPacks } = require("./paymentManagerMP");

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
  handleReconnect:  diceReconnect,
  snapshotMatch
} = require("./diceManager");

const { createPlayerState } = require("./matchState");
const { register, login, requireAuth, requestPasswordReset } = require("./authManager");

/* ── Express ─────────────────────────────────────────────── */
const app  = express();
const PORT = process.env.PORT || 3000;

// Rate limiting para endpoints de auth
const rateLimit = require("express-rate-limit");

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,                  // máximo 10 intentos
  message: { error: "Demasiados intentos. Esperá 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Demasiadas solicitudes. Esperá un momento." },
  standardHeaders: true,
  legacyHeaders: false
});

// Stripe Webhook necesita el body CRUDO (sin parsear) para verificar firma
// DEBE ir ANTES de express.json()
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  if (!sig) {
    return res.status(400).json({ error: "Firma faltante" });
  }
  
  try {
    const result = await handleStripeWebhook(req.body, sig, pool);
    res.json(result);
  } catch (err) {
    console.error("Stripe webhook error:", err);
    res.status(400).json({ error: err.message });
  }
});

// IMPORTANTÍSIMO: Para que Express pueda leer el req.body del login/registro
app.use(express.json()); 
app.use(express.static(path.join(__dirname, "../frontend")));

// Aplicar rate limiters a rutas sensibles
app.use("/api/login", authLimiter);
app.use("/api/register", authLimiter);
app.use("/api/forgot-password", authLimiter);
app.use("/api/reset-password", authLimiter);
app.use("/api", generalLimiter);

app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "../frontend/index.html"))
);

// Nuevas rutas de Autenticación
app.post("/api/register", register);
app.post("/api/login", login);

// Ruta de ranking AHORA PROTEGIDA con requireAuth
app.get("/ranking", requireAuth, async (req, res) => {
  try { res.json(await getTopRanking()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Ruta para obtener el catálogo de la tienda (incluye ownership)
app.get("/api/shop/catalog", requireAuth, async (req, res) => {
  try {
    const items = getShopCatalog();
    // Obtener items que ya posee el usuario
    const inv = await getOwnedItems(req.user.userId);
    const ownedIds = inv.owned.map(i => i.id);
    const equipped = inv.equipped;
    res.json({ items, ownedIds, equipped });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ruta para comprar en la tienda (PROTEGIDA)
app.post("/api/shop/buy", requireAuth, async (req, res) => {
  const { itemId } = req.body;
  const userId = req.user.userId; // Obtenido del token por requireAuth

  try {
    const result = await buyShopItem(userId, itemId);
    res.json({ message: "Compra exitosa", newBalance: result.newBalance });
  } catch (error) {
    console.error("Error en tienda:", error.message);
    res.status(400).json({ error: error.message || "Error al procesar la compra" });
  }
});

// Ruta para obtener el saldo actual del jugador
app.get("/api/user/balance", requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const result = await pool.query(
      "SELECT coins FROM players WHERE user_id = $1", 
      [userId]
    );
    
    if (result.rows.length > 0) {
      res.json({ coins: result.rows[0].coins });
    } else {
      res.status(404).json({ error: "Jugador no encontrado" });
    }
  } catch (err) {
    console.error("Error al consultar saldo:", err);
    res.status(500).json({ error: "Error al consultar saldo" });
  }
});

// ── PERFIL DE USUARIO ──────────────────────────────────────
app.get("/api/user/profile", requireAuth, async (req, res) => {
  try {
    const profile = await getUserProfile(req.user.userId);
    if (!profile) return res.status(404).json({ error: "Perfil no encontrado" });
    res.json(profile);
  } catch (err) {
    console.error("Error perfil:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── MISIONES ─────────────────────────────────────────────────
app.get("/api/user/missions", requireAuth, async (req, res) => {
  try {
    const playerId = req.user.playerId;
    const missions = await getPlayerMissions(playerId);
    res.json({ missions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── INVENTARIO ────────────────────────────────────────────
app.get("/api/user/inventory", requireAuth, async (req, res) => {
  try {
    const inventory = await getOwnedItems(req.user.userId);
    res.json(inventory);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/user/equip", requireAuth, async (req, res) => {
  try {
    const { itemId, category } = req.body; // category: 'avatar' | 'dice' | 'special'
    const player = await getUserProfile(req.user.userId);
    if (!player) throw new Error('Jugador no encontrado');
    const result = await equipItem(player.id, itemId, category);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── HISTORIAL DE TRANSACCIONES ──────────────────────────
app.get("/api/user/transactions", requireAuth, async (req, res) => {
  try {
    const profile = await getUserProfile(req.user.userId);
    if (!profile) return res.status(404).json({ error: "Perfil no encontrado" });
    const rows = await getPlayerTransactions(profile.id);
    res.json({ transactions: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── COFRE DIARIO ─────────────────────────────────────────
app.get("/api/user/chest-status", requireAuth, async (req, res) => {
  try {
    const status = await getChestStatus(req.user.userId);
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/user/claim-chest", requireAuth, async (req, res) => {
  try {
    const result = await claimDailyChest(req.user.userId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/user/missions/claim", requireAuth, async (req, res) => {
  try {
    const { missionId } = req.body;
    const playerId = req.user.playerId;
    const result = await claimMissionReward(playerId, missionId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── STRIPE ──────────────────────────────────────────────────

// Ruta para obtener paquetes de monedas (protegida)
app.get("/api/shop/packs", requireAuth, (req, res) => {
  res.json({ packs: getCoinPacks() });
});

// Ruta para crear intención de pago Stripe (protegida)
app.post("/api/shop/create-payment", requireAuth, async (req, res) => {
  const { packId } = req.body;
  const userId = req.user.userId;
  
  try {
    const result = await createCoinPurchase(packId, userId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Stripe webhook ya fue declarado arriba (antes de express.json())

// ── MERCADO PAGO ───────────────────────────────────────────

// Ruta para crear preferencia de pago MP
app.post("/api/mercadopago/create-preference", requireAuth, async (req, res) => {
  const { packId } = req.body;
  const userId = req.user.userId;
  const userEmail = req.user.username + "@player.com";

  try {
    const result = await createCheckoutPreference(packId, userId, userEmail);
    res.json(result);
  } catch (err) {
    console.error("Error MP preference:", err);
    res.status(400).json({ error: err.message });
  }
});

// Ruta para obtener paquetes MP
app.get("/api/mercadopago/packs", requireAuth, (req, res) => {
  res.json({ packs: getMPCoinPacks() });
});

// Webhook IPN de Mercado Pago
app.post("/api/mercadopago/webhook", async (req, res) => {
  const { id, topic } = req.query;
  const paymentId = id || req.body?.data?.id || req.body?.id;
  const paymentTopic = topic || req.body?.topic || req.body?.type;
  try {
    const result = await handleMPWebhook(paymentId, paymentTopic, pool);
    res.json(result);
  } catch (err) {
    console.error("MP webhook error:", err);
    res.status(400).json({ error: err.message });
  }
});

/* ── HTTP + WS ───────────────────────────────────────────── */
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

console.log("🎲 Iniciando Los 10.000 de Macko...");

const clients      = new Map(); // playerId → socket
const reconnTimers = new Map(); // playerId → timeoutId
const RECONN_MS    = 120_000;
const XP_PER_GAME   = 25;
const XP_PER_WIN    = 50;
const XP_PER_TOP3   = 15;

/* ── Helpers ─────────────────────────────────────────────── */
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
    
    // 💰 Sistema de recompensas: top 3 ganan monedas escalonadas
    // Ordenar jugadores por score descendente (el ganador ya está en match.winner)
    const sortedByScore = [...match.players].sort((a, b) => (b.score || 0) - (a.score || 0));
    
    // Premier al 1° con 500, 2° con 200, 3° con 100 monedas
    const rewards = [500, 200, 100];
    for (let i = 0; i < Math.min(sortedByScore.length, 3); i++) {
      const player = sortedByScore[i];
      const amount = rewards[i];
      if (amount > 0 && player.id) {
        // rewardWinner maneja la transacción con BEGIN/COMMIT, pero no podemos
        // usar transacción anidada. Llamamos una por una.
        try {
          await rewardWinner(player.id, amount);
          console.log(`💰 ${amount} monedas → ${player.name || player.id} (puesto ${i + 1})`);
        } catch (e) {
          console.error(`Error al premiar a ${player.id}:`, e.message);
        }
      }
    }
    
    // Dar XP base a todos los jugadores
    for (const p of match.players) {
      try { await awardXP(p.id, XP_PER_GAME); } catch(e) {}
    }
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

  const room = getRoom(roomId);
  if (room) {
    room.status = "waiting";
    for (const p of room.players) {
      p.ready   = false;
      p.score   = 0;
      p.entered = false;
    }
    setTimeout(() => {
      broadcastRoom(roomId, "PLAY_AGAIN", { room });
    }, 4000);
  }
}

/* ── Eliminar jugador definitivamente ────────────────────── */
function eliminatePlayer(roomId, playerId) {
  reconnTimers.delete(playerId);
  clients.delete(playerId);

  const match = getMatch(roomId);
  if (match) diceDisconnect(roomId, playerId, broadcastRoom);

  removePlayer(roomId, playerId);

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

/* ── Reconectar jugador a sala/partida ───────────────────── */
function doReconnect(socket, playerId, room, match) {
  const roomId = room.id;

  // Cancelar timer de eliminación
  if (reconnTimers.has(playerId)) {
    clearTimeout(reconnTimers.get(playerId));
    reconnTimers.delete(playerId);
  }

  clients.set(playerId, socket);
  socket.playerId = playerId;
  socket.roomId   = roomId;

  const player = room.players.find(p => p.id === playerId);
  if (player) {
    player.connected    = true;
    player.disconnected = false;
  }

  if (match) {
    diceReconnect(roomId, playerId);
    send(socket, "RECONNECTED", {
      room,
      match: snapshotMatch(match),
      playerId
    });
    broadcastRoom(roomId, "PLAYER_RECONNECTED", {
      playerId,
      playerName: player?.name || "",
      match: snapshotMatch(match)
    });
    console.log(`🔄 Reconectado a partida: ${playerId}`);
  } else {
    send(socket, "RECONNECTED_LOBBY", { room, playerId });
    broadcastRoomState(roomId);
    console.log(`🔄 Reconectado a lobby: ${playerId}`);
  }
}

/* ══════════════════════════════════════════════════════════
   CONEXIÓN WS
   ══════════════════════════════════════════════════════════ */
wss.on("connection", socket => {

  /* Ping/pong para detectar conexiones caídas */
  socket.isAlive = true;
  socket.on("pong", () => { socket.isAlive = true; });

  socket.on("message", async rawMsg => {
    try {
      const { type, data } = JSON.parse(rawMsg.toString());

      /* ── IDENTIFY ──────────────────────────────────────── */
      if (type === "IDENTIFY") {
        const { playerId, playerName, roomId } = data;

        socket.playerId = playerId;
        socket.roomId   = roomId || null;
        clients.set(playerId, socket);

        try {
          await createOrLoadPlayer({ id: playerId, alias: playerName, name: playerName });
        } catch (e) { console.error("DB identify:", e.message); }

        // Intentar reconectar si viene con roomId
        if (roomId) {
          const room  = getRoom(roomId);
          const match = getMatch(roomId);

          if (room) {
            const player = room.players.find(p => p.id === playerId);
            if (player) {
              doReconnect(socket, playerId, room, match || null);
              return;
            }
            // No está en la sala pero tiene roomId válido → mandarlo como identificado
            // para que el cliente sepa que puede intentar unirse
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

      /* ── ESTADO DE SALA ────────────────────────────────── */
      if (type === "GET_ROOM_STATE") {
        const room = getRoom(data.roomId);
        if (room) send(socket, "PLAY_AGAIN", { room });
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

        // Buscar si ya está en la sala (por playerId)
        const alreadyById = room.players.find(p => p.id === data.playerId);
        if (alreadyById) {
          // Ya está — reconectar
          const match = getMatch(room.id);
          doReconnect(socket, data.playerId, room, match || null);
          return;
        }

        // NUEVO FIX: buscar si hay un jugador con el mismo nombre desconectado
        // Si existe, reconectarlo en vez de crear uno nuevo
        const match = getMatch(room.id);
        const disconnectedSameName = room.players.find(p =>
          p.name.toLowerCase() === data.playerName.toLowerCase() &&
          p.disconnected === true
        );
        if (disconnectedSameName) {
          console.log(`🔄 Reconectando por nombre: ${data.playerName} → ${disconnectedSameName.id}`);
          // Actualizar el id del jugador al nuevo playerId del cliente
          const oldId = disconnectedSameName.id;
          disconnectedSameName.id        = data.playerId;
          disconnectedSameName.connected  = true;
          disconnectedSameName.disconnected = false;

          // Actualizar en el match también
          if (match) {
            const mp = match.players.find(p => p.id === oldId);
            if (mp) mp.id = data.playerId;
          }

          // Cancelar timer de eliminación del ID viejo
          if (reconnTimers.has(oldId)) {
            clearTimeout(reconnTimers.get(oldId));
            reconnTimers.delete(oldId);
            clients.delete(oldId);
          }

          doReconnect(socket, data.playerId, room, match || null);
          return;
        }

        if (room.players.length >= room.maxPlayers) {
          send(socket, "ERROR", { message: "La sala está llena" });
          return;
        }

        // Sala de espera: entrada normal
        if (room.status === "waiting") {
          const player = addPlayer(room.id, data.playerId, data.playerName);
          clients.set(data.playerId, socket);
          socket.playerId = data.playerId;
          socket.roomId   = room.id;
          send(socket, "JOIN_SUCCESS", { room, player });
          broadcastRoomState(room.id);
          return;
        }

        // Partida en curso: unirse como jugador nuevo
        if (room.status === "playing") {
          if (!match) {
            send(socket, "ERROR", { message: "No se encontró la partida activa" });
            return;
          }

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

          const playerState = createPlayerState(newPlayer);
          match.players.push(playerState);

          clients.set(data.playerId, socket);
          socket.playerId = data.playerId;
          socket.roomId   = room.id;

          send(socket, "JOINED_ACTIVE_GAME", {
            room,
            match:    snapshotMatch(match),
            playerId: data.playerId
          });

          broadcastRoom(room.id, "PLAYER_JOINED_GAME", {
            playerId:   data.playerId,
            playerName: data.playerName,
            match:      snapshotMatch(match)
          });
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
        // Incrementar contador de mensajes de chat para las misiones
        try { await pool.query("UPDATE players SET chat_messages = chat_messages + 1 WHERE id = $1", [data.playerId]); } catch(e) {}
        return;
      }

      /* ── AUDIO CHAT ──────────────────────────────────── */
      if (type === "CHAT_AUDIO") {
        // Reenviar el audio a todos en la sala (sin persistir)
        broadcastRoom(data.roomId, "CHAT_AUDIO", {
          playerId:   data.playerId,
          playerName: data.playerName,
          audioData:  String(data.audioData || "").slice(0, 300000), // ~300KB max
          duration:   Math.min(data.duration || 0, 30), // max 30s
          timestamp:  Date.now()
        });
        return;
      }

      /* ── SALIR DE PARTIDA ──────────────────────────────── */
      if (type === "LEAVE_GAME") {
        const { roomId, playerId } = data;
        const match = getMatch(roomId);
        if (!match) return;
        send(socket, "LEFT_GAME", { playerId });
        eliminatePlayer(roomId, playerId);
        socket.roomId = null;
        return;
      }

      /* ── SALIR DE SALA ─────────────────────────────────── */
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

      /* ── CANCELAR SALA ─────────────────────────────────── */
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

    console.log(`⚡ Desconectado: ${playerId} — gracia ${RECONN_MS/1000}s`);

    try { await registerDisconnect(playerId); } catch (e) {}

    // Marcar como desconectado (no eliminar aún)
    const room = getRoom(roomId);
    if (room) {
      const p = room.players.find(p => p.id === playerId);
      if (p) p.disconnected = true;
    }

    broadcastRoom(roomId, "PLAYER_DISCONNECTED", { playerId });

    // Si era su turno, avanzar para no bloquear
    const match = getMatch(roomId);
    if (match) {
      const cur = match.players[match.currentPlayerIndex];
      if (cur?.id === playerId) {
        diceDisconnect(roomId, playerId, broadcastRoom);
      }
    }

    // Timer de 2 minutos antes de eliminar definitivamente
    const timerId = setTimeout(() => {
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

/* ── Heartbeat: detectar sockets zombies ─────────────────── */
const heartbeat = setInterval(() => {
  wss.clients.forEach(socket => {
    if (!socket.isAlive) {
      socket.terminate();
      return;
    }
    socket.isAlive = false;
    socket.ping();
  });
}, 30000); // cada 30 segundos

wss.on("close", () => clearInterval(heartbeat));


// Solicitar recuperación
app.post("/api/forgot-password", requestPasswordReset);

// Cambiar la clave (se llama desde reset-password.html)
app.post("/api/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;
   
  
  // Vamos a buscar el usuario SOLAMENTE por el token, sin mirar la fecha.
  // Además, quitamos el espacio por si acaso.
  const query = "SELECT id, reset_expires, NOW() as hora_servidor FROM users WHERE reset_token = $1";
  const result = await pool.query(query, [token.trim()]);
  
  
  if (result.rows.length === 0) {
    return res.status(400).json({ error: "Token no existe en DB. Revisa si el token en la URL es el mismo que en la tabla." });
  }

  // Ahora comprobamos la fecha manualmente aquí
  const row = result.rows[0];
    
  if (new Date(row.reset_expires) < new Date(row.hora_servidor)) {
      return res.status(400).json({ error: "El token ya expiró." });
  }

  // Si llega aquí, actualizamos
  const hash = await bcrypt.hash(newPassword, 10);
  await pool.query("UPDATE users SET password_hash = $1, reset_token = NULL WHERE id = $2", [hash, row.id]);
  
  res.json({ message: "Contraseña actualizada" });
});

/* ── Init ────────────────────────────────────────────────── */
initializeDatabase();
server.listen(PORT, () => console.log(`🚀 Servidor en http://localhost:${PORT}`));
