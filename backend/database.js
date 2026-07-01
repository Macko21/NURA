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

        await pool.query(`
      CREATE TABLE IF NOT EXISTS missions (
        id SERIAL PRIMARY KEY,
        player_id TEXT NOT NULL,
        mission_id TEXT NOT NULL,
        progress INTEGER DEFAULT 0,
        completed INTEGER DEFAULT 0,
        claimed INTEGER DEFAULT 0,
        UNIQUE(player_id, mission_id)
      );
    `);
    // Migraciones para columnas nuevas
    const migraciones = [
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS chat_messages INTEGER DEFAULT 0`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS shop_purchases INTEGER DEFAULT 0`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS perfect_game INTEGER DEFAULT 0`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS equipped_avatar TEXT DEFAULT ''`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS equipped_dice TEXT DEFAULT ''`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS equipped_special TEXT DEFAULT ''`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS last_chest BIGINT DEFAULT 0`,
    ];
    // Migración para tabla missions_reset (timestamps de reseteo)
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS missions_reset (
          player_id TEXT PRIMARY KEY,
          daily_reset BIGINT DEFAULT 0,
          weekly_reset BIGINT DEFAULT 0
        )
      `);
    } catch(e) {}
    for (const sql of migraciones) {
      try { await pool.query(sql); } catch(e) {}
    }
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
  // Solo mostrar jugadores que se registraron (tienen user_id)
  // Excluir invitados que no crearon cuenta
  const result = await pool.query(`
    SELECT *
    FROM players
    WHERE user_id IS NOT NULL
    ORDER BY games_won DESC,
             ranking_points DESC
    LIMIT 100
  `);

  return result.rows;
}

const crypto = require("crypto");

// --- SISTEMA DE NIVELES ---
const XP_PER_GAME = 25;
const XP_PER_WIN = 50;
const XP_PER_STREAK_WIN = 10;
const XP_PER_TOP3 = 15;
const RANKS = [
  { min: 0, max: 99, title: 'Rookie', icon: '🌱' },
  { min: 100, max: 299, title: 'Aprendiz', icon: '📖' },
  { min: 300, max: 599, title: 'Profesional', icon: '⚙️' },
  { min: 600, max: 1199, title: 'Maestro', icon: '🏅' },
  { min: 1200, max: 1999, title: 'Leyenda', icon: '🌟' },
  { min: 2000, max: 3499, title: 'Elite', icon: '💎' },
  { min: 3500, max: 5999, title: 'Mitico', icon: '⚡' },
  { min: 6000, max: Infinity, title: 'Dios', icon: '👑' }
];
const MAX_LEVEL = 300;
function getRank(xp) {
  return RANKS.find(r => xp >= r.min && xp <= r.max) || RANKS[RANKS.length - 1];
}
function getLevel(xp) {
  return Math.min(Math.floor(xp / 200) + 1, MAX_LEVEL);
}

// --- MISIONES ---
const MISSIONS = [
  { id: 'd1', type: 'daily', name: 'Jugador del dia', desc: 'Juga 3 partidas', req: 3, track: 'games_played', coins: 50, xp: 30 },
  { id: 'd2', type: 'daily', name: 'Ganador incipiente', desc: 'Gana 1 partida', req: 1, track: 'games_won', coins: 80, xp: 40 },
  { id: 'd3', type: 'daily', name: 'Dados calientes', desc: 'Acumula 5000 puntos totales', req: 5000, track: 'total_score', coins: 60, xp: 35 },
  { id: 'd4', type: 'daily', name: 'Comprador frecuente', desc: 'Compra 1 item en la tienda', req: 1, track: 'shop_purchases', coins: 40, xp: 20 },
  { id: 'w1', type: 'weekly', name: 'Vicio total', desc: 'Juga 20 partidas', req: 20, track: 'games_played', coins: 200, xp: 100 },
  { id: 'w2', type: 'weekly', name: 'Racha de triunfos', desc: 'Gana 5 partidas en la semana', req: 5, track: 'games_won', coins: 300, xp: 150 },
  { id: 'w3', type: 'weekly', name: 'Imparable', desc: 'Acumula 30000 puntos totales', req: 30000, track: 'total_score', coins: 250, xp: 120 },
  { id: 'a1', type: 'achievement', name: 'Primera victoria', desc: 'Gana tu primera partida', req: 1, track: 'games_won', coins: 100, xp: 50 },
  { id: 'a2', type: 'achievement', name: 'Veterano', desc: 'Juga 100 partidas', req: 100, track: 'games_played', coins: 500, xp: 200 },
  { id: 'a3', type: 'achievement', name: 'Imparable', desc: 'Gana 3 partidas seguidas', req: 3, track: 'win_streak', coins: 300, xp: 150 },
  { id: 'a4', type: 'achievement', name: 'Leyenda del juego', desc: 'Gana 50 partidas', req: 50, track: 'games_won', coins: 2000, xp: 500 },
  { id: 'a6', type: 'achievement', name: 'Coleccionista', desc: 'Compra 10 items en la tienda', req: 10, track: 'shop_purchases', coins: 800, xp: 300 },
  { id: 'a7', type: 'achievement', name: 'Dios de los dados', desc: 'Nivel 300', req: 300, track: 'level', coins: 5000, xp: 1000 },
  { id: 'a8', type: 'achievement', name: 'Perfecto', desc: 'Saca cinco 1 en una tirada', req: 1, track: 'perfect_game', coins: 1000, xp: 500 },
];


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

