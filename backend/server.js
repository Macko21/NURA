"use strict";
require("dotenv").config();
/**
 * ============================================================
 * LOS 10.000 DE MACKO — backend/server.js
 * ============================================================
 */

const { initializeDatabase, buyShopItem, getShopCatalog, rewardWinner, pool, getUserProfile, awardXP, getPlayerMissions, claimMissionReward, checkMissionsCompleted, getLevel, getRank, getOwnedItems, equipItem, claimDailyChest, getChestStatus, getPlayerTransactions, getBoostStatus, SHOP_CATALOG, getFriends, addFriend, removeFriend, searchPlayers, acceptFriendRequest, rejectFriendRequest, getPendingFriendRequests, saveGlobalMessage, getGlobalMessages, updateLastSeen, updateHideLastSeen, savePrivateMessage, getPrivateMessages, cleanupPortalChats, createAdmin, getAdminByUsername, banPlayer, suspendPlayer, unbanPlayer, checkIfBanned, saveFeedback, getFeedback, respondFeedback, deleteFeedback, getCeoStats, getAllUsers, adjustPlayerCoins, logAudit, getAuditLog, getAllAdmins, deleteAdmin, changeAdminPassword, updateAdminRole, getUsersPerDay, getTransactionsPerDay, getGamesPlayedPerDay, getRevenuePerDay, getLevelDistribution, getActivityHeatmap, getServerInfo, savePushSubscription, removePushSubscription, getAllPushSubscriptions, getPushSubscriptionsCount, savePlayerNotification, getPlayerNotifications, deletePlayerNotification, consumePlayerNotification, cleanupExpiredNotifications, getShopItemDetail, generateWeeklyReport, getShopItemsFromDB, createShopItem, updateShopItemDB, deleteShopItemDB, getShopStats, completeDailyChallenge } = require("./database");
const { initPush, isPushReady, getVapidPublicKey, sendPushNotification } = require("./pushManager");
const { initEmail, isEmailReady, sendReportEmail } = require("./emailManager");
const { canonicalDiceSkinId } = require("./cosmeticResolver");
const { resolveCeoSessionSecret } = require("./ceoAuth");
const path      = require("path");
const fs        = require("fs");
const crypto    = require("crypto");
const http      = require("http");
const express   = require("express");
const WebSocket = require("ws");
const bcrypt    = require("bcrypt");
const jwt       = require("jsonwebtoken");
const { paymentsEnabled, paidCompetitionEnabled, assertJoinAllowed, createAttemptLimiter } = require('./productionPolicy');
const allowRoomLookup = createAttemptLimiter();
const PRIVATE_JOIN_APPROVAL = Symbol('privateJoinApproval');
let databaseReady = false;
const { handleStripeWebhook, getCoinPacks } = require("./paymentManager");
const { createCheckoutPreference, handleMPWebhook, retryPendingPayments, getCoinPacks: getMPCoinPacks } = require("./paymentManagerMP");
const { verifyMPSignature } = require('./mpSignature');
const { migrateProduction, schemaVersion } = require('./productionMigrations');

const {
  rooms,
  createRoom, getRoom, getRoomByCode,
  addPlayer, removePlayer,
  setReady, allPlayersReady,
  startGame, getAutomaticWinner,
  startReadyCountdown, cancelReadyCountdown, hasReadyCountdown
} = require("./roomManager");

const {
  createOrLoadPlayer, recordMatchResults,
  registerStraight, registerFiveOnes,
  registerDisconnect, getTopRanking
} = require("./playerManager");

const {
  createMatch, startFirstTurnTimer, getMatch, destroyMatch,
  handleEntryRoll, handleRoll, handleBank,
  handleDisconnect: diceDisconnect,
  handleReconnect:  diceReconnect,
  snapshotMatch, addLatePlayer,
  setTurnCallback, removeTurnCallback
} = require("./diceManager");

const { createPlayerState, setWinner } = require("./matchState");
const { register, verifyRegistration, login, requireAuth, requestPasswordReset, createGuestSession, verifyGameToken } = require("./authManager");
const botManager = require("./botManager");
const botGameHandler = require("./botGameHandler");

const {
  initTournamentManager,
  getActiveTournamentsData,
  registerPlayer: registerTournamentPlayer,
  startTournament: startTournamentBracket,
  completeMatch: completeTournamentMatch,
  cleanupTournament: cleanupTournamentData,
  checkAndAutoStartTournaments,
  checkAndCreateScheduledTournaments,
  sendTournamentPushNotifications,
  setWsClients,
} = require("./tournamentManager");

/* ── Express ─────────────────────────────────────────────── */
const app  = express();
const PORT = process.env.PORT || 3000;
const NATIVE_APP_ORIGINS = new Set(['capacitor://localhost', 'https://localhost', 'http://localhost']);
const CEO_AUTH = resolveCeoSessionSecret();
const CEO_SECRET = CEO_AUTH.secret;
if (CEO_AUTH.source === 'JWT_SECRET_DERIVED') {
  console.warn('⚠ CEO_SECRET ausente o corto; sesiones CEO usan una clave aislada derivada de JWT_SECRET');
} else if (!CEO_SECRET) {
  console.error('❌ No existe una clave segura para las sesiones del panel CEO');
}
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && NATIVE_APP_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(204).end();
  }
  next();
});
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    const sendJson = res.json.bind(res);
    res.json = body => {
      if (res.statusCode >= 500 && body && typeof body === 'object' && 'error' in body) {
        return sendJson({ error: 'Error interno del servidor' });
      }
      return sendJson(body);
    };
  }
  next();
});
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), payment=(self)');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; '));
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// Rate limiting para endpoints de auth
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

const authAttemptKey = req => {
  const identifier = String(req.body?.identifier || '').trim().toLowerCase();
  const identifierHash = identifier
    ? crypto.createHash('sha256').update(identifier).digest('hex').slice(0, 16)
    : 'empty';
  return `${ipKeyGenerator(req.ip)}:${identifierHash}`;
};

// Sólo protege contraseñas: los accesos correctos no consumen intentos y
// jamás comparte contador con invitados, registro, recuperación o CEO.
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  keyGenerator: authAttemptKey,
  skipSuccessfulRequests: true,
  requestWasSuccessful: (_req, res) => ![400, 401].includes(res.statusCode),
  message: { error: "Demasiados intentos de contraseña fallidos. Esperá 5 minutos." },
  standardHeaders: true,
  legacyHeaders: false
});

const guestSessionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: "Demasiadas sesiones nuevas. Esperá un minuto." },
  standardHeaders: true,
  legacyHeaders: false
});

const accountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Demasiadas solicitudes de cuenta. Esperá unos minutos." },
  standardHeaders: true,
  legacyHeaders: false
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  skip: req => req.path === '/version',
  message: { error: "Demasiadas solicitudes. Esperá un momento." },
  standardHeaders: true,
  legacyHeaders: false
});

// Limitadores específicos para endpoints sensibles
const shopBuyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: "Demasiadas compras. Esperá 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false
});

const feedbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Demasiados mensajes de feedback. Esperá 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false
});

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Demasiados intentos de pago. Esperá 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false
});

const equipLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: "Demasiados cambios de equipamiento. Esperá 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false
});

const tournamentRegLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Demasiadas inscripciones a torneos. Esperá 15 minutos." },
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
    res.status(400).json({ error: "Webhook de Stripe inválido" });
  }
});

// IMPORTANTÍSIMO: Para que Express pueda leer el req.body del login/registro
app.use(express.json()); 
app.use(express.static(path.join(__dirname, "../frontend")));
app.get('/vendor/three.module.js', (req, res) => {
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.sendFile(path.join(__dirname, '../node_modules/three/build/three.module.min.js'));
});
app.get('/vendor/three.core.min.js', (req, res) => {
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.sendFile(path.join(__dirname, '../node_modules/three/build/three.core.min.js'));
});
app.get('/vendor/RoundedBoxGeometry.js', (req, res) => {
  const addonPath = path.join(__dirname, '../node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js');
  const source = fs.readFileSync(addonPath, 'utf8').replace("from 'three';", "from '/vendor/three.module.js';");
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.type('application/javascript').send(source);
});
// Aplicar rate limiters a rutas sensibles
app.use("/api/login", loginLimiter);
app.use("/api/register", accountLimiter);
app.use("/api/guest-session", guestSessionLimiter);
app.use("/api/forgot-password", accountLimiter);
app.use("/api/reset-password", accountLimiter);
app.use("/ceo-panel/api/login", accountLimiter);
app.use("/api", generalLimiter);
// Aplicar limitadores específicos a rutas sensibles
app.use("/api/shop/buy", shopBuyLimiter);
app.use("/api/shop/create-payment", paymentLimiter);
app.use("/api/mercadopago/create-preference", paymentLimiter);
app.use("/api/feedback", feedbackLimiter);
app.use("/api/user/equip", equipLimiter);
app.use("/api/user/claim-chest", equipLimiter);
app.use("/api/user/missions/claim", equipLimiter);
app.use("/api/tournaments/:id/register", tournamentRegLimiter);
app.use("/api/tournaments/:id/unregister", tournamentRegLimiter);

app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "../frontend/index.html"))
);

// Favicon — evitar 404
app.get("/favicon.ico", (req, res) => res.status(204).end());

// Nuevas rutas de Autenticación
app.post("/api/register", register);
app.post("/api/register/verify", verifyRegistration);
app.post("/api/login", login);
app.post("/api/guest-session", createGuestSession);

