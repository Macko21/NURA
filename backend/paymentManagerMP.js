"use strict";
const { randomUUID } = require('crypto');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const { getCommercePack, listCommercePacks, grantCommercePack } = require('./commerceCatalog');
const { pool } = require('./database');
const { paymentsEnabled } = require('./productionPolicy');
const config = process.env.MP_ACCESS_TOKEN ? new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN }) : null;
const preference = config ? new Preference(config) : null;
const payment = config ? new Payment(config) : null;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validatePayment(data, order, env = process.env) {
  if (String(data.external_reference) !== String(order.id)) throw new Error('order_reference_mismatch');
  if (!Number.isFinite(Number(data.transaction_amount)) || data.currency_id !== order.currency || Math.round(Number(data.transaction_amount) * 100) !== Number(order.amount_cents)) throw new Error('order_amount_mismatch');
  if (typeof data.live_mode !== 'boolean' || data.live_mode !== order.live_mode) throw new Error('payment_environment_mismatch');
  if (!env.MP_COLLECTOR_ID || String(data.collector_id) !== String(env.MP_COLLECTOR_ID)) throw new Error('payment_seller_mismatch');
  if (order.payment_id && String(order.payment_id) !== String(data.id)) throw new Error('order_paid_twice_requires_refund');
}

async function createCheckoutPreference(packId, userId, userEmail, requestKey) {
  if (!paymentsEnabled() || !preference || !process.env.MP_WEBHOOK_SECRET || !process.env.MP_COLLECTOR_ID) throw new Error('Compras no habilitadas');
  if (!UUID.test(requestKey || '')) throw new Error('Identificador de compra inválido');
  const pack = getCommercePack(packId);
  if (!pack) throw new Error('Paquete no válido');
  const base = new URL(process.env.BASE_URL);
  if (base.protocol !== 'https:') throw new Error('Checkout requiere HTTPS');
  const now = Date.now();
  await pool.query(`INSERT INTO commerce_orders
    (id,user_id,request_key,pack_id,pack_snapshot,amount_cents,currency,live_mode,created_at,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,'ARS',$7,$8,$8) ON CONFLICT(user_id,request_key) DO NOTHING`,
  [randomUUID(), userId, requestKey, packId, JSON.stringify(pack), Math.round(pack.arsPrice * 100), process.env.MP_LIVE_MODE === 'true', now]);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query('SELECT * FROM commerce_orders WHERE user_id=$1 AND request_key=$2 FOR UPDATE', [userId, requestKey]);
    const order = found.rows[0];
    if (order.pack_id !== packId) throw new Error('Identificador reutilizado para otro paquete');
    if (!order.redirect_url) {
      const result = await preference.create({ body: {
        items: [{ id: order.pack_id, title: order.pack_snapshot.name, quantity: 1, currency_id: order.currency, unit_price: Number(order.amount_cents) / 100 }],
        payer: { email: userEmail },
        back_urls: { success: `${base.origin}/?mp_success=1`, failure: `${base.origin}/?mp_failure=1`, pending: `${base.origin}/?mp_pending=1` },
        auto_return: 'approved', external_reference: order.id,
        notification_url: `${base.origin}/api/mercadopago/webhook`
      }, requestOptions: { idempotencyKey: order.id } });
      const body = result.body || result;
      const url = order.live_mode ? body.init_point : body.sandbox_init_point;
      if (!url) throw new Error('Checkout sin URL');
      await client.query("UPDATE commerce_orders SET preference_id=$1,redirect_url=$2,status='pending',updated_at=$3 WHERE id=$4", [String(body.id), url, Date.now(), order.id]);
      order.redirect_url = url;
    }
    await client.query('COMMIT');
    return { orderId: order.id, redirectUrl: order.redirect_url, coins: order.pack_snapshot.coins, name: order.pack_snapshot.name, price: Number(order.amount_cents) / 100 };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

// Keep processing existing buyers even while new checkout is paused.
async function handleMPWebhook(paymentId, topic, db = pool) {
  if (topic !== 'payment') return { received: true, ignored: true };
  if (!payment || !/^\d{1,40}$/.test(String(paymentId || ''))) throw new Error('payment_unavailable');
  await db.query(`INSERT INTO commerce_inbox(provider,payment_id,next_attempt_at,updated_at)
    VALUES('mercadopago',$1,$2,$2) ON CONFLICT(provider,payment_id)
    DO UPDATE SET status='pending',next_attempt_at=EXCLUDED.next_attempt_at,updated_at=EXCLUDED.updated_at`, [String(paymentId), Date.now()]);
  return processPayment(String(paymentId), db);
}

async function processPayment(paymentId, db = pool) {
  try {
    const result = await payment.get({ id: paymentId });
    const data = result.body || result;
    if (String(data.id) !== paymentId || !UUID.test(data.external_reference || '')) throw new Error('unknown_or_legacy_order_requires_review');
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query('SELECT * FROM commerce_orders WHERE id=$1 FOR UPDATE', [data.external_reference]);
      if (!found.rows.length) throw new Error('order_not_found');
      const order = found.rows[0];
      validatePayment(data, order);
      let delivered = false;
      if (data.status === 'approved' && !order.delivered_at && !['refunded','charged_back','review'].includes(order.status)) {
        const event = await client.query(`INSERT INTO payment_events(provider,payment_id,user_id,pack_id,amount,created_at)
          VALUES('mercadopago',$1,$2,$3,$4,$5) ON CONFLICT(provider,payment_id) DO NOTHING RETURNING payment_id`,
        [paymentId, order.user_id, order.pack_id, order.pack_snapshot.coins || 0, Date.now()]);
        if (!event.rows.length) throw new Error('payment_event_conflict_requires_review');
        await grantCommercePack(client, order.user_id, order.pack_id, 'Mercado Pago', order.pack_snapshot);
        delivered = true;
      }
      const status = ['refunded','charged_back','review'].includes(order.status) ? order.status
        : ['refunded','charged_back'].includes(data.status) ? data.status
        : order.delivered_at || delivered ? 'delivered' : String(data.status || 'pending');
      await client.query(`UPDATE commerce_orders SET status=$1,payment_id=$2,
        delivered_at=CASE WHEN $3 THEN $4 ELSE delivered_at END,updated_at=$4 WHERE id=$5`,
      [status, ['approved','refunded','charged_back'].includes(data.status) ? paymentId : order.payment_id, delivered, Date.now(), order.id]);
      await client.query("UPDATE commerce_inbox SET status='processed',last_error=NULL,updated_at=$2 WHERE provider='mercadopago' AND payment_id=$1", [paymentId, Date.now()]);
      await client.query('COMMIT');
      return { received: true, delivered, duplicate: !!order.delivered_at };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  } catch (error) {
    await db.query(`UPDATE commerce_inbox SET attempts=attempts+1,last_error=$2,
      next_attempt_at=$3 + LEAST(3600000,5000 * POWER(2,LEAST(attempts,9)))::bigint,
      updated_at=$3 WHERE provider='mercadopago' AND payment_id=$1`, [paymentId, String(error.message).slice(0,250), Date.now()]);
    throw error;
  }
}

let retryRunning = false;
async function retryPendingPayments() {
  if (!payment || retryRunning) return;
  retryRunning = true;
  try {
    const pending = await pool.query("SELECT payment_id FROM commerce_inbox WHERE provider='mercadopago' AND status='pending' AND next_attempt_at <= $1 ORDER BY next_attempt_at LIMIT 20", [Date.now()]);
    for (const row of pending.rows) await processPayment(row.payment_id).catch(error => console.error('MP retry:', error.message));
  } finally { retryRunning = false; }
}
function getCoinPacks(catalog = []) { return listCommercePacks(catalog, 'ARS'); }
module.exports = { createCheckoutPreference, handleMPWebhook, retryPendingPayments, getCoinPacks, validatePayment };
