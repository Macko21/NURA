"use strict";

/**
 * ============================================================
 * LOS 10.000 DE MACKO — pushManager.js
 * Notificaciones Push usando Web Push API (navegador)
 * Sin dependencia de servicios externos (OneSignal, etc.)
 * ============================================================
 */

const webPush = require("web-push");
const { pool } = require("./database");

// VAPID keys se generan automáticamente si no existen en env
const VAPID_EMAIL = process.env.VAPID_EMAIL || "ceo@los10000demacko.com";

let vapidReady = false;
let activePublicKey = "";

async function initPush() {
  let publicKey = process.env.VAPID_PUBLIC_KEY || "";
  let privateKey = process.env.VAPID_PRIVATE_KEY || "";

  if (!publicKey || !privateKey) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `);
    const existing = await pool.query(`SELECT value FROM app_settings WHERE key = 'vapid_keys'`);
    const stored = existing.rows[0]?.value || {};
    publicKey = stored.publicKey || "";
    privateKey = stored.privateKey || "";
    if (!publicKey || !privateKey) {
      const generated = webPush.generateVAPIDKeys();
      await pool.query(`
        INSERT INTO app_settings (key, value, updated_at) VALUES ('vapid_keys', $1, $2)
        ON CONFLICT (key) DO NOTHING
      `, [JSON.stringify(generated), Date.now()]);
      const persisted = await pool.query(`SELECT value FROM app_settings WHERE key = 'vapid_keys'`);
      publicKey = persisted.rows[0]?.value?.publicKey || generated.publicKey;
      privateKey = persisted.rows[0]?.value?.privateKey || generated.privateKey;
    }
  }

  webPush.setVapidDetails(`mailto:${VAPID_EMAIL}`, publicKey, privateKey);
  activePublicKey = publicKey;
  vapidReady = true;
  console.log("🔔 Web Push configurado con claves VAPID persistentes");
}

function isPushReady() {
  return vapidReady;
}

function getVapidPublicKey() {
  return activePublicKey;
}

async function sendPushNotification(subscription, title, body, url, extraData) {
  if (!vapidReady) return { success: false, error: "Push no configurado" };
  try {
    const payload = JSON.stringify({
      title,
      body,
      url: url || "/",
      timestamp: Date.now(),
      ...(extraData || {})
    });
    await webPush.sendNotification(subscription, payload);
    return { success: true };
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      // Suscripción expirada o inválida
      return { success: false, expired: true, error: err.message };
    }
    return { success: false, error: err.message };
  }
}

module.exports = {
  initPush,
  isPushReady,
  getVapidPublicKey,
  sendPushNotification
};
