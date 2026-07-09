"use strict";

/**
 * ═══════════════════════════════════════════════════════
 * LOS 10.000 DE MACKO — tournamentManager.js
 * Lógica de torneos: creación de salas para matches,
 * bracket progression, notificaciones a jugadores
 * ═══════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require("uuid");
const {
  getTournamentById,
  getTournamentParticipants,
  getTournamentMatches,
  advanceTournamentMatch,
  generateBracket,
  getTournamentBracketData,
  getActiveTournaments,
  registerForTournament,
} = require("./database");

// Torneos activos en memoria: tournamentId → { status, matches, roomIds, etc }
const activeTournaments = new Map();

// Mapa de roomId → tournamentMatchId para saber qué match se juega en cada sala
const matchRooms = new Map();

// Intervalo para verificar matches pendientes cada 30s
let _checkInterval = null;

/**
 * Inicializar el tournament manager
 */
function initTournamentManager() {
  _checkInterval = setInterval(checkPendingMatches, 30000);
  console.log("🏆 Tournament Manager iniciado");
}

/**
 * Obtener todos los torneos activos con datos de bracket
 */
async function getActiveTournamentsData() {
  const tournaments = await getActiveTournaments();
  const result = [];
  for (const t of tournaments) {
    const bracket = await getTournamentBracketData(t.id);
    if (bracket) result.push(bracket);
  }
  return result;
}

/**
 * Registrar un jugador en un torneo (con cobro de fee si aplica)
 */
async function registerPlayer(tournamentId, playerId, playerName) {
  const tourney = await getTournamentById(tournamentId);
  if (!tourney) throw new Error("Torneo no encontrado");

  // Verificar fee (cobrar monedas si tiene costo)
  if (parseInt(tourney.fee) > 0) {
    const { pool } = require("./database");
    const playerRes = await pool.query(
      `SELECT coins FROM players WHERE id = $1`,
      [playerId]
    );
    if (!playerRes.rows[0] || playerRes.rows[0].coins < parseInt(tourney.fee)) {
      throw new Error(
        `Necesitás ${parseInt(tourney.fee).toLocaleString("es-AR")} monedas para participar`
      );
    }
    // Cobrar fee
    await pool.query(`UPDATE players SET coins = coins - $1 WHERE id = $2`, [
      parseInt(tourney.fee),
      playerId,
    ]);
    await pool.query(
      `INSERT INTO transactions (player_id, amount, reason, created_at) VALUES ($1, $2, $3, $4)`,
      [playerId, -parseInt(tourney.fee), `Inscripción torneo: ${tourney.name}`, Date.now()]
    );
  }

  // Registrar
  await registerForTournament(tournamentId, playerId, playerName);
  return { success: true };
}

/**
 * Iniciar un torneo (generar bracket)
 */
async function startTournament(tournamentId) {
  const result = await generateBracket(tournamentId);
  if (result.success) {
    // Cachear en memoria
    const bracket = await getTournamentBracketData(tournamentId);
    if (bracket) {
      activeTournaments.set(tournamentId, {
        ...bracket,
        lastChecked: Date.now(),
      });
    }
  }
  return result;
}

/**
 * Crear una sala para un match de torneo y devolver el roomId
 */
function createMatchRoom(tournamentId, matchId, roomManager, clients) {
  const { createRoom } = roomManager;
  const matchKey = `${tournamentId}:${matchId}`;

  // Si ya hay una sala para este match, devolverla
  if (matchRooms.has(matchKey)) {
    return matchRooms.get(matchKey);
  }

  // Crear sala privada para el match
  const room = createRoom({
    ownerId: "tournament",
    ownerName: `🏆 Torneo #${tournamentId}`,
    isPrivate: true,
    maxPlayers: 2,
  });

  room.isTournamentMatch = true;
  room.tournamentId = tournamentId;
  room.tournamentMatchId = matchId;

  matchRooms.set(matchKey, room.id);
  matchRooms.set(room.id, { tournamentId, matchId, matchKey });

  return room;
}

/**
 * Notificar a jugadores que su match está listo
 */
function notifyMatchReady(tournamentId, match, clients, sendFn) {
  const matchKey = `${tournamentId}:${match.id}`;
  const roomId = matchRooms.get(matchKey);

  if (!roomId) return;

  // Notificar a ambos jugadores si están conectados
  if (match.player1_id && clients.has(match.player1_id)) {
    const sock = clients.get(match.player1_id);
    sendFn(sock, "TOURNAMENT_MATCH_READY", {
      tournamentId,
      matchId: match.id,
      roomId,
      round: match.round,
      opponent: match.player2_name,
    });
  }
  if (match.player2_id && clients.has(match.player2_id)) {
    const sock = clients.get(match.player2_id);
    sendFn(sock, "TOURNAMENT_MATCH_READY", {
      tournamentId,
      matchId: match.id,
      roomId,
      round: match.round,
      opponent: match.player1_name,
    });
  }
}

