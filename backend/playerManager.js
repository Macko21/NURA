"use strict";

const { createPlayer, getPlayer, updatePlayer, getRanking } = require("./database");

async function createOrLoadPlayer(player) {
  await createPlayer(player);
  return getPlayer(player.id);
}

function getPlayerProfile(id) {
  return getPlayer(id);
}

async function registerGamePlayed(id, score) {
  const p = await getPlayer(id);
  if (!p) return;
  return updatePlayer(id, {
    games_played:  (p.games_played  || 0) + 1,
    total_score:   (p.total_score   || 0) + score,
    highest_score: Math.max(p.highest_score || 0, score)
  });
}

async function registerWin(id) {
  const p = await getPlayer(id);
  if (!p) return;
  return updatePlayer(id, {
    games_won:      (p.games_won      || 0) + 1,
    ranking_points: (p.ranking_points || 0) + 100,
    win_streak:     (p.win_streak     || 0) + 1
  });
}

function resetWinStreak(id) {
  return updatePlayer(id, { win_streak: 0 });
}

// Stubs — para uso futuro
function registerStraight(id)    { return Promise.resolve(); }
async function registerFiveOnes(id)    {
  const p = await getPlayer(id);
  if (!p) return;
  return updatePlayer(id, { perfect_game: (p.perfect_game || 0) + 1 });
}
function registerKick(id)        { return Promise.resolve(); }

async function registerDisconnect(id) {
  const p = await getPlayer(id);
  if (!p) return;
  return updatePlayer(id, { disconnects: (p.disconnects || 0) + 1 });
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
