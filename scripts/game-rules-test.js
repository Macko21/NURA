"use strict";

const assert = require("assert");
const {
  calculateScore,
  canEnterGame,
  getEntryScore,
  isWinningScore,
  isBustByExceeding,
  isInstantWin
} = require("../backend/gameEngine");
const {
  createMatch,
  getMatch,
  destroyMatch,
  handleEntryRoll,
  handleRoll
} = require("../backend/diceManager");
const { AUTO_BANK_DELAY_MS } = require("../backend/constants");
const { DICE_SKINS, SHOP_DICE_PREVIEW } = require("../frontend/dice-renderer");
const { SKIN_SOUND } = require("../frontend/audio");
const { createPlayerState } = require("../backend/matchState");

let passed = 0;

function check(name, fn) {
  fn();
  passed++;
  console.log(`  OK ${name}`);
}

function makeRoom(id) {
  return {
    id,
    code: "123456",
    currentTurnIndex: 0,
    players: [
      { id: "p1", name: "Uno", alias: "Uno#0001", ready: true },
      { id: "p2", name: "Dos", alias: "Dos#0002", ready: true }
    ]
  };
}

function withDice(values, fn) {
  const originalRandom = Math.random;
  const queue = [...values];
  Math.random = () => {
    if (!queue.length) throw new Error("La prueba pidio mas dados de los preparados");
    return (queue.shift() - 0.5) / 6;
  };
  try {
    return fn();
  } finally {
    Math.random = originalRandom;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log("\nReglas de Los 10.000");

  check("1 suelto vale 100 y 5 suelto vale 50", () => {
    const result = calculateScore([1, 5, 2, 2, 3]);
    assert.equal(result.score, 150);
    assert.equal(result.scoringDice, 2);
  });

  check("tres 1 valen 1000 y cuatro 1 valen 1100", () => {
    assert.equal(calculateScore([1, 1, 1]).score, 1000);
    assert.equal(calculateScore([1, 1, 1, 1]).score, 1100);
  });

  check("tres, cuatro y cinco 6 valen 600, 6000 y 6600", () => {
    assert.equal(calculateScore([6, 6, 6]).score, 600);
    assert.equal(calculateScore([6, 6, 6, 6]).score, 6000);
    assert.equal(calculateScore([6, 6, 6, 6, 6]).score, 6600);
  });

  check("cinco iguales usan valor x 1100 salvo los cinco 1", () => {
    for (let face = 2; face <= 6; face++) {
      assert.equal(calculateScore(Array(5).fill(face)).score, face * 1100);
    }
    assert.equal(calculateScore([1, 1, 1, 1, 1]).score, 10000);
  });

  check("ninguna tirada distinta de cinco 1 supera 6600 ni produce 7000", () => {
    let max = 0;
    const dice = [1, 1, 1, 1, 1];
    for (let n = 0; n < 6 ** 5; n++) {
      let value = n;
      for (let i = 0; i < 5; i++) {
        dice[i] = value % 6 + 1;
        value = Math.floor(value / 6);
      }
      if (dice.every(d => d === 1)) continue;
      const score = calculateScore(dice).score;
      assert.notEqual(score, 7000);
      max = Math.max(max, score);
    }
    assert.equal(max, 6600);
  });

  check("todas las skins de dados del catalogo usan sus IDs reales", () => {
    const expectedIds = [1, 2, 4, 5, 6, 18, 19, 20, 21, 22, 32, 33];
    const numericKeys = value => Object.keys(value).map(Number).sort((a, b) => a - b);
    assert.deepEqual(numericKeys(DICE_SKINS), expectedIds);
    assert.deepEqual(numericKeys(SHOP_DICE_PREVIEW), expectedIds);
    assert.deepEqual(numericKeys(SKIN_SOUND), expectedIds);
  });

  check("la dificultad elegida de los bots llega al estado de partida", () => {
    const bot = createPlayerState({ id: "bot-1", name: "Bot", isBot: true, botDifficulty: "hard" });
    assert.equal(bot.isBot, true);
    assert.equal(bot.botDifficulty, "hard");
  });

  check("entrar exige 1000 y consume exactamente 1000", () => {
    assert.equal(canEnterGame(999), false);
    assert.equal(canEnterGame(1000), true);
    assert.equal(getEntryScore(1000), 0);
    assert.equal(getEntryScore(2000), 1000);
  });

  check("la entrada del servidor conserva solo el excedente", () => {
    const roomId = "entry-test";
    createMatch(makeRoom(roomId));
    try {
      const result = withDice([2, 2, 2, 2, 3], () =>
        handleEntryRoll(roomId, "p1", () => {})
      );
      assert.equal(result.event, "PLAYER_ENTERED");
      assert.equal(result.gained, 1000);
      assert.equal(getMatch(roomId).players[0].score, 1000);
    } finally {
      destroyMatch(roomId);
    }
  });

  check("cinco 1 ganan con cero puntos y se pasan con puntaje previo", () => {
    const fiveOnes = [1, 1, 1, 1, 1];
    assert.equal(isInstantWin(fiveOnes, 0), true);
    assert.equal(isInstantWin(fiveOnes, 100), false);
    assert.equal(isWinningScore(10000), true);
    assert.equal(isBustByExceeding(100, 10000), true);
  });

  check("un jugador ya ingresado gana con cinco 1 si sigue en cero", () => {
    const roomId = "instant-win-test";
    let finalized = 0;
    const match = createMatch(makeRoom(roomId), () => { finalized++; });
    match.players[0].entered = true;
    try {
      const result = withDice([1, 1, 1, 1, 1], () =>
        handleRoll(roomId, "p1", () => {})
      );
      assert.equal(result.event, "INSTANT_WIN");
      assert.equal(match.status, "finished");
      assert.equal(match.players[0].score, 10000);
      assert.equal(finalized, 1);
    } finally {
      destroyMatch(roomId);
    }
  });

  check("un tiro caliente muerto pierde todo incluso despues de encadenarse", () => {
    const roomId = "hot-dice-dead-test";
    const events = [];
    const match = createMatch(makeRoom(roomId));
    match.players[0].entered = true;
    const broadcast = (_roomId, type, data) => events.push({ type, data });
    try {
      withDice([1, 5, 2, 2, 3], () => handleRoll(roomId, "p1", broadcast));
      assert.equal(withDice([1, 1, 1], () => handleRoll(roomId, "p1", broadcast)).event, "HOT_DICE");
      assert.equal(withDice([2, 2, 2, 2, 2], () => handleRoll(roomId, "p1", broadcast)).event, "HOT_DICE");
      const dead = withDice([2, 3, 3, 4, 4], () => handleRoll(roomId, "p1", broadcast));
      assert.equal(dead.event, "DEAD_ROLL");
      assert.equal(match.players[0].score, 0);
      assert.equal(match.players[0].turnPoints, 0);
      assert.equal(match.currentPlayerIndex, 1);
      assert.equal(events.at(-1).type, "TURN_START");
    } finally {
      destroyMatch(roomId);
    }
  });

  await (async () => {
    const roomId = "hot-dice-test";
    const events = [];
    const match = createMatch(makeRoom(roomId));
    match.players[0].entered = true;
    const broadcast = (_roomId, type, data) => events.push({ type, data, at: Date.now() });

    try {
      withDice([1, 5, 2, 2, 3], () => handleRoll(roomId, "p1", broadcast));
      const hot = withDice([1, 1, 1], () => handleRoll(roomId, "p1", broadcast));
      assert.equal(hot.event, "HOT_DICE");

      const chainedHot = withDice([6, 6, 6, 6, 6], () => handleRoll(roomId, "p1", broadcast));
      assert.equal(chainedHot.event, "HOT_DICE");
      assert.equal(events.at(-1).type, "HOT_DICE");
      assert.equal(events.at(-1).data.turnPoints, 7750);
      assert.equal(events.some(e => e.type === "BANKED"), false);

      const beforeFinal = Date.now();
      const finalRoll = withDice([1, 2, 2, 3, 4], () => handleRoll(roomId, "p1", broadcast));
      assert.equal(finalRoll.event, "ROLL_RESULT_AUTOBANK");
      assert.equal(events.at(-1).type, "ROLL_RESULT");
      assert.equal(events.at(-1).data.turnPoints, 7850);

      await sleep(Math.floor(AUTO_BANK_DELAY_MS / 2));
      assert.equal(events.some(e => e.type === "BANKED"), false);

      await sleep(Math.ceil(AUTO_BANK_DELAY_MS / 2) + 100);
      const banked = events.find(e => e.type === "BANKED");
      assert.ok(banked);
      assert.equal(banked.data.gained, 7850);
      assert.ok(banked.at - beforeFinal >= AUTO_BANK_DELAY_MS - 25);
      assert.equal(events.at(-1).type, "TURN_START");
      assert.equal(match.players[0].score, 7850);
      passed++;
      console.log("  OK dados calientes se encadenan y muestran el total antes del autobanco");
    } finally {
      destroyMatch(roomId);
    }
  })();

  console.log(`\n${passed} pruebas de reglas pasaron\n`);
}

run().catch(err => {
  console.error("\nFALLO:", err.stack || err.message);
  process.exitCode = 1;
});
