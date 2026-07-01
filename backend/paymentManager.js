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
const COIN_PACKS = {
  "small":  { coins: 500,  price: 299,  name: "Bolsa de Monedas" },
  "medium": { coins: 1500, price: 799,  name: "Cofre de Monedas" },
  "large":  { coins: 4000, price: 1599, name: "Tesoro Real" },
  "mega":   { coins: 10000, price: 3499, name: "Fortuna de Macko" }
};

/**
 * Crea un PaymentIntent de Stripe para comprar un paquete de monedas.
 */
async function createCoinPurchase(priceId, userId) {
  if (!stripe) throw new Error("Stripe no está configurado. Usá Mercado Pago.");

  try {
    const pack = COIN_PACKS[priceId];
    if (!pack) throw new Error("Paquete no válido");

    const paymentIntent = await stripe.paymentIntents.create({
      amount: pack.price, // en centavos
      currency: "usd",
      description: `${pack.name} - ${pack.coins} monedas`,
      metadata: {
        packId: priceId,
        coins: pack.coins.toString(),
        userId: userId
      }
    });

    return {
      clientSecret: paymentIntent.client_secret,
      amount: pack.price,
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
    const { coins, packId, userId } = paymentIntent.metadata;

    if (!userId) {
      console.warn("Webhook: sin userId en metadata");
      return { received: true };
    }

    const coinsAmount = parseInt(coins, 10); if (isNaN(coinsAmount)) return { received: true };

    const userResult = await pool.query("SELECT id FROM users WHERE id = $1", [userId]);
    if (userResult.rows.length === 0) {
      console.warn(`Webhook: usuario ${userId} no encontrado`);
      return { received: true };
    }

    await pool.query("UPDATE players SET coins = coins + $1 WHERE user_id = $2", [coinsAmount, userId]);
    await pool.query(
      `INSERT INTO transactions (player_id, amount, reason, created_at) VALUES ($1, $2, $3, $4)`,
      [userId, coinsAmount, `Compra Stripe: ${packId}`, Date.now()]
    );

    console.log(`✅ ${coinsAmount} monedas entregadas a usuario ${userId}`);
  }

  return { received: true };
}

/**
 * Devuelve los paquetes disponibles (sin el precio en centavos para el frontend).
 */
function getCoinPacks() {
  const packs = {};
  for (const [id, pack] of Object.entries(COIN_PACKS)) {
    packs[id] = {
      ...pack,
      priceDisplay: `$${(pack.price / 100).toFixed(2)}`
    };
  }
  return packs;
}

module.exports = {
  createCoinPurchase,
  handleStripeWebhook,
  getCoinPacks,
  COIN_PACKS
};
