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
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS boost_expires BIGINT DEFAULT 0`,
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS last_seen BIGINT DEFAULT 0`,
      `ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS is_scheduled BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS schedule_interval TEXT DEFAULT NULL`,
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
    // Tabla de amigos
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS friends (
          id SERIAL PRIMARY KEY,
          player_id TEXT NOT NULL,
          friend_id TEXT NOT NULL,
          status TEXT DEFAULT 'accepted',
          created_at BIGINT NOT NULL,
          UNIQUE(player_id, friend_id)
        )
      `);
    } catch(e) {}
    // Tabla de mensajes globales (chat entre usuarios)
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS global_chat (
          id SERIAL PRIMARY KEY,
          player_id TEXT NOT NULL,
          player_name TEXT NOT NULL,
          message TEXT NOT NULL,
          created_at BIGINT NOT NULL
        )
      `);
    } catch(e) {}
    // Tabla de mensajes privados entre amigos
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS private_messages (
          id SERIAL PRIMARY KEY,
          from_id TEXT NOT NULL,
          to_id TEXT NOT NULL,
          from_name TEXT NOT NULL,
          message TEXT NOT NULL,
          created_at BIGINT NOT NULL
        )
      `);
    } catch(e) {}
    // Índices para consultas rápidas de mensajes privados
    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_private_msgs_from_to ON private_messages(from_id, to_id)`);
    } catch(e) {}
    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_private_msgs_to_from ON private_messages(to_id, from_id)`);
    } catch(e) {}
    // Tabla de admins (CEO panel)
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS admins (
          id SERIAL PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'editor',
          created_at BIGINT NOT NULL
        )
      `);
    } catch(e) {}
    // Migración: agregar columna role si no existe (para admins existentes)
    try {
      await pool.query(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'editor'`);
    } catch(e) {}
    // Tabla de feedback de usuarios
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS feedback (
          id SERIAL PRIMARY KEY,
          player_id TEXT NOT NULL,
          player_name TEXT NOT NULL,
          category TEXT NOT NULL,
          message TEXT NOT NULL,
          created_at BIGINT NOT NULL
        )
      `);
    } catch(e) {}
    // Columnas de baneo en users
    try {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_permanent BOOLEAN DEFAULT FALSE`);
    } catch(e) {}
    try {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_until BIGINT DEFAULT 0`);
    } catch(e) {    }
    // Columnas de respuesta de admin en feedback
    try {
      await pool.query(`ALTER TABLE feedback ADD COLUMN IF NOT EXISTS admin_response TEXT DEFAULT NULL`);
    } catch(e) {}
    try {
      await pool.query(`ALTER TABLE feedback ADD COLUMN IF NOT EXISTS admin_responded_at BIGINT DEFAULT NULL`);
    } catch(e) {}
    try {
      await pool.query(`ALTER TABLE feedback ADD COLUMN IF NOT EXISTS admin_username TEXT DEFAULT NULL`);
    } catch(e) {}
    // Tabla de audit_log
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS audit_log (
          id SERIAL PRIMARY KEY,
          admin_username TEXT NOT NULL,
          action TEXT NOT NULL,
          target_id TEXT,
          details TEXT,
          created_at BIGINT NOT NULL
        )
      `);
    } catch(e) {    }
    // Tabla de push_subscriptions
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS push_subscriptions (
          player_id TEXT PRIMARY KEY,
          subscription TEXT NOT NULL,
          created_at BIGINT NOT NULL
        )
      `);
    } catch(e) {}
    // Tabla de shop_items (CRUD del CEO panel)
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS shop_items (
          id SERIAL PRIMARY KEY,
          category TEXT NOT NULL,
          name TEXT NOT NULL,
          icon TEXT NOT NULL DEFAULT '🎲',
          price INTEGER NOT NULL DEFAULT 0,
          description TEXT DEFAULT '',
          enabled BOOLEAN DEFAULT TRUE,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        )
      `);
    } catch(e) {}
    // ── TORNEOS ──────────────────────────────────────────────
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS tournaments (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT DEFAULT '',
          status TEXT DEFAULT 'registration',
          type TEXT DEFAULT 'single_elimination',
          max_players INTEGER NOT NULL DEFAULT 16,
          min_players INTEGER NOT NULL DEFAULT 4,
          fee INTEGER NOT NULL DEFAULT 0,
          prize_pool INTEGER DEFAULT 0,
          prizes JSONB DEFAULT '[]',
          rounds INTEGER DEFAULT 4,
          current_round INTEGER DEFAULT 0,
          start_time BIGINT NOT NULL,
          registration_until BIGINT,
          created_at BIGINT NOT NULL,
          created_by TEXT DEFAULT 'system'
        )
      `);
    } catch(e) { console.error('Error creating tournaments table:', e.message); }
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS tournament_participants (
          id SERIAL PRIMARY KEY,
          tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
          player_id TEXT NOT NULL,
          player_name TEXT NOT NULL,
          seed INTEGER DEFAULT 0,
          status TEXT DEFAULT 'registered',
          eliminated_round INTEGER DEFAULT 0,
          final_position INTEGER DEFAULT 0,
          registered_at BIGINT NOT NULL,
          UNIQUE(tournament_id, player_id)
        )
      `);
    } catch(e) { console.error('Error creating tournament_participants table:', e.message); }
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS tournament_matches (
          id SERIAL PRIMARY KEY,
          tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
          round INTEGER NOT NULL,
          match_index INTEGER NOT NULL,
          player1_id TEXT,
          player2_id TEXT,
          player1_name TEXT DEFAULT '',
          player2_name TEXT DEFAULT '',
          player1_score INTEGER DEFAULT 0,
          player2_score INTEGER DEFAULT 0,
          winner_id TEXT,
          status TEXT DEFAULT 'pending',
          room_code TEXT,
          played_at BIGINT,
          UNIQUE(tournament_id, round, match_index)
        )
      `);
    } catch(e) { console.error('Error creating tournament_matches table:', e.message); }
    for (const sql of migraciones) {
      try { await pool.query(sql); } catch(e) {}
    }
    // Seed de items del shop desde el catálogo estático (solo la primera vez)
    await seedShopItemsFromCatalog();
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
  // XP no-lineal: cada 10 niveles sube la dificultad
  // Lv1→10: 200xp/nivel, Lv11→30: 350, Lv31→60: 600, Lv61→100: 1000, Lv101→200: 1800, Lv201→300: 3000
  let level = 1;
  let totalXp = 0;
  while (level < MAX_LEVEL) {
    const cost = xpCostForLevel(level);
    if (totalXp + cost > xp) break;
    totalXp += cost;
    level++;
  }
  return Math.min(level, MAX_LEVEL);
}
function xpCostForLevel(level) {
  if (level <= 10)  return 200;
  if (level <= 30)  return 350;
  if (level <= 60)  return 600;
  if (level <= 100) return 1000;
  if (level <= 200) return 1800;
  return 3000;
}
function xpToNextLevel(currentLevel) {
  return xpCostForLevel(currentLevel);
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

async function getShopCatalog() {
  try {
    const dbItems = await pool.query(`SELECT * FROM shop_items WHERE enabled = TRUE ORDER BY category, price ASC`);
    if (dbItems.rows.length > 0) {
      return dbItems.rows.map(item => ({
        id: item.id,
        category: item.category,
        name: item.name,
        icon: item.icon,
        price: item.price,
        desc: item.description,
        priceDisplay: item.price.toLocaleString('es-AR')
      }));
    }
  } catch(e) {}
  // Fallback: solo si la tabla shop_items no existe aún
  // Filtrar duplicados del catálogo hardcodeado (por nombre+categoría)
  const seen = new Set();
  return SHOP_CATALOG.filter(item => {
    const key = item.name + '|' + item.category;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(item => ({
    ...item,
    priceDisplay: item.price.toLocaleString('es-AR')
  }));
}

async function getShopItemById(itemId) {
  // Buscar primero en la DB
  try {
    const res = await pool.query(`SELECT * FROM shop_items WHERE id = $1 AND enabled = TRUE`, [itemId]);
    if (res.rows[0]) {
      const item = res.rows[0];
      return { id: item.id, category: item.category, name: item.name, icon: item.icon, price: item.price, desc: item.description };
    }
  } catch(e) {}
  // Fallback al hardcode
  return SHOP_CATALOG.find(i => i.id === parseInt(itemId)) || null;
}

// ── Verificar si el jugador tiene boost de +50% activo ──
async function checkBoostActive(playerId) {
  try {
    const res = await pool.query(`SELECT equipped_special, boost_expires FROM players WHERE id = $1`, [playerId]);
    if (!res.rows[0]) return false;
    const { equipped_special, boost_expires } = res.rows[0];
    if (equipped_special !== '31') return false;
    if (!boost_expires || Date.now() > Number(boost_expires)) return false;
    return true;
  } catch (e) {
    console.error('Error checking boost:', e.message);
    return false;
  }
}

// ── Obtener estado del boost (para el frontend) ────────
async function getBoostStatus(playerId) {
  try {
    const res = await pool.query(`SELECT equipped_special, boost_expires FROM players WHERE id = $1`, [playerId]);
    if (!res.rows[0]) return { active: false, remaining: 0 };
    const { equipped_special, boost_expires } = res.rows[0];
    if (equipped_special !== '31' || !boost_expires) return { active: false, remaining: 0 };
    const remaining = Number(boost_expires) - Date.now();
    if (remaining <= 0) return { active: false, remaining: 0 };
    return { active: true, remaining };
  } catch (e) {
    return { active: false, remaining: 0 };
  }
}

// --- SISTEMA DE RECOMPENSAS ---
async function rewardWinner(playerId, coinsAmount) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    
    // Verificar boost de +50% (item 31) antes de sumar
    const boostRes = await client.query(`SELECT equipped_special, boost_expires FROM players WHERE id = $1`, [playerId]);
    let finalAmount = coinsAmount;
    let boostNote = '';
    if (boostRes.rows[0]) {
      const { equipped_special, boost_expires } = boostRes.rows[0];
      if (equipped_special === '31' && boost_expires && Date.now() < Number(boost_expires)) {
        finalAmount = Math.round(coinsAmount * 1.5);
        boostNote = ' (+50% boost)';
      }
    }
    
    // Sumar las monedas al jugador
    await client.query(
      `UPDATE players SET coins = coins + $1 WHERE id = $2`,
      [finalAmount, playerId]
    );

    // Guardar en el historial de transacciones
    await client.query(
      `INSERT INTO transactions (player_id, amount, reason, created_at) 
       VALUES ($1, $2, $3, $4)`,
      [playerId, finalAmount, 'Victoria en partida' + boostNote, Date.now()]
    );

    await client.query("COMMIT");
    if (boostNote) {
      console.log(`💰 ${finalAmount} monedas (${coinsAmount}x1.5) → ${playerId} (boost +50% activo)`);
    }
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error al entregar recompensa:", err);
  } finally {
    client.release();
  }
}

async function buyShopItem(userId, itemId) {
  const client = await pool.connect();
  
  // Buscar el ítem en la DB o en el catálogo hardcodeado
  const item = await getShopItemById(itemId);
  if (!item) throw new Error("Ítem no válido");
  const cost = item.price;

  try {
    await client.query("BEGIN");

    // 1. Obtener el jugador y bloquear la fila para evitar compras duplicadas simultáneas
    const playerRes = await client.query(
      `SELECT id, coins, shop_purchases FROM players WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );

    const player = playerRes.rows[0];
    if (!player) throw new Error("Jugador no encontrado");
    if (player.coins < cost) throw new Error("No tienes suficientes monedas 🪙");

    // 2. Restar las monedas
    const newBalance = player.coins - cost;
    await client.query(
      `UPDATE players SET coins = $1, shop_purchases = COALESCE(shop_purchases, 0) + 1 WHERE user_id = $2`,
      [newBalance, userId]
    );

    // 3. Registrar la compra en redemptions
    const now = Date.now();
    await client.query(
      `INSERT INTO redemptions (player_id, reward_id, status, created_at) 
       VALUES ($1, $2, $3, $4)`,
      [player.id, parseInt(itemId), 'completed', now]
    );

    // 4. Registrar en transactions (historial)
    await client.query(
      `INSERT INTO transactions (player_id, amount, reason, created_at) VALUES ($1, $2, $3, $4)`,
      [player.id, -cost, 'Compra: ' + item.name, now]
    );

    await client.query("COMMIT");
    console.log(`✅ ${player.id} compró ${item.name} por ${cost}🪙`);
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
  const level = p.level || 1;
  const xp = p.xp || 0;
  // XP total necesario para llegar al nivel actual
  let xpForCurrentLevel = 0;
  for (let i = 1; i < level; i++) xpForCurrentLevel += xpCostForLevel(i);
  const xpInCurrentLevel = xp - xpForCurrentLevel;
  const xpForNext = xpCostForLevel(level);
  return {
    id: p.id, alias: p.alias, email: p.email,
    coins: p.coins || 0, xp, level,
    rank: rank.title, rankIcon: rank.icon,
    xpForNext, xpInCurrentLevel,
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
// Helper: inicio del día actual (medianoche 00:00)
function getStartOfDay() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
// Helper: inicio de la semana actual (lunes 00:00)
function getStartOfWeek() {
  const d = new Date();
  const day = d.getDay(); // 0=domingo, 1=lunes, ..., 6=sábado
  const diff = (day === 0 ? 6 : day - 1); // días desde el lunes
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const DAY_MS  = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

async function getPlayerMissions(playerId) {
  // Obtener timestamps de reseteo
  const resetRes = await pool.query(`SELECT daily_reset, weekly_reset FROM missions_reset WHERE player_id = $1`, [playerId]);
  const now = Date.now();
  let dailyReset  = resetRes.rows[0]?.daily_reset || 0;
  let weeklyReset = resetRes.rows[0]?.weekly_reset || 0;
  // Reset a medianoche (00:00) en vez de 24h desde última vez
  const startOfToday = getStartOfDay();
  const startOfWeek = getStartOfWeek();
  const isNewDaily  = dailyReset < startOfToday;
  const isNewWeekly = weeklyReset < startOfWeek;

  // Si pasó el daily reset, marcar claimed de diarias como 0 para que se puedan re-completar
  if (isNewDaily) {
    await pool.query(
      `UPDATE missions SET claimed = 0, completed = 0 WHERE player_id = $1 AND mission_id LIKE 'd%'`,
      [playerId]
    );
    await pool.query(
      `INSERT INTO missions_reset (player_id, daily_reset, weekly_reset) VALUES ($1, $2, $3)
       ON CONFLICT (player_id) DO UPDATE SET daily_reset = $2`,
      [playerId, startOfToday, weeklyReset]
    );
    dailyReset = startOfToday;
  }
  if (isNewWeekly) {
    await pool.query(
      `UPDATE missions SET claimed = 0, completed = 0 WHERE player_id = $1 AND mission_id LIKE 'w%'`,
      [playerId]
    );
    await pool.query(
      `INSERT INTO missions_reset (player_id, daily_reset, weekly_reset) VALUES ($1, $2, $3)
       ON CONFLICT (player_id) DO UPDATE SET weekly_reset = $2`,
      [playerId, dailyReset, startOfWeek]
    );
    weeklyReset = startOfWeek;
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
    if (!playerRes.rows[0]) {
      return { owned: [], equipped: {} };
    }
    const p = playerRes.rows[0];
    // Obtener items comprados desde redemptions
    const redRes = await pool.query(`SELECT reward_id FROM redemptions WHERE player_id = $1 AND status = 'completed'`, [p.id]);
    const ownedIds = new Set(redRes.rows.map(r => Number(r.reward_id)));
    
    // Construir catálogo unificado: DB items + hardcoded items
    let allItems = [];
    try {
      const dbRes = await pool.query(`SELECT * FROM shop_items WHERE enabled = TRUE`);
      if (dbRes.rows.length > 0) {
        allItems = dbRes.rows.map(item => ({
          id: item.id, category: item.category, name: item.name,
          icon: item.icon, price: item.price, desc: item.description
        }));
      }
    } catch(e) {}
    // Agregar items del catálogo hardcodeado que no existan en DB (comparar por nombre+categoría)
    for (const item of SHOP_CATALOG) {
      if (!allItems.find(i => i.name === item.name && i.category === item.category)) {
        allItems.push(item);
      }
    }
    
    const owned = allItems.filter(item => ownedIds.has(item.id));
    const equipped = {
      avatar: String(p.equipped_avatar || ''),
      dice: String(p.equipped_dice || ''),
      special: String(p.equipped_special || '')
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
  
  // Verificar que posee el item (solo si NO es 'default')
  if (itemId !== 'default') {
    const parsedId = parseInt(itemId);
    if (isNaN(parsedId)) throw new Error('ID de item invalido');
    const redRes = await pool.query(`SELECT id FROM redemptions WHERE player_id = $1 AND reward_id = $2 AND status = 'completed'`, [playerId, parsedId]);
    if (!redRes.rows.length) throw new Error('No posees este item');
  }
  
  await pool.query(`UPDATE players SET ${col} = $1 WHERE id = $2`, [itemId === 'default' ? '' : String(itemId), playerId]);
  
  // Si se equipa el item 31 (+50% Monedas x 1d), activar el boost por 24h
  if (itemId === '31') {
    const expires = Date.now() + 24 * 60 * 60 * 1000; // 24h desde ahora
    await pool.query(`UPDATE players SET boost_expires = $1 WHERE id = $2`, [expires, playerId]);
    console.log(`⏫ Boost +50% activado para ${playerId} - expira ${new Date(expires).toISOString()}`);
  }
  
  return { success: true };
}

async function getAvatarUrl(playerId) {
  const res = await pool.query(`SELECT equipped_avatar FROM players WHERE id = $1`, [playerId]);
  if (!res.rows[0]) return null;
  const avatarId = res.rows[0].equipped_avatar;
  if (!avatarId) return null;
  const item = SHOP_CATALOG.find(i =>
    i.id === parseInt(avatarId) && (i.category === 'avatares' || [34, 35].includes(i.id))
  );
  return item ? item.icon : null;
}

// ── HISTORIAL DE TRANSACCIONES ──────────────────────────
async function getPlayerTransactions(playerId, limit = 50) {
  try {
    const res = await pool.query(
      `SELECT id, amount, reason, created_at FROM transactions WHERE player_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [playerId, limit]
    );
    return res.rows;
  } catch (err) {
    console.error("getPlayerTransactions error:", err.message);
    return [];
  }
}

// ── AMIGOS ────────────────────────────────────────────────
async function getFriends(playerId) {
  try {
    const res = await pool.query(`
      SELECT p.id, p.alias, p.name, p.equipped_avatar, p.games_played, p.games_won,
             p.last_seen
      FROM friends f
      JOIN players p ON p.id = f.friend_id
      WHERE f.player_id = $1 AND f.status = 'accepted'
      ORDER BY p.alias
    `, [playerId]);
    return res.rows;
  } catch(e) { return []; }
}

async function addFriend(playerId, friendId) {
  if (playerId === friendId) throw new Error('No podés agregarte a vos mismo');
  // Verificar si ya existe una relación (en cualquier dirección)
  const exists = await pool.query(
    `SELECT id, status FROM friends WHERE (player_id = $1 AND friend_id = $2) OR (player_id = $2 AND friend_id = $1)`,
    [playerId, friendId]
  );
  if (exists.rows.length > 0) {
    const row = exists.rows[0];
    if (row.status === 'accepted') throw new Error('Ya son amigos');
    if (row.status === 'pending') {
      // Si la solicitud viene del otro lado, aceptarla automáticamente
      if (exists.rows[0]) {
        await pool.query(`UPDATE friends SET status = 'accepted' WHERE id = $1`, [row.id]);
        return { success: true, accepted: true };
      }
      throw new Error('Solicitud ya enviada');
    }
  }
  await pool.query(
    `INSERT INTO friends (player_id, friend_id, status, created_at) VALUES ($1, $2, 'pending', $3)`,
    [playerId, friendId, Date.now()]
  );
  return { success: true, pending: true };
}

async function acceptFriendRequest(requestId, playerId) {
  const res = await pool.query(
    `UPDATE friends SET status = 'accepted' WHERE id = $1 AND friend_id = $2 AND status = 'pending' RETURNING *`,
    [requestId, playerId]
  );
  if (res.rows.length === 0) throw new Error('Solicitud no encontrada');
  return { success: true };
}

async function rejectFriendRequest(requestId, playerId) {
  await pool.query(
    `DELETE FROM friends WHERE id = $1 AND friend_id = $2 AND status = 'pending'`,
    [requestId, playerId]
  );
  return { success: true };
}

async function getPendingFriendRequests(playerId) {
  const res = await pool.query(`
    SELECT f.id as request_id, f.player_id as from_id, f.created_at,
           p.alias as from_name, p.equipped_avatar
    FROM friends f
    JOIN players p ON p.id = f.player_id
    WHERE f.friend_id = $1 AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `, [playerId]);
  return res.rows;
}

async function removeFriend(playerId, friendId) {
  await pool.query(
    `DELETE FROM friends WHERE player_id = $1 AND friend_id = $2`,
    [playerId, friendId]
  );
  return { success: true };
}

async function searchPlayers(query, currentPlayerId) {
  try {
    const res = await pool.query(`
      SELECT id, alias, name, equipped_avatar, games_played, games_won
      FROM players
      WHERE user_id IS NOT NULL AND id != $1 AND (alias ILIKE $2 OR name ILIKE $2)
      LIMIT 20
    `, [currentPlayerId, `%${query}%`]);
    return res.rows;
  } catch(e) { return []; }
}

// ── Actualizar last_seen ────────────────────────────────────
async function updateLastSeen(playerId) {
  try {
    await pool.query(`UPDATE players SET last_seen = $1 WHERE id = $2`, [Date.now(), playerId]);
  } catch(e) {}
}

// ── AJUSTAR MONEDAS (CEO) ────────────────────────────────
async function adjustPlayerCoins(playerId, amount, reason) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const res = await client.query(`SELECT coins FROM players WHERE id = $1 FOR UPDATE`, [playerId]);
    if (!res.rows[0]) throw new Error('Jugador no encontrado');
    const newBalance = Math.max(0, (res.rows[0].coins || 0) + amount);
    await client.query(`UPDATE players SET coins = $1 WHERE id = $2`, [newBalance, playerId]);
    await client.query(
      `INSERT INTO transactions (player_id, amount, reason, created_at) VALUES ($1, $2, $3, $4)`,
      [playerId, amount, reason, Date.now()]
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

// ── ADMIN (CEO Panel) ─────────────────────────────────────
async function createAdmin(username, passwordHash, role = 'editor') {
  const validRoles = ['viewer', 'editor', 'admin'];
  if (!validRoles.includes(role)) role = 'editor';
  try {
    await pool.query(
      `INSERT INTO admins (username, password_hash, role, created_at) VALUES ($1, $2, $3, $4)`,
      [username, passwordHash, role, Date.now()]
    );
    return { success: true };
  } catch(e) {
    if (e.code === '23505') throw new Error('Admin ya existe');
    throw e;
  }
}

async function getAdminByUsername(username) {
  try {
    const res = await pool.query(`SELECT * FROM admins WHERE username = $1`, [username]);
    return res.rows[0] || null;
  } catch(e) { return null; }
}

// ── BANEO ──────────────────────────────────────────────────
async function banPlayer(userId) {
  try {
    await pool.query(`UPDATE users SET banned_permanent = TRUE WHERE id = $1`, [userId]);
    return { success: true };
  } catch(e) { throw e; }
}

async function suspendPlayer(userId, hours) {
  try {
    const until = Date.now() + hours * 60 * 60 * 1000;
    await pool.query(`UPDATE users SET banned_until = $1 WHERE id = $2`, [until, userId]);
    return { success: true, until };
  } catch(e) { throw e; }
}

async function unbanPlayer(userId) {
  try {
    await pool.query(`UPDATE users SET banned_permanent = FALSE, banned_until = 0 WHERE id = $1`, [userId]);
    return { success: true };
  } catch(e) { throw e; }
}

async function checkIfBanned(userId) {
  try {
    const res = await pool.query(`SELECT banned_permanent, banned_until FROM users WHERE id = $1`, [userId]);
    if (!res.rows[0]) return { banned: false };
    const { banned_permanent, banned_until } = res.rows[0];
    if (banned_permanent) return { banned: true, reason: 'permanente' };
    if (banned_until > 0 && Date.now() < Number(banned_until)) {
      const remaining = Math.ceil((Number(banned_until) - Date.now()) / 3600000);
      return { banned: true, reason: `suspendido (${remaining}h restantes)` };
    }
    // Si pasó el tiempo, limpiar
    if (banned_until > 0 && Date.now() >= Number(banned_until)) {
      await pool.query(`UPDATE users SET banned_until = 0 WHERE id = $1`, [userId]);
    }
    return { banned: false };
  } catch(e) { return { banned: false }; }
}

// ── FEEDBACK ───────────────────────────────────────────────
async function saveFeedback(playerId, playerName, category, message) {
  try {
    await pool.query(
      `INSERT INTO feedback (player_id, player_name, category, message, created_at) VALUES ($1, $2, $3, $4, $5)`,
      [playerId, playerName, category, String(message).slice(0, 1000), Date.now()]
    );
  } catch(e) {}
}

async function getFeedback(limit = 100) {
  try {
    const res = await pool.query(`
      SELECT id, player_id, player_name, category, message, created_at,
             admin_response, admin_responded_at, admin_username
      FROM feedback
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);
    return res.rows;
  } catch(e) { return []; }
}

async function respondFeedback(feedbackId, adminUsername, responseMessage) {
  try {
    await pool.query(`
      UPDATE feedback SET admin_response = $1, admin_responded_at = $2, admin_username = $3
      WHERE id = $4
    `, [String(responseMessage).slice(0, 500), Date.now(), adminUsername, feedbackId]);
    return { success: true };
  } catch(e) { throw e; }
}

async function deleteFeedback(feedbackId) {
  try {
    await pool.query(`DELETE FROM feedback WHERE id = $1`, [feedbackId]);
    return { success: true };
  } catch(e) { throw e; }
}

// ── CEO PANEL STATS ────────────────────────────────────────
async function getCeoStats() {
  try {
    const [totalUsers, totalPlayers, totalGames, totalTransactions, totalFeedback, recentLogins] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM users`),
      pool.query(`SELECT COUNT(*) FROM players`),
      pool.query(`SELECT COALESCE(SUM(games_played), 0) as total FROM players`),
      pool.query(`SELECT COUNT(*) FROM transactions`),
      pool.query(`SELECT COUNT(*) FROM feedback`),
      pool.query(`SELECT COUNT(*) FROM players WHERE last_seen > $1`, [Date.now() - 3600000]) // última hora
    ]);
    return {
      totalUsers: parseInt(totalUsers.rows[0].count),
      totalPlayers: parseInt(totalPlayers.rows[0].count),
      totalGamesPlayed: parseInt(totalGames.rows[0].total),
      totalTransactions: parseInt(totalTransactions.rows[0].count),
      totalFeedback: parseInt(totalFeedback.rows[0].count),
      onlineNow: parseInt(recentLogins.rows[0].count)
    };
  } catch(e) { return {}; }
}

