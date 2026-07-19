"use strict";

/**
 * ============================================================
 * LOS 10.000 DE MACKO — backend/botGameHandler.js
 * Maneja las partidas contra bots.
 * ============================================================
 */

const botManager = require("./botManager");
const { getMatch, handleEntryRoll, handleRoll, handleBank } = require("./diceManager");
const { addPlayer, setReady } = require("./roomManager");

/**
 * Agrega bots a una sala existente y los marca como listos.
 * Luego se debe llamar a startMatchForRoom para iniciar.
 */
function addBotsToRoom(room, botCount, difficulty) {
  room.isBotGame = true;
  room.botDifficulty = difficulty;

  for (let i = 0; i < botCount; i++) {
    const botId = botManager.generateBotId(i);
    const botName = botManager.getBotName(i);
    try {
      addPlayer(room.id, botId, botName);
      setReady(room.id, botId, true);
      const botPlayer = room.players.find(p => p.id === botId);
      if (botPlayer) {
        botPlayer.isBot = true;
        botPlayer.botDifficulty = difficulty;
        botPlayer.connected = true;
        // Cosméticos aleatorios de la tienda para propaganda
        const cosmetics = botManager.getRandomCosmetics();
        botPlayer.equippedDice = cosmetics.equippedDice;
        botPlayer.equippedAvatar = cosmetics.equippedAvatar;
        botPlayer.equippedSpecial = cosmetics.equippedSpecial;
      }
    } catch(e) {
      console.error("Error adding bot:", e.message);
    }
  }
}

/**
 * Programa el procesamiento automático del turno de un bot si el
 * jugador actual es un bot. Se llama después de cada cambio de turno.
 */
function scheduleBotTurnIfNeeded(roomId, broadcastRoom) {
  const match = getMatch(roomId);
  if (!match || match.status !== "playing") return;

  const current = match.players[match.currentPlayerIndex];
  if (!current || !current.isBot) return;

  const difficulty = current.botDifficulty || 'normal';
  const thinkDelay = botManager.getBotDelay(difficulty);

  setTimeout(() => {
    processBotTurn(roomId, broadcastRoom);
  }, thinkDelay);
}

/**
 * Procesa una acción del bot actual (entrada, roll o bank).
 * Se vuelve a programar si el bot continúa su turno,
 * o si el siguiente jugador también es un bot.
 */
function processBotTurn(roomId, broadcastRoom) {
  const match = getMatch(roomId);
  if (!match || match.status !== "playing") return;

  const current = match.players[match.currentPlayerIndex];
  if (!current || !current.isBot) return;

  // Bot no disponible para jugar
  if (current.mustStop || current.turnExpired || current.eliminated) return;

  // Si no ha entrado aún, intentar entrada
  if (!current.entered) {
    _botEntry(roomId, current.id, broadcastRoom);
    return;
  }

  // Decidir si plantarse o seguir
  const difficulty = current.botDifficulty || 'normal';
  if (botManager.shouldBank(current, difficulty)) {
    const result = handleBank(roomId, current.id, broadcastRoom);
    if (result && result.ok) {
      // Bank exitoso, el turno avanzó. Ver si el próximo es bot.
      _scheduleNextBotCheck(roomId, broadcastRoom, 1000);
    } else {
      // Bank falló o fue ignorado, reintentar
      _scheduleNextBotCheck(roomId, broadcastRoom, 600);
    }
  } else {
    const result = handleRoll(roomId, current.id, broadcastRoom);
    if (result && result.ok) {
      const event = result.event;
      if (event === 'ROLL_RESULT' || event === 'HOT_DICE') {
        // El bot sigue siendo el jugador actual y puede continuar
        setTimeout(() => {
          const m = getMatch(roomId);
          if (!m || m.status !== "playing") return;
          const p = m.players[m.currentPlayerIndex];
          if (p && p.isBot && !p.mustStop && !p.turnExpired && p.canContinue) {
            processBotTurn(roomId, broadcastRoom);
          } else if (p && p.isBot && p.mustStop) {
            // Auto-bank pendiente, esperar y verificar
            _scheduleNextBotCheck(roomId, broadcastRoom, 2000);
          } else {
            // Turno avanzó a humano u otro bot
            _scheduleNextBotCheck(roomId, broadcastRoom, 600);
          }
        }, 400);
      } else if (event === 'ROLL_RESULT_AUTOBANK') {
        // Auto-bank se ejecutará, verificar después
        _scheduleNextBotCheck(roomId, broadcastRoom, 2000);
      } else {
        // DEAD_ROLL, BUST, WIN, INSTANT_WIN — el turno avanzó
        _scheduleNextBotCheck(roomId, broadcastRoom, 800);
      }
    } else {
      // Roll falló (ok: false), intentar de nuevo
      _scheduleNextBotCheck(roomId, broadcastRoom, 600);
    }
  }
}

/**
 * Programa la verificación del próximo turno de bot después de un delay.
 */
function _scheduleNextBotCheck(roomId, broadcastRoom, delayMs) {
  setTimeout(() => {
    const match = getMatch(roomId);
    if (!match || match.status !== "playing") return;
    const p = match.players[match.currentPlayerIndex];
    if (p && p.isBot) {
      processBotTurn(roomId, broadcastRoom);
    }
    // Si es humano, no hacemos nada
  }, delayMs);
}

/**
 * Intenta la tirada de entrada para un bot.
 */
function _botEntry(roomId, botId, broadcastRoom) {
  const result = handleEntryRoll(roomId, botId, broadcastRoom);
  if (!result || !result.ok) {
    // Error inesperado, reintentar después
    _scheduleNextBotCheck(roomId, broadcastRoom, 800);
    return;
  }

  if (result.event === 'PLAYER_ENTERED' || result.event === 'INSTANT_WIN') {
    // Entró al juego (o ganó instantáneamente)
    setTimeout(() => {
      const m = getMatch(roomId);
      if (!m || m.status !== "playing") return;
      const p = m.players[m.currentPlayerIndex];
      if (p && p.isBot && p.entered && !p.mustStop) {
        processBotTurn(roomId, broadcastRoom);
      } else {
        // Turno avanzó a otro jugador
        _scheduleNextBotCheck(roomId, broadcastRoom, 600);
      }
    }, 600);
    return;
  }

  if (result.event === 'ENTRY_FAILED' && result.attemptsLeft > 0) {
    // Aún tiene intentos, reintentar
    setTimeout(() => {
      const m = getMatch(roomId);
      if (!m || m.status !== "playing") return;
      const p = m.players[m.currentPlayerIndex];
      if (p && p.isBot && !p.entered) {
        _botEntry(roomId, botId, broadcastRoom);
      }
    }, 800);
    return;
  }

  // ENTRY_FAILED_TURN_OVER o ENTRY_FAILED sin intentos — el turno avanzó
  // Verificar si el próximo jugador también es bot
  _scheduleNextBotCheck(roomId, broadcastRoom, 600);
}

module.exports = {
  addBotsToRoom,
  scheduleBotTurnIfNeeded,
  processBotTurn
};