// Ruta de ranking AHORA PROTEGIDA con requireAuth
app.get("/ranking", requireAuth, async (req, res) => {
  try { res.json(await getTopRanking()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Ruta para obtener el catálogo de la tienda (incluye ownership)
app.get("/api/shop/catalog", async (req, res) => {
  try {
    const items = await getShopCatalog();
    let inv = { owned: [], equipped: {} };
    let boosts = {};
    // El catálogo y sus precios no son secretos. La propiedad/equipamiento se
    // obtiene por endpoints autenticados; así los invitados pueden navegar sin
    // debilitar la validación de cuenta del resto de la API.
    const ownedIds = inv.owned.map(i => i.id);
    const equipped = inv.equipped;
    res.json({ items, ownedIds, equipped, boosts });
  } catch (err) {
    console.error("Shop catalog error:", err);
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

app.post("/api/user/hide-last-seen", requireAuth, async (req, res) => {
  try {
    const { hide } = req.body;
    if (typeof hide !== 'boolean') return res.status(400).json({ error: 'Valor inválido' });
    const playerId = req.user.playerId;
    const result = await updateHideLastSeen(playerId, hide);
    res.json(result);
  } catch (err) {
    console.error("Error hide-last-seen:", err);
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
    console.error("Equip item:", err.message);
    res.status(400).json({ error: err.message || "No se pudo equipar el item" });
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

// ── BOOST +50% MONEDAS ──────────────────────────────────
app.get("/api/user/boost-status", requireAuth, async (req, res) => {
  try {
    const player = await getUserProfile(req.user.userId);
    if (!player) return res.json({ active: false, remaining: 0 });
    const status = await getBoostStatus(player.id);
    res.json(status);
  } catch (err) {
    res.json({ active: false, remaining: 0 });
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

// ── AMIGOS ────────────────────────────────────────────────────
app.get("/api/friends", requireAuth, async (req, res) => {
  try {
    const friends = await getFriends(req.user.playerId);
    // Agregar is_online desde el server (WebSocket activo en clients Map)
    const friendsWithStatus = friends.map(f => ({
      ...f,
      equipped_avatar: resolveAvatarIcon(f.equipped_avatar) || '👤',
      is_online: clients.has(f.id) && clients.get(f.id)?.readyState === WebSocket.OPEN
    }));
    res.json({ friends: friendsWithStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/friends/add", requireAuth, async (req, res) => {
  try {
    const { friendId } = req.body;
    const result = await addFriend(req.user.playerId, friendId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/friends/remove", requireAuth, async (req, res) => {
  try {
    const { friendId } = req.body;
    await removeFriend(req.user.playerId, friendId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/friends/search", requireAuth, async (req, res) => {
  try {
    const q = req.query.q || '';
    if (q.length < 2) return res.json({ players: [] });
    const players = await searchPlayers(q, req.user.playerId);
    res.json({ players });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SOLICITUDES DE AMISTAD ────────────────────────────────────
app.get("/api/friends/pending", requireAuth, async (req, res) => {
  try {
    const requests = await getPendingFriendRequests(req.user.playerId);
    res.json({ requests });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/friends/accept", requireAuth, async (req, res) => {
  try {
    const { requestId } = req.body;
    await acceptFriendRequest(requestId, req.user.playerId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/friends/reject", requireAuth, async (req, res) => {
  try {
    const { requestId } = req.body;
    await rejectFriendRequest(requestId, req.user.playerId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── INVITACIONES A PARTIDA ────────────────────────────────────
app.post("/api/games/invite", requireAuth, async (req, res) => {
  try {
    const { targetPlayerId, roomId } = req.body;
    if (!targetPlayerId || !roomId) return res.status(400).json({ error: 'Faltan datos' });
    const room = rooms.get(roomId);
    if (!room) return res.status(404).json({ error: 'Sala no encontrada' });
    if (!room.players.some(player => player.id === req.user.playerId)) {
      return res.status(403).json({ error: 'No pertenecés a esta sala' });
    }
    const targetExists = await pool.query(
      `SELECT 1 FROM players WHERE id = $1 AND user_id IS NOT NULL`,
      [targetPlayerId]
    );
    if (!targetExists.rows.length) return res.status(404).json({ error: 'Jugador no encontrado' });
    // Enviar notificación WebSocket al jugador objetivo
    const targetSock = clients.get(targetPlayerId);
    const fromPlayer = await getUserProfile(req.user.userId);
    const inviterName = fromPlayer?.alias || req.user.username;
    const inviteId = crypto.randomUUID();
    const inviteData = {
      inviteId,
      fromId: req.user.playerId,
      fromName: inviterName,
      fromAvatar: resolveAvatarIcon(fromPlayer?.equipped_avatar) || '👤',
      roomId: room.id,
      roomCode: room.code,
      playerCount: room.players.length,
      maxPlayers: room.maxPlayers
    };
    await savePlayerNotification(targetPlayerId, {
      id: inviteId,
      type: 'game_invite',
      title: `${inviterName} te invitó a jugar`,
      message: `Unite a la partida (${room.players.length}/${room.maxPlayers} jugadores)`,
      data: inviteData
    });
    if (targetSock && targetSock.readyState === WebSocket.OPEN) {
      send(targetSock, 'GAME_INVITE', inviteData);
      res.json({ success: true, sent: true });
    } else if (isPushReady()) {
      // Jugador no conectado — enviar push notification con datos de invitación
      let pushSent = false;
      try {
        const subRes = await pool.query(
          `SELECT subscription FROM push_subscriptions WHERE player_id = $1`,
          [targetPlayerId]
        );
        if (subRes.rows[0]) {
          const sub = typeof subRes.rows[0].subscription === 'string'
            ? JSON.parse(subRes.rows[0].subscription)
            : subRes.rows[0].subscription;
          await sendPushNotification(
            sub,
            `🎮 ${inviterName} te invitó a jugar`,
            `Unite a la partida (${room.players.length}/${room.maxPlayers} jugadores)`,
            '/',
            { action: 'game_invite', ...inviteData }
          );
          pushSent = true;
        }
      } catch(e) {
        console.error('Error sending push invite:', e.message);
      }
      res.json({ success: true, sent: false, offline: true, pushSent });
    } else {
      res.json({ success: true, sent: false, offline: true });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CHAT GLOBAL ──────────────────────────────────────────────
app.get("/api/global-chat", requireAuth, async (req, res) => {
  try {
    const messages = await getGlobalMessages(30);
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── NOTIFICACIONES RECIENTES (broadcasts del CEO) ────────────
app.get("/api/notifications", requireAuth, async (req, res) => {
  try {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const [personal, broadcastsRes] = await Promise.all([
      getPlayerNotifications(req.user.playerId, 50),
      pool.query(`
        SELECT id, message, created_at FROM global_chat
        WHERE player_id = 'ceo' AND created_at >= $1
        ORDER BY created_at DESC LIMIT 20
      `, [cutoff])
    ]);
    const broadcasts = broadcastsRes.rows.map(row => ({
      id: `ceo-${row.id}`,
      type: 'broadcast',
      title: 'Anuncio',
      message: row.message,
      data: {},
      created_at: row.created_at,
      expires_at: Number(row.created_at) + 24 * 60 * 60 * 1000
    }));
    res.json({ notifications: [...personal, ...broadcasts].sort((a, b) => Number(b.created_at) - Number(a.created_at)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/notifications/:id", requireAuth, async (req, res) => {
  try {
    await deletePlayerNotification(req.user.playerId, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PARTIDAS ACTIVAS ────────────────────────────────────────
app.get("/api/games/active", requireAuth, async (req, res) => {
  try {
    const activeGames = [];
    for (const [id, room] of rooms) {
      const match = getMatch(id);
      // Las salas privadas solo se descubren mediante una invitación dirigida.
      // No se publica ni su UUID interno ni su lista de participantes.
      if (room.private || room.status !== "playing" || match?.status !== "playing" || !room.players.length) continue;
      activeGames.push({
        roomId: id,
        code: room.code,
        private: false,
        isBotGame: !!room.isBotGame,
        status: room.status,
        players: room.players.map(p => ({ id: p.id, name: p.name })),
        playerCount: room.players.length,
        maxPlayers: room.maxPlayers
      });
    }
    res.json({ games: activeGames });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── TORNEOS ────────────────────────────────────────────────────
app.get("/api/tournaments", requireAuth, async (req, res) => {
  try {
    const { getPublicTournaments } = require("./database");
    const allTourneys = await getPublicTournaments(20);
    
    // Agregar is_registered para cada torneo según el jugador actual
    const playerId = req.user.playerId || req.user.username;
    const regRes = await pool.query(
      `SELECT tournament_id FROM tournament_participants WHERE player_id = $1`,
      [playerId]
    );
    const registeredIds = new Set(regRes.rows.map(r => String(r.tournament_id)));
    const tourneysWithReg = allTourneys.map(t => ({
      ...t,
      is_registered: registeredIds.has(String(t.id))
    }));
    
    res.set('Cache-Control', 'no-store');
    res.json({ tournaments: tourneysWithReg });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PRÓXIMO TORNEO PROGRAMADO (debe ir ANTES de /:id) ────
app.get("/api/tournaments/next", requireAuth, async (req, res) => {
  try {
    const { getActiveTournaments } = require("./database");
    const all = await getActiveTournaments();
    const now = Date.now();
    const upcoming = all
      .filter(t => t.status === 'registration' && t.start_time > now && Number(t.registration_until || t.start_time) > now)
      .sort((a, b) => parseInt(a.start_time) - parseInt(b.start_time));
    const next = upcoming[0] || null;
    res.json({ next, upcoming: upcoming.slice(0, 5) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/tournaments/:id(\\d+)", requireAuth, async (req, res) => {
  try {
    const { getTournamentBracketData } = require("./database");
    const bracket = await getTournamentBracketData(req.params.id);
    if (!bracket) return res.status(404).json({ error: "Torneo no encontrado" });
    res.json(bracket);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/tournaments/:id/register", requireAuth, async (req, res) => {
  try {
    const playerId = req.user.playerId || req.user.username;
    const playerName = req.user.username;
    const result = await registerTournamentPlayer(req.params.id, playerId, playerName);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/tournaments/:id/unregister", requireAuth, async (req, res) => {
  try {
    const { unregisterFromTournament } = require("./database");
    const playerId = req.user.playerId || req.user.username;
    await unregisterFromTournament(req.params.id, playerId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/tournaments/:id/participants", requireAuth, async (req, res) => {
  try {
    const { getTournamentParticipants } = require("./database");
    const participants = await getTournamentParticipants(req.params.id);
    res.json({ participants });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/tournaments/:id/bracket", requireAuth, async (req, res) => {
  try {
    const { getTournamentBracketData } = require("./database");
    const bracket = await getTournamentBracketData(req.params.id);
    res.json(bracket || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/tournaments/history", requireAuth, async (req, res) => {
  try {
    const { getTournamentHistoryByPlayer } = require("./database");
    const playerId = req.user.playerId || req.user.username;
    const history = await getTournamentHistoryByPlayer(playerId, 10);
    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DESAFÍO DIARIO ────────────────────────────────────────────

app.get("/api/daily-challenge", requireAuth, async (req, res) => {
  try {
    const { ensureTodayChallenge, getDailyPlayerScore } = require("./database");
    const challenge = await ensureTodayChallenge();
    const playerId = req.user.playerId || req.user.username;
    const myScore = await getDailyPlayerScore(playerId);
    res.json({ challenge, myScore });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/daily-challenge/leaderboard", requireAuth, async (req, res) => {
  try {
    const { getDailyLeaderboard } = require("./database");
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const leaderboard = await getDailyLeaderboard(limit);
    res.json({ leaderboard });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/daily-challenge/submit", requireAuth, async (req, res) => {
  res.status(410).json({ error: 'El resultado se confirma automáticamente al terminar la partida' });
});

// ── VERSIÓN Y CHANGELOG ──────────────────────────────────────
// Cache de la versión (se actualiza al reiniciar el server)
let _versionCache = null;
app.get("/api/version", (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    if (!_versionCache) {
      const versionData = require(path.join(__dirname, "../frontend/version.js"));
      _versionCache = { version: versionData.GAME_VERSION, changelog: versionData.CHANGELOG };
    }
    res.json({ ..._versionCache, build: process.env.RENDER_GIT_COMMIT || process.env.BUILD_SHA || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CEO PANEL — TORNEOS ─────────────────────────────────
app.get("/ceo-panel/api/tournaments", requireCeoAuth, requireCeoRole('editor'), async (req, res) => {
  try {
    const { getTournaments, getTournamentStats } = require("./database");
    const [tournaments, stats] = await Promise.all([
      getTournaments(50),
      getTournamentStats()
    ]);
    res.json({ tournaments, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/ceo-panel/api/tournaments/create", requireCeoAuth, requireCeoRole('admin'), async (req, res) => {
  try {
    const { createTournament } = require("./database");
    const { SCHEDULE_INTERVALS_MS } = require("./tournamentRules");
    const { name, description, maxPlayers, fee, prizes, startTime, registrationUntil, isScheduled, scheduleInterval } = req.body;
    if (!name || !maxPlayers || !startTime) {
      return res.status(400).json({ error: 'Nombre, maxPlayers y startTime requeridos' });
    }
    if (isScheduled && !SCHEDULE_INTERVALS_MS[scheduleInterval]) {
      return res.status(400).json({ error: 'Frecuencia de torneo no válida' });
    }
    const tourney = await createTournament(
      name, description, maxPlayers, fee || 0, prizes || [],
      new Date(startTime).getTime(),
      registrationUntil ? new Date(registrationUntil).getTime() : null,
      req.admin.username
    );
    // Si es torneo programado/recurrente, marcar en DB
    if (isScheduled && scheduleInterval) {
      try {
        await pool.query(
          `UPDATE tournaments SET is_scheduled = TRUE, schedule_interval = $1 WHERE id = $2`,
          [scheduleInterval, tourney.id]
        );
      } catch(e) { console.error('Error marking scheduled tournament:', e.message); }
    }
    logAudit(req.admin.username, 'tournament_create', String(tourney.id), `${name} (${maxPlayers} players, fee: ${fee || 0})${isScheduled ? ' scheduled:'+scheduleInterval : ''}`).catch(e => {});
    res.json({ tournament: tourney });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/ceo-panel/api/tournaments/:id/start", requireCeoAuth, requireCeoRole('admin'), async (req, res) => {
  try {
    const result = await startTournamentBracket(req.params.id);
    logAudit(req.admin.username, 'tournament_start', req.params.id, 'Bracket generado').catch(e => {});
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/ceo-panel/api/tournaments/:id/cancel", requireCeoAuth, requireCeoRole('admin'), async (req, res) => {
  try {
    const { cancelTournament } = require("./database");
    await cancelTournament(req.params.id);
    cleanupTournamentData(req.params.id);
    logAudit(req.admin.username, 'tournament_cancel', req.params.id, 'Cancelado').catch(e => {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/ceo-panel/api/tournaments/:id/advance", requireCeoAuth, requireCeoRole('editor'), async (req, res) => {
  try {
    const { matchId, winnerId, p1Score, p2Score } = req.body;
    if (!matchId || !winnerId) return res.status(400).json({ error: 'matchId y winnerId requeridos' });
    const result = await completeTournamentMatch(
      req.params.id, matchId, winnerId, p1Score || 0, p2Score || 0,
      clients, send
    );
    logAudit(req.admin.username, 'tournament_advance', String(matchId), `winner: ${winnerId}`).catch(e => {});
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/ceo-panel/api/tournaments/:id/bracket", requireCeoAuth, requireCeoRole('viewer'), async (req, res) => {
  try {
    const { getTournamentBracketData } = require("./database");
    const bracket = await getTournamentBracketData(req.params.id);
    res.json(bracket || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CEO: Enviar notificación push a participantes de un torneo (editor+) ──
app.post("/ceo-panel/api/tournaments/:id/push", requireCeoAuth, requireCeoRole('editor'), async (req, res) => {
  try {
    const { title, body, url } = req.body;
    if (!title || !body) return res.status(400).json({ error: 'title y body requeridos' });
    
    const { getTournamentById } = require("./database");
    const tournament = await getTournamentById(req.params.id);
    if (!tournament) return res.status(404).json({ error: 'Torneo no encontrado' });
    
    const result = await sendTournamentPushNotifications(
      req.params.id,
      tournament.name,
      String(title).slice(0, 120),
      String(body).slice(0, 250),
      url || '/'
    );
    
    logAudit(req.admin.username, 'push_tournament', String(req.params.id), 
      `Torneo: ${tournament.name} · sent: ${result.sent} failed: ${result.failed}`).catch(e => {});
    
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── FEEDBACK (público, requiere auth) ──────────────────────
app.post("/api/feedback", requireAuth, async (req, res) => {
  try {
    const { category, message } = req.body;
    if (!category || !message) return res.status(400).json({ error: 'Categoría y mensaje requeridos' });
    const validCategories = ['sugerencia', 'bug', 'otro'];
    if (!validCategories.includes(category)) return res.status(400).json({ error: 'Categoría inválida' });
    const safeMessage = String(message).trim();
    if (!safeMessage || safeMessage.length > 2000) return res.status(400).json({ error: 'El mensaje debe tener entre 1 y 2000 caracteres' });
    await saveFeedback(req.user.playerId, req.user.username, category, safeMessage);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// CEO PANEL — RUTAS PROTEGIDAS
// ════════════════════════════════════════════════════════════

// Middleware de autenticación para CEO panel
async function requireCeoAuth(req, res, next) {
  if (!CEO_SECRET) return res.status(503).json({ error: 'Panel administrativo no configurado' });
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, CEO_SECRET, { algorithms: ['HS256'] });
    const admin = await getAdminByUsername(decoded.username);
    if (!admin || Number(admin.session_version || 0) !== Number(decoded.sessionVersion || 0)) {
      return res.status(401).json({ error: 'Token inválido' });
    }
    req.admin = admin;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

// Servir HTML del CEO panel
app.get("/ceo-panel", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/ceo-panel.html"));
});

// Historial detallado exclusivo del panel CEO. El endpoint público conserva
// notas breves, mientras que este reemplaza la versión actual con el detalle operativo.
app.get("/ceo-panel/api/version", requireCeoAuth, (req, res) => {
  try {
    const versionData = require(path.join(__dirname, "../frontend/version.js"));
    const ceoDetails = require("./ceoChangelog");
    const changelog = versionData.CHANGELOG.map(entry => (
      ceoDetails[entry.version] ? { ...entry, ...ceoDetails[entry.version] } : entry
    ));
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({ version: versionData.GAME_VERSION, changelog });
  } catch (err) {
    console.error('CEO changelog:', err.message);
    res.status(500).json({ error: 'No se pudo cargar el historial' });
  }
});

// Login del CEO panel
app.post("/ceo-panel/api/login", async (req, res) => {
  try {
    if (!CEO_SECRET) return res.status(503).json({ error: 'Panel administrativo no configurado' });
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Credenciales requeridas' });
    const admin = await getAdminByUsername(username);
    if (!admin) return res.status(401).json({ error: 'Credenciales inválidas' });
    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) return res.status(401).json({ error: 'Credenciales inválidas' });
    // Token JWT con expiración de 24h
    const token = jwt.sign(
      { username: admin.username, role: admin.role, id: admin.id, sessionVersion: Number(admin.session_version) || 0 },
      CEO_SECRET,
      { algorithm: 'HS256', expiresIn: '8h' }
    );
    res.json({ token, username: admin.username, role: admin.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Middleware de permisos por rol (viewer < editor < admin)
function requireCeoRole(minRole) {
  return (req, res, next) => {
    const hierarchy = { viewer: 0, editor: 1, admin: 2 };
    const userLevel = hierarchy[req.admin?.role] ?? -1;
    const needed = hierarchy[minRole] ?? 99;
    if (userLevel < needed) {
      return res.status(403).json({ error: 'No tenés permisos para esta accion' });
    }
    next();
  };
}

// Stats del CEO panel (viewer+)
app.get("/ceo-panel/api/stats", requireCeoAuth, requireCeoRole('viewer'), async (req, res) => {
  try {
    const stats = await getCeoStats();
    // Agregar salas activas
    stats.activeRooms = rooms.size;
    stats.activeMatches = 0;
    for (const [, room] of rooms) {
      if (room.status === 'playing') stats.activeMatches++;
    }
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Listar usuarios (viewer+)
app.get("/ceo-panel/api/users", requireCeoAuth, requireCeoRole('viewer'), async (req, res) => {
  try {
    const users = await getAllUsers(200);
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Banear usuario (editor+)
app.post("/ceo-panel/api/users/ban", requireCeoAuth, requireCeoRole('editor'), async (req, res) => {
  try {
    const { userId } = req.body;
    await banPlayer(userId);
    logAudit(req.admin.username, 'ban', userId, 'Permanente').catch(e => {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Suspender usuario (editor+)
app.post("/ceo-panel/api/users/suspend", requireCeoAuth, requireCeoRole('editor'), async (req, res) => {
  try {
    const { userId, hours } = req.body;
    const result = await suspendPlayer(userId, hours || 24);
    logAudit(req.admin.username, 'suspend', userId, `${hours || 24}h`).catch(e => {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Desbanear usuario (editor+)
app.post("/ceo-panel/api/users/unban", requireCeoAuth, requireCeoRole('editor'), async (req, res) => {
  try {
    const { userId } = req.body;
    await unbanPlayer(userId);
    logAudit(req.admin.username, 'unban', userId, '').catch(e => {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener feedback (viewer+)
app.get("/ceo-panel/api/feedback", requireCeoAuth, requireCeoRole('viewer'), async (req, res) => {
  try {
    const feedback = await getFeedback(100);
    res.json({ feedback });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Partidas activas (viewer+)
app.get("/ceo-panel/api/games/active", requireCeoAuth, requireCeoRole('viewer'), async (req, res) => {
  try {
    const activeGames = [];
    for (const [id, room] of rooms) {
      if (room.players.length === 0) continue; // filtrar salas vacías
      activeGames.push({
        roomId: id,
        code: room.code,
        status: room.status,
        players: room.players.map(p => ({ id: p.id, name: p.name })),
        playerCount: room.players.length,
        maxPlayers: room.maxPlayers
      });
    }
    res.json({ games: activeGames });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Transacciones de un usuario (editor+)
app.get("/ceo-panel/api/users/:id/transactions", requireCeoAuth, requireCeoRole('editor'), async (req, res) => {
  try {
    const { id } = req.params;
    // Buscar primero como playerId, luego como userId
    let rows = await getPlayerTransactions(id, 50);
    if (!rows.length) {
      // Intentar buscar el player por userId
      const player = await pool.query(`SELECT id FROM players WHERE user_id = $1`, [id]);
      if (player.rows[0]) {
        rows = await getPlayerTransactions(player.rows[0].id, 50);
      }
    }
    res.json({ transactions: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ajustar monedas de un usuario (editor+)
app.post("/ceo-panel/api/users/adjust-coins", requireCeoAuth, requireCeoRole('editor'), async (req, res) => {
  try {
    let { playerId, amount, reason } = req.body;
    if (!playerId || !amount) return res.status(400).json({ error: 'playerId y amount requeridos' });
    amount = Number(amount);
    if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > 1_000_000) {
      return res.status(400).json({ error: 'Monto inválido' });
    }
    // Si se envió un userId (UUID) en lugar de playerId, resolver el player
    if (playerId.includes('-')) {
      const plRes = await pool.query(`SELECT id FROM players WHERE user_id = $1`, [playerId]);
      if (plRes.rows[0]) playerId = plRes.rows[0].id;
    }
    const result = await adjustPlayerCoins(String(playerId), amount, String(reason || 'Ajuste manual CEO').slice(0, 200));
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Resetear contraseña de usuario regular (editor+)
app.post("/ceo-panel/api/users/reset-password", requireCeoAuth, requireCeoRole('editor'), async (req, res) => {
  try {
    const { userId, newPassword } = req.body;
    if (!userId || !newPassword) return res.status(400).json({ error: 'userId y newPassword requeridos' });
    if (newPassword.length < 10 || newPassword.length > 128) return res.status(400).json({ error: 'La contraseña debe tener entre 10 y 128 caracteres' });
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query(`UPDATE users SET password_hash = $1, session_version = session_version + 1 WHERE id = $2`, [hash, userId]);
    logAudit(req.admin.username, 'reset_user_password', userId, 'Contraseña reseteada por admin').catch(e => {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Broadcast global (editor+)
app.post("/ceo-panel/api/broadcast", requireCeoAuth, requireCeoRole('editor'), async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Mensaje requerido' });
    const safeMsg = String(message).slice(0, 500);
    let sent = 0;
    for (const [pid, sock] of clients) {
      if (sock?.readyState === WebSocket.OPEN) {
        send(sock, "BROADCAST", {
          message: safeMsg,
          timestamp: Date.now()
        });
        sent++;
      }
    }
    // También guardar en global_chat como mensaje del sistema
    saveGlobalMessage('ceo', '👑 CEO', safeMsg).catch(e => {});
    // Audit log
    logAudit(req.admin.username, 'broadcast', null, safeMsg).catch(e => {});
    res.json({ success: true, sent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── AUDIT LOG (viewer+) ─────────────────────────────────────
app.get("/ceo-panel/api/audit-log", requireCeoAuth, requireCeoRole('viewer'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const logs = await getAuditLog(limit);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CAMBIAR CONTRASEÑA DE OTRO ADMIN (admin only) ───────────
app.post("/ceo-panel/api/admins/change-password/:adminId", requireCeoAuth, requireCeoRole('admin'), async (req, res) => {
  try {
    const { adminId } = req.params;
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 14 || newPassword.length > 128) {
      return res.status(400).json({ error: 'La contraseña debe tener entre 14 y 128 caracteres' });
    }
    // Buscar el admin por ID
    const adminRes = await pool.query(`SELECT username FROM admins WHERE id = $1`, [adminId]);
    if (!adminRes.rows[0]) return res.status(404).json({ error: 'Admin no encontrado' });
    if (String(adminRes.rows[0].username) === String(req.admin.username)) {
      return res.status(400).json({ error: 'Usá "Cambiar mi contraseña" para cambiarte a vos mismo' });
    }
    const newHash = await bcrypt.hash(newPassword, 12);
    await changeAdminPassword(adminRes.rows[0].username, newHash);
    logAudit(req.admin.username, 'admin_change_password', adminRes.rows[0].username, 'Contraseña reseteada por otro admin').catch(e => {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ADMINS (admin only) ──────────────────────────────────────
app.get("/ceo-panel/api/admins", requireCeoAuth, requireCeoRole('admin'), async (req, res) => {
  try {
    const admins = await getAllAdmins();
    res.json({ admins });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/ceo-panel/api/admins/create", requireCeoAuth, requireCeoRole('admin'), async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    if (!/^[A-Za-z][A-Za-z0-9_.-]{2,31}$/.test(username)) return res.status(400).json({ error: 'Usuario administrativo inválido' });
    if (password.length < 14 || password.length > 128) return res.status(400).json({ error: 'Contraseña debe tener entre 14 y 128 caracteres' });
    const safeRole = ['viewer', 'editor', 'admin'].includes(role) ? role : 'editor';
    const hash = await bcrypt.hash(password, 12);
    await createAdmin(username, hash, safeRole);
    logAudit(req.admin.username, 'admin_create', username, `rol: ${safeRole}`).catch(e => {});
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/ceo-panel/api/admins/role", requireCeoAuth, requireCeoRole('admin'), async (req, res) => {
  try {
    const { adminId, role } = req.body;
    if (!adminId || !role) return res.status(400).json({ error: 'adminId y role requeridos' });
    if (!['viewer', 'editor', 'admin'].includes(role)) return res.status(400).json({ error: 'Rol inválido' });
    if (String(req.admin.id) === String(adminId)) {
      return res.status(400).json({ error: 'No podés cambiar tu propio rol' });
    }
    await updateAdminRole(adminId, role);
    logAudit(req.admin.username, 'admin_change_role', String(adminId), `nuevo rol: ${role}`).catch(e => {});
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/ceo-panel/api/admins/delete", requireCeoAuth, requireCeoRole('admin'), async (req, res) => {
  try {
    const { adminId } = req.body;
    if (!adminId) return res.status(400).json({ error: 'adminId requerido' });
    if (String(req.admin.id) === String(adminId)) {
      return res.status(400).json({ error: 'No podés eliminar tu propio usuario' });
    }
    await deleteAdmin(adminId);
    logAudit(req.admin.username, 'admin_delete', String(adminId), '').catch(e => {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/ceo-panel/api/admins/change-password", requireCeoAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Contraseñas requeridas' });
    if (newPassword.length < 14 || newPassword.length > 128) return res.status(400).json({ error: 'Nueva contraseña debe tener entre 14 y 128 caracteres' });
    const admin = await getAdminByUsername(req.admin.username);
    const match = await bcrypt.compare(currentPassword, admin.password_hash);
    if (!match) return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    const newHash = await bcrypt.hash(newPassword, 12);
    await changeAdminPassword(req.admin.username, newHash);
    logAudit(req.admin.username, 'admin_change_password', req.admin.username, '').catch(e => {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ANALYTICS (viewer+) ────────────────────────────────────
app.get("/ceo-panel/api/analytics/users", requireCeoAuth, requireCeoRole('viewer'), async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const data = await getUsersPerDay(days);
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/ceo-panel/api/analytics/transactions", requireCeoAuth, requireCeoRole('viewer'), async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const data = await getTransactionsPerDay(days);
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/ceo-panel/api/analytics/games", requireCeoAuth, requireCeoRole('viewer'), async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const data = await getGamesPlayedPerDay(days);
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/ceo-panel/api/analytics/revenue", requireCeoAuth, requireCeoRole('viewer'), async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const data = await getRevenuePerDay(days);
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/ceo-panel/api/analytics/levels", requireCeoAuth, requireCeoRole('viewer'), async (req, res) => {
  try {
    const data = await getLevelDistribution();
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/ceo-panel/api/analytics/heatmap", requireCeoAuth, requireCeoRole('viewer'), async (req, res) => {
  try {
    const data = await getActivityHeatmap();
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/ceo-panel/api/analytics/shop", requireCeoAuth, requireCeoRole('viewer'), async (req, res) => {
  try {
    const data = await getShopStats();
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── FEEDBACK MANAGEMENT (editor+) ──────────────────────────
app.post("/ceo-panel/api/feedback/:id/respond", requireCeoAuth, requireCeoRole('editor'), async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Mensaje requerido' });
    const result = await respondFeedback(id, req.admin.username, message);
    logAudit(req.admin.username, 'feedback_respond', String(id), message.slice(0, 100)).catch(e => {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/ceo-panel/api/feedback/:id", requireCeoAuth, requireCeoRole('editor'), async (req, res) => {
  try {
    const { id } = req.params;
    await deleteFeedback(id);
    logAudit(req.admin.username, 'feedback_delete', String(id), '').catch(e => {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SERVER INFO (viewer+) ──────────────────────────────────
const SERVER_START_TIME = Date.now();
app.get("/ceo-panel/api/server", requireCeoAuth, requireCeoRole('viewer'), async (req, res) => {
  try {
    const info = getServerInfo(SERVER_START_TIME);
    // Agregar conteos de salas activas y jugadores conectados
    info.activeRooms = rooms.size;
    info.connectedPlayers = 0;
    for (const [, sock] of clients) {
      if (sock?.readyState === WebSocket.OPEN) info.connectedPlayers++;
    }
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUSH NOTIFICATIONS (viewer+) ─────────────────────────
app.get("/ceo-panel/api/push/vapid-key", requireCeoAuth, requireCeoRole('viewer'), (req, res) => {
  res.json({ publicKey: getVapidPublicKey() || '' });
});

app.post("/ceo-panel/api/push/subscribe", requireCeoAuth, requireCeoRole('editor'), async (req, res) => {
  try {
    const { playerId, subscription } = req.body;
    if (!playerId || !subscription) return res.status(400).json({ error: 'playerId y subscription requeridos' });
    await savePushSubscription(playerId, subscription);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/ceo-panel/api/push/unsubscribe", requireCeoAuth, requireCeoRole('editor'), async (req, res) => {
  try {
    const { playerId } = req.body;
    await removePushSubscription(playerId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/ceo-panel/api/push/broadcast", requireCeoAuth, requireCeoRole('editor'), async (req, res) => {
  try {
    if (!isPushReady()) return res.status(400).json({ error: 'Push no configurado - faltan VAPID keys' });
    const { title, body, url } = req.body;
    if (!title || !body) return res.status(400).json({ error: 'title y body requeridos' });
    const subs = await getAllPushSubscriptions();
    let sent = 0, failed = 0;
    for (const sub of subs) {
      try {
        const result = await sendPushNotification(sub.subscription, title, body, url);
        if (result.success) sent++;
        else {
          failed++;
          if (result.expired) await removePushSubscription(sub.playerId);
        }
      } catch(e) { failed++; }
    }
    logAudit(req.admin.username, 'push_broadcast', null, `title:${title} sent:${sent} failed:${failed}`).catch(e => {});
    res.json({ success: true, sent, failed, total: subs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/ceo-panel/api/push/stats", requireCeoAuth, requireCeoRole('viewer'), async (req, res) => {
  try {
    const count = await getPushSubscriptionsCount();
    res.json({ subscriptions: count, ready: isPushReady() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUSH ENDPOINTS PÚBLICOS (para que los jugadores se suscriban) ──
app.get("/api/push/vapid-key", (req, res) => {
  res.json({ publicKey: getVapidPublicKey() || '' });
});

app.post("/api/push/subscribe", requireAuth, async (req, res) => {
  try {
    const { subscription } = req.body;
    const endpoint = subscription?.endpoint;
    const p256dh = subscription?.keys?.p256dh;
    const auth = subscription?.keys?.auth;
    if (typeof endpoint !== 'string' || !endpoint.startsWith('https://') ||
        typeof p256dh !== 'string' || p256dh.length < 40 ||
        typeof auth !== 'string' || auth.length < 10) {
      return res.status(400).json({ error: 'Suscripción push inválida' });
    }
    const playerId = req.user.playerId;
    await savePushSubscription(playerId, subscription);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/push/unsubscribe", requireAuth, async (req, res) => {
  try {
    const playerId = req.user.playerId;
    await removePushSubscription(playerId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SHOP MANAGEMENT (viewer+ read, editor+ write) ────────
app.get("/ceo-panel/api/shop/items", requireCeoAuth, requireCeoRole('viewer'), async (req, res) => {
  try {
    const items = await getShopItemsFromDB();
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/ceo-panel/api/shop/items", requireCeoAuth, requireCeoRole('editor'), async (req, res) => {
  try {
    const { category, name, icon, price, description } = req.body;
    if (!category || !name || !price) return res.status(400).json({ error: 'Categoria, nombre y precio requeridos' });
    const item = await createShopItem(category, name, icon, price, description);
    logAudit(req.admin.username, 'shop_create', String(item.id), `${name} (${category}) - $${price}`).catch(e => {});
    res.json({ item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/ceo-panel/api/shop/items/:id", requireCeoAuth, requireCeoRole('editor'), async (req, res) => {
  try {
    const { id } = req.params;
    const fields = req.body;
    const item = await updateShopItemDB(id, fields);
    if (!item) return res.status(404).json({ error: 'Item no encontrado' });
    logAudit(req.admin.username, 'shop_update', String(id), fields.name || '').catch(e => {});
    res.json({ item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/ceo-panel/api/shop/items/:id", requireCeoAuth, requireCeoRole('editor'), async (req, res) => {
  try {
    const { id } = req.params;
    await deleteShopItemDB(id);
    logAudit(req.admin.username, 'shop_delete', String(id), '').catch(e => {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── WEEKLY REPORT (viewer+) ───────────────────────────────
app.get("/ceo-panel/api/report/weekly", requireCeoAuth, requireCeoRole('viewer'), async (req, res) => {
  try {
    const report = await generateWeeklyReport();
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SEND REPORT BY EMAIL (editor+) ───────────────────────
app.post("/ceo-panel/api/report/email", requireCeoAuth, requireCeoRole('editor'), async (req, res) => {
  try {
    if (!isEmailReady()) return res.status(400).json({ error: 'Email no configurado - faltan SMTP vars' });
    const { to } = req.body;
    if (!to) return res.status(400).json({ error: 'Destinatario (to) requerido' });
    const report = await generateWeeklyReport();
    const html = buildReportHtml(report);
    const result = await sendReportEmail(to, html);
    logAudit(req.admin.username, 'report_email', to, 'Reporte semanal enviado').catch(e => {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper para generar HTML del reporte
function buildReportHtml(report) {
  return `<html><head><meta charset="utf-8"><title>Reporte Semanal</title>
  <style>body{font-family:sans-serif;background:#0A0A12;color:#EDE8DC;padding:20px}
  h1{color:#D4AF37;font-size:24px}h2{color:#D4AF37;font-size:18px;margin-top:24px}
  .stat{display:inline-block;padding:16px;margin:8px;background:rgba(18,18,30,.9);border-radius:8px;border:1px solid rgba(212,175,55,.15);text-align:center;min-width:120px}
  .num{font-size:32px;color:#D4AF37;font-weight:700}.lbl{font-size:11px;color:#5A5440;margin-top:4px}
  .footer{margin-top:30px;color:#5A5440;font-size:11px;border-top:1px solid rgba(255,255,255,.05);padding-top:12px}
  table{width:100%;border-collapse:collapse;margin-top:12px}
  th,td{padding:8px 12px;text-align:left;border-bottom:1px solid rgba(255,255,255,.06);font-size:13px}
  th{color:#D4AF37;font-size:11px;text-transform:uppercase}</style></head><body>
  <h1>📊 Reporte Semanal</h1>
  <p style="color:#5A5440">${new Date(report.generatedAt).toLocaleDateString('es-AR', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</p>
  <div style="margin-top:16px">
    <div class="stat"><div class="num">${report.newUsers}</div><div class="lbl">Nuevos usuarios</div></div>
    <div class="stat"><div class="num">${report.newPlayers}</div><div class="lbl">Nuevos jugadores</div></div>
    <div class="stat"><div class="num">${report.totalRevenue.toLocaleString('es-AR')}</div><div class="lbl">Monedas gastadas</div></div>
    <div class="stat"><div class="num">${report.feedbackCount}</div><div class="lbl">Feedbacks recibidos</div></div>
    <div class="stat"><div class="num">${report.activePlayers}</div><div class="lbl">Jugadores activos</div></div>
  </div>
  <h2>📈 Totales acumulados</h2>
  <div>
    <div class="stat"><div class="num">${report.totalUsers.toLocaleString('es-AR')}</div><div class="lbl">Total usuarios</div></div>
    <div class="stat"><div class="num">${report.totalPlayers.toLocaleString('es-AR')}</div><div class="lbl">Total jugadores</div></div>
  </div>
  <div class="footer">📈 Los 10.000 de Macko — Reporte generado automáticamente por el CEO Panel</div>
  </body></html>`;
}

// ── STRIPE ──────────────────────────────────────────────────

// Ruta para obtener paquetes de monedas (protegida)
app.get("/api/shop/packs", requireAuth, (req, res) => {
  res.json({ packs: getCoinPacks(SHOP_CATALOG) });
});

// Ruta para crear intención de pago Stripe (protegida)
app.post("/api/shop/create-payment", requireAuth, async (req, res) => {
  return res.status(503).json({ error: 'Stripe no está habilitado para compras en esta versión' });
});

// Stripe webhook ya fue declarado arriba (antes de express.json())

app.get('/health/live', (req, res) => res.json({ live: true }));
app.get('/health/ready', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    if (!databaseReady) throw new Error('schema_not_ready');
    await pool.query('SELECT 1');
    res.json({ ready: true, schemaVersion, build: process.env.RENDER_GIT_COMMIT || process.env.BUILD_SHA || null });
  } catch (_) { res.status(503).json({ ready: false }); }
});

// ── MERCADO PAGO ───────────────────────────────────────────

// Ruta para crear preferencia de pago MP
app.post("/api/mercadopago/create-preference", requireAuth, async (req, res) => {
  if (!paymentsEnabled()) return res.status(503).json({ error: 'Las compras están temporalmente deshabilitadas' });
  const { packId } = req.body;
  const userId = req.user.userId;

  try {
    const userResult = await pool.query("SELECT email FROM users WHERE id = $1", [userId]);
    if (!userResult.rows.length) return res.status(404).json({ error: "Usuario no encontrado" });
    const userEmail = userResult.rows[0].email;
    const result = await createCheckoutPreference(packId, userId, userEmail, req.body.requestKey);
    res.json(result);
  } catch (err) {
    console.error("Error MP preference:", err);
    res.status(400).json({ error: "No se pudo iniciar el pago" });
  }
});

// Ruta para obtener paquetes MP
app.get("/api/mercadopago/packs", requireAuth, (req, res) => {
  res.json({ packs: getMPCoinPacks(SHOP_CATALOG), enabled: paymentsEnabled() });
});

app.get('/api/commerce/orders', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`SELECT id,pack_id,pack_snapshot->>'name' AS name,amount_cents,currency,status,delivered_at,created_at
      FROM commerce_orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`, [req.user.userId]);
    res.set('Cache-Control', 'no-store').json({ orders: result.rows });
  } catch (_) { res.status(503).json({ error: 'No se pudo consultar tus compras' }); }
});

// Webhook firmado de Mercado Pago
app.post("/api/mercadopago/webhook", async (req, res) => {
  const paymentId = req.query['data.id'];
  if (!verifyMPSignature({ signature: req.headers['x-signature'], requestId: req.headers['x-request-id'], dataId: paymentId, secret: process.env.MP_WEBHOOK_SECRET })) {
    return res.status(401).json({ error: 'Firma de notificación inválida' });
  }
  const paymentTopic = req.body?.type;
  if (String(req.body?.data?.id || '') !== paymentId) return res.status(400).json({ error: 'Recurso de notificación inconsistente' });
  try {
    const result = await handleMPWebhook(paymentId, paymentTopic, pool);
    res.json(result);
  } catch (err) {
    console.error("MP webhook error:", err);
    res.status(503).json({ error: "Notificación pendiente de procesamiento" });
  }
});

/* ── HTTP + WS ───────────────────────────────────────────── */
const server = http.createServer(app);
const wss    = new WebSocket.Server({
  server,
  maxPayload: 350 * 1024,
  verifyClient: ({ req }) => {
    const origin = req.headers.origin;
    if (!origin) return true;
    if (NATIVE_APP_ORIGINS.has(origin)) return true;
    try { return new URL(origin).host === req.headers.host; }
    catch (_) { return false; }
  }
});

console.log("🎲 Iniciando Los 10.000 de Macko...");

const clients      = new Map(); // playerId → socket
const reconnTimers = new Map(); // playerId → timeoutId
const botTurnTimers = new Map(); // timerId → {roomId, playerId} bot turns timeout
const joinRequests = new Map(); // roomId → Map(playerId, request)
// Las apps móviles pueden quedar suspendidas varios minutos sin cerrar sesión.
// Se conserva el lugar para permitir una reconexión real, no sólo una reconexión rápida.
const RECONN_MS    = 15 * 60_000;
const JOIN_REQUEST_MS = 30_000;
const XP_PER_GAME   = 25;
const XP_PER_WIN    = 50;
const XP_PER_TOP3   = 15;
const XP_PER_STREAK_WIN = 20;

/* ── Helpers ─────────────────────────────────────────────── */
function send(socket, type, data = {}) {
  if (socket?.readyState === WebSocket.OPEN)
    socket.send(JSON.stringify({ type, data }));
}

// Pasar clientes WebSocket al tournament manager para notificaciones
setWsClients(clients, send);

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

/* ── Verificar si es invitado (sin user_id en BD) ──────── */
async function checkIfGuest(playerId) {
  try {
    const res = await pool.query(`SELECT user_id FROM players WHERE id = $1`, [playerId]);
    return !res.rows[0] || !res.rows[0].user_id;
  } catch(e) {
    return true; // asumir invitado si hay error
  }
}

/* ── Resolver ID de item avatar a su icono (emoji) ──── */
// Cache de iconos de avatares desde la DB
const _avatarIconCache = new Map();
const _diceSkinIdCache = new Map();
async function loadAvatarIconCache() {
  try {
    const res = await pool.query("SELECT id, icon FROM shop_items WHERE category = 'avatares' OR id IN (34, 35)");
    for (const row of res.rows) {
      _avatarIconCache.set(String(row.id), row.icon);
    }
    console.log(`🎨 Avatar icon cache loaded: ${_avatarIconCache.size} items`);
  } catch(e) {}
}
loadAvatarIconCache();

function resolveAvatarIcon(itemId) {
  if (!itemId) return '';
  const id = String(itemId);
  if (_avatarIconCache.has(id)) return _avatarIconCache.get(id);
  const item = SHOP_CATALOG.find(i =>
    i.id === parseInt(itemId) && (i.category === 'avatares' || [34, 35].includes(i.id))
  );
  return item ? item.icon : '';
}

function parseSpecialIds(value, legacy = '') {
  let parsed = [];
  try { parsed = Array.isArray(value) ? value : JSON.parse(String(value || '[]')); } catch (_) {}
  if (!Array.isArray(parsed)) parsed = [];
  if (!parsed.length && legacy) parsed = [legacy];
  return [...new Set(parsed.map(String).filter(Boolean))].slice(0, 3);
}

async function resolveDiceSkinId(itemId) {
  if (!itemId) return '';
  const id = String(itemId);
  if (_diceSkinIdCache.has(id)) return _diceSkinIdCache.get(id);

  let itemName = '';
  try {
    const res = await pool.query('SELECT name FROM shop_items WHERE id = $1', [itemId]);
    itemName = res.rows[0]?.name || '';
  } catch (e) {}

  const fallbackItem = SHOP_CATALOG.find(item => item.id === Number(itemId));
  const resolvedId = canonicalDiceSkinId(id, itemName || fallbackItem?.name);
  _diceSkinIdCache.set(id, resolvedId);
  return resolvedId;
}

/* ── Cargar items equipados a un room player ──────────── */
async function loadEquippedToRoomPlayer(roomPlayer, playerId) {
  try {
    const plRes = await pool.query(`SELECT equipped_avatar, equipped_dice, equipped_special, equipped_specials, win_streak, level FROM players WHERE id = $1`, [playerId]);
    if (plRes.rows[0]) {
      roomPlayer.equippedAvatar = resolveAvatarIcon(plRes.rows[0].equipped_avatar);
      roomPlayer.equippedDice = await resolveDiceSkinId(plRes.rows[0].equipped_dice);
      roomPlayer.equippedSpecial = plRes.rows[0].equipped_special || '';
      roomPlayer.equippedSpecials = parseSpecialIds(plRes.rows[0].equipped_specials, plRes.rows[0].equipped_special);
      roomPlayer.winStreak = Number(plRes.rows[0].win_streak) || 0;
      roomPlayer.level = Number(plRes.rows[0].level) || 1;
      console.log(`📦 loadEquipped(${playerId}): dice=${roomPlayer.equippedDice} av=${roomPlayer.equippedAvatar} sp=${roomPlayer.equippedSpecial}`);
    } else {
      console.log(`📦 loadEquipped(${playerId}): NO ROW found in players table`);
    }
  } catch(e) { console.error(`📦 loadEquipped ERROR for ${playerId}:`, e.message); }
}

/* ── Post-victoria ───────────────────────────────────────── */
async function onMatchWon(match, roomId) {
  const winner = match.winner;
  if (!winner || match.finalizing) return;
  match.finalizing = true;
  // Envolver todo el pre-broadcast en try/catch para que GAME_OVER
  // siempre se envíe aunque algo falle antes.
  let room = null;
  let isTournamentMatch = false;
  try {
    try { rejectAllJoinRequests(roomId, 'La partida terminó'); } catch(e) { console.error('rejectJoinRequests:', e.message); }

    room = getRoom(roomId);
    isTournamentMatch = !!room?.isTournamentMatch;

    // En torneos el resultado se confirma antes de destruir la partida. Si la
    // base se cae unos segundos, se conserva el estado ganador y se reintenta:
    // nunca se pierde un resultado ni se habilita una revancha accidental.
    if (isTournamentMatch) {
      try {
        await completeTournamentMatch(
          room.tournamentId,
          room.tournamentMatchId,
          winner.id,
          match.players[0]?.score || 0,
          match.players[1]?.score || 0,
          clients,
          send
        );
      } catch (e) {
        console.error('Error avanzando match de torneo; se reintentara:', e.message);
        match.finalizing = false;
        broadcastRoom(roomId, "ERROR", {
          message: "Estamos confirmando el resultado del torneo. No cierres la partida."
        });
        setTimeout(() => {
          const pendingMatch = getMatch(roomId);
          if (pendingMatch === match && match.winner && !match.finalizing) {
            onMatchWon(match, roomId).catch(err => {
              console.error("Reintento de resultado de torneo:", err.message);
            });
          }
        }, 3000);
        return;
      }
    }

    // Cerrar la partida y resetear la sala antes de tocar la base de datos.
    // Asi el boton Revancha nunca compite con las recompensas o estadisticas.
    const finalSnapshot = snapshotMatch(match);
    if (room) {
      cancelReadyCountdown(roomId);
      room.status = "waiting";
      for (const p of room.players) {
        p.ready   = false;
        p.score   = 0;
        p.entered = false;
      }
    }
    broadcastRoom(roomId, "GAME_OVER", {
      winner,
      match: finalSnapshot,
      room,
      tournamentMatch: isTournamentMatch
    });
    destroyMatch(roomId);
  } catch (preBroadcastErr) {
    // Último recurso: si algo falló antes de GAME_OVER, enviarlo ahora
    console.error('onMatchWon pre-broadcast error:', preBroadcastErr.message);
    try {
      if (room && room.status !== 'waiting') {
        room.status = 'waiting';
        for (const p of room.players) { p.ready = false; p.score = 0; p.entered = false; }
      }
      broadcastRoom(roomId, 'GAME_OVER', {
        winner,
        match: snapshotMatch(match),
        room,
        tournamentMatch: isTournamentMatch
      });
      destroyMatch(roomId);
    } catch (lastResortErr) {
      console.error('onMatchWon last-resort GAME_OVER failed:', lastResortErr.message);
    }
  }

  const isBotGame = !!room?.isBotGame;
  try {
    const winnerId = winner.isBot ? null : winner.id;
    const registeredPlayerIds = await recordMatchResults(match.players, winnerId);
    const registeredIdSet = new Set(registeredPlayerIds);

    if (!isBotGame) {
      if (!isTournamentMatch) {
        // 💰 Sistema de recompensas: top 3 ganan monedas escalonadas
        const sortedByScore = [...match.players].sort((a, b) => (b.score || 0) - (a.score || 0));
        const rewards = [500, 200, 100];
        for (let i = 0; i < Math.min(sortedByScore.length, 3); i++) {
          const player = sortedByScore[i];
          const amount = rewards[i];
          if (amount > 0 && player.id) {
            try {
              await rewardWinner(player.id, amount, { isWin: i === 0 });
              console.log(`💰 ${amount} monedas → ${player.name || player.id} (puesto ${i + 1})`);
            } catch (e) {
              console.error(`Error al premiar a ${player.id}:`, e.message);
            }
          }
        }
      }
    }

    // XP por puesto + boost XP
    const sortedByScore = [...match.players].sort((a, b) => (b.score || 0) - (a.score || 0));
    for (let i = 0; i < sortedByScore.length; i++) {
      const p = sortedByScore[i];
      if (!registeredIdSet.has(p.id)) continue;
      let xpTotal = XP_PER_GAME; // 15 base
      if (i === 0) { // 1° puesto (ganador)
        xpTotal += XP_PER_WIN; // +35
        // 25 monedas extra al ganador (con boosts de monedas por ganar)
        try { await rewardWinner(p.id, 25, { isWin: true }); } catch(e) {}
      } else if (i <= 2) { // 2° y 3° puesto
        xpTotal += XP_PER_TOP3; // +10
      }
      // Racha de victorias
      if (p.winStreak >= 2) xpTotal += XP_PER_STREAK_WIN; // +20
      // Boost de XP 100% (item 52)
      if (p.id) {
        try {
          const xpBoostRes = await pool.query(`SELECT boost_xp_expires FROM players WHERE id = $1`, [p.id]);
          if (xpBoostRes.rows[0]?.boost_xp_expires && Date.now() < Number(xpBoostRes.rows[0].boost_xp_expires)) {
            xpTotal *= 2;
          }
        } catch(e) {}
      }
      try { await awardXP(p.id, xpTotal); } catch(e) {}
      // Mejor turno individual: escanear historial de la partida
      if (match.history) {
        let bestThisGame = 0;
        for (const ev of match.history) {
          if ((ev.type === 'BANKED' || ev.type === 'SCORED') && ev.payload?.playerId === p.id) {
            const gained = ev.payload.gained || 0;
            if (gained > bestThisGame) bestThisGame = gained;
          }
        }
        if (bestThisGame > 0) {
          try { await pool.query(`UPDATE players SET best_turn = GREATEST(COALESCE(best_turn,0), $1) WHERE id = $2`, [bestThisGame, p.id]); } catch(e) {}
        }
      }
      // Mejor racha de victorias
      try {
        await pool.query(`UPDATE players SET best_win_streak = GREATEST(COALESCE(best_win_streak,0), COALESCE(win_streak,0)) WHERE id = $1`, [p.id]);
      } catch(e) {}
      if (p.straights > 0) await registerStraight(p.id);
      if (p.fiveOnes > 0 && p.id === winner.id) await registerFiveOnes(p.id);
    }
    if (isBotGame) console.log(`🤖 Partida contra bots registrada. Ganador: ${winner.name || winner.id}`);

    // ── Desafío Diario: guardar puntaje del jugador humano ──
    if (room?.isDailyChallenge) {
      try {
        const humanPlayer = match.players.find(p => !p.isBot);
        if (humanPlayer) {
          const rolls = match.history?.filter(e => e.type === 'ROLL' && e.payload?.playerId === humanPlayer.id).length || 0;
          const dailyResult = await completeDailyChallenge(humanPlayer.id, humanPlayer.name, humanPlayer.score, rolls);
          console.log(`🎯 Desafío diario: ${humanPlayer.name} score=${humanPlayer.score} completed=${dailyResult.completed} rewarded=${dailyResult.rewarded}`);
          if (dailyResult.rewarded) {
            const playerSocket = clients.get(humanPlayer.id);
            send(playerSocket, 'DAILY_REWARD', { coins: dailyResult.reward });
          }
        }
      } catch(e) { console.error('Error guardando score diario:', e.message); }
    }

    // ── Apuestas: distribuir pot al ganador ──
    if (match.betPot > 0 && match.betPlayers) {
      try {
        const HOUSE_EDGE = 0.1;
        const netPot = Math.floor(match.betPot * (1 - HOUSE_EDGE));
        if (netPot > 0 && winner.id && !winner.isBot) {
          const payoutClient = await pool.connect();
          try {
            await payoutClient.query('BEGIN');
            const credited = await payoutClient.query(
              `UPDATE players SET coins = coins + $1 WHERE id = $2 RETURNING coins`,
              [netPot, winner.id]
            );
            if (!credited.rows.length) throw new Error('Ganador no encontrado para acreditar la apuesta');
            await payoutClient.query(
              `INSERT INTO transactions (player_id, amount, reason, created_at) VALUES ($1, $2, $3, $4)`,
              [winner.id, netPot, `Ganó apuesta: pot ${match.betPot} - 10% comisión`, Date.now()]
            );
            await payoutClient.query('COMMIT');
          } catch (error) {
            await payoutClient.query('ROLLBACK');
            throw error;
          } finally {
            payoutClient.release();
          }
          console.log(`💰 Apuesta cobrada: ${winner.name} ganó ${netPot} monedas (pot: ${match.betPot})`);
          // Notificar a todos
          broadcastRoom(roomId, 'BET_WON', {
            winnerId: winner.id,
            winnerName: winner.name,
            pot: match.betPot,
            netWin: netPot
          });
        }
      } catch(e) { console.error('Error distribuyendo apuesta:', e.message); }
    }
  } catch (e) {
    console.error("DB post-win:", e.message);
  }

  if (isTournamentMatch && room) {
    for (const p of room.players) {
      const sock = clients.get(p.id);
      if (sock?.roomId === roomId) sock.roomId = null;
    }
    rooms.delete(roomId);
    return;
  }

  if (room && room.status === "waiting") {
    // Limpiar invitados desconectados al terminar la partida
    for (const p of [...room.players]) {
      if (p.disconnected) {
        try {
          const isG = await checkIfGuest(p.id);
          if (isG) {
            reconnTimers.delete(p.id);
            clients.delete(p.id);
            removePlayer(roomId, p.id);
          }
        } catch(e) {}
      }
    }
    broadcastRoomState(roomId);
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
      const matchWinner = match.players.find(p => p.id === winner.id);
      if (matchWinner) {
        setWinner(match, matchWinner);
        broadcastRoom(roomId, "WIN", {
          playerId: matchWinner.id,
          playerName: matchWinner.name,
          dice: [],
          match: snapshotMatch(match)
        });
        void onMatchWon(match, roomId);
      }
      return;
    }
  }
  broadcastRoomState(roomId);
}

/* ── Helper: iniciar match para una sala ─────────────────── */
async function startMatchForRoom(roomId, triggerData) {
  const room = getRoom(roomId);
  if (!room || room.status !== "waiting" || room.starting) return null;
  room.starting = true;
  let match = null;
  try {
    const unconfirmedBet = room.players.find(player => Number(player.bet) > 0 && !player.betConfirmed);
    if (unconfirmedBet) throw new Error(`${unconfirmedBet.name} todavía no confirmó su apuesta`);

    const firstPlayer = startGame(roomId);
    match = createMatch(room, onMatchWon);

    const betPlayers = room.players
      .map(player => ({ id: player.id, name: player.name, bet: Math.max(0, Math.floor(Number(player.bet) || 0)) }))
      .filter(player => player.bet > 0);
    if (betPlayers.length) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const player of betPlayers) {
          const debit = await client.query(
            `UPDATE players SET coins = coins - $1
             WHERE id = $2 AND user_id IS NOT NULL AND coins >= $1
             RETURNING coins`,
            [player.bet, player.id]
          );
          if (!debit.rows.length) throw new Error(`${player.name} no tiene saldo suficiente para la apuesta`);
          await client.query(
            `INSERT INTO transactions (player_id, amount, reason, created_at) VALUES ($1, $2, $3, $4)`,
            [player.id, -player.bet, `Apuesta en partida ${roomId}`, Date.now()]
          );
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      match.betPot = betPlayers.reduce((total, player) => total + player.bet, 0);
      match.betPlayers = betPlayers;
      console.log(`💰 Apuestas debitadas: pot=${match.betPot} monedas`);
    }

    for (const p of match.players) {
      if (p.id) {
        try {
          const plRes = await pool.query(`SELECT equipped_avatar, equipped_dice, equipped_special, equipped_specials, win_streak, level FROM players WHERE id = $1`, [p.id]);
          if (plRes.rows[0]) {
            p.equippedAvatar = resolveAvatarIcon(plRes.rows[0].equipped_avatar);
            p.equippedDice = await resolveDiceSkinId(plRes.rows[0].equipped_dice) || null;
            p.equippedSpecial = plRes.rows[0].equipped_special || null;
            p.equippedSpecials = parseSpecialIds(plRes.rows[0].equipped_specials, plRes.rows[0].equipped_special);
            p.winStreak = plRes.rows[0].win_streak || 0;
            p.level = Number(plRes.rows[0].level) || 1;
          }
        } catch(e) {}
        const roomP = room.players.find(rp => rp.id === p.id);
        if (roomP) {
          if (!p.equippedDice && roomP.equippedDice) p.equippedDice = roomP.equippedDice;
          if (!p.equippedAvatar && roomP.equippedAvatar) p.equippedAvatar = roomP.equippedAvatar;
          if (!p.equippedSpecial && roomP.equippedSpecial) p.equippedSpecial = roomP.equippedSpecial;
          if ((!p.equippedSpecials || !p.equippedSpecials.length) && roomP.equippedSpecials) p.equippedSpecials = roomP.equippedSpecials;
        }
        if (triggerData && p.id === triggerData.playerId) {
          if (!p.equippedDice && triggerData.equippedDice) p.equippedDice = triggerData.equippedDice;
          if (!p.equippedAvatar && triggerData.equippedAvatar) p.equippedAvatar = triggerData.equippedAvatar;
          if (!p.equippedSpecial && triggerData.equippedSpecial) p.equippedSpecial = triggerData.equippedSpecial;
          if ((!p.equippedSpecials || !p.equippedSpecials.length) && triggerData.equippedSpecials) p.equippedSpecials = triggerData.equippedSpecials;
        }
      }
    }

    broadcastRoom(roomId, "GAME_STARTED", { firstPlayer, match: snapshotMatch(match) });
    startFirstTurnTimer(roomId, broadcastRoom);
    return match;
  } catch (error) {
    if (match) destroyMatch(roomId);
    room.status = "waiting";
    broadcastRoom(roomId, "ERROR", { message: error.message || "No se pudo iniciar la partida" });
    broadcastRoomState(roomId);
    return null;
  } finally {
    room.starting = false;
  }
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

function findPlayerRoom(playerId, exceptRoomId = null) {
  for (const room of rooms.values()) {
    if (room.id === exceptRoomId) continue;
    if (room.players.some(player => player.id === playerId)) return room;
  }
  return null;
}

function findActivePlayerRoom(playerId, exceptRoomId = null) {
  for (const room of rooms.values()) {
    if (room.id === exceptRoomId || room.status !== "playing" || !getMatch(room.id)) continue;
    if (room.players.some(player => player.id === playerId)) return room;
  }
  return null;
}

function leaveWaitingRooms(playerId, exceptRoomId = null) {
  for (const room of [...rooms.values()]) {
    if (room.id === exceptRoomId || room.status !== "waiting") continue;
    if (!room.players.some(player => player.id === playerId)) continue;
    cancelReadyCountdown(room.id);
    removePlayer(room.id, playerId);
    if (!room.players.length) {
      rooms.delete(room.id);
    } else {
      broadcastRoom(room.id, "PLAYER_REMOVED", { playerId });
      broadcastRoomState(room.id);
    }
  }
}

function clearJoinRequest(roomId, playerId) {
  const roomRequests = joinRequests.get(roomId);
  const request = roomRequests?.get(playerId);
  if (!request) return null;
  clearTimeout(request.timer);
  roomRequests.delete(playerId);
  if (!roomRequests.size) joinRequests.delete(roomId);
  return request;
}

function rejectAllJoinRequests(roomId, message = 'La partida ya no acepta ingresos') {
  const roomRequests = joinRequests.get(roomId);
  if (!roomRequests) return;
  for (const request of roomRequests.values()) {
    clearTimeout(request.timer);
    send(request.socket, 'JOIN_REQUEST_REJECTED', { message });
  }
  joinRequests.delete(roomId);
}

async function joinActiveMatch(socket, room, playerName, approval = null) {
  const playerId = socket.playerId;
  const match = getMatch(room.id);
  if (!match || room.status !== 'playing' || match.status !== 'playing') {
    throw new Error('La partida ya no está activa');
  }
  if (room.players.some(player => player.id === playerId)) {
    doReconnect(socket, playerId, room, match);
    return;
  }
  assertJoinAllowed(room, playerId, { approved: approval === PRIVATE_JOIN_APPROVAL });
  if (socket.readyState !== WebSocket.OPEN || socket.superseded) throw new Error('La conexión cambió; volvé a solicitar ingreso');
  if (room.players.length >= room.maxPlayers) throw new Error('La partida está llena');
  const previousRoom = findActivePlayerRoom(playerId, room.id);
  if (previousRoom) throw new Error('Primero salí de tu partida activa');

  const equipped = {};
  await loadEquippedToRoomPlayer(equipped, playerId);
  if (getRoom(room.id) !== room || getMatch(room.id) !== match || room.status !== 'playing' || match.status !== 'playing') throw new Error('La partida cambió; volvé a solicitar ingreso');
  if (socket.superseded || socket.readyState !== WebSocket.OPEN) throw new Error('La conexión cambió');
  assertJoinAllowed(room, playerId, { approved: approval === PRIVATE_JOIN_APPROVAL });
  if (room.players.length >= room.maxPlayers || findActivePlayerRoom(playerId, room.id)) throw new Error('No se puede ingresar a esta partida');
  leaveWaitingRooms(playerId, room.id);
  const roomPlayer = addPlayer(room.id, playerId, playerName, { isGuest:!!socket.isGuest });
  Object.assign(roomPlayer, equipped, { joinedLate: true });
  const joined = addLatePlayer(room.id, roomPlayer);
  if (!joined.ok) {
    removePlayer(room.id, playerId);
    throw new Error(joined.error || 'No se pudo ingresar a la partida');
  }

  clients.set(playerId, socket);
  socket.playerName = playerName;
  socket.roomId = room.id;
  const payload = { room, match:joined.match, playerId };
  send(socket, 'JOIN_ACTIVE_SUCCESS', payload);
  broadcastRoom(room.id, 'PLAYER_JOINED_LATE', {
    playerId,
    playerName,
    match:joined.match
  });
}

function requestPrivateJoin(socket, room, playerName) {
  if (room.isTournamentMatch || room.players.some(p => Number(p.bet) > 0)) throw new Error('Esta partida no acepta nuevos jugadores');
  const playerId = socket.playerId;
  const match = getMatch(room.id);
  if (!match || room.status !== 'playing' || match.status !== 'playing') {
    throw new Error('La partida ya no está activa');
  }
  if (room.players.length >= room.maxPlayers) throw new Error('La partida está llena');
  if (findActivePlayerRoom(playerId, room.id)) throw new Error('Primero salí de tu partida activa');
  const ownerId = room.players[0]?.id;
  const ownerSocket = clients.get(ownerId);
  if (!ownerId || !ownerSocket || ownerSocket.readyState !== WebSocket.OPEN) {
    throw new Error('El creador no está disponible para aceptar');
  }

  let roomRequests = joinRequests.get(room.id);
  if (!roomRequests) {
    roomRequests = new Map();
    joinRequests.set(room.id, roomRequests);
  }
  clearJoinRequest(room.id, playerId);
  roomRequests = joinRequests.get(room.id) || new Map();
  joinRequests.set(room.id, roomRequests);
  const timer = setTimeout(() => {
    const expired = clearJoinRequest(room.id, playerId);
    if (!expired) return;
    send(expired.socket, 'JOIN_REQUEST_REJECTED', { message:'La solicitud venció' });
    send(ownerSocket, 'JOIN_REQUEST_RESOLVED', { playerId, accepted:false, expired:true });
  }, JOIN_REQUEST_MS);
  roomRequests.set(playerId, {
    socket,
    playerId,
    playerName,
    isGuest:!!socket.isGuest,
    createdAt:Date.now(),
    timer
  });
  send(ownerSocket, 'JOIN_REQUEST_RECEIVED', {
    playerId,
    playerName,
    expiresIn:JOIN_REQUEST_MS
  });
  send(socket, 'JOIN_REQUEST_SENT', { roomId:room.id, expiresIn:JOIN_REQUEST_MS });
}

/* ══════════════════════════════════════════════════════════
   CONEXIÓN WS
   ══════════════════════════════════════════════════════════ */
const WS_ROOM_ACTIONS = new Set([
  "GET_ROOM_STATE", "PLAYER_READY", "ROLL", "BANK", "CHAT_MESSAGE", "CHAT_AUDIO",
  "LEAVE_GAME", "LEAVE_ROOM", "CANCEL_ROOM", "GAME_INVITE", "SET_BET", "CONFIRM_BET", "USE_POWERUP"
]);
const WS_REGISTERED_ACTIONS = new Set([
  "TOURNAMENT_REGISTER", "TOURNAMENT_GET_BRACKET", "TOURNAMENT_JOIN_MATCH", "FRIEND_REQUEST", "FRIEND_ACCEPT",
  "FRIEND_REJECT", "GAME_INVITE", "GAME_INVITE_ACCEPT", "GAME_INVITE_REJECT",
  "PRIVATE_CHAT", "GET_PRIVATE_CHAT", "GLOBAL_CHAT"
]);

function sanitizeWsPlayerName(value) {
  return String(value || "Jugador")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^\p{L}\p{N} ._-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24) || "Jugador";
}

const PROFANITY_PATTERNS = [
  /(^|[^\p{L}\p{N}])(hij[oa]s?\s+de\s+put[oa]s?)(?=$|[^\p{L}\p{N}])/giu,
  /(^|[^\p{L}\p{N}])(put[oa]s?|pelotud[oa]s?|bolud[oa]s?|forr[oa]s?|pajer[oa]s?|soretes?|mierdas?|conch(?:a|udo|uda)s?|imb[eé]ciles?|idiotas?|mog[oó]lic[oa]s?)(?=$|[^\p{L}\p{N}])/giu
];

function filterChatMessage(value, maxLength = 500) {
  let message = String(value || '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, maxLength);
  for (const pattern of PROFANITY_PATTERNS) {
    message = message.replace(pattern, (_full, prefix, insult) => `${prefix}${'•'.repeat(Math.min(10, [...insult].length))}`);
  }
  return message;
}

wss.on("connection", (socket, request) => {
  // Same one-hop proxy trust as HTTP, avoiding one shared limiter for all Render users.
  const forwarded = String(request.headers['x-forwarded-for'] || '').split(',').at(-1).trim();
  socket.clientIp = require('net').isIP(forwarded) ? forwarded : socket._socket.remoteAddress;

  /* Ping/pong para detectar conexiones caídas */
  socket.isAlive = true;
  socket.authenticated = false;
  socket.authDeadline = setTimeout(() => {
    if (!socket.authenticated) socket.close(4003, "Autenticación requerida");
  }, 5000);
  socket.messageWindowStartedAt = Date.now();
  socket.messageCount = 0;
  socket.on("pong", () => { socket.isAlive = true; });

  let messageQueue = Promise.resolve();
  let queuedMessages = 0;
  socket.on('message', rawMsg => {
    if (++queuedMessages > 20) { queuedMessages--; socket.close(4008, 'Demasiadas acciones pendientes'); return; }
    messageQueue = messageQueue.then(() => processSocketMessage(rawMsg)).finally(() => { queuedMessages--; });
  });
  async function processSocketMessage(rawMsg) {
    try {
      const now = Date.now();
      if (now - socket.messageWindowStartedAt >= 10_000) {
        socket.messageWindowStartedAt = now;
        socket.messageCount = 0;
      }
      if (++socket.messageCount > 80) {
        socket.close(4008, "Demasiados mensajes");
        return;
      }

      const parsed = JSON.parse(rawMsg.toString());
      const type = typeof parsed?.type === "string" ? parsed.type : "";
      const data = parsed?.data && typeof parsed.data === "object" && !Array.isArray(parsed.data)
        ? parsed.data
        : {};

      if (type === "PING") {
        send(socket, "PONG", {});
        return;
      }

      /* ── IDENTIFY ──────────────────────────────────────── */
      if (type === "IDENTIFY") {
        if (socket.authenticated || socket.authenticating) {
          send(socket, "ERROR", { message: "La conexión ya fue identificada" });
          return;
        }

        socket.authenticating = true;
        let identity;
        try { identity = verifyGameToken(data.token); }
        catch (_) {
          send(socket, "ERROR", { message: "Sesión inválida o expirada" });
          socket.close(4003, "Autenticación requerida");
          return;
        }

        const playerId = String(identity.playerId || "");
        if (!playerId) {
          socket.close(4003, "Identidad inválida");
          return;
        }

        socket.isGuest = identity.guest === true;
        socket.userId = socket.isGuest ? null : identity.userId;
        socket.playerId = playerId;
        socket.playerName = socket.isGuest
          ? sanitizeWsPlayerName(data.playerName)
          : sanitizeWsPlayerName(identity.username);
        socket.roomId = null;
        socket.sessionVersion = Number(identity.sessionVersion || 0);
        socket.tokenExpiresAt = Number(identity.exp) * 1000;

        if (!socket.isGuest) {
          const sessionResult = await pool.query(
            `SELECT session_version FROM users WHERE id = $1`,
            [socket.userId]
          );
          if (!sessionResult.rows.length || Number(sessionResult.rows[0].session_version) !== Number(identity.sessionVersion || 0)) {
            send(socket, "ERROR", { message: "Sesión revocada. Volvé a iniciar sesión" });
            socket.close(4003, "Sesión revocada");
            return;
          }
          const banStatus = await checkIfBanned(socket.userId);
          if (banStatus.banned) {
            send(socket, "ERROR", { message: "Tu cuenta no tiene acceso al juego" });
            socket.close(4003, "Cuenta bloqueada");
            return;
          }
        } else {
          try {
            await createOrLoadPlayer({ id: playerId, alias: socket.playerName, name: socket.playerName });
          } catch (e) { console.error("DB guest identify:", e.message); }
        }

        socket.authenticated = true;
        clearTimeout(socket.authDeadline);
        const previousSocket = clients.get(playerId);
        if (previousSocket && previousSocket !== socket) {
          previousSocket.superseded = true;
          previousSocket.close(4001, "Nueva conexión");
        }
        clients.set(playerId, socket);

        // Actualizar last_seen para tracking online/offline
        updateLastSeen(playerId).catch(e => {});

        // Intentar reconectar si viene con roomId
        if (data.roomId) {
          const room  = getRoom(data.roomId);
          const match = getMatch(data.roomId);

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

      if (!socket.authenticated) {
        send(socket, "ERROR", { message: "Debés identificar la conexión" });
        socket.close(4003, "Autenticación requerida");
        return;
      }
      if (Date.now() >= socket.tokenExpiresAt) {
        socket.close(4003, 'Sesión expirada');
        return;
      }
      if (!socket.isGuest) {
        const currentSession = await pool.query('SELECT session_version FROM users WHERE id = $1', [socket.userId]);
        if (!currentSession.rows.length || Number(currentSession.rows[0].session_version) !== socket.sessionVersion) {
          socket.close(4003, 'Sesión revocada');
          return;
        }
      }
      if (socket.superseded || socket.readyState !== WebSocket.OPEN) return;

      if (socket.isGuest && ["CREATE_ROOM", "JOIN_ROOM", "START_BOT_GAME"].includes(type)) {
        socket.playerName = sanitizeWsPlayerName(data.playerName);
      }
      data.playerId = socket.playerId;
      data.playerName = socket.playerName;

      const actionCooldowns = {
        ROLL: 150, BANK: 250, CHAT_MESSAGE: 600, CHAT_AUDIO: 3000,
        PRIVATE_CHAT: 500, GLOBAL_CHAT: 1000, FRIEND_REQUEST: 1000,
        GAME_INVITE: 1000
      };
      const cooldown = actionCooldowns[type];
      if (cooldown) {
        socket.lastActionAt ||= Object.create(null);
        if (now - (socket.lastActionAt[type] || 0) < cooldown) return;
        socket.lastActionAt[type] = now;
      }
      if (["ROLL", "BANK", "USE_POWERUP"].includes(type) && socket.gameActionPending) {
        send(socket, "ERROR", { message: "Esperá a que termine la acción anterior" });
        return;
      }

      if (socket.isGuest && WS_REGISTERED_ACTIONS.has(type)) {
        send(socket, "ERROR", { message: "Esta función requiere una cuenta" });
        return;
      }

      if (WS_ROOM_ACTIONS.has(type)) {
        if (!socket.roomId || String(data.roomId || "") !== String(socket.roomId)) {
          send(socket, "ERROR", { message: "Acción fuera de tu sala" });
          return;
        }
        const actionRoom = getRoom(socket.roomId);
        const actionMatch = getMatch(socket.roomId);
        const isMember = actionRoom?.players?.some(p => p.id === socket.playerId)
          || actionMatch?.players?.some(p => p.id === socket.playerId);
        if (!isMember) {
          send(socket, "ERROR", { message: "No pertenecés a esta sala" });
          return;
        }
        data.roomId = socket.roomId;
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
        if (!room) {
          send(socket, "ERROR", { message: "La sala ya no existe" });
          return;
        }
        if (room.status !== "waiting") {
          send(socket, "ERROR", { message: "La revancha todavia se esta preparando" });
          return;
        }
        send(socket, "PLAY_AGAIN", { room, immediate: !!data.immediate });
        return;
      }

      if (type === "LEAVE_CONTEXT") {
        const playerId = socket.playerId;
        const activeRoom = findActivePlayerRoom(playerId);
        if (activeRoom) {
          eliminatePlayer(activeRoom.id, playerId);
        } else {
          leaveWaitingRooms(playerId);
        }
        socket.roomId = null;
        send(socket, "LEFT_CONTEXT", {});
        return;
      }

      /* ── CREAR SALA ────────────────────────────────────── */
      if (type === "CREATE_ROOM") {
        const playerName = data.playerName || socket.playerName || 'Jugador';
        const ownerId = data.playerId || socket.playerId;
        if (!ownerId) {
          send(socket, "ERROR", { message: "No se pudo recuperar tu usuario" });
          return;
        }
        const activeRoom = findActivePlayerRoom(ownerId);
        if (activeRoom) {
          send(socket, "ERROR", { message: "Ya estás en una partida activa" });
          return;
        }
        leaveWaitingRooms(ownerId);
        const room = createRoom({
          ownerId,
          ownerName:  playerName,
          isPrivate:  data.isPrivate !== false,
          maxPlayers: Math.max(2, Math.min(10, Number(data.maxPlayers) || 10)),
          ownerIsGuest: !!socket.isGuest
        });
        // Cargar items equipados del owner para que todos lo vean
        try {
          const owner = room.players.find(p => p.id === ownerId);
          if (owner) {
            await loadEquippedToRoomPlayer(owner, ownerId);
          }
        } catch(e) { console.error('Error loading owner equipped:', e.message); }
        clients.set(ownerId, socket);
        socket.playerId = ownerId;
        socket.playerName = playerName;
        socket.roomId   = room.id;
        send(socket, "ROOM_CREATED", { room });
        return;
      }

      /* ── UNIRSE ────────────────────────────────────────── */
      if (type === "REQUEST_JOIN_ACTIVE") {
        if (!allowRoomLookup(`player:${socket.playerId}`) || !allowRoomLookup(`ip:${socket.clientIp}`)) {
          send(socket, 'ERROR', { message: 'Demasiados intentos de ingreso; esperá un minuto' });
          return;
        }
        const room = getRoom(data.roomId);
        if (!room) {
          send(socket, "ERROR", { message:"Partida no encontrada" });
          return;
        }
        const playerName = String(data.playerName || socket.playerName || 'Jugador').trim() || 'Jugador';
        try {
          if (room.private && !room.players.some(p => p.id === socket.playerId)) {
            if (String(data.code || '') !== String(room.code)) throw new Error('Necesitás el código de la sala privada');
            if (room.isTournamentMatch) throw new Error('Sala exclusiva del torneo');
            requestPrivateJoin(socket, room, playerName);
          } else await joinActiveMatch(socket, room, playerName);
        } catch (error) {
          send(socket, "ERROR", { message:error.message });
        }
        return;
      }

      if (type === "RESPOND_JOIN_REQUEST") {
        const room = getRoom(data.roomId);
        if (!room || room.players[0]?.id !== socket.playerId) {
          send(socket, "ERROR", { message:"Sólo el creador puede responder" });
          return;
        }
        const request = clearJoinRequest(room.id, String(data.requesterId || ''));
        if (!request) {
          send(socket, "JOIN_REQUEST_RESOLVED", { playerId:data.requesterId, accepted:false, expired:true });
          return;
        }
        if (!data.accept) {
          send(request.socket, "JOIN_REQUEST_REJECTED", { message:"El creador rechazó tu solicitud" });
          send(socket, "JOIN_REQUEST_RESOLVED", { playerId:request.playerId, accepted:false });
          return;
        }
        try {
          await joinActiveMatch(request.socket, room, request.playerName, PRIVATE_JOIN_APPROVAL);
          send(socket, "JOIN_REQUEST_RESOLVED", { playerId:request.playerId, accepted:true });
        } catch (error) {
          send(request.socket, "JOIN_REQUEST_REJECTED", { message:error.message });
          send(socket, "JOIN_REQUEST_RESOLVED", { playerId:request.playerId, accepted:false });
        }
        return;
      }

      if (type === "JOIN_ROOM") {
        if (!allowRoomLookup(`player:${socket.playerId}`) || !allowRoomLookup(`ip:${socket.clientIp}`)) {
          send(socket, 'ERROR', { message: 'Demasiados intentos de ingreso; esperá un minuto' });
          return;
        }
        const joiningPlayerId = data.playerId || socket.playerId;
        const joiningPlayerName = String(data.playerName || socket.playerName || 'Jugador').trim() || 'Jugador';
        if (!joiningPlayerId) {
          send(socket, "ERROR", { message: "No se pudo recuperar tu usuario" });
          return;
        }
        const room = getRoomByCode(data.code);
        if (!room) {
          send(socket, "ERROR", { message: "Sala no encontrada" });
          return;
        }

        // Buscar si ya está en la sala (por playerId)
        const alreadyById = room.players.find(p => p.id === joiningPlayerId);
        if (alreadyById) {
          // Ya está — reconectar
          const match = getMatch(room.id);
          doReconnect(socket, joiningPlayerId, room, match || null);
          return;
        }
        if (room.isTournamentMatch) {
          send(socket, 'ERROR', { message: 'Sala exclusiva para los participantes del torneo' });
          return;
        }

        const previousRoom = findActivePlayerRoom(joiningPlayerId, room.id);
        if (previousRoom) {
          send(socket, "ERROR", { message: "Primero salí de tu partida activa" });
          return;
        }

        if (room.players.length >= room.maxPlayers) {
          send(socket, "ERROR", { message: "La sala está llena" });
          return;
        }

        // Sala de espera: entrada normal
        if (room.status === "waiting") {
          const equipped = {};
          await loadEquippedToRoomPlayer(equipped, joiningPlayerId);
          if (getRoom(room.id) !== room || room.status !== 'waiting' || room.players.length >= room.maxPlayers || socket.superseded || socket.readyState !== WebSocket.OPEN || findActivePlayerRoom(joiningPlayerId, room.id)) {
            send(socket, 'ERROR', { message: 'La sala cambió; intentá ingresar nuevamente' });
            return;
          }
          leaveWaitingRooms(joiningPlayerId, room.id);
          const player = addPlayer(room.id, joiningPlayerId, joiningPlayerName, { isGuest:!!socket.isGuest });
          // Cargar items equipados del jugador para que todos lo vean
          Object.assign(player, equipped);
          clients.set(joiningPlayerId, socket);
          socket.playerId = joiningPlayerId;
          socket.playerName = joiningPlayerName;
          socket.roomId   = room.id;
          send(socket, "JOIN_SUCCESS", { room, player });
          broadcastRoomState(room.id);
          return;
        }

        if (room.status === "playing") {
          try {
            if (room.private) requestPrivateJoin(socket, room, joiningPlayerName);
            else await joinActiveMatch(socket, room, joiningPlayerName);
          } catch (error) {
            send(socket, "ERROR", { message:error.message });
          }
          return;
        }

        send(socket, "ERROR", { message: "No se puede unir a esta sala" });
        return;
      }



      /* ── LISTO ─────────────────────────────────────────── */
      if (type === "PLAYER_READY") {
        const readyRoom = getRoom(data.roomId);
        if (!readyRoom || readyRoom.status !== "waiting") {
          send(socket, "ERROR", { message: "La sala no esta lista para comenzar" });
          return;
        }
        if (!setReady(data.roomId, data.playerId, true)) {
          send(socket, "ERROR", { message: "No se encontro tu jugador en la sala" });
          return;
        }
        broadcastRoomState(data.roomId);
        if (allPlayersReady(data.roomId)) {
          cancelReadyCountdown(data.roomId);
          await startMatchForRoom(data.roomId, data);
        } else {
          const room = getRoom(data.roomId);
          const readyCount = room ? room.players.filter(p => p.ready).length : 0;
          if (readyCount >= 2 && !hasReadyCountdown(data.roomId)) {
            startReadyCountdown(data.roomId, broadcastRoom, async (roomId) => {
              await startMatchForRoom(roomId, null);
            });
          } else if (readyCount < 2) {
            cancelReadyCountdown(data.roomId);
          }
        }
        return;
      }

      /* ── APUESTAS ─────────────────────────────────────── */
      if (type === "SET_BET") {
        const { roomId, amount } = data;
        const playerId = socket.playerId;
        if (!roomId || !playerId) return;
        const requestedBet = Math.max(0, Math.min(5000, Math.floor(Number(amount) || 0)));
        if (requestedBet > 0 && !paidCompetitionEnabled()) {
          send(socket, 'ERROR', { message: 'Las apuestas están deshabilitadas hasta completar la verificación de producción' });
          return;
        }
        if (requestedBet > 0) {
          const balance = await pool.query(
            `SELECT coins FROM players WHERE id = $1 AND user_id IS NOT NULL`,
            [playerId]
          );
          if (!balance.rows.length || Number(balance.rows[0].coins) < requestedBet) {
            send(socket, "ERROR", { message: "No tenés saldo suficiente para esa apuesta" });
            return;
          }
        }
        const { setPlayerBet } = require('./roomManager');
        const result = setPlayerBet(roomId, playerId, requestedBet);
        if (!result.ok) { send(socket, "ERROR", { message: result.error }); return; }
        broadcastRoomState(roomId);
        return;
      }

      if (type === "CONFIRM_BET") {
        const { roomId } = data;
        const playerId = socket.playerId;
        if (!roomId || !playerId) return;
        const { confirmPlayerBet, getBettingState } = require('./roomManager');
        const result = confirmPlayerBet(roomId, playerId);
        if (!result.ok) { send(socket, "ERROR", { message: result.error }); return; }
        broadcastRoomState(roomId);
        // Si todos apostaron, notificar
        if (result.allBet && result.pot > 0) {
          broadcastRoom(roomId, 'BETTING_COMPLETE', { pot: result.pot });
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
        if (!player || !player.entered) {
          result = handleEntryRoll(roomId, playerId, broadcastRoom);
          // DEBUG temporal: ver qué dados y puntaje se generaron en entrada
          if (result.ok && result.dice) {
            const { calculateScore } = require('./gameEngine');
            const calc = calculateScore(result.dice);
            console.log('🔍 ENTRY DEBUG - player:', playerId.slice(0,8), 'dice:', result.dice, 'rollScore:', calc.score, 'scoringDice:', calc.scoringDice, 'event:', result.event, 'gained:', result.gained);
          }
        }
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

      /* ── POWER-UP ─────────────────────────────────────── */
      if (type === "USE_POWERUP") {
        const { roomId, playerId, powerUpId } = data;
        const { canUsePowerUp, handlePowerUp, getPowerUps } = require('./diceManager');
        const powerUps = getPowerUps();
        const pu = powerUps[powerUpId];
        if (!pu) { send(socket, "ERROR", { message: 'Power-up inválido' }); return; }
        const validation = canUsePowerUp(roomId, playerId, powerUpId);
        if (!validation.ok) { send(socket, "ERROR", { message: validation.error }); return; }
        socket.gameActionPending = true;
        let result;
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const debit = await client.query(
            `UPDATE players SET coins = coins - $1
             WHERE id = $2 AND user_id IS NOT NULL AND coins >= $1
             RETURNING coins`,
            [pu.cost, playerId]
          );
          if (!debit.rows.length) {
            await client.query('ROLLBACK');
            send(socket, "ERROR", { message: `No tenés suficientes monedas (necesitás ${pu.cost})` });
            return;
          }
          await client.query(`INSERT INTO transactions (player_id, amount, reason, created_at) VALUES ($1, $2, $3, $4)`,
            [playerId, -pu.cost, `Power-up: ${pu.name}`, Date.now()]);
          await client.query('COMMIT');
          // No hay await entre el commit y la mutación: el lock del socket y la
          // validación previa mantienen estable el turno durante este tramo.
          result = handlePowerUp(roomId, playerId, powerUpId, broadcastRoom);
          if (!result.ok) throw new Error(result.error);
          send(socket, 'COINS_UPDATE', { coins: Number(debit.rows[0].coins) || 0 });
        } catch (e) {
          try { await client.query('ROLLBACK'); } catch (_) {}
          console.error('Power-up transaction:', e.message);
          send(socket, "ERROR", { message: 'Error procesando monedas' }); return;
        } finally {
          client.release();
          socket.gameActionPending = false;
        }
        return;
      }

      /* ── TOURNAMENT: ENTRAR AL MATCH ASIGNADO ───────── */
      if (type === "TOURNAMENT_JOIN_MATCH") {
        const tournamentId = Number(data.tournamentId);
        const matchId = Number(data.matchId);
        const roomId = String(data.roomId || '');
        const matchRes = await pool.query(
          `SELECT * FROM tournament_matches
           WHERE id = $1 AND tournament_id = $2 AND status = 'pending'
             AND (player1_id = $3 OR player2_id = $3)`,
          [matchId, tournamentId, socket.playerId]
        );
        const tournamentMatch = matchRes.rows[0];
        const tournamentRoom = getRoom(roomId);
        if (!tournamentMatch || !tournamentRoom
            || Number(tournamentRoom.tournamentId) !== tournamentId
            || Number(tournamentRoom.tournamentMatchId) !== matchId) {
          send(socket, "ERROR", { message: "Match de torneo no disponible" });
          return;
        }
        if (socket.roomId && socket.roomId !== roomId) {
          send(socket, "ERROR", { message: "Salí de tu sala actual antes de entrar al torneo" });
          return;
        }
        const tournamentPlayer = tournamentRoom.players.find(p => p.id === socket.playerId);
        if (!tournamentPlayer) {
          send(socket, "ERROR", { message: "No pertenecés a este match" });
          return;
        }
        await loadEquippedToRoomPlayer(tournamentPlayer, socket.playerId);
        doReconnect(socket, socket.playerId, tournamentRoom, null);
        return;
      }

      /* ── TOURNAMENT: REGISTER ───────────────────────── */
      if (type === "TOURNAMENT_REGISTER") {
        const { tournamentId } = data;
        try {
          await registerTournamentPlayer(tournamentId, socket.playerId, socket.playerName || socket.username || socket.playerId);
          send(socket, "TOURNAMENT_REGISTERED", { tournamentId });
        } catch (err) {
          send(socket, "ERROR", { message: err.message });
        }
        return;
      }

      /* ── TOURNAMENT: GET BRACKET ────────────────────── */
      if (type === "TOURNAMENT_GET_BRACKET") {
        const { getTournamentBracketData } = require("./database");
        const bracket = await getTournamentBracketData(data.tournamentId);
        if (bracket) {
          send(socket, "TOURNAMENT_BRACKET", { bracket });
        }
        return;
      }

      /* ── SOLICITUD DE AMISTAD ────────────────────────── */
      if (type === "FRIEND_REQUEST") {
        const { targetId } = data;
        if (!targetId) return;
        const targetPlayer = await pool.query('SELECT id FROM players WHERE id = $1 AND user_id IS NOT NULL', [targetId]);
        if (!targetPlayer.rows.length) {
          send(socket, 'ERROR', { message: 'Jugador no encontrado' });
          return;
        }
        let friendResult;
        try {
          friendResult = await addFriend(socket.playerId, targetId);
        } catch (e) {
          send(socket, 'ERROR', { message: e.message });
          return;
        }
        const sender = await pool.query('SELECT user_id FROM players WHERE id = $1', [socket.playerId]);
        const fromProfile = await getUserProfile(sender.rows[0]?.user_id);
        const fromName = fromProfile?.alias || data.playerName || 'Jugador';
        const fromAvatar = fromProfile?.equipped_avatar || '👤';
        // Enviar al objetivo
        const targetSock = clients.get(targetId);
        if (friendResult.accepted) {
          if (targetSock?.readyState === WebSocket.OPEN) {
            send(targetSock, 'FRIEND_ACCEPTED', { byId: socket.playerId, byName: fromName });
          }
          send(socket, 'FRIEND_ACCEPTED_OK', { fromId: targetId });
          return;
        }
        if (targetSock && targetSock.readyState === WebSocket.OPEN) {
          send(targetSock, 'FRIEND_REQUEST', {
            fromId: data.playerId,
            fromName,
            fromAvatar,
            timestamp: Date.now()
          });
        }
        send(socket, 'FRIEND_REQUEST_SENT', { targetId, accepted: !!friendResult.accepted });
        return;
      }

      /* ── ACEPTAR/RECHAZAR AMISTAD ─────────────────── */
      if (type === "FRIEND_ACCEPT") {
        const { requestId } = data;
        try {
          const accepted = await acceptFriendRequest(requestId, socket.playerId);
          const fromId = accepted.fromId;
          // Notificar al remitente
          const fromSock = clients.get(fromId);
          if (fromSock && fromSock.readyState === WebSocket.OPEN) {
            send(fromSock, 'FRIEND_ACCEPTED', {
              byId: data.playerId,
              byName: data.playerName
            });
          }
          send(socket, 'FRIEND_ACCEPTED_OK', { fromId });
        } catch(e) { send(socket, 'ERROR', { message: e.message }); }
        return;
      }

      if (type === "FRIEND_REJECT") {
        const { requestId } = data;
        try {
          await rejectFriendRequest(requestId, data.playerId);
          send(socket, 'FRIEND_REJECTED_OK', {});
        } catch(e) { send(socket, 'ERROR', { message: e.message }); }
        return;
      }

      /* ── INVITACIÓN A PARTIDA ───────────────────────── */
      if (type === "GAME_INVITE") {
        const { targetId, roomId, roomCode } = data;
        if (!targetId || !roomId) return;
        const targetExists = await pool.query('SELECT 1 FROM players WHERE id = $1 AND user_id IS NOT NULL', [targetId]);
        if (!targetExists.rows.length) {
          send(socket, 'ERROR', { message: 'Jugador no encontrado' });
          return;
        }
        const inviterId = data.playerId || socket.playerId;
        const fromProfile = await getUserProfile(
          (await pool.query('SELECT user_id FROM players WHERE id = $1', [inviterId])).rows[0]?.user_id
        );
        const room = rooms.get(roomId);
        const targetSock = clients.get(targetId);
        const inviterName = fromProfile?.alias || data.playerName || 'Jugador';
        const inviteId = crypto.randomUUID();
        const inviteData = {
          inviteId,
          fromId: inviterId,
          fromName: inviterName,
          fromAvatar: resolveAvatarIcon(fromProfile?.equipped_avatar) || '👤',
          roomId,
          roomCode: room?.code || '',
          playerCount: room?.players?.length || 0,
          maxPlayers: room?.maxPlayers || 10
        };
        await savePlayerNotification(targetId, {
          id: inviteId,
          type: 'game_invite',
          title: `${inviterName} te invitó a jugar`,
          message: `Unite a la partida (${inviteData.playerCount}/${inviteData.maxPlayers} jugadores)`,
          data: inviteData
        });
        if (targetSock && targetSock.readyState === WebSocket.OPEN) {
          send(targetSock, 'GAME_INVITE', inviteData);
        } else if (isPushReady()) {
          // Target offline: enviar push notification con datos de invitación
          try {
            const subRes = await pool.query(
              `SELECT subscription FROM push_subscriptions WHERE player_id = $1`,
              [targetId]
            );
            if (subRes.rows[0]) {
              const sub = typeof subRes.rows[0].subscription === 'string'
                ? JSON.parse(subRes.rows[0].subscription)
                : subRes.rows[0].subscription;
              const playerCount = room?.players?.length || 0;
              const maxPlayers = room?.maxPlayers || 10;
              await sendPushNotification(
                sub,
                `🎮 ${inviterName} te invitó a jugar`,
                `Unite a la partida (${playerCount}/${maxPlayers} jugadores)`,
                '/',
                { action: 'game_invite', ...inviteData }
              );
            }
          } catch(e) {
            console.error('Error sending push invite:', e.message);
          }
        }
        send(socket, 'GAME_INVITE_SENT', { targetId });
        return;
      }

      if (type === "GAME_INVITE_ACCEPT") {
        const { inviteId } = data;
        if (!inviteId) { send(socket, 'ERROR', { message: 'Invitación inválida' }); return; }
        const trustedInvite = await consumePlayerNotification(socket.playerId, inviteId, 'game_invite');
        if (!trustedInvite?.roomId) { send(socket, 'ERROR', { message: 'La invitación venció o ya fue usada' }); return; }
        const roomId = String(trustedInvite.roomId);
        const room = rooms.get(roomId);
        if (!room) { send(socket, 'ERROR', { message: 'Sala no encontrada' }); return; }
        // Verificar si el jugador ya está en la sala (reconexión)
        const alreadyInRoom = room.players.find(p => p.id === socket.playerId);
        if (alreadyInRoom) {
          doReconnect(socket, socket.playerId, room, getMatch(roomId) || null);
          return;
        }
        if (room.status !== 'waiting') {
          send(socket, 'ERROR', { message: 'La partida ya comenzó' }); return;
        }
        if (room.players.length >= room.maxPlayers) {
          send(socket, 'ERROR', { message: 'Sala llena' }); return;
        }
        const invPlayerId = socket.playerId;
        const safePlayerName = socket.playerName;
        let newPlayer;
        try {
          newPlayer = addPlayer(roomId, invPlayerId, safePlayerName);
        } catch (e) {
          send(socket, 'ERROR', { message: e.message || 'Error al unirse a la sala' }); return;
        }
        if (newPlayer) {
          await loadEquippedToRoomPlayer(newPlayer, invPlayerId);
          clients.set(invPlayerId, socket);
          socket.playerId = invPlayerId;
          socket.roomId = roomId;
          send(socket, 'JOIN_SUCCESS', { room });
          broadcastRoomState(roomId);
        }
        return;
      }

      if (type === "GAME_INVITE_REJECT") {
        const { inviteId } = data;
        if (!inviteId) return;
        const trustedInvite = await consumePlayerNotification(socket.playerId, inviteId, 'game_invite');
        if (!trustedInvite) return;
        const fromId = trustedInvite.fromId;
        const fromSock = clients.get(fromId);
        if (fromSock && fromSock.readyState === WebSocket.OPEN) {
          send(fromSock, 'GAME_INVITE_REJECTED', {
            byId: data.playerId,
            byName: data.playerName
          });
        }
        return;
      }

      /* ── CHAT ──────────────────────────────────────────── */
      if (type === "CHAT_MESSAGE") {
        const chatPlayer = rooms.get(data.roomId)?.players?.find(p => p.id === data.playerId);
        const message = filterChatMessage(data.message, 500);
        if (!message) return;
        broadcastRoom(data.roomId, "CHAT_MESSAGE", {
          playerId:   data.playerId,
          playerName: data.playerName,
          message,
          equippedSpecial: chatPlayer?.equippedSpecial || '',
          equippedSpecials: chatPlayer?.equippedSpecials || [],
          timestamp:  Date.now()
        });
        // Incrementar contador de mensajes de chat para las misiones
        try { await pool.query("UPDATE players SET chat_messages = chat_messages + 1 WHERE id = $1", [data.playerId]); } catch(e) {}
        return;
      }

      /* ── CHAT PRIVADO (entre amigos) ────────────────── */
      if (type === "PRIVATE_CHAT") {
        const msg = filterChatMessage(data.message, 500);
        if (!msg || !data.toId) return;
        const friendship = await pool.query(
          `SELECT 1 FROM friends WHERE status = 'accepted'
           AND ((player_id = $1 AND friend_id = $2) OR (player_id = $2 AND friend_id = $1))`,
          [socket.playerId, data.toId]
        );
        if (!friendship.rows.length) {
          send(socket, "ERROR", { message: "Sólo podés escribirle a tus amigos" });
          return;
        }
        // Guardar en DB
        savePrivateMessage(data.playerId, data.toId, data.playerName, msg).catch(e => console.warn('Private chat save failed:', e.message));
        // Enviar al destinatario si está conectado
        const targetSocket = clients.get(data.toId);
        if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
          send(targetSocket, "PRIVATE_CHAT", {
            fromId: data.playerId,
            fromName: data.playerName,
            message: msg,
            timestamp: Date.now()
          });
        }
        // Confirmar al remitente
        send(socket, "PRIVATE_CHAT_SENT", {
          toId: data.toId,
          message: msg,
          timestamp: Date.now()
        });
        return;
      }

      /* ── OBTENER HISTORIAL DE CHAT PRIVADO ───────────── */
      if (type === "GET_PRIVATE_CHAT") {
        const { friendId } = data;
        if (!friendId) return;
        const friendship = await pool.query(
          `SELECT 1 FROM friends WHERE status = 'accepted'
           AND ((player_id = $1 AND friend_id = $2) OR (player_id = $2 AND friend_id = $1))`,
          [socket.playerId, friendId]
        );
        if (!friendship.rows.length) {
          send(socket, "ERROR", { message: "Conversación no disponible" });
          return;
        }
        const messages = await getPrivateMessages(socket.playerId, friendId, 50);
        send(socket, "PRIVATE_CHAT_HISTORY", {
          friendId,
          messages
        });
        return;
      }

      /* ── CHAT GLOBAL ────────────────────────────────── */
      if (type === "GLOBAL_CHAT") {
        const msg = filterChatMessage(data.message, 300);
        if (!msg) return;
        // Broadcast PRIMERO (instantáneo), luego guardar en DB sin esperar
        for (const [pid, sock] of clients) {
          if (sock?.readyState === WebSocket.OPEN) {
            send(sock, "GLOBAL_CHAT", {
              playerId: data.playerId,
              playerName: data.playerName,
              message: msg,
              timestamp: Date.now()
            });
          }
        }
        // Guardar en DB sin await para no bloquear el broadcast
        saveGlobalMessage(socket.playerId || data.playerId, data.playerName, msg).catch(e => console.warn('Global chat save failed:', e.message));
        return;
      }

      /* ── EMOTE EN PARTIDA ─────────────────────────────── */
      if (type === "EMOTE") {
        const emote = String(data.emote || '').slice(0, 4);
        if (!emote) return;
        // Cooldown anti-spam: 2 segundos entre emotes por jugador
        const now = Date.now();
        if (socket._lastEmote && now - socket._lastEmote < 2000) return;
        socket._lastEmote = now;
        // Broadcast a todos en la misma sala
        const roomId = socket.roomId;
        if (roomId) {
          broadcastRoom(roomId, "EMOTE", {
            playerId:   socket.playerId,
            playerName: socket.playerName,
            emote,
            timestamp:  now
          });
        }
        return;
      }

      /* ── AUDIO CHAT ──────────────────────────────────── */
      if (type === "CHAT_AUDIO") {
        const audioData = String(data.audioData || "");
        if (!audioData || audioData.length > 300000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(audioData)) {
          send(socket, "ERROR", { message: "Audio inválido o demasiado grande" });
          return;
        }
        const duration = Number(data.duration);
        // Reenviar el audio a todos en la sala (sin persistir)
        broadcastRoom(data.roomId, "CHAT_AUDIO", {
          playerId:   data.playerId,
          playerName: data.playerName,
          audioData,
          duration:   Number.isFinite(duration) ? Math.max(0, Math.min(duration, 30)) : 0,
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
        if (room.isTournamentMatch) {
          const tournamentPlayer = room.players.find(p => p.id === playerId);
          if (tournamentPlayer) tournamentPlayer.disconnected = true;
          socket.roomId = null;
          send(socket, "LEFT_ROOM", { roomId });
          broadcastRoomState(roomId);
          return;
        }
        // Notificar a todos que este jugador se fue
        broadcastRoom(roomId, "PLAYER_REMOVED", { playerId });
        removePlayer(roomId, playerId);
        socket.roomId = null;
        // No eliminar de clients: el jugador sigue conectado al lobby
        cancelReadyCountdown(roomId);
        broadcastRoomState(roomId);
        return;
      }

      /* ── CANCELAR SALA ─────────────────────────────────── */
      if (type === "CANCEL_ROOM") {
        const { roomId, playerId } = data;
        const room = getRoom(roomId);
        if (!room || room.status !== "waiting") return;
        if (room.isTournamentMatch) {
          send(socket, "ERROR", { message: "Un match de torneo no se puede cancelar" });
          return;
        }
        const isOwner = room.players[0]?.id === playerId;
        if (!isOwner) return;
        cancelReadyCountdown(roomId);
        broadcastRoom(roomId, "ROOM_CANCELLED", { roomId });
      for (const p of room.players) {
        const sock = clients.get(p.id);
        if (sock) sock.roomId = null;
      }
      rooms.delete(roomId);
      rejectAllJoinRequests(roomId, 'La sala fue cancelada');
      // Si se cancela sala, limpiar invitados antiguos de la BD
      try {
        const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24h
        await pool.query(`DELETE FROM players WHERE user_id IS NULL AND created_at < $1`, [cutoff]);
        console.log('🧹 Limpieza de invitados antiguos completada');
      } catch(e) {}
      return;
      }

      if (type === "START_BOT_GAME") {
        try {
          const { botCount, difficulty } = data;
          if (!botCount || botCount < 1 || botCount > 5) {
            send(socket, "ERROR", { message: "Cantidad de bots inválida (1-5)" });
            return;
          }
          const validDiff = ['easy','normal','hard'];
          if (!validDiff.includes(difficulty)) {
            send(socket, "ERROR", { message: "Dificultad inválida (easy/normal/hard)" });
            return;
          }
          // Obtener datos del jugador
          const playerName = data.playerName || socket.playerName || 'Jugador';
          const playerId = data.playerId || socket.playerId;
          if (!playerId) {
            send(socket, "ERROR", { message: "No se pudo identificar al jugador" });
            return;
          }
          const activeRoom = findActivePlayerRoom(playerId);
          if (activeRoom) {
            send(socket, "ERROR", { message: "Ya estás en una partida activa" });
            return;
          }
          leaveWaitingRooms(playerId);

          // Crear sala para la partida contra bots
          const room = createRoom({
            ownerId: playerId,
            ownerName: playerName,
            isPrivate: data.isPrivate !== false,
            maxPlayers: 10,
            ownerIsGuest: !!socket.isGuest
          });
          room.isBotGame = true;
          
          // Vincular socket a la sala
          clients.set(playerId, socket);
          socket.playerId = playerId;
          socket.playerName = playerName;
          socket.roomId = room.id;
          
          // Enviar ROOM_CREATED al jugador
          send(socket, "ROOM_CREATED", { room });
          
          // Agregar bots a la sala
          botGameHandler.addBotsToRoom(room, botCount, difficulty);
          
          // Marcar al jugador humano como listo
          setReady(room.id, playerId, true);
          
          // Iniciar partida automáticamente
          setTimeout(async () => {
            try {
              await startMatchForRoom(room.id);
              // Registrar callback para que los bots jueguen automáticamente al cambiar el turno
              setTurnCallback(room.id, (rid) => {
                botGameHandler.scheduleBotTurnIfNeeded(rid, broadcastRoom);
              });
              // Programar el primer turno de bot si es necesario
              setTimeout(() => {
                botGameHandler.scheduleBotTurnIfNeeded(room.id, broadcastRoom);
              }, 1000);
            } catch (e) {
              console.error("Error starting bot match:", e.message);
            }
          }, 500);
          
          console.log(`🤖 Partida contra bots iniciada: ${botCount} bots (${difficulty}), jugador: ${playerName}`);
        } catch (err) {
          console.error("Error en START_BOT_GAME:", err);
          send(socket, "ERROR", { message: "Error al iniciar partida contra bots" });
        }
        return;
      }

      // ── DESAFÍO DIARIO ──────────────────────────────
      if (type === "START_DAILY") {
        try {
          const playerName = data.playerName || socket.playerName || 'Jugador';
          const playerId = data.playerId || socket.playerId;
          if (!playerId) {
            send(socket, "ERROR", { message: "No se pudo identificar al jugador" });
            return;
          }
          const activeRoom = findActivePlayerRoom(playerId);
          if (activeRoom) {
            send(socket, "ERROR", { message: "Ya estás en una partida activa" });
            return;
          }
          leaveWaitingRooms(playerId);

          // Crear sala solo para el jugador
          const room = createRoom({
            ownerId: playerId,
            ownerName: playerName,
            isPrivate: true,
            maxPlayers: 2,
            ownerIsGuest: !!socket.isGuest
          });
          room.isBotGame = true;
          room.isDailyChallenge = true;

          clients.set(playerId, socket);
          socket.playerId = playerId;
          socket.playerName = playerName;
          socket.roomId = room.id;

          send(socket, "ROOM_CREATED", { room });

          // Agregar 1 bot fácil como oponente
          botGameHandler.addBotsToRoom(room, 1, 'easy');
          setReady(room.id, playerId, true);

          setTimeout(async () => {
            try {
              await startMatchForRoom(room.id);
              setTurnCallback(room.id, (rid) => {
                botGameHandler.scheduleBotTurnIfNeeded(rid, broadcastRoom);
              });
              setTimeout(() => {
                botGameHandler.scheduleBotTurnIfNeeded(room.id, broadcastRoom);
              }, 1000);
            } catch (e) {
              console.error("Error starting daily match:", e.message);
            }
          }, 500);

          console.log(`🎯 Desafío diario iniciado: jugador: ${playerName}`);
        } catch (err) {
          console.error("Error en START_DAILY:", err);
          send(socket, "ERROR", { message: "Error al iniciar desafío diario" });
        }
        return;
      }

    } catch (err) {
      console.error("WS error:", err);
      send(socket, "ERROR", { message: "Error procesando mensaje" });
    }
  }

  /* ── DESCONEXIÓN ─────────────────────────────────────── */
  socket.on("close", async () => {
    clearTimeout(socket.authDeadline);
    if (socket.superseded) return;
    const { roomId, playerId } = socket;
    if (!roomId || !playerId) return;

    console.log(`⚡ Desconectado: ${playerId}`);

    try { await registerDisconnect(playerId); } catch (e) {}

    // Marcar como desconectado (no eliminar aún)
    const room = getRoom(roomId);
    if (room) {
      const p = room.players.find(p => p.id === playerId);
      if (p) p.disconnected = true;
      if (room.status === 'waiting') cancelReadyCountdown(roomId);
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

    // Verificar si es invitado (no tiene user_id en DB)
    const isGuest = await checkIfGuest(playerId);

    if (isGuest) {
      // Invitados: persisten durante la partida, no se eliminan
      // Solo si la sala está en waiting (sin partida activa), limpiar después de 5s
      if (!match && room && room.status === "waiting") {
        const timerId = setTimeout(() => {
          const currentRoom = getRoom(roomId);
          if (currentRoom) {
            broadcastRoom(roomId, "PLAYER_LEFT", { playerId });
            eliminatePlayer(roomId, playerId);
          } else {
            reconnTimers.delete(playerId);
            clients.delete(playerId);
          }
        }, 5000);
        reconnTimers.set(playerId, timerId);
      }
      // Si hay partida activa, el invitado queda hasta que termine
    } else {
      // Usuarios registrados: timer de 2 min para reconectar
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
    }
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
  try {
  const { token, newPassword } = req.body;
  if (typeof token !== 'string' || token.length < 32 || typeof newPassword !== 'string') {
    return res.status(400).json({ error: 'Solicitud inválida' });
  }
  if (newPassword.length < 10 || newPassword.length > 128) {
    return res.status(400).json({ error: 'La contraseña debe tener entre 10 y 128 caracteres' });
  }
  
  // Vamos a buscar el usuario SOLAMENTE por el token, sin mirar la fecha.
  // Además, quitamos el espacio por si acaso.
  const query = "SELECT id, reset_expires, NOW() as hora_servidor FROM users WHERE reset_token = $1";
  const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
  const result = await pool.query(query, [tokenHash]);
  
  
  if (result.rows.length === 0) {
    return res.status(400).json({ error: "El enlace es inválido o ya fue usado" });
  }

  // Ahora comprobamos la fecha manualmente aquí
  const row = result.rows[0];
    
  if (new Date(row.reset_expires) < new Date(row.hora_servidor)) {
      return res.status(400).json({ error: "El enlace es inválido o expiró" });
  }

  // Si llega aquí, actualizamos
  const hash = await bcrypt.hash(newPassword, 12);
  const updated = await pool.query(
    `UPDATE users
     SET password_hash = $1, reset_token = NULL, reset_expires = NULL,
         session_version = session_version + 1
     WHERE id = $2 AND reset_token = $3 AND reset_expires > NOW()
     RETURNING id`,
    [hash, row.id, tokenHash]
  );
  if (!updated.rows.length) {
    return res.status(400).json({ error: "El enlace es inválido, expiró o ya fue usado" });
  }
  
  res.json({ message: "Contraseña actualizada" });
  } catch (error) {
    console.error('Password reset:', error.message);
    res.status(503).json({ error: 'No se pudo actualizar la contraseña. Intentá nuevamente' });
  }
});

/* ── Limpieza periódica de invitados fantasma ──────────── */
async function cleanupGuestPlayers() {
  try {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24h
    const res = await pool.query(`
      DELETE FROM players p
      WHERE p.user_id IS NULL AND p.created_at < $1
        AND COALESCE(p.games_played, 0) = 0
        AND COALESCE(p.games_won, 0) = 0
        AND COALESCE(p.total_score, 0) = 0
        AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.player_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM redemptions r WHERE r.player_id = p.id)
    `, [cutoff]);
    if (res.rowCount > 0) console.log(`🧹 Limpiados ${res.rowCount} invitados antiguos`);
  } catch(e) {}
}
// Ejecutar cada 6 horas
setInterval(cleanupGuestPlayers, 6 * 60 * 60 * 1000);
cleanupGuestPlayers(); // también al iniciar

/* ── Init ────────────────────────────────────────────────── */
async function startServer() {
  try {
    await initializeDatabase();
    await migrateProduction(pool);
    databaseReady = true;
  } catch(e) {
    if (process.env.NODE_ENV === 'production') {
      console.error('Inicio bloqueado: base de datos o esquema no disponible:', e.message);
      await pool.end();
      process.exit(1);
    }
    console.error('⚠️ DB no disponible, arrancando en modo limitado:', e.message);
  }
  if (databaseReady) {
    retryPendingPayments().catch(error => console.error('Payment retries:', error.message));
    setInterval(() => retryPendingPayments().catch(error => console.error('Payment retries:', error.message)), 30_000).unref();
  }
  try { await initPush(); } catch(e) { console.error('⚠️ Push no disponible:', e.message); }
  try { initEmail(); } catch(e) { console.error('⚠️ Email no disponible:', e.message); }
  try { initTournamentManager(); } catch(e) { console.error('⚠️ Tournament Manager no disponible:', e.message); }

  // Limpieza periódica de chats viejos
  async function runChatCleanup() {
    const result = await cleanupPortalChats();
    if (result.cleaned) console.log(`🧹 Chat social compactado: ${result.global} globales, ${result.private} privados`);
  }
  runChatCleanup().catch(() => {});
  setInterval(() => runChatCleanup().catch(() => {}), 24 * 60 * 60 * 1000);
  cleanupExpiredNotifications().catch(() => {});
  setInterval(() => cleanupExpiredNotifications().catch(() => {}), 60 * 60 * 1000);

  // Bootstrap opcional: nunca hay credenciales administrativas en el código.
  const bootstrapAdmin = process.env.CEO_ADMIN_USERNAME;
  const bootstrapPassword = process.env.CEO_ADMIN_PASSWORD;
  if (bootstrapAdmin && bootstrapPassword) {
    try {
      const existing = await getAdminByUsername(bootstrapAdmin);
      if (!existing) {
        if (bootstrapPassword.length < 14) throw new Error('CEO_ADMIN_PASSWORD debe tener al menos 14 caracteres');
        const hash = await bcrypt.hash(bootstrapPassword, 12);
        await createAdmin(bootstrapAdmin, hash, 'admin');
        console.log(`👑 Administrador inicial creado: ${bootstrapAdmin}`);
      }
    } catch(e) {
      console.error('Error creando administrador inicial:', e.message);
    }
  } else {
    console.warn('⚠ CEO_ADMIN_USERNAME/CEO_ADMIN_PASSWORD no configurados; no se crea un administrador inicial');
  }

  server.listen(PORT, () => {
    console.log(`🚀 Servidor en http://localhost:${PORT}`);
  });
}

startServer();