async function getAllUsers(limit = 100) {
  try {
    const res = await pool.query(`
      SELECT u.id, u.email, u.username, u.created_at,
             u.banned_permanent, u.banned_until,
             p.id as player_id, p.alias, p.coins, p.games_played, p.games_won,
             p.last_seen, p.xp, p.level
      FROM users u
      LEFT JOIN players p ON p.user_id = u.id
      ORDER BY u.created_at DESC
      LIMIT $1
    `, [limit]);
    return res.rows;
  } catch(e) { return []; }
}

// ── GLOBAL CHAT ───────────────────────────────────────────
async function saveGlobalMessage(playerId, playerName, message) {
  try {
    await pool.query(
      `INSERT INTO global_chat (player_id, player_name, message, created_at) VALUES ($1, $2, $3, $4)`,
      [playerId, playerName, String(message).slice(0, 300), Date.now()]
    );
  } catch(e) {}
}

async function getGlobalMessages(limit = 30) {
  try {
    const res = await pool.query(`
      SELECT id, player_id, player_name, message, created_at
      FROM global_chat
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);
    return res.rows.reverse();
  } catch(e) { return []; }
}

// Limpiar mensajes globales viejos: mantener solo los últimos 200
async function cleanupGlobalChat() {
  try {
    // Borrar mensajes que no estén entre los últimos 200
    await pool.query(`
      DELETE FROM global_chat WHERE id NOT IN (
        SELECT id FROM global_chat ORDER BY created_at DESC LIMIT 200
      )
    `);
  } catch(e) {}
}

// ── AUDIT LOG (CEO actions) ────────────────────────────────
async function logAudit(adminUsername, action, targetId, details) {
  try {
    await pool.query(
      `INSERT INTO audit_log (admin_username, action, target_id, details, created_at) VALUES ($1, $2, $3, $4, $5)`,
      [adminUsername, action, targetId || null, String(details || '').slice(0, 500), Date.now()]
    );
  } catch(e) { console.error('Audit log error:', e.message); }
}

async function getAuditLog(limit = 100) {
  try {
    const res = await pool.query(`
      SELECT id, admin_username, action, target_id, details, created_at
      FROM audit_log
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);
    return res.rows;
  } catch(e) { return []; }
}

