"use strict";

/**
 * ============================================================
 * LOS 10.000 DE MACKO — backend/botManager.js
 * Inteligencia artificial para bots oponentes.
 * ============================================================
 *
 * Tres niveles de dificultad:
 *   - easy:   conservador, se planta rápido
 *   - normal: balanceado, decisiones lógicas medias
 *   - hard:   agresivo, maximiza puntos, más riesgo
 *
 * Cada bot tiene un nombre temático.
 * ============================================================
 */

const BOT_NAMES = [
  "🤖 Tron",
  "⚡ Byte",
  "🎲 D20",
  "💎 Ruby",
  "🔥 Pixel",
  "🧊 Glitch",
  "🌟 Nova",
  "🛡️ Código",
  "⚙️ R2",
  "🔮 Chips"
];

/**
 * Devuelve un nombre de bot según el índice (cíclico).
 */
function getBotName(index) {
  return BOT_NAMES[index % BOT_NAMES.length];
}

/**
 * Genera un ID único para un bot.
 */
function generateBotId(index) {
  return `bot_${index}_${Date.now()}`;
}

/**
 * Decide si el bot debe plantarse (bank) o seguir tirando.
 *
 * @param {Object} player - Estado del jugador (score, turnPoints, remainingDice, entered, etc.)
 * @param {string} difficulty - 'easy' | 'normal' | 'hard'
 * @returns {boolean} true = plantarse, false = seguir tirando
 */
function shouldBank(player, difficulty) {
  const { score, turnPoints, remainingDice, entered } = player;

  if (!entered) return false; // Primero hay que entrar

  const totalProjected = score + turnPoints;

  switch (difficulty) {
    case 'easy':
      // Muy conservador: se planta con poco
      if (turnPoints >= 250) return true;
      if (remainingDice <= 3 && turnPoints >= 100) return true;
      if (remainingDice <= 2) return true; // No arriesga con pocos dados
      if (totalProjected >= 5000 && turnPoints >= 200) return true;
      // Factor aleatorio: 20% de chance de plantarse aunque tenga poco
      if (turnPoints >= 100 && remainingDice <= 3 && Math.random() < 0.2) return true;
      return false;

    case 'normal':
      // Balanceado
      if (turnPoints >= 500) return true;
      if (remainingDice <= 2 && turnPoints >= 200) return true;
      if (remainingDice === 1) return true; // Con 1 dado casi siempre se planta
      if (totalProjected >= 7000 && turnPoints >= 350) return true;
      if (score >= 9000 && turnPoints >= 300) return true; // Cerca de ganar, no arriesga
      // Factor aleatorio: 15% de chance de seguir con 3-4 dados aunque tenga puntos
      if (turnPoints >= 300 && remainingDice >= 3 && Math.random() < 0.15) return false;
      return false;

    case 'hard':
      // Agresivo: busca maximizar puntos
      if (turnPoints >= 800) return true;
      if (remainingDice <= 2 && turnPoints >= 350) return true;
      if (remainingDice === 1 && turnPoints >= 200) return true;
      if (score >= 9000 && turnPoints >= 350) return true; // Cerrando el partido
      if (score >= 9500 && turnPoints >= 200) return true; // Muy cerca, no arriesga
      // A veces se arriesga con todo
      if (remainingDice >= 4 && turnPoints < 400 && Math.random() < 0.7) return false; // Sigue
      if (remainingDice >= 3 && turnPoints < 300 && Math.random() < 0.5) return false; // Sigue
      return true; // Por defecto se planta si no hay razón para seguir
  }

  return true; // Default: plantarse
}

/**
 * Obtiene el delay entre acciones del bot (en ms).
 * Simula "tiempo de pensar" del bot.
 * Los bots difíciles "piensan" más rápido.
 */
function getBotDelay(difficulty) {
  switch (difficulty) {
    case 'easy':   return 1200 + Math.random() * 800;  // 1.2-2.0s
    case 'normal': return 800 + Math.random() * 700;   // 0.8-1.5s
    case 'hard':   return 500 + Math.random() * 600;   // 0.5-1.1s
    default:       return 1000;
  }
}

// ── Cosméticos de tienda para bots (propaganda/publicidad) ──
const BOT_COSMETICS = {
  dice: [1, 2, 4, 5, 6, 18, 19, 20, 21, 22, 32, 33],
  avatar: [7, 8, 9, 10, 11, 12, 13, 14, 23, 24, 25, 26, 27, 34, 35],
  special: [3, 15, 16, 17, 28, 29, 30, 31, 36]
};

/**
 * Asigna cosméticos aleatorios de la tienda a un bot.
 * Los bots muestran skins, avatares y efectos especiales
 * que los jugadores pueden comprar.
 */
function getRandomCosmetics() {
  return {
    equippedDice: BOT_COSMETICS.dice[Math.floor(Math.random() * BOT_COSMETICS.dice.length)],
    equippedAvatar: BOT_COSMETICS.avatar[Math.floor(Math.random() * BOT_COSMETICS.avatar.length)],
    equippedSpecial: BOT_COSMETICS.special[Math.floor(Math.random() * BOT_COSMETICS.special.length)]
  };
}

module.exports = {
  getBotName,
  generateBotId,
  shouldBank,
  getBotDelay,
  getRandomCosmetics,
  BOT_NAMES
};
