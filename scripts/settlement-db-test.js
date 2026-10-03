'use strict';
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const url = new URL(process.env.DATABASE_URL || 'postgres://localhost/not_configured');
if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname) || !url.pathname.endsWith('_test')) throw new Error('Use isolated local PostgreSQL ending in _test');
const { initializeDatabase, pool } = require('../backend/database');
const { migrateProduction } = require('../backend/productionMigrations');
const { saveFinishedMatch, settleFinishedMatch } = require('../backend/matchSettlement');

async function main() {
  await initializeDatabase();
  await migrateProduction(pool);
  await migrateProduction(pool);
  const user = randomUUID(), player = `settlement-test-${user}`, id = randomUUID(), lostAckId = randomUUID();
  const match = { id, roomId: randomUUID(), status: 'finished', finishedAt: Date.now(), winner: { id: player },
    players: [{ id: player, score: 10000, turnsPlayed: 3, winStreak: 0 }], history: [{ type: 'BANKED', payload: { playerId: player, gained: 500 } }] };
  try {
    await pool.query('INSERT INTO users(id,email,username,password_hash,created_at) VALUES($1,$2,$3,$4,$5)', [user,`${user}@example.invalid`,player,'test-only',Date.now()]);
    await pool.query('INSERT INTO players(id,user_id,created_at) VALUES($1,$2,$3)', [player,user,Date.now()]);
    await Promise.all(Array.from({ length: 10 }, () => saveFinishedMatch(match, {}, pool)));
    assert.equal(Number((await pool.query('SELECT COUNT(*) FROM finished_matches WHERE id=$1',[id])).rows[0].count),1);
    console.log('OK concurrent result saving creates one immutable obligation');
    const failingDb = {
      query: (...args) => pool.query(...args),
      connect: async () => {
        const client = await pool.connect();
        return { release: () => client.release(), query: (sql,args) => {
          if (String(sql).startsWith('INSERT INTO game_operations') && args[3] === 'xp') throw new Error('simulated_failure_after_coin_ledger');
          return client.query(sql,args);
        } };
      }
    };
    await assert.rejects(settleFinishedMatch(id,{db:failingDb}));
    let state = (await pool.query('SELECT coins,xp,games_played FROM players WHERE id=$1',[player])).rows[0];
    assert.equal(state.coins,0); assert.equal(state.xp,0); assert.equal(state.games_played,0);
    assert.equal(Number((await pool.query('SELECT COUNT(*) FROM game_operations WHERE match_id=$1',[id])).rows[0].count),0);
    assert.equal((await pool.query('SELECT status FROM finished_matches WHERE id=$1',[id])).rows[0].status,'pending');
    console.log('OK partial award failure rolls back coins, XP, statistics and ledger together');
    // New Node process, no shared in-memory match or retry queue.
    const child = await promisify(execFile)(process.execPath,['-e',
      "const {settleFinishedMatch}=require('./backend/matchSettlement');const {pool}=require('./backend/database');settleFinishedMatch(process.argv[1]).catch(e=>{console.error(e);process.exitCode=1}).finally(()=>pool.end());",id], { cwd: require('node:path').resolve(__dirname,'..'), env: process.env });
    assert(!child.stderr);
    state = (await pool.query('SELECT coins,xp,games_played,games_won,best_turn FROM players WHERE id=$1',[player])).rows[0];
    assert.equal(state.coins,525); assert.equal(state.xp,75); assert.equal(state.games_played,1); assert.equal(state.games_won,1); assert.equal(state.best_turn,500);
    console.log('OK a fresh process recovers the saved result and pays the exact award');
    const retried = await Promise.all(Array.from({ length: 100 }, () => settleFinishedMatch(id)));
    assert(retried.every(r => r.duplicate));
    state = (await pool.query('SELECT coins,xp,games_played FROM players WHERE id=$1',[player])).rows[0];
    assert.equal(state.coins,525); assert.equal(state.xp,75); assert.equal(state.games_played,1);
    assert.equal(Number((await pool.query('SELECT COUNT(*) FROM game_operations WHERE match_id=$1',[id])).rows[0].count),3);
    assert.equal(Number((await pool.query('SELECT SUM(amount) FROM transactions WHERE player_id=$1',[player])).rows[0].sum),525);
    console.log('OK 100 concurrent replays never repeat coins, XP, statistics or ledger entries');
    await saveFinishedMatch({ ...match, id: lostAckId }, {}, pool);
    const lostAckDb = {
      query: (...args) => pool.query(...args),
      connect: async () => {
        const client = await pool.connect();
        return { release: () => client.release(), query: async (sql,args) => {
          const result = await client.query(sql,args);
          if (sql === 'COMMIT') throw new Error('simulated_lost_commit_acknowledgement');
          return result;
        } };
      }
    };
    await assert.rejects(settleFinishedMatch(lostAckId,{db:lostAckDb}));
    assert.equal((await settleFinishedMatch(lostAckId)).duplicate,true);
    state = (await pool.query('SELECT coins,xp,games_played FROM players WHERE id=$1',[player])).rows[0];
    assert.equal(state.coins,1050); assert.equal(state.xp,150); assert.equal(state.games_played,2);
    console.log('OK loss of commit acknowledgement never duplicates an already paid award');
  } finally {
    await pool.query('DELETE FROM transactions WHERE player_id=$1',[player]);
    await pool.query('DELETE FROM game_operations WHERE match_id=ANY($1)',[[id,lostAckId]]);
    await pool.query('DELETE FROM finished_matches WHERE id=ANY($1)',[[id,lostAckId]]);
    await pool.query('DELETE FROM players WHERE id=$1',[player]);
    await pool.query('DELETE FROM users WHERE id=$1',[user]);
  }
}
main().catch(error => { console.error(error); process.exitCode=1; }).finally(()=>pool.end());