// ── ADMIN MANAGEMENT ───────────────────────────────────────
async function getAllAdmins() {
  try {
    const res = await pool.query(`SELECT id, username, role, created_at FROM admins ORDER BY created_at ASC`);
    return res.rows;
  } catch(e) { return []; }
}

async function updateAdminRole(adminId, newRole) {
  const validRoles = ['viewer', 'editor', 'admin'];
  if (!validRoles.includes(newRole)) throw new Error('Rol inválido');
  try {
    await pool.query(`UPDATE admins SET role = $1 WHERE id = $2`, [newRole, adminId]);
    return { success: true };
  } catch(e) { throw e; }
}

async function deleteAdmin(adminId) {
  try {
    await pool.query(`DELETE FROM admins WHERE id = $1`, [adminId]);
    return { success: true };
  } catch(e) { throw e; }
}

async function changeAdminPassword(username, newHash) {
  try {
    await pool.query(`UPDATE admins SET password_hash = $1 WHERE username = $2`, [newHash, username]);
    return { success: true };
  } catch(e) { throw e; }
}

// ── ANALYTICS ──────────────────────────────────────────────
async function getUsersPerDay(days = 30) {
  try {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const res = await pool.query(`
      SELECT DATE(to_timestamp(created_at / 1000)) as day, COUNT(*) as count
      FROM users
      WHERE created_at > $1
      GROUP BY day
      ORDER BY day ASC
    `, [cutoff]);
    return res.rows;
  } catch(e) { return []; }
}

