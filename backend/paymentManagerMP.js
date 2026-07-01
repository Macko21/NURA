"use strict";

/**
 * ============================================================
 * LOS 10.000 DE MACKO — paymentManagerMP.js
 * Integración con Mercado Pago para Argentina
 * SDK v3+ (MercadoPagoConfig, Preference, Payment)
 * ============================================================
 */

const { MercadoPagoConfig, Preference, Payment } = require("mercadopago");

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
const COIN_PACKS = {
  "small":  { coins: 500,  price: 500,   name: "Bolsa de Monedas" },
  "medium": { coins: 1500, price: 1200,  name: "Cofre de Monedas" },
  "large":  { coins: 4000, price: 2800,  name: "Tesoro Real" },
  "mega":   { coins: 10000,price: 5500,  name: "Fortuna de Macko" }
};

/**
 * Crea una preferencia de pago en Mercado Pago (Checkout Pro).
 * Devuelve el link de pago para redirigir al usuario.
 */
async function createCheckoutPreference(packId, userId, userEmail) {
  if (!mpClient) throw new Error("Mercado Pago no está configurado");

  try {
    const pack = COIN_PACKS[packId];
    if (!pack) throw new Error("Paquete no válido");

    const preferenceData = {
      body: {
        items: [{
          id: packId,
          title: `${pack.name} - ${pack.coins} monedas`,
          description: `${pack.coins} monedas para Los 10.000 de Macko`,
          quantity: 1,
          currency_id: "ARS",
          unit_price: pack.price
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
      price: pack.price
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
  if (topic && topic !== "payment" && topic !== "merchant_order") {
    return { received: true };
  }

  if (!paymentId) return { received: true };

  try {
    const result = await mpPayment.get({ id: paymentId });
    // SDK v3+: paymentData viene directamente o en .body según versión
    const paymentData = result.body || result;

    if (paymentData.status === "approved") {
      const extRef = JSON.parse(paymentData.external_reference || "{}");
      const { userId, coins } = extRef;

      if (!userId || !coins) {
        console.warn("MP webhook: sin userId o coins en external_reference");
        return { received: true };
      }

      const coinsAmount = parseInt(coins, 10);
      if (isNaN(coinsAmount)) return { received: true };

      const userResult = await pool.query("SELECT id FROM users WHERE id = $1", [userId]);
      if (userResult.rows.length === 0) {
        console.warn(`MP webhook: usuario ${userId} no encontrado`);
        return { received: true };
      }

      await pool.query("UPDATE players SET coins = coins + $1 WHERE user_id = $2", [coinsAmount, userId]);
      await pool.query(
        `INSERT INTO transactions (player_id, amount, reason, created_at) VALUES ($1, $2, $3, $4)`,
        [userId, coinsAmount, "Compra Mercado Pago", Date.now()]
      );

      console.log(`✅ MP: ${coinsAmount} monedas → usuario ${userId}`);
    }
  } catch (err) {
    console.error("Error procesando IPN de MP:", err);
  }

  return { received: true };
}

/**
 * Devuelve los paquetes disponibles para el frontend.
 */
function getCoinPacks() {
  const packs = {};
  for (const [id, pack] of Object.entries(COIN_PACKS)) {
    packs[id] = {
      ...pack,
      priceDisplay: `$${pack.price.toLocaleString("es-AR")}`
    };
  }
  return packs;
}

module.exports = {
  createCheckoutPreference,
  handleMPWebhook,
  getCoinPacks
};