// --- CATÁLOGO DE TIENDA COMPLETO ---
// Diseñado por un game designer exitoso 🏆
const SHOP_CATALOG = [
  // ── DADOS (skins) ──
  { id: 1,  category: 'dados',     name: 'Dados Neón',       icon: '🎲', price: 500,  desc: 'Brillá en la oscuridad' },
  { id: 2,  category: 'dados',     name: 'Dados Fuego',      icon: '🔥', price: 1500, desc: 'Llamaradas al rodar' },
  { id: 4,  category: 'dados',     name: 'Dados Élite',      icon: '💎', price: 3000, desc: 'El lujo de ganar' },
  { id: 5,  category: 'dados',     name: 'Dados Fantasma',   icon: '👻', price: 2000, desc: 'Espectral y misterioso' },
  { id: 6,  category: 'dados',     name: 'Dados Hielo',      icon: '❄️', price: 2500, desc: 'Frío como la victoria' },
  { id: 18, category: 'dados',     name: 'Dados Láser',      icon: '🔴', price: 1200, desc: 'Precisión letal' },
  { id: 19, category: 'dados',     name: 'Dados Dorados',    icon: '🏅', price: 4000, desc: 'Oro puro en cada tiro' },
  { id: 20, category: 'dados',     name: 'Dados Esmeralda',  icon: '💚', price: 1800, desc: 'Suerte verde' },
  { id: 21, category: 'dados',     name: 'Dados Zombie',     icon: '🧟', price: 2200, desc: 'Apocalipsis en tus manos' },
  { id: 22, category: 'dados',     name: 'Dados Arcoíris',   icon: '🌈', price: 2800, desc: 'Todos los colores del éxito' },
  
  // ── AVATARES ──
  { id: 7,  category: 'avatares',  name: 'Pirata',        icon: '🏴‍☠️', price: 400,  desc: 'Izá la bandera' },
  { id: 8,  category: 'avatares',  name: 'Ninja',         icon: '🥷', price: 700,  desc: 'Sigilo y precisión' },
  { id: 9,  category: 'avatares',  name: 'Mago',          icon: '🧙', price: 600,  desc: 'Magia en los dados' },
  { id: 10, category: 'avatares',  name: 'Robot',         icon: '🤖', price: 1200, desc: 'Precisión mecánica' },
  { id: 11, category: 'avatares',  name: 'Fantasma',      icon: '👻', price: 1000, desc: 'Aparecé de la nada' },
  { id: 12, category: 'avatares',  name: 'Rey',           icon: '👑', price: 2000, desc: 'La corona es tuya' },
  { id: 13, category: 'avatares',  name: 'Dragón',        icon: '🐉', price: 2500, desc: 'Poder ancestral' },
  { id: 14, category: 'avatares',  name: 'Legendario',    icon: '⚡', price: 3500, desc: 'Solo para elegidos' },
  { id: 23, category: 'avatares',  name: 'Payaso',        icon: '🤡', price: 300,  desc: 'Risa mortal' },
  { id: 24, category: 'avatares',  name: 'Samurái',       icon: '⚔️', price: 1600, desc: 'Honor y victoria' },
  { id: 25, category: 'avatares',  name: 'Ángel',         icon: '😇', price: 2200, desc: 'Protección divina' },
  { id: 26, category: 'avatares',  name: 'Diablo',        icon: '😈', price: 1400, desc: 'Fuego infernal' },
  { id: 27, category: 'avatares',  name: 'Alien',         icon: '👽', price: 3000, desc: 'De otro mundo' },
  
  // ── ESPECIALES ──
  { id: 3,  category: 'especiales',name: 'Emotes VIP',         icon: '😎', price: 800,  desc: 'Emojis exclusivos en chat' },
  { id: 15, category: 'especiales',name: 'Marco Premium',      icon: '🖼️',  price: 1800, desc: 'Marco dorado en tu perfil' },
  { id: 16, category: 'especiales',name: 'Efecto Victoria',    icon: '🎆', price: 2800, desc: 'Celebración épica al ganar' },
  { id: 17, category: 'especiales',name: 'Tema Oscuro Ultra',  icon: '🌑', price: 1500, desc: 'Estilo nocturno supremo' },
  { id: 28, category: 'especiales',name: 'Nick Dorado',        icon: '✨', price: 2000, desc: 'Tu nombre brilla en el chat' },
  { id: 29, category: 'especiales',name: 'Dado Mag. Animado',  icon: '🪄', price: 3500, desc: 'Animación especial al tirar' },
  { id: 30, category: 'especiales',name: 'Racha Visible',      icon: '📢', price: 1200, desc: 'Todos ven tu racha de victorias' },
  { id: 31, category: 'especiales',name: '+50% Monedas x 1d',  icon: '⏫', price: 2500, desc: 'Ganás 50% más monedas por 24h' },
  
  // ── ULTRA RAROS (premium) ──
  { id: 32, category: 'ultra',     name: 'Dados Diamante',    icon: '💠', price: 5000, desc: 'Brillo eterno en cada tiro' },
  { id: 33, category: 'ultra',     name: 'Dados Galácticos',  icon: '🌌', price: 7000, desc: 'Poder estelar al rodar' },
  { id: 34, category: 'ultra',     name: 'Avatar Unicornio',  icon: '🦄', price: 6000, desc: 'Magia y rareza suprema' },
  { id: 35, category: 'ultra',     name: 'Avatar Fénix',      icon: '🔥', price: 8000, desc: 'Renacé de las cenizas' },
  { id: 36, category: 'ultra',     name: 'Efecto Láser',      icon: '💥', price: 10000, desc: 'Explosión láser al ganar' },
];

