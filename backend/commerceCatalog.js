"use strict";

const COMMERCE_PACKS = {
  small:  { name: "Bolsa de Monedas", icon: "🪙", coins: 500, usdCents: 299, arsPrice: 500 },
  medium: { name: "Cofre de Monedas", icon: "💰", coins: 1500, usdCents: 799, arsPrice: 1200 },
  large:  { name: "Tesoro Real", icon: "👑", coins: 4000, usdCents: 1599, arsPrice: 2800, badge: "Popular" },
  mega:   { name: "Fortuna de Macko", icon: "🏰", coins: 10000, usdCents: 3499, arsPrice: 5500, badge: "Mejor valor" },
  skin_starter: { name: "Pack Skins Elementales", icon: "🔥", coins: 500, itemIds: [1, 2, 6, 20], usdCents: 499, arsPrice: 6990, badge: "4 skins" },
  avatar_party: { name: "Pack Avatares Party", icon: "🎭", coins: 400, itemIds: [7, 10, 23, 27, 41], usdCents: 599, arsPrice: 8490, badge: "5 avatares" },
  legend_combo: { name: "Pack Leyenda", icon: "🐉", coins: 1500, itemIds: [19, 13, 16, 46], usdCents: 999, arsPrice: 13990, badge: "Combo completo" },
  ultra_diamond: { name: "Ultra Diamante", icon: "💠", coins: 1000, itemIds: [32], usdCents: 1299, arsPrice: 17990, badge: "Ultra directo" },
  ultra_galaxy: { name: "Ultra Galáctico", icon: "🌌", coins: 1200, itemIds: [33, 36], usdCents: 1699, arsPrice: 23990, badge: "Ultra + efecto" },
  ultra_mythic: { name: "Ultra Mítico", icon: "🔮", coins: 1500, itemIds: [49, 50, 51], usdCents: 2199, arsPrice: 30990, badge: "3 Ultra" }
};

function getCommercePack(id) {
  const pack = COMMERCE_PACKS[id];
  return pack ? { id, itemIds: [], coins: 0, ...pack } : null;
}

function listCommercePacks(catalog, currency = "ARS") {
  const items = new Map((catalog || []).map(item => [Number(item.id), item]));
  return Object.fromEntries(Object.keys(COMMERCE_PACKS).map(id => {
    const pack = getCommercePack(id);
    const price = currency === "USD" ? pack.usdCents : pack.arsPrice;
    return [id, { name: pack.name, icon: pack.icon, coins: pack.coins, badge: pack.badge || "",
      items: pack.itemIds.map(itemId => items.get(itemId)).filter(Boolean).map(item => ({ id: item.id, name: item.name, icon: item.icon })),
      price, priceDisplay: currency === "USD" ? `$${(price / 100).toFixed(2)}` : `$${price.toLocaleString("es-AR")}` }];
  }));
}

async function grantCommercePack(client, userId, packId, provider) {
  const pack = getCommercePack(packId);
  if (!pack) throw new Error("Paquete no válido");
  const playerResult = await client.query("SELECT id FROM players WHERE user_id = $1 FOR UPDATE", [userId]);
  if (!playerResult.rows.length) throw new Error(`Usuario ${userId} sin jugador`);
  const playerId = playerResult.rows[0].id;
  if (pack.coins) {
    await client.query("UPDATE players SET coins = coins + $1 WHERE id = $2", [pack.coins, playerId]);
    await client.query(`INSERT INTO transactions (player_id, amount, reason, created_at) VALUES ($1, $2, $3, $4)`,
      [playerId, pack.coins, `Compra ${provider}: ${pack.name}`, Date.now()]);
  }
  let deliveredItems = 0;
  for (const itemId of pack.itemIds) {
    const inserted = await client.query(
      `INSERT INTO redemptions (player_id, reward_id, status, created_at)
       SELECT $1, $2, 'completed', $3
       WHERE NOT EXISTS (SELECT 1 FROM redemptions WHERE player_id = $1 AND reward_id = $2 AND status = 'completed')
       RETURNING reward_id`, [playerId, itemId, Date.now()]);
    deliveredItems += inserted.rows.length;
  }
  if (deliveredItems) await client.query("UPDATE players SET shop_purchases = COALESCE(shop_purchases, 0) + $1 WHERE id = $2", [deliveredItems, playerId]);
  return { playerId, coins: pack.coins, itemIds: pack.itemIds, deliveredItems };
}

module.exports = { COMMERCE_PACKS, getCommercePack, listCommercePacks, grantCommercePack };
