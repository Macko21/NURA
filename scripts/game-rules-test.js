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
  handleRoll,
  snapshotMatch
} = require("../backend/diceManager");
const { AUTO_BANK_DELAY_MS } = require("../backend/constants");
const { DICE_SKINS, SHOP_DICE_PREVIEW } = require("../frontend/dice-renderer");
const { SKIN_SOUND } = require("../frontend/audio");
const { createPlayerState } = require("../backend/matchState");
const { pool } = require("../backend/database");
const { SHOP_CATALOG } = require("../backend/database");
const { shouldBank, getBotDelay, getRandomCosmetics } = require("../backend/botManager");
const { getCommercePack } = require("../backend/commerceCatalog");
const { recordMatchResults, completedMatchParticipant } = require("../backend/playerManager");
const { canonicalDiceSkinId } = require("../backend/cosmeticResolver");
const { resolveCeoSessionSecret } = require("../backend/ceoAuth");
const {
  PUBLIC_TOURNAMENT_RETENTION_MS,
  validateTournamentInput,
  isTournamentRegistrationOpen,
  nextScheduledOccurrence,
  nextScheduledName
} = require("../backend/tournamentRules");

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
  check('panel CEO conserva acceso con clave aislada derivada de JWT_SECRET', () => {
    const jwtSecret = 'test-jwt-secret-with-more-than-thirty-two-bytes';
    const first = resolveCeoSessionSecret({ JWT_SECRET: jwtSecret, CEO_SECRET: '' });
    const second = resolveCeoSessionSecret({ JWT_SECRET: jwtSecret });
    assert.equal(first.source, 'JWT_SECRET_DERIVED');
    assert.equal(first.secret, second.secret);
    assert.notEqual(first.secret, jwtSecret);
    assert.equal(resolveCeoSessionSecret({ CEO_SECRET: 'x'.repeat(40), JWT_SECRET: jwtSecret }).source, 'CEO_SECRET');
  });
  check('torneos finalizados permanecen visibles exactamente 24 horas', () => {
    assert.equal(PUBLIC_TOURNAMENT_RETENTION_MS, 86400000);
  });
  check('inscripción de torneo respeta estado y fecha de cierre', () => {
    const now = 1_000_000;
    assert.equal(isTournamentRegistrationOpen({ status: 'registration', registration_until: now + 1 }, now), true);
    assert.equal(isTournamentRegistrationOpen({ status: 'registration', registration_until: now }, now), false);
    assert.equal(isTournamentRegistrationOpen({ status: 'active', registration_until: now + 1 }, now), false);
  });
  check('creación de torneo valida fechas, cupos y costo', () => {
    const now = 1_000_000;
    const valid = validateTournamentInput({ name: 'Copa Macko', maxPlayers: 16, fee: 500, startTime: now + 10_000, registrationUntil: now + 5_000 }, now);
    assert.equal(valid.maxPlayers, 16);
    assert.throws(() => validateTournamentInput({ name: 'No', maxPlayers: 2, startTime: now + 10_000 }, now));
    assert.throws(() => validateTournamentInput({ name: 'Copa', maxPlayers: 16, startTime: now + 10_000, registrationUntil: now + 20_000 }, now));
  });
  check('recurrencia salta fechas vencidas y elige próxima futura', () => {
    const hour = 60 * 60 * 1000;
    assert.equal(nextScheduledOccurrence(0, '1h', 3 * hour + 10), 4 * hour);
    assert.equal(nextScheduledOccurrence(0, 'invalid', 0), null);
    assert.equal(nextScheduledName('Copa 10.000'), 'Copa 10.000 #2');
    assert.equal(nextScheduledName('Copa 10.000 #2'), 'Copa 10.000 #3');
  });
  console.log("\nReglas de Los 10.000");

  check("snapshot conserva el nivel real del jugador", () => {
    const match = createMatch(makeRoom("room-level"));
    match.players[0].level = 14;
    assert.equal(snapshotMatch(match).players[0].level, 14);
    destroyMatch("room-level");
  });

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
    const expectedIds = [1, 2, 4, 5, 6, 18, 19, 20, 21, 22, 32, 33, 37, 38, 39, 40, 49];
    const numericKeys = value => Object.keys(value).map(Number).sort((a, b) => a - b);
    assert.deepEqual(numericKeys(DICE_SKINS), expectedIds);
    assert.deepEqual(numericKeys(SHOP_DICE_PREVIEW), expectedIds);
    assert.deepEqual(numericKeys(SKIN_SOUND), expectedIds);
  });

  check("IDs historicos de tienda conservan la skin visual correcta", () => {
    assert.equal(canonicalDiceSkinId("4", "Dados Fantasma"), "5");
    assert.equal(canonicalDiceSkinId("5", "Dados Hielo"), "6");
    assert.equal(canonicalDiceSkinId("10", "Dados Arcoíris"), "22");
    assert.equal(canonicalDiceSkinId("32", "Dados Diamante"), "32");
  });

  check("la dificultad elegida de los bots llega al estado de partida", () => {
    const bot = createPlayerState({ id: "bot-1", name: "Bot", isBot: true, botDifficulty: "hard" });
    assert.equal(bot.isBot, true);
    assert.equal(bot.botDifficulty, "hard");
  });

  check("bots muestran avatares reales, toda la tienda y tiempos visibles", () => {
    for (let i = 0; i < 100; i++) assert.ok(getBotDelay('hard') >= 1850);
    const cosmetics = getRandomCosmetics(SHOP_CATALOG);
    assert.equal(typeof cosmetics.equippedAvatar, 'string');
    assert.ok(cosmetics.equippedAvatar.length > 1);
    assert.ok(SHOP_CATALOG.some(item => item.id === cosmetics.equippedDice));
    assert.ok(SHOP_CATALOG.some(item => item.id === cosmetics.equippedSpecial));
  });

  check("bot dificil adapta riesgo y packs premium tienen contenido fijo", () => {
    assert.equal(shouldBank({ entered:true, score:6000, turnPoints:700, remainingDice:4 }, 'hard', { leaderScore:6000 }), true);
    assert.equal(shouldBank({ entered:true, score:2000, turnPoints:700, remainingDice:4 }, 'hard', { leaderScore:6000 }), false);
    assert.deepEqual(getCommercePack('ultra_mythic').itemIds, [49, 50, 51]);
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

  await (async () => {
    const originalConnect = pool.connect;
    const updates = [];
    const transactionLog = [];
    pool.connect = async () => ({
      query: async (sql, params) => {
        if (params) {
          updates.push(params);
          return { rows: params[0] === 'registered' ? [{ id: params[0] }] : [] };
        }
        transactionLog.push(sql);
        return { rows: [] };
      },
      release: () => transactionLog.push('RELEASE')
    });
    try {
      const registered = await recordMatchResults([
        { id: 'registered', score: 10000 },
        { id: 'guest', score: 2500 },
        { id: 'disconnected', score: 3000, disconnected: true },
        { id: 'eliminated', score: 1500, eliminated: true },
        { id: 'bot-1', score: 4000, isBot: true }
      ], 'registered');
      assert.deepEqual(registered, ['registered']);
      assert.deepEqual(updates, [
        ['registered', 10000, true],
        ['guest', 2500, false]
      ]);
      assert.deepEqual(transactionLog, ['BEGIN', 'COMMIT', 'RELEASE']);
      assert.equal(completedMatchParticipant({ id: 'finished' }), true);
      assert.equal(completedMatchParticipant({ id: 'left', disconnected: true }), false);
      assert.equal(completedMatchParticipant({ id: 'timed-out', eliminated: true }), false);
      passed++;
      console.log('  OK misiones y ranking cuentan solo participantes que completaron la partida');
    } finally {
      pool.connect = originalConnect;
    }
  })();

  console.log(`\n${passed} pruebas de reglas pasaron\n`);
}

run().catch(err => {
  console.error("\nFALLO:", err.stack || err.message);
  process.exitCode = 1;
});