function getShopCatalog() {
  return SHOP_CATALOG.map(item => ({
    ...item,
    priceDisplay: item.price.toLocaleString('es-AR')
  }));
}

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
  
  // Buscar el ítem en el catálogo
  const item = SHOP_CATALOG.find(i => i.id === parseInt(itemId));
  if (!item) throw new Error("Ítem no válido");
  const cost = item.price;

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


// --- PERFIL DE USUARIO ---
async function getUserProfile(userId) {
  const result = await pool.query(`
    SELECT p.id, p.alias, p.name, p.coins, p.xp, p.level,
           p.games_played, p.games_won, p.total_score, p.highest_score,
           p.win_streak, u.email
    FROM players p
    JOIN users u ON u.id = p.user_id
    WHERE p.user_id = $1
  `, [userId]);
  if (!result.rows[0]) return null;
  const p = result.rows[0];
  const rank = getRank(p.xp || 0);
  return {
    id: p.id, alias: p.alias, email: p.email,
    coins: p.coins || 0, xp: p.xp || 0, level: p.level || 1,
    rank: rank.title, rankIcon: rank.icon,
    gamesPlayed: p.games_played || 0, gamesWon: p.games_won || 0,
    totalScore: p.total_score || 0, highestScore: p.highest_score || 0,
    winStreak: p.win_streak || 0
  };
}

// --- XP ---
async function awardXP(playerId, amount) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const res = await client.query(
      `UPDATE players SET xp = xp + $1 WHERE id = $2 RETURNING xp, level`,
      [amount, playerId]
    );
    if (res.rows.length === 0) { await client.query("ROLLBACK"); return {}; }
    const newXp = res.rows[0].xp;
    const newLevel = getLevel(newXp);
    const leveledUp = newLevel > (res.rows[0].level || 1);
    if (leveledUp) {
      await client.query(`UPDATE players SET level = $1 WHERE id = $2`, [newLevel, playerId]);
    }
    await client.query("COMMIT");
    return { xp: newXp, level: newLevel, leveledUp };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// --- MISIONES ---
const DAY_MS  = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

