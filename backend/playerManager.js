"use strict";

const { createPlayer, getPlayer, updatePlayer, getRanking, pool } = require("./database");

async function createOrLoadPlayer(player) {
  await createPlayer(player);
  return getPlayer(player.id);
}

function getPlayerProfile(id) {
  return getPlayer(id);
}

async function registerGamePlayed(id, score) {
  const safeScore = Math.max(0, Number(score) || 0);
  const res = await pool.query(`
    UPDATE players SET
      games_played = COALESCE(games_played, 0) + 1,
      total_score = COALESCE(total_score, 0) + $2,
      highest_score = GREATEST(COALESCE(highest_score, 0), $2)
    WHERE id = $1 RETURNING *
  `, [id, safeScore]);
  return res.rows[0];
}

async function registerWin(id) {
  const res = await pool.query(`
    UPDATE players SET
      games_won = COALESCE(games_won, 0) + 1,
      ranking_points = COALESCE(ranking_points, 0) + 100,
      win_streak = COALESCE(win_streak, 0) + 1
    WHERE id = $1 RETURNING *
  `, [id]);
  return res.rows[0];
}

function resetWinStreak(id) {
  return updatePlayer(id, { win_streak: 0 });
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
  registerGamePlayed,
  registerWin,
  resetWinStreak,
  registerStraight,
  registerFiveOnes,
  registerKick,
  registerDisconnect,
  getTopRanking
};