async function getTransactionsPerDay(days = 30) {
  try {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const res = await pool.query(`
      SELECT DATE(to_timestamp(created_at / 1000)) as day,
             COUNT(*) as count,
             COALESCE(SUM(amount), 0) as total_amount
      FROM transactions
      WHERE created_at > $1 AND amount > 0
      GROUP BY day
      ORDER BY day ASC
    `, [cutoff]);
    return res.rows;
  } catch(e) { return []; }
}

async function getGamesPlayedPerDay(days = 30) {
  try {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const res = await pool.query(`
      SELECT DATE(to_timestamp(last_seen / 1000)) as day, COUNT(*) as count
      FROM players
      WHERE last_seen > $1 AND user_id IS NOT NULL
      GROUP BY day
      ORDER BY day ASC
    `, [cutoff]);
    return res.rows;
  } catch(e) { return []; }
}

// ── Revenue per day (transacciones de compra) ──────────────
async function getRevenuePerDay(days = 30) {
  try {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const res = await pool.query(`
      SELECT DATE(to_timestamp(t.created_at / 1000)) as day,
             COUNT(*) as count,
             COALESCE(SUM(ABS(t.amount)), 0) as total_coins
      FROM transactions t
      WHERE t.created_at > $1 AND t.amount < 0
        AND t.reason LIKE 'Compra:%'
      GROUP BY day
      ORDER BY day ASC
    `, [cutoff]);
    return res.rows;
  } catch(e) { return []; }
}

