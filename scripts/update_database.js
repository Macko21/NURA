const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'backend', 'database.js');
let code = fs.readFileSync(filePath, 'utf8');

// ============================================
// 1. ADD LEVEL SYSTEM CONSTANTS AND MISSIONS
// ============================================
const newConstants = `
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
];
`;

// ============================================
// 2. ADD COLUMNS TO PLAYERS TABLE
// ============================================
code = code.replace(
  'disconnects INTEGER DEFAULT 0,\n        created_at BIGINT NOT NULL',
  'disconnects INTEGER DEFAULT 0,\n        xp INTEGER DEFAULT 0,\n        level INTEGER DEFAULT 1,\n        chat_messages INTEGER DEFAULT 0,\n        shop_purchases INTEGER DEFAULT 0,\n        perfect_game INTEGER DEFAULT 0,\n        created_at BIGINT NOT NULL'
);

// ============================================
// 3. ADD MISSIONS TABLE
// ============================================
code = code.replace(
  "console.log(\"✅ PostgreSQL conectado y esquemas creados\");",
  `    await pool.query(\`
      CREATE TABLE IF NOT EXISTS missions (
        id SERIAL PRIMARY KEY,
        player_id TEXT NOT NULL,
        mission_id TEXT NOT NULL,
        progress INTEGER DEFAULT 0,
        completed INTEGER DEFAULT 0,
        claimed INTEGER DEFAULT 0,
        UNIQUE(player_id, mission_id)
      );
    \`);
    // Migraciones para columnas nuevas
    const migraciones = [
      \`ALTER TABLE players ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0\`,
      \`ALTER TABLE players ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1\`,
      \`ALTER TABLE players ADD COLUMN IF NOT EXISTS chat_messages INTEGER DEFAULT 0\`,
      \`ALTER TABLE players ADD COLUMN IF NOT EXISTS shop_purchases INTEGER DEFAULT 0\`,
      \`ALTER TABLE players ADD COLUMN IF NOT EXISTS perfect_game INTEGER DEFAULT 0\`,
    ];
    for (const sql of migraciones) {
      try { await pool.query(sql); } catch(e) {}
    }
    console.log("✅ PostgreSQL conectado y esquemas creados");`
);

// ============================================
// 4. ADD NEW FUNCTIONS (profile, xp, missions)
// ============================================
const newFunctions = `
// --- PERFIL DE USUARIO ---
async function getUserProfile(userId) {
  const result = await pool.query(\`
    SELECT p.id, p.alias, p.name, p.coins, p.xp, p.level,
           p.games_played, p.games_won, p.total_score, p.highest_score,
           p.win_streak, u.email
    FROM players p
    JOIN users u ON u.id = p.user_id
    WHERE p.user_id = \$1
  \`, [userId]);
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
      \`UPDATE players SET xp = xp + \$1 WHERE id = \$2 RETURNING xp, level\`,
      [amount, playerId]
    );
    if (res.rows.length === 0) { await client.query("ROLLBACK"); return {}; }
    const newXp = res.rows[0].xp;
    const newLevel = getLevel(newXp);
    const leveledUp = newLevel > (res.rows[0].level || 1);
    if (leveledUp) {
      await client.query(\`UPDATE players SET level = \$1 WHERE id = \$2\`, [newLevel, playerId]);
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
async function getPlayerMissions(playerId) {
  const res = await pool.query(
    \`SELECT mission_id, progress, completed, claimed FROM missions WHERE player_id = \$1\`,
    [playerId]
  );
  const progressMap = {};
  res.rows.forEach(r => {
    progressMap[r.mission_id] = { progress: r.progress, completed: r.completed, claimed: r.claimed };
  });
  const playerRes = await pool.query(\`SELECT * FROM players WHERE id = \$1\`, [playerId]);
  const p = playerRes.rows[0] || {};
  const stats = {
    games_played: p.games_played || 0, games_won: p.games_won || 0,
    total_score: p.total_score || 0, win_streak: p.win_streak || 0,
    shop_purchases: p.shop_purchases || 0, chat_messages: p.chat_messages || 0,
    perfect_game: p.perfect_game || 0, level: p.level || 1
  };
  return MISSIONS.map(m => {
    const saved = progressMap[m.id];
    const currentProgress = stats[m.track] || 0;
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
    \`INSERT INTO missions (player_id, mission_id, progress, completed, claimed)
     VALUES (\$1, \$2, \$3, 1, 1)
     ON CONFLICT (player_id, mission_id)
     DO UPDATE SET claimed = 1\`,
    [playerId, missionId, mission.req]
  );

  // Dar recompensas
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(\`UPDATE players SET coins = coins + \$1 WHERE id = \$2\`, [mission.coins, playerId]);
    if (mission.xp > 0) {
      await client.query(\`UPDATE players SET xp = xp + \$1 WHERE id = \$2\`, [mission.xp, playerId]);
    }
    await client.query(
      \`INSERT INTO transactions (player_id, amount, reason, created_at) VALUES (\$1, \$2, \$3, \$4)\`,
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
`;

// Insert new constants after require('crypto') line
code = code.replace(
  'const crypto = require("crypto"); // Nativo de Node.js, para generar UUIDs',
  'const crypto = require("crypto");\n' + newConstants
);

// Insert new functions before the module.exports
code = code.replace(
  'module.exports = {',
  newFunctions + '\nmodule.exports = {'
);

// Update exports to include new functions
code = code.replace(
  'buyShopItem,\n  getShopCatalog,\n  rewardWinner,\n  pool',
  'buyShopItem,\n  getShopCatalog,\n  rewardWinner,\n  pool,\n  getUserProfile, awardXP, getLevel, getRank,\n  getPlayerMissions, claimMissionReward, checkMissionsCompleted, MISSIONS, RANKS'
);

fs.writeFileSync(filePath, code, 'utf8');
console.log('✅ database.js updated successfully!');