async function getPlayerMissions(playerId) {
  // Obtener timestamps de reseteo
  const resetRes = await pool.query(`SELECT daily_reset, weekly_reset FROM missions_reset WHERE player_id = $1`, [playerId]);
  const now = Date.now();
  let dailyReset  = resetRes.rows[0]?.daily_reset || 0;
  let weeklyReset = resetRes.rows[0]?.weekly_reset || 0;
  const isNewDaily  = (now - dailyReset) > DAY_MS;
  const isNewWeekly = (now - weeklyReset) > WEEK_MS;

  // Si pasó el daily reset, marcar claimed de diarias como 0 para que se puedan re-completar
  if (isNewDaily) {
    await pool.query(
      `UPDATE missions SET claimed = 0, completed = 0 WHERE player_id = $1 AND mission_id LIKE 'd%'`,
      [playerId]
    );
    await pool.query(
      `INSERT INTO missions_reset (player_id, daily_reset, weekly_reset) VALUES ($1, $2, $3)
       ON CONFLICT (player_id) DO UPDATE SET daily_reset = $2`,
      [playerId, now, weeklyReset]
    );
    dailyReset = now;
  }
  if (isNewWeekly) {
    await pool.query(
      `UPDATE missions SET claimed = 0, completed = 0 WHERE player_id = $1 AND mission_id LIKE 'w%'`,
      [playerId]
    );
    await pool.query(
      `INSERT INTO missions_reset (player_id, daily_reset, weekly_reset) VALUES ($1, $2, $3)
       ON CONFLICT (player_id) DO UPDATE SET weekly_reset = $2`,
      [playerId, dailyReset, now]
    );
    weeklyReset = now;
  }

  const res = await pool.query(
    `SELECT mission_id, progress, completed, claimed FROM missions WHERE player_id = $1`,
    [playerId]
  );
  const progressMap = {};
  res.rows.forEach(r => {
    progressMap[r.mission_id] = { progress: r.progress, completed: r.completed, claimed: r.claimed };
  });
  const playerRes = await pool.query(`SELECT * FROM players WHERE id = $1`, [playerId]);
  const p = playerRes.rows[0] || {};
  const stats = {
    games_played: p.games_played || 0, games_won: p.games_won || 0,
    total_score: p.total_score || 0, win_streak: p.win_streak || 0,
    shop_purchases: p.shop_purchases || 0, chat_messages: p.chat_messages || 0,
    perfect_game: p.perfect_game || 0, level: p.level || 1
  };
  return MISSIONS.map(m => {
    const saved = progressMap[m.id];
    let currentProgress = stats[m.track] || 0;
    // Para diarias y semanales, si se reseteó, el progreso es 0
    if (m.type === 'daily' && isNewDaily) currentProgress = 0;
    if (m.type === 'weekly' && isNewWeekly) currentProgress = 0;
    const completed = currentProgress >= m.req ? 1 : 0;
    return { ...m, progress: Math.min(currentProgress, m.req), completed, claimed: saved?.claimed || 0 };
  });
}

