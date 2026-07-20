"use strict";

const DICE_SKIN_IDS_BY_NAME = Object.freeze({
  neon: "1",
  fuego: "2",
  elite: "4",
  fantasma: "5",
  hielo: "6",
  laser: "18",
  dorados: "19",
  esmeralda: "20",
  zombie: "21",
  arcoiris: "22",
  diamante: "32",
  galacticos: "33"
});

function normalizeDiceSkinName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^dados?\s+/, "")
    .replace(/[^a-z0-9]/g, "");
}

function canonicalDiceSkinId(itemId, itemName) {
  const canonicalId = DICE_SKIN_IDS_BY_NAME[normalizeDiceSkinName(itemName)];
  return canonicalId || String(itemId || "");
}

module.exports = { canonicalDiceSkinId, normalizeDiceSkinName };