// ── Level distribution ─────────────────────────────────────
async function getLevelDistribution() {
  try {
    const res = await pool.query(`
      SELECT level, COUNT(*) as count
      FROM players
      WHERE user_id IS NOT NULL
      GROUP BY level
      ORDER BY level ASC
    `);
    // Agrupar en rangos
    const ranges = [
      { label: '1-10', min: 1, max: 10 },
      { label: '11-25', min: 11, max: 25 },
      { label: '26-50', min: 26, max: 50 },
      { label: '51-100', min: 51, max: 100 },
      { label: '101-200', min: 101, max: 200 },
      { label: '201+', min: 201, max: 999999 }
    ];
    return ranges.map(r => ({
      range: r.label,
      count: res.rows
        .filter(row => parseInt(row.level) >= r.min && parseInt(row.level) <= r.max)
        .reduce((sum, row) => sum + parseInt(row.count), 0)
    })).filter(r => r.count > 0);
  } catch(e) { return []; }
}

// ── Activity heatmap (por hora del día) ────────────────────
async function getActivityHeatmap() {
  try {
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const res = await pool.query(`
      SELECT EXTRACT(HOUR FROM to_timestamp(last_seen / 1000)) as hour,
             COUNT(*) as count
      FROM players
      WHERE last_seen > $1 AND user_id IS NOT NULL
      GROUP BY hour
      ORDER BY hour ASC
    `, [oneWeekAgo]);
    // Rellenar todas las 24 horas
    const hourMap = {};
    res.rows.forEach(r => { hourMap[parseInt(r.hour)] = parseInt(r.count); });
    const hours = [];
    for (let i = 0; i < 24; i++) {
      hours.push({ hour: i, count: hourMap[i] || 0 });
    }
    return hours;
  } catch(e) { return []; }
}

// ── SERVER INFO ────────────────────────────────────────────
function getServerInfo(startTime) {
  const uptime = Date.now() - startTime;
  const days = Math.floor(uptime / 86400000);
  const hours = Math.floor((uptime % 86400000) / 3600000);
  const mins = Math.floor((uptime % 3600000) / 60000);
  return {
    startTime,
    uptime,
    uptimeStr: `${days}d ${hours}h ${mins}m`,
    nodeVersion: process.version,
    platform: process.platform,
    memoryUsage: process.memoryUsage(),
    env: {
      NODE_ENV: process.env.NODE_ENV || 'development',
      PORT: process.env.PORT || 3000,
      HAS_DATABASE_URL: !!process.env.DATABASE_URL,
      HAS_CEO_SECRET: !!process.env.CEO_SECRET,
      HAS_STRIPE_KEY: !!process.env.STRIPE_SECRET_KEY,
      HAS_MP_ACCESS_TOKEN: !!process.env.MP_ACCESS_TOKEN
    }
  };
}

// ── PUSH SUBSCRIPTIONS ────────────────────────────────────
async function savePushSubscription(playerId, subscription) {
  try {
    await pool.query(
      `INSERT INTO push_subscriptions (player_id, subscription, created_at) VALUES ($1, $2, $3)
       ON CONFLICT (player_id) DO UPDATE SET subscription = $2, created_at = $3`,
      [playerId, JSON.stringify(subscription), Date.now()]
    );
  } catch(e) { console.error('Push sub error:', e.message); }
}

async function removePushSubscription(playerId) {
  try {
    await pool.query(`DELETE FROM push_subscriptions WHERE player_id = $1`, [playerId]);
  } catch(e) {}
}

async function getAllPushSubscriptions() {
  try {
    const res = await pool.query(`SELECT player_id, subscription FROM push_subscriptions`);
    return res.rows.map(r => ({
      playerId: r.player_id,
      subscription: typeof r.subscription === 'string' ? JSON.parse(r.subscription) : r.subscription
    }));
  } catch(e) { return []; }
}

async function getPushSubscriptionsCount() {
  try {
    const res = await pool.query(`SELECT COUNT(*) FROM push_subscriptions`);
    return parseInt(res.rows[0].count);
  } catch(e) { return 0; }
}

// ── SHOP ITEMS CRUD (CEO Panel) ─────────────────────────
async function getShopItemsFromDB() {
  try {
    const res = await pool.query(`SELECT * FROM shop_items WHERE enabled = TRUE ORDER BY category, price ASC`);
    return res.rows;
  } catch(e) { return []; }
}

async function createShopItem(category, name, icon, price, description) {
  const now = Date.now();
  try {
    const res = await pool.query(`
      INSERT INTO shop_items (category, name, icon, price, description, enabled, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, TRUE, $6, $6)
      RETURNING *
    `, [category, name, icon || '🎲', parseInt(price) || 0, description || '', now]);
    return res.rows[0];
  } catch(e) { throw e; }
}

