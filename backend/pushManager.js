"use strict";

/**
 * ============================================================
 * LOS 10.000 DE MACKO — pushManager.js
 * Notificaciones Push usando Web Push API (navegador)
 * Sin dependencia de servicios externos (OneSignal, etc.)
 * ============================================================
 */

const webPush = require("web-push");

// VAPID keys se generan automáticamente si no existen en env
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL = process.env.VAPID_EMAIL || "ceo@los10000demacko.com";

let vapidReady = false;

function initPush() {
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webPush.setVapidDetails(
      `mailto:${VAPID_EMAIL}`,
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );
    vapidReady = true;
    console.log("🔔 Web Push configurado con VAPID keys de env");
  } else {
    console.warn("⚠️  Web Push: Sin VAPID keys — notificaciones push deshabilitadas");
    console.warn("   Generalas con: npx web-push generate-vapid-keys");
    console.warn("   Y setealas como VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY en el env");
  }
}

function isPushReady() {
  return vapidReady;
}

function getVapidPublicKey() {
  return VAPID_PUBLIC_KEY || "";
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