/**
 * Completar un match de torneo y avanzar bracket
 */
async function completeMatch(
  tournamentId,
  matchId,
  winnerId,
  p1Score,
  p2Score,
  clients,
  sendFn,
) {
  const result = await advanceTournamentMatch(
    tournamentId,
    matchId,
    winnerId,
    p1Score,
    p2Score,
  );

  if (result.success) {
    // Notificar al bracket actualizado
    const bracket = await getTournamentBracketData(tournamentId);
    if (bracket) {
      activeTournaments.set(tournamentId, {
        ...bracket,
        lastChecked: Date.now(),
      });

      // Broadcast a todos los jugadores online del torneo
      notifyBracketUpdate(tournamentId, bracket, clients, sendFn);

      // Si el torneo terminó, notificar campeón
      if (bracket.tournament.status === "completed") {
        notifyChampion(tournamentId, winnerId, bracket, clients, sendFn);
      }
    }
  }
  return result;
}

/**
 * Notificar actualización de bracket a todos los participantes online
 */
function notifyBracketUpdate(tournamentId, bracket, clients, sendFn) {
  const participants = bracket.participants || [];
  for (const p of participants) {
    if (clients.has(p.player_id)) {
      const sock = clients.get(p.player_id);
      sendFn(sock, "TOURNAMENT_BRACKET_UPDATE", {
        tournamentId,
        bracket,
      });
    }
  }
}

/**
 * Notificar campeón del torneo
 */
function notifyChampion(tournamentId, winnerId, bracket, clients, sendFn) {
  const tourney = bracket.tournament;
  // Notificar al ganador
  if (clients.has(winnerId)) {
    const sock = clients.get(winnerId);
    sendFn(sock, "TOURNAMENT_CHAMPION", {
      tournamentId: tourney.id,
      tournamentName: tourney.name,
      prizePool: tourney.prize_pool,
    });
  }
  // Broadcast a todos los participantes
  const participants = bracket.participants || [];
  for (const p of participants) {
    if (p.player_id !== winnerId && clients.has(p.player_id)) {
      const sock = clients.get(p.player_id);
      sendFn(sock, "TOURNAMENT_COMPLETED", {
        tournamentId: tourney.id,
        tournamentName: tourney.name,
        championId: winnerId,
      });
    }
  }
}

/**
 * Verificar matches pendientes y notificar jugadores
 */
async function checkPendingMatches() {
  try {
    const tournaments = await getActiveTournaments();
    for (const t of tournaments) {
      const matches = await getTournamentMatches(t.id);
      const pending = matches.filter(
        (m) =>
          m.status === "pending" &&
          m.player1_id &&
          m.player2_id &&
          m.player1_id !== "BYE" &&
          m.player2_id !== "BYE" &&
          !m.room_code
      );

      for (const m of pending) {
        // Asignar código de sala usando ID del match como referencia
        const roomCode = String(m.id).padStart(6, "0").slice(0, 6);
        const { pool } = require("./database");
        await pool.query(
          `UPDATE tournament_matches SET room_code = $1 WHERE id = $2`,
          [roomCode, m.id]
        );
      }
    }
  } catch (e) {
    console.error("Tournament check error:", e.message);
  }
}

/**
 * Liberar recursos al terminar un torneo
 */
function cleanupTournament(tournamentId) {
  activeTournaments.delete(tournamentId);
  // Limpiar match rooms asociados
  for (const [key, val] of matchRooms) {
    if (val?.tournamentId === tournamentId || key.startsWith(`${tournamentId}:`)) {
      matchRooms.delete(key);
    }
  }
}

/**
 * Detener el tournament manager
 */
function stopTournamentManager() {
  if (_checkInterval) {
    clearInterval(_checkInterval);
    _checkInterval = null;
  }
}

module.exports = {
  initTournamentManager,
  getActiveTournamentsData,
  registerPlayer,
  startTournament,
  createMatchRoom,
  notifyMatchReady,
  completeMatch,
  notifyBracketUpdate,
  cleanupTournament,
  stopTournamentManager,
  activeTournaments,
  matchRooms,
};