async function updateShopItemDB(id, fields) {
  const allowed = ['name', 'description', 'icon', 'category', 'price', 'enabled'];
  const sets = [];
  const vals = [];
  let idx = 1;
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = $${idx}`);
      vals.push(key === 'price' ? parseInt(fields[key]) || 0 : fields[key]);
      idx++;
    }
  }
  if (!sets.length) throw new Error('Sin campos para actualizar');
  sets.push(`updated_at = $${idx}`);
  vals.push(Date.now());
  vals.push(id);
  try {
    const res = await pool.query(`UPDATE shop_items SET ${sets.join(', ')} WHERE id = $${idx + 1} RETURNING *`, vals);
    return res.rows[0] || null;
  } catch(e) { throw e; }
}

async function deleteShopItemDB(id) {
  try {
    await pool.query(`DELETE FROM shop_items WHERE id = $1`, [id]);
    return { success: true };
  } catch(e) { throw e; }
}

async function seedShopItemsFromCatalog() {
  try {
    const existing = await pool.query(`SELECT COUNT(*) as count FROM shop_items`);
    if (parseInt(existing.rows[0].count) > 0) return; // Ya hay datos
    const now = Date.now();
    for (const item of SHOP_CATALOG) {
      // Insertar con ID explícito para que coincida con el catálogo hardcodeado
      await pool.query(`
        INSERT INTO shop_items (id, category, name, icon, price, description, enabled, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $7)
        ON CONFLICT (id) DO NOTHING
      `, [item.id, item.category, item.name, item.icon, item.price, item.desc || '', now]);
    }
    // Sincronizar la secuencia serial para que el CEO panel pueda crear items sin conflictos
    await pool.query(`SELECT setval('shop_items_id_seq', (SELECT MAX(id) FROM shop_items))`);
    console.log(`🛒 Seed: ${SHOP_CATALOG.length} items del catálogo importados a shop_items con IDs explícitos`);
  } catch(e) { console.error('Error seeding shop_items:', e.message); }
}

// ── SHOP CATALOG VIEWER (CEO) ────────────────────────────
async function getShopItemDetail(itemId) {
  // Buscar primero en DB, después en static
  try {
    const res = await pool.query(`SELECT * FROM shop_items WHERE id = $1`, [itemId]);
    if (res.rows[0]) return res.rows[0];
  } catch(e) {}
  const item = SHOP_CATALOG.find(i => i.id === parseInt(itemId));
  return item || null;
}

// ── SHOP STATS (items más comprados) ─────────────────────
async function getShopStats() {
  try {
    // Items más comprados (desde redemptions)
    const topItems = await pool.query(`
      SELECT r.reward_id, COUNT(*) as count
      FROM redemptions r
      GROUP BY r.reward_id
      ORDER BY count DESC
      LIMIT 10
    `);
    // Mapear a nombres del catálogo
    const catalogMap = {};
    SHOP_CATALOG.forEach(i => { catalogMap[i.id] = i; });
    const items = topItems.rows.map(r => {
      const id = parseInt(r.reward_id);
      const item = catalogMap[id] || { name: '#' + id, icon: '❓', category: '?' };
      return {
        id,
        name: item.name,
        icon: item.icon,
        category: item.category,
        count: parseInt(r.count)
      };
    });
    // Total de compras en la tienda
    const totalPurchases = await pool.query(`
      SELECT COUNT(*) as count FROM redemptions WHERE status = 'completed'
    `);
    // Compras por categoría
    const catPurchases = await pool.query(`
      SELECT r.reward_id, COUNT(*) as count
      FROM redemptions r
      WHERE r.status = 'completed'
      GROUP BY r.reward_id
    `);
    const catCounts = { dados: 0, avatares: 0, especiales: 0, ultra: 0 };
    catPurchases.rows.forEach(r => {
      const id = parseInt(r.reward_id);
      const item = catalogMap[id];
      if (item && catCounts[item.category] !== undefined) {
        catCounts[item.category] += parseInt(r.count);
      }
    });
    return {
      topItems: items,
      totalPurchases: parseInt(totalPurchases.rows[0]?.count || 0),
      byCategory: catCounts
    };
  } catch(e) { return { topItems: [], totalPurchases: 0, byCategory: {} }; }
}

// ── GENERATE WEEKLY REPORT ─────────────────────────────────
async function generateWeeklyReport() {
  try {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const [newUsers, newPlayers, totalRevenue, feedbackCount, activePlayers, totalUsersRes, totalPlayersRes] = await Promise.all([
      pool.query(`SELECT COUNT(*) as count FROM users WHERE created_at > $1`, [weekAgo]),
      pool.query(`SELECT COUNT(*) as count FROM players WHERE created_at > $1`, [weekAgo]),
      pool.query(`SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM transactions WHERE created_at > $1 AND amount < 0 AND reason LIKE 'Compra:%'`, [weekAgo]),
      pool.query(`SELECT COUNT(*) as count FROM feedback WHERE created_at > $1`, [weekAgo]),
      pool.query(`SELECT COUNT(*) as count FROM players WHERE last_seen > $1 AND user_id IS NOT NULL`, [weekAgo]),
      pool.query(`SELECT COUNT(*) as count FROM users`),
      pool.query(`SELECT COUNT(*) as count FROM players WHERE user_id IS NOT NULL`)
    ]);
    return {
      generatedAt: Date.now(),
      weekAgo,
      newUsers: parseInt(newUsers.rows[0].count),
      newPlayers: parseInt(newPlayers.rows[0].count),
      totalRevenue: parseInt(totalRevenue.rows[0].total || 0),
      feedbackCount: parseInt(feedbackCount.rows[0].count),
      activePlayers: parseInt(activePlayers.rows[0].count),
      totalUsers: parseInt(totalUsersRes.rows[0].count),
      totalPlayers: parseInt(totalPlayersRes.rows[0].count)
    };
  } catch(e) { return { error: e.message }; }
}

// ── PRIVATE MESSAGES (chat entre amigos) ──────────────────
async function savePrivateMessage(fromId, toId, fromName, message) {
  try {
    await pool.query(
      `INSERT INTO private_messages (from_id, to_id, from_name, message, created_at) VALUES ($1, $2, $3, $4, $5)`,
      [fromId, toId, fromName, String(message).slice(0, 500), Date.now()]
    );
  } catch(e) {}
}

// Obtener historial de chat entre dos personas (conversación)
async function getPrivateMessages(playerId1, playerId2, limit = 50) {
  try {
    const res = await pool.query(`
      SELECT id, from_id, to_id, from_name, message, created_at
      FROM private_messages
      WHERE (from_id = $1 AND to_id = $2) OR (from_id = $2 AND to_id = $1)
      ORDER BY created_at DESC
      LIMIT $3
    `, [playerId1, playerId2, limit]);
    return res.rows.reverse();
  } catch(e) { return []; }
}

// Limpiar mensajes privados más viejos de 7 días
async function cleanupPrivateMessages() {
  try {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    await pool.query(`DELETE FROM private_messages WHERE created_at < $1`, [sevenDaysAgo]);
  } catch(e) {}
}

// ════════════════════════════════════════════════════════════
// ── TORNEOS ─────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════

async function createTournament(name, description, maxPlayers, fee, prizes, startTime, registrationUntil, createdBy) {
  const now = Date.now();
  // Calcular rondas necesarias para single elimination
  const rounds = Math.ceil(Math.log2(maxPlayers));
  try {
    const res = await pool.query(`
      INSERT INTO tournaments (name, description, max_players, min_players, fee, prize_pool, prizes, rounds, start_time, registration_until, created_at, created_by)
      VALUES ($1, $2, $3, 4, $4, 0, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [name, description || '', parseInt(maxPlayers), parseInt(fee) || 0, JSON.stringify(prizes || []), rounds, startTime, registrationUntil || null, now, createdBy || 'system']);
    return res.rows[0];
  } catch(e) { throw e; }
}