async function claimMissionReward(playerId, missionId) {
  const mission = MISSIONS.find(m => m.id === missionId);
  if (!mission) throw new Error("Mision no encontrada");
  
  // Verificar que este completada
  const missions = await getPlayerMissions(playerId);
  const m = missions.find(x => x.id === missionId);
  if (!m || !m.completed) throw new Error("Mision no completada");
  if (m.claimed) throw new Error("Mision ya reclamada");

  // Guardar claim
  await pool.query(
    `INSERT INTO missions (player_id, mission_id, progress, completed, claimed)
     VALUES ($1, $2, $3, 1, 1)
     ON CONFLICT (player_id, mission_id)
     DO UPDATE SET claimed = 1`,
    [playerId, missionId, mission.req]
  );

  // Dar recompensas
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE players SET coins = coins + $1 WHERE id = $2`, [mission.coins, playerId]);
    if (mission.xp > 0) {
      await client.query(`UPDATE players SET xp = xp + $1 WHERE id = $2`, [mission.xp, playerId]);
    }
    await client.query(
      `INSERT INTO transactions (player_id, amount, reason, created_at) VALUES ($1, $2, $3, $4)`,
      [playerId, mission.coins, 'Mision: ' + mission.name, Date.now()]
    );
    await client.query("COMMIT");
    return { coins: mission.coins, xp: mission.xp, missionName: mission.name };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function checkMissionsCompleted(playerId) {
  const missions = await getPlayerMissions(playerId);
  return missions.filter(m => m.completed && !m.claimed);
}

// ── COFRE DIARIO ────────────────────────────────────────
const CHEST_DAY_MS = 24 * 60 * 60 * 1000;
const CHEST_COINS_MIN = 50;
const CHEST_COINS_MAX = 200;
const CHEST_ITEM_CHANCE = 0.05; // 5% de chance de obtener un item ultra raro gratis
const CHEST_ULTRA_ITEMS = SHOP_CATALOG.filter(i => i.category === 'ultra');

async function claimDailyChest(userId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const res = await client.query(`SELECT id, coins, last_chest FROM players WHERE user_id = $1 FOR UPDATE`, [userId]);
    if (!res.rows[0]) throw new Error('Jugador no encontrado');
    const p = res.rows[0];
    const now = Date.now();
    if (now - (p.last_chest || 0) < CHEST_DAY_MS) {
      const remaining = CHEST_DAY_MS - (now - (p.last_chest || 0));
      const hours = Math.floor(remaining / 3600000);
      const mins = Math.floor((remaining % 3600000) / 60000);
      throw new Error(`Ya reclamaste tu cofre. Volvé en ${hours}h ${mins}min`);
    }
    // Monedas aleatorias
    const coins = Math.floor(Math.random() * (CHEST_COINS_MAX - CHEST_COINS_MIN + 1)) + CHEST_COINS_MIN;
    await client.query(`UPDATE players SET coins = coins + $1, last_chest = $2 WHERE id = $3`, [coins, now, p.id]);
    await client.query(`INSERT INTO transactions (player_id, amount, reason, created_at) VALUES ($1, $2, $3, $4)`,
      [p.id, coins, 'Cofre diario', now]);
    
    let itemGained = null;
    // 5% de chance de item ultra
    if (Math.random() < CHEST_ITEM_CHANCE && CHEST_ULTRA_ITEMS.length > 0) {
      const randomItem = CHEST_ULTRA_ITEMS[Math.floor(Math.random() * CHEST_ULTRA_ITEMS.length)];
      await client.query(`INSERT INTO redemptions (player_id, reward_id, status, created_at) VALUES ($1, $2, 'completed', $3)`,
        [p.id, randomItem.id, now]);
      itemGained = { id: randomItem.id, name: randomItem.name, icon: randomItem.icon };
    }
    await client.query("COMMIT");
    return { coins, itemGained };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function getChestStatus(userId) {
  const res = await pool.query(`SELECT last_chest FROM players WHERE user_id = $1`, [userId]);
  const lastChest = res.rows[0]?.last_chest || 0;
  const now = Date.now();
  const canClaim = (now - lastChest) >= CHEST_DAY_MS;
  const remaining = canClaim ? 0 : CHEST_DAY_MS - (now - lastChest);
  return { canClaim, remaining, lastChest };
}

// ── INVENTARIO ────────────────────────────────────────────
async function getOwnedItems(userId) {
  try {
    const playerRes = await pool.query(`SELECT * FROM players WHERE user_id = $1`, [userId]);
    if (!playerRes.rows[0]) return { owned: [], equipped: {} };
    const p = playerRes.rows[0];
    const redRes = await pool.query(`SELECT reward_id FROM redemptions WHERE player_id = $1 AND status = 'completed'`, [p.id]);
    const ownedIds = redRes.rows.map(r => r.reward_id);
    const owned = SHOP_CATALOG.filter(item => ownedIds.includes(item.id));
    const equipped = {
      avatar: p.equipped_avatar || '',
      dice: p.equipped_dice || '',
      special: p.equipped_special || ''
    };
    return { owned, equipped };
  } catch (err) {
    console.error("getOwnedItems error:", err.message);
    return { owned: [], equipped: {} };
  }
}

async function equipItem(playerId, itemId, category) {
  // category: 'avatar' | 'dice' | 'special'
  const colMap = { avatar: 'equipped_avatar', dice: 'equipped_dice', special: 'equipped_special' };
  const col = colMap[category];
  if (!col) throw new Error('Categoria invalida');
  
  // Verificar que posee el item
  const redRes = await pool.query(`SELECT id FROM redemptions WHERE player_id = $1 AND reward_id = $2 AND status = 'completed'`, [playerId, parseInt(itemId)]);
  if (!redRes.rows.length && itemId !== 'default') throw new Error('No posees este item');
  
  await pool.query(`UPDATE players SET ${col} = $1 WHERE id = $2`, [itemId === 'default' ? '' : String(itemId), playerId]);
  return { success: true };
}

async function getAvatarUrl(playerId) {
  const res = await pool.query(`SELECT equipped_avatar FROM players WHERE id = $1`, [playerId]);
  if (!res.rows[0]) return null;
  const avatarId = res.rows[0].equipped_avatar;
  if (!avatarId) return null;
  const item = SHOP_CATALOG.find(i => i.id === parseInt(avatarId) && i.category === 'avatares');
  return item ? item.icon : null;
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
  getShopCatalog,
  rewardWinner,
  pool,
  getUserProfile, awardXP, getLevel, getRank,
  getPlayerMissions, claimMissionReward, checkMissionsCompleted,
  MISSIONS, RANKS, SHOP_CATALOG, getOwnedItems, equipItem,
  claimDailyChest, getChestStatus
};