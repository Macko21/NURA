'use strict';
const { pool, getLevel, getTodayChallenge } = require('./database');
const { completedMatchParticipant } = require('./playerManager');

function boostedCoins(amount, player, isWin, at) {
  if (at < Number(player.boost_expires || 0)) amount = Math.round(amount * 1.5);
  if (isWin && at < Number(player.boost_coins_win_50_expires || 0)) amount = Math.round(amount * 1.5);
  if (isWin && at < Number(player.boost_coins_win_100_expires || 0)) amount *= 2;
  return amount;
}

async function saveFinishedMatch(match, room, db = pool) {
  if (!match.id || match.status !== 'finished' || !match.winner?.id) throw new Error('invalid_finished_match');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT id FROM finished_matches WHERE id=$1', [match.id]);
    if (existing.rows.length) { await client.query('COMMIT'); return match.id; }
    const participants = [...new Map(match.players.filter(completedMatchParticipant).map(p => [p.id, p])).values()];
    const registered = await client.query('SELECT * FROM players WHERE id=ANY($1) AND user_id IS NOT NULL', [participants.map(p => p.id)]);
    const profiles = new Map(registered.rows.map(p => [p.id, p]));
    const ranked = participants.filter(p => profiles.has(p.id)).sort((a,b) => {
      // The actual winner, not a disconnected player's higher score, owns first place.
      if (a.id === match.winner.id) return -1;
      if (b.id === match.winner.id) return 1;
      return Number(b.score || 0) - Number(a.score || 0) || a.id.localeCompare(b.id);
    });
    const at = Number(match.finishedAt) || Date.now();
    const awards = ranked.map((player, position) => {
      const profile = profiles.get(player.id);
      const isWinner = player.id === match.winner.id;
      let coins = 0;
      if (!room?.isBotGame && !room?.isTournamentMatch && position < 3) coins += boostedCoins([500,200,100][position], profile, isWinner, at);
      if (isWinner) coins += boostedCoins(25, profile, true, at);
      let xp = 25 + (isWinner ? 50 : position <= 2 ? 15 : 0) + (Number(player.winStreak) >= 2 ? 20 : 0);
      if (at < Number(profile.boost_xp_expires || 0)) xp *= 2;
      const bestTurn = Math.max(0, ...(match.history || []).filter(e => ['BANKED','SCORED'].includes(e.type) && e.payload?.playerId === player.id).map(e => Number(e.payload.gained) || 0));
      return { playerId: player.id, isWinner, score: Math.max(0, Math.min(10000, Math.floor(Number(player.score) || 0))), coins, xp, bestTurn, perfect: isWinner && Number(player.fiveOnes) > 0 };
    });
    const payload = {
      match: structuredClone(match), awards,
      tournament: room?.isTournamentMatch ? { id: room.tournamentId, matchId: room.tournamentMatchId } : null,
      daily: room?.isDailyChallenge ? { challenge: getTodayChallenge(), player: match.players.find(p => !p.isBot) } : null
    };
    await client.query(`INSERT INTO finished_matches(id,room_id,payload,next_attempt_at,created_at)
      VALUES($1,$2,$3,$4,$4) ON CONFLICT(id) DO NOTHING`, [match.id, match.roomId, JSON.stringify(payload), at]);
    await client.query('COMMIT');
    return match.id;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

async function addOperation(client, matchId, playerId, kind, amount, at) {
  const operationId = `${matchId}:${playerId}:${kind}`;
  await client.query('INSERT INTO game_operations(operation_id,match_id,player_id,kind,amount,created_at) VALUES($1,$2,$3,$4,$5,$6)', [operationId, matchId, playerId, kind, amount, at]);
  if (!['stats','bet_fee'].includes(kind)) await client.query(`INSERT INTO transactions(player_id,amount,reason,created_at,operation_id)
    VALUES($1,$2,$3,$4,$5)`, [playerId, kind === 'xp' ? 0 : amount, `Partida ${matchId}: ${kind} +${amount}`, at, operationId]);
}

async function settleFinishedMatch(id, { db = pool, completeTournament = null } = {}) {
  // Never hold a pool connection while a tournament opens its own transaction.
  const pending = await db.query('SELECT status,payload FROM finished_matches WHERE id=$1', [id]);
  if (!pending.rows.length) throw new Error('finished_match_not_found');
  if (pending.rows[0].status === 'settled') return { duplicate: true };
  const tournamentPending = pending.rows[0].payload.tournament;
  if (tournamentPending) {
    try {
      if (!completeTournament) throw new Error('tournament_settlement_unavailable');
      const match = pending.rows[0].payload.match;
      const advanced = await completeTournament(tournamentPending.id, tournamentPending.matchId, match.winner.id, match.players[0]?.score || 0, match.players[1]?.score || 0);
      if (!advanced?.success) throw new Error('tournament_result_not_confirmed');
    } catch (error) {
      await db.query("UPDATE finished_matches SET attempts=attempts+1,last_error=$2,next_attempt_at=$3 WHERE id=$1 AND status='pending'", [id,String(error.message).slice(0,250),Date.now()+15000]);
      throw error;
    }
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query('SELECT * FROM finished_matches WHERE id=$1 FOR UPDATE', [id]);
    if (!found.rows.length) throw new Error('finished_match_not_found');
    const row = found.rows[0];
    if (row.status === 'settled') { await client.query('COMMIT'); return { duplicate: true }; }
    const { match, awards, daily } = row.payload;
    const ids = [...new Set([...awards.map(a => a.playerId), ...(match.betPot > 0 ? [match.winner.id] : []), ...(daily?.player ? [daily.player.id] : [])])].sort();
    const locked = await client.query('SELECT * FROM players WHERE id=ANY($1) ORDER BY id FOR UPDATE', [ids]);
    const profiles = new Map(locked.rows.map(p => [p.id,p]));
    const at = Date.now();
    for (const award of awards) {
      const player = profiles.get(award.playerId);
      if (!player?.user_id) throw new Error('registered_participant_missing_requires_review');
      const xp = Number(player.xp || 0) + award.xp;
      await addOperation(client,id,player.id,'stats',0,at);
      await addOperation(client,id,player.id,'coins',award.coins,at);
      await addOperation(client,id,player.id,'xp',award.xp,at);
      await client.query(`UPDATE players SET coins=COALESCE(coins,0)+$2,xp=$3,level=$4,
        games_played=COALESCE(games_played,0)+1,games_won=COALESCE(games_won,0)+CASE WHEN $5 THEN 1 ELSE 0 END,
        ranking_points=COALESCE(ranking_points,0)+CASE WHEN $5 THEN 100 ELSE 0 END,
        win_streak=CASE WHEN $5 THEN COALESCE(win_streak,0)+1 ELSE 0 END,
        total_score=COALESCE(total_score,0)+$6,highest_score=GREATEST(COALESCE(highest_score,0),$6),
        best_turn=GREATEST(COALESCE(best_turn,0),$7),
        best_win_streak=GREATEST(COALESCE(best_win_streak,0),CASE WHEN $5 THEN COALESCE(win_streak,0)+1 ELSE 0 END),
        perfect_game=COALESCE(perfect_game,0)+CASE WHEN $8 THEN 1 ELSE 0 END WHERE id=$1`,
      [player.id,award.coins,xp,getLevel(xp),award.isWinner,award.score,award.bestTurn,award.perfect]);
    }
    if (Number(match.betPot) > 0) {
      const winner = profiles.get(match.winner.id);
      if (!winner?.user_id) throw new Error('bet_winner_missing_requires_review');
      const net = Math.floor(Number(match.betPot) * 0.9);
      await addOperation(client,id,winner.id,'bet_payout',net,at);
      await addOperation(client,id,winner.id,'bet_fee',Math.floor(Number(match.betPot))-net,at);
      await client.query('UPDATE players SET coins=coins+$1 WHERE id=$2', [net,winner.id]);
    }
    if (daily?.player && profiles.get(daily.player.id)?.user_id) {
      const { challenge, player } = daily;
      const score = Math.max(0,Math.min(10000,Number(player.score)||0));
      const completed = score >= Number(challenge.target || 10000);
      await client.query(`INSERT INTO daily_scores(challenge_date,player_id,player_name,score,rolls,completed,completed_at,reward_claimed)
        VALUES($1,$2,$3,$4,0,$5,$6,false) ON CONFLICT(challenge_date,player_id) DO UPDATE
        SET score=GREATEST(daily_scores.score,EXCLUDED.score),completed=daily_scores.completed OR EXCLUDED.completed`,
      [challenge.date,player.id,String(player.name || 'Jugador').slice(0,24),score,completed,completed?at:null]);
      const claim = await client.query('UPDATE daily_scores SET reward_claimed=true WHERE challenge_date=$1 AND player_id=$2 AND completed=true AND reward_claimed=false RETURNING player_id', [challenge.date,player.id]);
      if (claim.rows.length) {
        const reward = Math.max(0,Math.floor(Number(challenge.reward)||0));
        await addOperation(client,id,player.id,'daily_reward',reward,at);
        await client.query('UPDATE players SET coins=coins+$1 WHERE id=$2', [reward,player.id]);
      }
    }
    await client.query("UPDATE finished_matches SET status='settled',settled_at=$2,last_error=NULL WHERE id=$1", [id,at]);
    await client.query('COMMIT');
    return { duplicate: false };
  } catch (error) {
    await client.query('ROLLBACK');
    await client.query(`UPDATE finished_matches SET attempts=attempts+1,last_error=$2,
      next_attempt_at=$3+LEAST(3600000,5000*POWER(2,LEAST(attempts,9)))::bigint WHERE id=$1 AND status='pending'`, [id,String(error.message).slice(0,250),Date.now()]);
    throw error;
  } finally { client.release(); }
}

let retrying = false;
async function retryFinishedMatches(options = {}) {
  if (retrying) return;
  retrying = true;
  try {
    const db = options.db || pool;
    const pending = await db.query("SELECT id FROM finished_matches WHERE status='pending' AND next_attempt_at<=$1 ORDER BY created_at LIMIT 20", [Date.now()]);
    for (const row of pending.rows) await settleFinishedMatch(row.id,options).catch(error => console.error('Match settlement retry:',row.id,error.message));
  } finally { retrying = false; }
}
module.exports = { saveFinishedMatch, settleFinishedMatch, retryFinishedMatches, boostedCoins };
