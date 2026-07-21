"use strict";

/**
 * ============================================================
 * LOS 10.000 DE MACKO — paymentManagerMP.js
 * Integración con Mercado Pago para Argentina
 * SDK v3+ (MercadoPagoConfig, Preference, Payment)
 * ============================================================
 */

const { MercadoPagoConfig, Preference, Payment } = require("mercadopago");
const { COMMERCE_PACKS, getCommercePack, listCommercePacks, grantCommercePack } = require("./commerceCatalog");

// Mercado Pago es opcional. Solo inicializar si hay token configurado.
let mpClient = null;
let mpPreference = null;
let mpPayment = null;

if (process.env.MP_ACCESS_TOKEN) {
  try {
    mpClient = new MercadoPagoConfig({
      accessToken: process.env.MP_ACCESS_TOKEN
    });
    mpPreference = new Preference(mpClient);
    mpPayment = new Payment(mpClient);
    console.log("💳 Mercado Pago configurado correctamente");
  } catch (e) {
    console.warn("⚠ Error al inicializar Mercado Pago:", e.message);
  }
} else {
  console.log("💳 Mercado Pago no configurado — la tienda de monedas no estará disponible");
}

// Paquetes de monedas disponibles (precios en ARS)
const COIN_PACKS = COMMERCE_PACKS;

/**
 * Crea una preferencia de pago en Mercado Pago (Checkout Pro).
 * Devuelve el link de pago para redirigir al usuario.
 */
async function createCheckoutPreference(packId, userId, userEmail) {
  if (!mpClient) throw new Error("Mercado Pago no está configurado");

  try {
    const pack = getCommercePack(packId);
    if (!pack) throw new Error("Paquete no válido");

    const preferenceData = {
      body: {
        items: [{
          id: packId,
          title: pack.name,
          description: "Contenido digital fijo para Los 10.000 de Macko",
          quantity: 1,
          currency_id: "ARS",
          unit_price: pack.arsPrice
        }],
        payer: {
          email: userEmail
        },
        back_urls: {
          success: `${process.env.BASE_URL || "http://localhost:3000"}/?mp_success=1`,
          failure: `${process.env.BASE_URL || "http://localhost:3000"}/?mp_failure=1`,
          pending: `${process.env.BASE_URL || "http://localhost:3000"}/?mp_pending=1`
        },
        auto_return: "approved",
        external_reference: JSON.stringify({ userId, packId, coins: pack.coins }),
        notification_url: `${process.env.BASE_URL || "http://localhost:3000"}/api/mercadopago/webhook`
      }
    };

    const result = await mpPreference.create(preferenceData);
    
    // SDK v3+ devuelve los datos directamente (no envueltos en .body)
    const prefBody = result.body || result;
    if (!prefBody || !prefBody.init_point) {
      throw new Error("Mercado Pago no generó link de pago. Verificá las credenciales.");
    }
    
    return {
      redirectUrl: prefBody.init_point || prefBody.sandbox_init_point,
      preferenceId: prefBody.id,
      coins: pack.coins,
      name: pack.name,
      price: pack.arsPrice
    };
  } catch (err) {
    console.error("Error creating MP preference:", err);
    throw err;
  }
}

/**
 * Procesa la notificación IPN (webhook) de Mercado Pago.
 */
async function handleMPWebhook(paymentId, topic, pool) {
  if (!mpClient) return { received: true };

  // Solo filtrar si topic está definido (formato IPN clásico)
  if (topic && topic !== "payment") {
    return { received: true };
  }

  if (!paymentId) return { received: true };

  try {
    const result = await mpPayment.get({ id: paymentId });
    // SDK v3+: paymentData viene directamente o en .body según versión
    const paymentData = result.body || result;

    if (paymentData.status === "approved") {
      const extRef = JSON.parse(paymentData.external_reference || "{}");
      const { userId, packId } = extRef;

      if (!userId || !packId) {
        console.warn("MP webhook: referencia externa incompleta");
        return { received: true };
      }

      const pack = getCommercePack(packId);
      if (!pack || Number(paymentData.transaction_amount) !== pack.arsPrice || paymentData.currency_id !== "ARS") {
        throw new Error("El pago de Mercado Pago no coincide con el paquete comprado");
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const eventInsert = await client.query(
          `INSERT INTO payment_events (provider, payment_id, user_id, pack_id, amount, created_at)
           VALUES ('mercadopago', $1, $2, $3, $4, $5)
           ON CONFLICT (provider, payment_id) DO NOTHING RETURNING payment_id`,
          [String(paymentData.id), userId, packId, pack.coins, Date.now()]
        );
        if (!eventInsert.rows.length) {
          await client.query("COMMIT");
          return { received: true, duplicate: true };
        }
        const delivery = await grantCommercePack(client, userId, packId, "Mercado Pago");
        await client.query("COMMIT");
        console.log(`✅ MP: pack ${packId} → jugador ${delivery.playerId}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }
  } catch (err) {
    console.error("Error procesando IPN de MP:", err);
    throw err;
  }

  return { received: true };
}

/**
 * Devuelve los paquetes disponibles para el frontend.
 */
function getCoinPacks(catalog = []) { return listCommercePacks(catalog, "ARS"); }

module.exports = {
  createCheckoutPreference,
  handleMPWebhook,
  getCoinPacks
};