async function getTournaments(limit = 20) {
  try {
    const res = await pool.query(`
      SELECT t.*,
        (SELECT COUNT(*) FROM tournament_participants tp WHERE tp.tournament_id = t.id) as registered_count
      FROM tournaments t
      ORDER BY t.created_at DESC
      LIMIT $1
    `, [limit]);
    return res.rows;
  } catch(e) { return []; }
}

async function getActiveTournaments() {
  try {
    const res = await pool.query(`
      SELECT t.*,
        (SELECT COUNT(*) FROM tournament_participants tp WHERE tp.tournament_id = t.id) as registered_count
      FROM tournaments t
      WHERE t.status IN ('registration', 'active')
      ORDER BY t.start_time ASC
    `);
    return res.rows;
  } catch(e) { return []; }
}

async function getTournamentById(tournamentId) {
  try {
    const res = await pool.query(`
      SELECT t.*,
        (SELECT COUNT(*) FROM tournament_participants tp WHERE tp.tournament_id = t.id) as registered_count
      FROM tournaments t
      WHERE t.id = $1
    `, [tournamentId]);
    return res.rows[0] || null;
  } catch(e) { return null; }
}

async function registerForTournament(tournamentId, playerId, playerName) {
  try {
    // Verificar que el torneo esté en registro
    const tourney = await getTournamentById(tournamentId);
    if (!tourney) throw new Error('Torneo no encontrado');
    if (tourney.status !== 'registration') throw new Error('El torneo no está en período de registro');
    
    // Verificar cupo
    if (parseInt(tourney.registered_count) >= parseInt(tourney.max_players)) {
      throw new Error('El torneo está lleno');
    }
    
    // Verificar si ya está registrado
    const existing = await pool.query(
      `SELECT id FROM tournament_participants WHERE tournament_id = $1 AND player_id = $2`,
      [tournamentId, playerId]
    );
    if (existing.rows.length > 0) throw new Error('Ya estás registrado en este torneo');
    
    // Asignar seed aleatorio
    const seed = Math.floor(Math.random() * 10000) + 1;
    await pool.query(`
      INSERT INTO tournament_participants (tournament_id, player_id, player_name, seed, registered_at)
      VALUES ($1, $2, $3, $4, $5)
    `, [tournamentId, playerId, playerName, seed, Date.now()]);
    
    return { success: true };
  } catch(e) { throw e; }
}

async function unregisterFromTournament(tournamentId, playerId) {
  try {
    const tourney = await getTournamentById(tournamentId);
    if (!tourney) throw new Error('Torneo no encontrado');
    if (tourney.status !== 'registration') throw new Error('El torneo ya comenzó, no podés cancelar');
    
    await pool.query(
      `DELETE FROM tournament_participants WHERE tournament_id = $1 AND player_id = $2`,
      [tournamentId, playerId]
    );
    return { success: true };
  } catch(e) { throw e; }
}

async function getTournamentParticipants(tournamentId) {
  try {
    const res = await pool.query(`
      SELECT tp.*, p.equipped_avatar
      FROM tournament_participants tp
      LEFT JOIN players p ON p.id = tp.player_id
      WHERE tp.tournament_id = $1
      ORDER BY tp.seed ASC
    `, [tournamentId]);
    return res.rows;
  } catch(e) { return []; }
}

async function getTournamentMatches(tournamentId) {
  try {
    const res = await pool.query(`
      SELECT * FROM tournament_matches
      WHERE tournament_id = $1
      ORDER BY round ASC, match_index ASC
    `, [tournamentId]);
    return res.rows;
  } catch(e) { return []; }
}

