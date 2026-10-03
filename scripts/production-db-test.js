'use strict';
// Refuse production endpoints. No real provider request is made in this suite.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const url = new URL(process.env.DATABASE_URL || 'postgres://localhost/not_configured');
if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname) || !url.pathname.endsWith('_test')) {
  throw new Error('Use an isolated local PostgreSQL database ending in _test');
}
process.env.MP_ACCESS_TOKEN = 'test-only-fake-token';
process.env.MP_COLLECTOR_ID = '42';
const { Payment } = require('mercadopago');
const payments = new Map();
Payment.prototype.get = async ({ id }) => {
  if (!payments.has(String(id))) throw new Error('simulated_provider_unavailable');
  return structuredClone(payments.get(String(id)));
};
const { initializeDatabase, pool } = require('../backend/database');
const { migrateProduction } = require('../backend/productionMigrations');
const { handleMPWebhook } = require('../backend/paymentManagerMP');

async function main() {
  await initializeDatabase();
  await migrateProduction(pool);
  await migrateProduction(pool);
  const user = randomUUID();
  const player = `production-test-${user}`;
  const order = randomUUID();
  const paymentId = String(Date.now());
  const missingId = paymentId + '9';
  try {
    await pool.query('INSERT INTO users(id,email,username,password_hash,created_at) VALUES($1,$2,$3,$4,$5)', [user, `${user}@example.invalid`, player, 'not-a-real-password', Date.now()]);
    await pool.query('INSERT INTO players(id,user_id,created_at) VALUES($1,$2,$3)', [player, user, Date.now()]);
    // Deliberately not current catalog content: delivery must use the saved snapshot.
    const snapshot = { id: 'small', name: 'Immutable test pack', coins: 7, xp: 0, itemIds: [1] };
    await pool.query(`INSERT INTO commerce_orders(id,user_id,request_key,pack_id,pack_snapshot,amount_cents,currency,live_mode,created_at,updated_at)
      VALUES($1,$2,$3,'small',$4,50000,'ARS',false,$5,$5)`, [order,user,randomUUID(),JSON.stringify(snapshot),Date.now()]);
    payments.set(paymentId, { id: paymentId, external_reference: order, status: 'approved', transaction_amount: 500, currency_id: 'ARS', live_mode: false, collector_id: 42 });
    await Promise.all(Array.from({ length: 20 }, () => handleMPWebhook(paymentId, 'payment', pool)));
    assert.equal(Number((await pool.query('SELECT coins FROM players WHERE id=$1', [player])).rows[0].coins), 7);
    assert.equal(Number((await pool.query('SELECT COUNT(*) FROM payment_events WHERE payment_id=$1', [paymentId])).rows[0].count), 1);
    assert.equal(Number((await pool.query('SELECT COUNT(*) FROM transactions WHERE player_id=$1', [player])).rows[0].count), 1);
    assert.equal(Number((await pool.query('SELECT COUNT(*) FROM redemptions WHERE player_id=$1', [player])).rows[0].count), 1);
    console.log('OK 20 concurrent notifications deliver immutable content exactly once');
    payments.get(paymentId).transaction_amount = 501;
    await assert.rejects(handleMPWebhook(paymentId, 'payment', pool));
    assert.equal(Number((await pool.query('SELECT coins FROM players WHERE id=$1', [player])).rows[0].coins), 7);
    console.log('OK amount mismatch never credits coins');
    payments.get(paymentId).transaction_amount = 500;
    payments.get(paymentId).status = 'refunded';
    await handleMPWebhook(paymentId, 'payment', pool);
    assert.equal((await pool.query('SELECT status FROM commerce_orders WHERE id=$1', [order])).rows[0].status, 'refunded');
    payments.get(paymentId).status = 'approved';
    await handleMPWebhook(paymentId, 'payment', pool);
    assert.equal((await pool.query('SELECT status FROM commerce_orders WHERE id=$1', [order])).rows[0].status, 'refunded');
    assert.equal(Number((await pool.query('SELECT coins FROM players WHERE id=$1', [player])).rows[0].coins), 7);
    console.log('OK refund/replay never delivers twice (refund entitlement review remains manual)');
    await assert.rejects(handleMPWebhook(missingId, 'payment', pool));
    const inbox = (await pool.query('SELECT * FROM commerce_inbox WHERE payment_id=$1', [missingId])).rows[0];
    assert.equal(inbox.status, 'pending'); assert.equal(inbox.attempts, 1); assert(Number(inbox.next_attempt_at) > Date.now());
    console.log('OK provider failure persists a retry across server restarts');
  } finally {
    await pool.query('DELETE FROM commerce_inbox WHERE payment_id = ANY($1)', [[paymentId,missingId]]);
    await pool.query('DELETE FROM payment_events WHERE user_id=$1', [user]);
    await pool.query('DELETE FROM commerce_orders WHERE user_id=$1', [user]);
    await pool.query('DELETE FROM redemptions WHERE player_id=$1', [player]);
    await pool.query('DELETE FROM transactions WHERE player_id=$1', [player]);
    await pool.query('DELETE FROM players WHERE id=$1', [player]);
    await pool.query('DELETE FROM users WHERE id=$1', [user]);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
