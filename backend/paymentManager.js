"use strict";

/**
 * ============================================================
 * LOS 10.000 DE MACKO — paymentManager.js
 * Gestión de pagos con Stripe (OPCIONAL — solo si está configurado)
 * ============================================================
 */

// Stripe es opcional. Si no hay STRIPE_SECRET_KEY, se desactiva.
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  try {
    stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
    console.log("💳 Stripe configurado (internacional)");
  } catch (e) {
    console.warn("⚠ Stripe no disponible:", e.message);
  }
} else {
  console.log("💳 Stripe no configurado — usando Mercado Pago para Argentina");
}

// Paquetes de monedas disponibles para compra con dinero real
const { COMMERCE_PACKS, getCommercePack, listCommercePacks, grantCommercePack } = require("./commerceCatalog");
const COIN_PACKS = COMMERCE_PACKS;

/**
 * Crea un PaymentIntent de Stripe para comprar un paquete de monedas.
 */
async function createCoinPurchase(priceId, userId) {
  if (!stripe) throw new Error("Stripe no está configurado. Usá Mercado Pago.");

  try {
    const pack = getCommercePack(priceId);
    if (!pack) throw new Error("Paquete no válido");

    const paymentIntent = await stripe.paymentIntents.create({
      amount: pack.usdCents,
      currency: "usd",
      description: `${pack.name} - contenido digital fijo`,
      metadata: {
        packId: priceId,
        coins: pack.coins.toString(),
        userId: userId
      }
    });

    return {
      clientSecret: paymentIntent.client_secret,
      amount: pack.usdCents,
      coins: pack.coins,
      name: pack.name
    };
  } catch (err) {
    console.error("Error creating Stripe payment:", err);
    throw err;
  }
}

/**
 * Verifica el webhook de Stripe y entrega las monedas al jugador.
 */
async function handleStripeWebhook(rawBody, signature, pool) {
  if (!stripe) throw new Error("Stripe no está configurado");

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    throw err;
  }

  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object;
    const { packId, userId } = paymentIntent.metadata;

    if (!userId) {
      console.warn("Webhook: sin userId en metadata");
      return { received: true };
    }

    const pack = getCommercePack(packId);
    if (!pack || paymentIntent.amount_received !== pack.usdCents || paymentIntent.currency !== "usd") {
      throw new Error("El pago de Stripe no coincide con el paquete comprado");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const eventInsert = await client.query(
        `INSERT INTO payment_events (provider, payment_id, user_id, pack_id, amount, created_at)
         VALUES ('stripe', $1, $2, $3, $4, $5)
         ON CONFLICT (provider, payment_id) DO NOTHING RETURNING payment_id`,
        [paymentIntent.id, userId, packId, pack.coins, Date.now()]
      );
      if (!eventInsert.rows.length) {
        await client.query("COMMIT");
        return { received: true, duplicate: true };
      }
      const delivery = await grantCommercePack(client, userId, packId, "Stripe");
      await client.query("COMMIT");
      console.log(`✅ Pack ${packId} entregado a jugador ${delivery.playerId}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  return { received: true };
}

/**
 * Devuelve los paquetes disponibles (sin el precio en centavos para el frontend).
 */
function getCoinPacks(catalog = []) { return listCommercePacks(catalog, "USD"); }

module.exports = {
  createCoinPurchase,
  handleStripeWebhook,
  getCoinPacks,
  COIN_PACKS
};