async function generateBracket(tournamentId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    
    const tourneyRes = await client.query(`SELECT * FROM tournaments WHERE id = $1 FOR UPDATE`, [tournamentId]);
    const tourney = tourneyRes.rows[0];
    if (!tourney) throw new Error('Torneo no encontrado');
    if (tourney.status !== 'registration') throw new Error('El bracket ya fue generado');
    
    // Obtener participantes ordenados por seed
    const parts = await client.query(`
      SELECT * FROM tournament_participants
      WHERE tournament_id = $1
      ORDER BY seed ASC
    `, [tournamentId]);
    
    if (parts.rows.length < tourney.min_players) {
      throw new Error(`Faltan jugadores (mínimo ${tourney.min_players}, actual: ${parts.rows.length})`);
    }
    
    const players = parts.rows;
    const totalPlayers = players.length;
    const rounds = Math.ceil(Math.log2(totalPlayers));
    const bracketSize = Math.pow(2, rounds);
    
    // Rellenar con BYEs (player_id = null) si no es potencia de 2
    const seeded = [...players];
    // Ordenar para que los mejores seeds queden separados
    seeded.sort((a, b) => a.seed - b.seed);
    
    // Crear matches de primera ronda
    const matchIds = [];
    for (let i = 0; i < bracketSize / 2; i++) {
      const p1Idx = i;
      const p2Idx = bracketSize - 1 - i;
      const p1 = seeded[p1Idx] || null;
      const p2 = seeded[p2Idx] || null;
      
      const res = await client.query(`
        INSERT INTO tournament_matches (tournament_id, round, match_index, player1_id, player2_id, player1_name, player2_name, status)
        VALUES ($1, 1, $2, $3, $4, $5, $6, 'pending')
        RETURNING id
      `, [
        tournamentId, i,
        p1 ? p1.player_id : null, p2 ? p2.player_id : null,
        p1 ? p1.player_name : 'BYE', p2 ? p2.player_name : 'BYE'
      ]);
      matchIds.push(res.rows[0].id);
      
      // Si uno es BYE, el otro avanza automáticamente
      if (!p1 || !p2) {
        const winnerId = p1 ? p1.player_id : (p2 ? p2.player_id : null);
        if (winnerId) {
          await client.query(`
            UPDATE tournament_matches SET winner_id = $1, status = 'completed' WHERE id = $2
          `, [winnerId, res.rows[0].id]);
        }
      }
    }
    
    // Generar rondas restantes vacías
    let matchesInRound = bracketSize / 2;
    for (let r = 2; r <= rounds; r++) {
      matchesInRound = Math.ceil(matchesInRound / 2);
      for (let i = 0; i < matchesInRound; i++) {
        await client.query(`
          INSERT INTO tournament_matches (tournament_id, round, match_index, status)
          VALUES ($1, $2, $3, 'pending')
        `, [tournamentId, r, i]);
      }
    }
    
    // Actualizar estado del torneo
    const prizePool = parseInt(tourney.fee) * players.length;
    await client.query(`
      UPDATE tournaments SET status = 'active', current_round = 1, rounds = $1, prize_pool = $2
      WHERE id = $3
    `, [rounds, prizePool, tournamentId]);
    
    await client.query("COMMIT");
    return { success: true, prizePool };
  } catch(e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function advanceTournamentMatch(tournamentId, matchId, winnerId, p1Score, p2Score) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    
    const matchRes = await client.query(`
      SELECT * FROM tournament_matches WHERE id = $1 AND tournament_id = $2 FOR UPDATE
    `, [matchId, tournamentId]);
    const match = matchRes.rows[0];
    if (!match) throw new Error('Match no encontrado');
    if (match.status === 'completed') throw new Error('Este match ya fue completado');
    
    // Actualizar match
    await client.query(`
      UPDATE tournament_matches
      SET winner_id = $1, player1_score = $2, player2_score = $3, status = 'completed', played_at = $4
      WHERE id = $5
    `, [winnerId, p1Score || 0, p2Score || 0, Date.now(), matchId]);
    
    // Avanzar al ganador a la siguiente ronda
    if (winnerId) {
      const nextRound = match.round + 1;
      const nextMatchIdx = Math.floor(match.match_index / 2);
      const isFirstPlayer = match.match_index % 2 === 0;
      
      const nextMatchRes = await client.query(`
        SELECT * FROM tournament_matches
        WHERE tournament_id = $1 AND round = $2 AND match_index = $3
        FOR UPDATE
      `, [tournamentId, nextRound, nextMatchIdx]);
      
      const nextMatch = nextMatchRes.rows[0];
      if (nextMatch) {
        // Obtener nombre del ganador
        const winnerName = match.player1_id === winnerId ? match.player1_name : match.player2_name;
        
        if (isFirstPlayer) {
          await client.query(`
            UPDATE tournament_matches SET player1_id = $1, player1_name = $2 WHERE id = $3
          `, [winnerId, winnerName, nextMatch.id]);
        } else {
          await client.query(`
            UPDATE tournament_matches SET player2_id = $1, player2_name = $2 WHERE id = $3
          `, [winnerId, winnerName, nextMatch.id]);
        }
      }
      
      // Actualizar participante: registrar eliminación si no es ganador final
      const loserId = match.player1_id === winnerId ? match.player2_id : match.player1_id;
      if (loserId) {
        await client.query(`
          UPDATE tournament_participants SET eliminated_round = $1 WHERE tournament_id = $2 AND player_id = $3
        `, [match.round, tournamentId, loserId]);
      }
    }
    
    // Verificar si el torneo terminó
    const finalMatch = await client.query(`
      SELECT * FROM tournament_matches
      WHERE tournament_id = $1 AND round = (SELECT rounds FROM tournaments WHERE id = $1)
    `, [tournamentId]);
    
    if (finalMatch.rows[0] && finalMatch.rows[0].status === 'completed') {
      const championId = finalMatch.rows[0].winner_id;
      
      // Asignar posiciones finales
      await client.query(`
        UPDATE tournament_participants SET final_position = 1 WHERE tournament_id = $1 AND player_id = $2
      `, [tournamentId, championId]);
      
      // Segundo puesto
      const secondPlace = finalMatch.rows[0].player1_id === championId
        ? finalMatch.rows[0].player2_id
        : finalMatch.rows[0].player1_id;
      if (secondPlace) {
        await client.query(`
          UPDATE tournament_participants SET final_position = 2 WHERE tournament_id = $1 AND player_id = $2
        `, [tournamentId, secondPlace]);
      }
      
      await client.query(`
        UPDATE tournaments SET status = 'completed' WHERE id = $1
      `, [tournamentId]);
    }
    
    await client.query("COMMIT");
    return { success: true };
  } catch(e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function getTournamentBracketData(tournamentId) {
  try {
    const tourney = await getTournamentById(tournamentId);
    if (!tourney) return null;
    const participants = await getTournamentParticipants(tournamentId);
    const matches = await getTournamentMatches(tournamentId);
    
    // Agrupar matches por ronda
    const rounds = [];
    const totalRounds = parseInt(tourney.rounds) || 1;
    for (let r = 1; r <= totalRounds; r++) {
      const roundMatches = matches.filter(m => parseInt(m.round) === r);
      rounds.push({
        round: r,
        matches: roundMatches
      });
    }
    
    return {
      tournament: tourney,
      participants,
      rounds
    };
  } catch(e) { return null; }
}

async function cancelTournament(tournamentId) {
  try {
    await pool.query(`UPDATE tournaments SET status = 'cancelled' WHERE id = $1`, [tournamentId]);
    return { success: true };
  } catch(e) { throw e; }
}

async function getTournamentHistoryByPlayer(playerId, limit = 10) {
  try {
    const res = await pool.query(`
      SELECT t.id, t.name, t.status, tp.final_position, tp.registered_at, t.start_time, t.max_players
      FROM tournament_participants tp
      JOIN tournaments t ON t.id = tp.tournament_id
      WHERE tp.player_id = $1
      ORDER BY tp.registered_at DESC
      LIMIT $2
    `, [playerId, limit]);
    return res.rows;
  } catch(e) { return []; }
}

async function getTournamentStats() {
  try {
    const [total, active, totalPlayers, totalPrize] = await Promise.all([
      pool.query(`SELECT COUNT(*) as count FROM tournaments`),
      pool.query(`SELECT COUNT(*) as count FROM tournaments WHERE status = 'active'`),
      pool.query(`SELECT COALESCE(SUM(registered_count), 0) as total FROM (SELECT COUNT(*) as registered_count FROM tournament_participants GROUP BY tournament_id) sub`),
      pool.query(`SELECT COALESCE(SUM(prize_pool), 0) as total FROM tournaments WHERE status = 'completed'`)
    ]);
    return {
      totalTournaments: parseInt(total.rows[0].count),
      activeTournaments: parseInt(active.rows[0].count),
      totalParticipants: parseInt(totalPlayers.rows[0].total),
      totalPrizes: parseInt(totalPrize.rows[0].total)
    };
  } catch(e) { return {}; }
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
  getShopItemsFromDB, createShopItem, updateShopItemDB, deleteShopItemDB,
  rewardWinner,
  pool,
  getUserProfile, awardXP, getLevel, getRank,
  getPlayerMissions, claimMissionReward, checkMissionsCompleted,
  MISSIONS, RANKS, SHOP_CATALOG, getOwnedItems, equipItem,
  claimDailyChest, getChestStatus, getPlayerTransactions,
  checkBoostActive, getBoostStatus,
  getFriends, addFriend, removeFriend, searchPlayers,
  acceptFriendRequest, rejectFriendRequest, getPendingFriendRequests,
  saveGlobalMessage, getGlobalMessages, cleanupGlobalChat,
  savePrivateMessage, getPrivateMessages, cleanupPrivateMessages,
  updateLastSeen,
  createAdmin, getAdminByUsername,
  banPlayer, suspendPlayer, unbanPlayer, checkIfBanned,
  saveFeedback, getFeedback, respondFeedback, deleteFeedback, getCeoStats, getAllUsers,
  adjustPlayerCoins,
  logAudit, getAuditLog,
  getAllAdmins, deleteAdmin, changeAdminPassword, updateAdminRole,
  getUsersPerDay, getTransactionsPerDay, getGamesPlayedPerDay,
  getRevenuePerDay, getLevelDistribution, getActivityHeatmap,
  getServerInfo,
  savePushSubscription, removePushSubscription, getAllPushSubscriptions, getPushSubscriptionsCount,
  getShopItemDetail,
  generateWeeklyReport,
  seedShopItemsFromCatalog,
  getShopStats,
  // Torneos
  createTournament,
  getTournaments,
  getActiveTournaments,
  getTournamentById,
  registerForTournament,
  unregisterFromTournament,
  getTournamentParticipants,
  getTournamentMatches,
  generateBracket,
  advanceTournamentMatch,
  getTournamentBracketData,
  cancelTournament,
  getTournamentHistoryByPlayer,
  getTournamentStats
};
