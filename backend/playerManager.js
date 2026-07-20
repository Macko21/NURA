"use strict";

const { createPlayer, getPlayer, getRanking, pool } = require("./database");

async function createOrLoadPlayer(player) {
  await createPlayer(player);
  return getPlayer(player.id);
}

function getPlayerProfile(id) {
  return getPlayer(id);
}

function completedMatchParticipant(player) {
  return !!(
    player?.id &&
    !player.isBot &&
    !player.disconnected &&
    !player.eliminated
  );
}

async function recordMatchResults(players, winnerId) {
  const client = await pool.connect();
  const registeredPlayerIds = [];
  try {
    await client.query('BEGIN');
    const uniquePlayers = new Map(
      (players || []).filter(completedMatchParticipant).map(player => [player.id, player])
    );
    for (const player of uniquePlayers.values()) {
      const safeScore = Math.max(0, Number(player.score) || 0);
      const isWinner = player.id === winnerId;
      const result = await client.query(`
        UPDATE players SET
          games_played = COALESCE(games_played, 0) + 1,
          games_won = COALESCE(games_won, 0) + CASE WHEN $3 THEN 1 ELSE 0 END,
          ranking_points = COALESCE(ranking_points, 0) + CASE WHEN $3 THEN 100 ELSE 0 END,
          win_streak = CASE WHEN $3 THEN COALESCE(win_streak, 0) + 1 ELSE 0 END,
          total_score = COALESCE(total_score, 0) + $2,
          highest_score = GREATEST(COALESCE(highest_score, 0), $2)
        WHERE id = $1 AND user_id IS NOT NULL
        RETURNING id
      `, [player.id, safeScore, isWinner]);
      if (result.rows[0]?.id) registeredPlayerIds.push(result.rows[0].id);
    }
    await client.query('COMMIT');
    return registeredPlayerIds;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Stubs — para uso futuro
function registerStraight(id)    { return Promise.resolve(); }
async function registerFiveOnes(id)    {
  return pool.query(`UPDATE players SET perfect_game = COALESCE(perfect_game, 0) + 1 WHERE id = $1`, [id]);
}
function registerKick(id)        { return Promise.resolve(); }

async function registerDisconnect(id) {
  return pool.query(`UPDATE players SET disconnects = COALESCE(disconnects, 0) + 1 WHERE id = $1`, [id]);
}

function getTopRanking() {
  return getRanking();
}

module.exports = {
  createOrLoadPlayer,
  getPlayerProfile,
  recordMatchResults,
  registerStraight,
  registerFiveOnes,
  registerKick,
  registerDisconnect,
  getTopRanking,
  completedMatchParticipant
};
