"use strict";

const BOT_NAMES = ["🤖 Tron", "⚡ Byte", "🎲 D20", "💎 Ruby", "🔥 Pixel", "🧊 Glitch", "🌟 Nova", "🛡️ Código", "⚙️ R2", "🔮 Chips"];

function getBotName(index) { return BOT_NAMES[index % BOT_NAMES.length]; }
function generateBotId(index) { return `bot_${index}_${Date.now()}`; }

function shouldBank(player, difficulty, context = {}) {
  const score = Number(player.score || 0);
  const turnPoints = Number(player.turnPoints || 0);
  const remainingDice = Number(player.remainingDice || 0);
  if (!player.entered) return false;
  const totalProjected = score + turnPoints;
  if (totalProjected === 10000) return true;

  if (difficulty === 'easy') {
    if (turnPoints >= 250) return true;
    if (remainingDice <= 3 && turnPoints >= 100) return true;
    return remainingDice <= 2;
  }
  if (difficulty === 'normal') {
    if (turnPoints >= 500) return true;
    if (remainingDice <= 2 && turnPoints >= 200) return true;
    if (remainingDice === 1) return true;
    return score >= 9000 && turnPoints >= 300;
  }

  // Difícil: estrategia adaptativa, sin alterar resultados ni probabilidades.
  const leaderScore = Number(context.leaderScore || score);
  const scoreGap = Math.max(0, leaderScore - score);
  let target = scoreGap >= 2500 ? 950 : scoreGap >= 1000 ? 800 : 650;
  if (score >= leaderScore && score >= 6000) target -= 100;
  if (score >= 9000) target = Math.min(target, 450);
  if (remainingDice <= 1 && turnPoints >= 250) return true;
  if (remainingDice === 2 && turnPoints >= 400) return true;
  if (remainingDice === 3 && turnPoints >= 600) return true;
  return turnPoints >= target;
}

function getBotDelay(difficulty) {
  if (difficulty === 'easy') return 2400 + Math.random() * 900;
  if (difficulty === 'hard') return 1850 + Math.random() * 750;
  return 2100 + Math.random() * 800;
}

function getBotPresentationDelay(event) {
  if (event === 'HOT_DICE') return 2900 + Math.random() * 700;
  if (event === 'ROLL_RESULT') return 2300 + Math.random() * 700;
  return 1900 + Math.random() * 600;
}

const BOT_COSMETICS = {
  dice: [1, 2, 4, 5, 6, 18, 19, 20, 21, 22, 32, 33],
  avatar: [7, 8, 9, 10, 11, 12, 13, 14, 23, 24, 25, 26, 27, 34, 35],
  special: [3, 15, 16, 17, 28, 29, 30, 31, 36]
};

function getRandomCosmetics(catalog = []) {
  const dice = catalog.filter(i => i.category === 'dados' || (i.category === 'ultra' && /^Dados\b/i.test(i.name)));
  const avatars = catalog.filter(i =>
    (i.category === 'avatares' || (i.category === 'ultra' && /^Avatar\b/i.test(i.name)))
    && String(i.icon || '').length > 1
  );
  const specials = catalog.filter(i => i.category === 'especiales' || (i.category === 'ultra' && !/^(Dados|Avatar)\b/i.test(i.name)));
  const pick = (items, fallback) => items.length ? items[Math.floor(Math.random() * items.length)] : { id: fallback[Math.floor(Math.random() * fallback.length)] };
  const die = pick(dice, BOT_COSMETICS.dice);
  const avatar = pick(avatars, BOT_COSMETICS.avatar);
  const special = pick(specials, BOT_COSMETICS.special);
  return { equippedDice: die.id, equippedAvatar: avatar.icon || '🤖', equippedSpecial: special.id };
}

module.exports = { getBotName, generateBotId, shouldBank, getBotDelay, getBotPresentationDelay, getRandomCosmetics, BOT_NAMES };
