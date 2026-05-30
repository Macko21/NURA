"use strict";

const { createPlayer, getPlayer, getRanking, db } = require("./database");

function run(sql, ...params) {
  try {
    db.prepare(sql).run(...params);
    return Promise.resolve(true);
  } catch(e) { return Promise.reject(e); }
}

async function createOrLoadPlayer(player) {
  await createPlayer(player);
  return getPlayer(player.id);
}

function getPlayerProfile(playerId) { return getPlayer(playerId); }

function addCoins(id, amount) {
  return run("UPDATE players SET coins=coins+?, coins_won=coins_won+? WHERE id=?", amount, amount, id);
}

function removeCoins(id, amount) {
  return run("UPDATE players SET coins=CASE WHEN coins>=? THEN coins-? ELSE coins END, coins_bet=coins_bet+? WHERE id=?", amount, amount, amount, id);
}

function registerGamePlayed(id, score) {
  return run("UPDATE players SET games_played=games_played+1, total_score=total_score+?, highest_score=CASE WHEN ?>highest_score THEN ? ELSE highest_score END WHERE id=?", score, score, score, id);
}

function registerWin(id) {
  return run("UPDATE players SET games_won=games_won+1, ranking_points=ranking_points+100, win_streak=win_streak+1 WHERE id=?", id);
}

function resetWinStreak(id) {
  return run("UPDATE players SET win_streak=0 WHERE id=?", id);
}

function registerStraight(id) {
  return run("UPDATE players SET stairs=stairs+1 WHERE id=?", id);
}

function registerFiveOnes(id) {
  return run("UPDATE players SET five_ones=five_ones+1 WHERE id=?", id);
}

function registerKick(id) {
  return run("UPDATE players SET inactivity_kicks=inactivity_kicks+1 WHERE id=?", id);
}

function registerDisconnect(id) {
  return run("UPDATE players SET disconnects=disconnects+1 WHERE id=?", id);
}

function getTopRanking() { return getRanking(); }

module.exports = {
  createOrLoadPlayer, getPlayerProfile,
  addCoins, removeCoins,
  registerGamePlayed, registerWin, resetWinStreak,
  registerStraight, registerFiveOnes,
  registerKick, registerDisconnect,
  getTopRanking
};