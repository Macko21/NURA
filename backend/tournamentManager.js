"use strict";

/**
 * ═══════════════════════════════════════════════════════
 * LOS 10.000 DE MACKO — tournamentManager.js
 * Lógica de torneos: creación de salas para matches,
 * bracket progression, notificaciones a jugadores
 * ═══════════════════════════════════════════════════════
 */

const {
  getTournamentById,
  getTournamentParticipants,
  getTournamentMatches,
  advanceTournamentMatch,
  getTournamentBracketData,
  getActiveTournaments,
  registerForTournament,
  cancelTournament,
  createTournament,
  generateBracket,
  getAllPushSubscriptions,
  removePushSubscription,
} = require("./database");
const { isPushReady, sendPushNotification } = require("./pushManager");

// Torneos activos en memoria: tournamentId → { status, matches, roomIds, etc }
const activeTournaments = new Map();

// Mapa de roomId → tournamentMatchId para saber qué match se juega en cada sala

// Referencia a clientes WebSocket del server principal
let _wsClients = null;
let _wsSend = null;

function setWsClients(clients, sendFn) {
  _wsClients = clients;
  _wsSend = sendFn;
}
const matchRooms = new Map();

// Intervalo para verificar matches pendientes cada 30s
let _checkInterval = null;

/**
 * Inicializar el tournament manager
 */
function initTournamentManager() {
  _checkInterval = setInterval(checkPendingMatches, 30000);
  console.log("🏆 Tournament Manager iniciado");
  startAutoTournamentLoop();
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
  return registerForTournament(tournamentId, playerId, playerName);
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
    setTimeout(() => checkPendingMatches(), 250);
  }
  return result;
}

/**
 * Crear una sala para un match de torneo y devolver el roomId
 */
function createMatchRoom(tournamentId, match, roomManager) {
  const { createRoom, addPlayer } = roomManager;
  const matchId = match.id;
  const matchKey = `${tournamentId}:${matchId}`;

  // Si ya hay una sala para este match, devolverla
  if (matchRooms.has(matchKey)) {
    const existingRoom = roomManager.getRoom(matchRooms.get(matchKey));
    if (existingRoom) return existingRoom;
    matchRooms.delete(matchKey);
  }

  // Crear sala privada para el match
  const room = createRoom({
    ownerId: match.player1_id,
    ownerName: match.player1_name,
    isPrivate: true,
    maxPlayers: 2,
  });
  addPlayer(room.id, match.player2_id, match.player2_name);

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
    sock.notifiedTournamentMatches ||= new Set();
    if (!sock.notifiedTournamentMatches.has(String(match.id))) {
      sock.notifiedTournamentMatches.add(String(match.id));
      sendFn(sock, "TOURNAMENT_MATCH_READY", {
        tournamentId,
        matchId: match.id,
        roomId,
        roomCode: match.room_code,
        round: match.round,
        opponent: match.player2_name,
      });
    }
  }
  if (match.player2_id && clients.has(match.player2_id)) {
    const sock = clients.get(match.player2_id);
    sock.notifiedTournamentMatches ||= new Set();
    if (!sock.notifiedTournamentMatches.has(String(match.id))) {
      sock.notifiedTournamentMatches.add(String(match.id));
      sendFn(sock, "TOURNAMENT_MATCH_READY", {
        tournamentId,
        matchId: match.id,
        roomId,
        roomCode: match.room_code,
        round: match.round,
        opponent: match.player1_name,
      });
    }
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
    const matchKey = `${tournamentId}:${matchId}`;
    const roomId = matchRooms.get(matchKey);
    if (roomId) {
      matchRooms.delete(roomId);
      matchRooms.delete(matchKey);
    }
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
    setTimeout(() => checkPendingMatches(), 250);
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
          m.player2_id !== "BYE"
      );

      for (const m of pending) {
        const room = createMatchRoom(t.id, m, require("./roomManager"));
        m.room_code = room.code;
        const { pool } = require("./database");
        await pool.query(
          `UPDATE tournament_matches SET room_code = $1 WHERE id = $2`,
          [room.code, m.id]
        );
        if (_wsClients && _wsSend) notifyMatchReady(t.id, m, _wsClients, _wsSend);
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
  const toDelete = [];
  for (const [key, val] of matchRooms) {
    if (val?.tournamentId === tournamentId || key.startsWith(`${tournamentId}:`)) {
      toDelete.push(key);
    }
  }
  for (const key of toDelete) {
    matchRooms.delete(key);
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



/**
 * ═══════════════════════════════════════════════════════════
 * SISTEMA DE TORNEOS AUTOMÁTICOS Y PROGRAMADOS
 * ═══════════════════════════════════════════════════════════
 */

/** Intervalo de chequeo principal (cada 30s) */
let _autoCheckInterval = null;

/** Set de IDs de torneos ya notificados como "próximos" para evitar duplicados */
const _notifiedUpcoming = new Set();

/**
 * Inicializar el sistema automático de torneos
 */
function initAutoTournaments() {
  // Ya existe el checkPendingMatches cada 30s, agregamos lógica extra
  console.log("⏰ Sistema de torneos automáticos iniciado");
}

/**
 * Verificar y auto-iniciar torneos cuya registration_until venció
 */
/**
 * Enviar notificaciones push a los participantes de un torneo
 * También envía por WebSocket a los conectados
 */
async function sendTournamentPushNotifications(tournamentId, tournamentName, title, body, url, wsClients, wsSend) {
  const clients = wsClients || _wsClients;
  const sendFn = wsSend || _wsSend;
  let pushSent = 0, pushFailed = 0, wsSent = 0;
  
  // 1) Enviar por WebSocket a TODOS los conectados (no solo participantes)
  if (clients && sendFn) {
    try {
      for (const [pid, sock] of clients) {
        if (sock?.readyState === 1) {
          try {
            sendFn(sock, "NOTIFICATION", {
              title: title,
              message: body,
              icon: '🏆',
              notifType: 'tournament',
              url: url || '/'
            });
            wsSent++;
          } catch(e) {}
        }
      }
      console.log(`📡 WS torneo #${tournamentId}: ${wsSent} notificaciones enviadas`);
    } catch(e) { console.error('Error enviando WS torneo:', e.message); }
  }
  
  // 2) Enviar push notification (navegador cerrado /sin sesión)
  if (!isPushReady()) {
    console.log("🔕 Push no configurado — omitiendo notificaciones push del torneo");
    return { sent: pushSent, failed: pushFailed, wsSent };
  }
  try {
    const allSubs = await getAllPushSubscriptions(); // [{ playerId, subscription }]
    if (!allSubs.length) return { sent: pushSent, failed: pushFailed, wsSent };
    
    for (const s of allSubs) {
      try {
        const result = await sendPushNotification(
          s.subscription,
          title,
          body,
          url || '/'
        );
        if (result.success) {
          pushSent++;
        } else {
          pushFailed++;
          if (result.expired) {
            await removePushSubscription(s.playerId).catch(e => {});
          }
        }
      } catch(e) {
        pushFailed++;
      }
    }
    
    console.log(`📬 Push torneo #${tournamentId} "${tournamentName}": ${pushSent} enviados, ${pushFailed} fallidos`);
    return { sent: pushSent, failed: pushFailed, wsSent };
  } catch (e) {
    console.error(`❌ Error enviando push para torneo #${tournamentId}:`, e.message);
    return { sent: pushSent, failed: pushFailed, wsSent };
  }
}

async function checkAndAutoStartTournaments() {
  try {
    const { pool } = require("./database");
    const now = Date.now();
    
    // Buscar torneos en registration con registration_until vencido
    const res = await pool.query(`
      SELECT * FROM tournaments 
      WHERE status = 'registration' 
        AND registration_until IS NOT NULL 
        AND registration_until < $1
    `, [now]);
    
    for (const t of res.rows) {
      const partsRes = await pool.query(
        'SELECT COUNT(*) as count FROM tournament_participants WHERE tournament_id = $1',
        [t.id]
      );
      const playerCount = parseInt(partsRes.rows[0].count);
      
      if (playerCount >= t.min_players) {
        // Suficientes jugadores → auto-iniciar y LUEGO notificar
        try {
          console.log(`⏰ Auto-iniciando torneo #${t.id} (${t.name}) con ${playerCount} jugadores`);
          await generateBracket(t.id);
          console.log(`✅ Torneo #${t.id} iniciado automáticamente`);
          
          // Notificar push DESPUÉS del bracket exitoso
          await sendTournamentPushNotifications(
            t.id, t.name,
            `🏆 ¡${t.name} está por comenzar!`,
            `El torneo con ${playerCount} jugadores ya tiene bracket generado. ¡Entrá a ver los matches!`,
            '/?tab=tournaments'
          );
        } catch (e) {
          console.error(`❌ Error auto-iniciando torneo #${t.id}:`, e.message);
        }
      } else {
        // No suficientes jugadores → auto-cancelar y LUEGO notificar
        try {
          console.log(`⏰ Auto-cancelando torneo #${t.id} (${t.name}) - solo ${playerCount}/${t.min_players} jugadores`);
          await cancelTournament(t.id);
          console.log(`✅ Torneo #${t.id} cancelado automáticamente`);
          
          // Notificar push DESPUÉS de la cancelación exitosa
          await sendTournamentPushNotifications(
            t.id, t.name,
            `❌ ${t.name} cancelado`,
            `No se alcanzaron los jugadores mínimos (${playerCount}/${t.min_players}). El torneo fue cancelado.`,
            '/?tab=tournaments'
          );
        } catch (e) {
          console.error(`❌ Error auto-cancelando torneo #${t.id}:`, e.message);
        }
      }
    }
  } catch (e) {
    console.error("Error en auto-start tournaments:", e.message);
  }
}

/**
 * Notificar a participantes de torneos que están por comenzar pronto
 * (solo una vez por torneo, evitando duplicados con _notifiedUpcoming)
 */
async function checkAndNotifyUpcomingTournaments() {
  try {
    if (!isPushReady()) return;
    const { pool } = require("./database");
    const now = Date.now();
    
    // Buscar torneos en registration que comienzan en menos de 30 minutos
    const thirtyMin = 30 * 60 * 1000;
    const res = await pool.query(`
      SELECT * FROM tournaments 
      WHERE status = 'registration' 
        AND start_time > $1 
        AND start_time <= $2
    `, [now, now + thirtyMin]);
    
    for (const t of res.rows) {
      // Saltar si ya notificamos este torneo como "próximo"
      if (_notifiedUpcoming.has(String(t.id))) continue;
      
      const timeUntilStart = parseInt(t.start_time) - now;
      const minsLeft = Math.max(1, Math.floor(timeUntilStart / 60000));
      
      const partsRes = await pool.query(
        'SELECT COUNT(*) as count FROM tournament_participants WHERE tournament_id = $1',
        [t.id]
      );
      const playerCount = parseInt(partsRes.rows[0].count);
      
      // Si tiene al menos 2 jugadores, notificar (solo una vez)
      if (playerCount >= 2) {
        _notifiedUpcoming.add(String(t.id));
        await sendTournamentPushNotifications(
          t.id, t.name,
          `⏰ ${t.name} comienza en ${minsLeft} min`,
          `${playerCount} jugador${playerCount !== 1 ? 'es' : ''} inscripto${playerCount !== 1 ? 's' : ''}. ¡Preparate para la partida!`,
          '/?tab=tournaments'
        );
        console.log(`🔔 Notificado torneo #${t.id} (${t.name}) - comienza en ${minsLeft} min`);
      }
    }
    
    // Limpiar del Set torneos que ya no están en registration (empezaron o se cancelaron)
    if (_notifiedUpcoming.size > 0) {
      const stillActive = await pool.query(`
        SELECT id FROM tournaments WHERE id = ANY($1::int[]) AND status = 'registration'
      `, [Array.from(_notifiedUpcoming)]);
      const activeIds = new Set(stillActive.rows.map(r => String(r.id)));
      for (const id of _notifiedUpcoming) {
        if (!activeIds.has(id)) _notifiedUpcoming.delete(id);
      }
    }
  } catch (e) {
    console.error("Error notificando torneos próximos:", e.message);
  }
}

/**
 * Auto-crear el próximo torneo programado (si hay uno schedule recurrente vencido)
 */
async function checkAndCreateScheduledTournaments() {
  try {
    const { pool, createTournament } = require("./database");
    const now = Date.now();
    
    // Buscar torneos programados completados/cancelados que necesitan crear el siguiente
    // Un torneo programado tiene is_scheduled = TRUE y schedule_interval no nulo
    // Solo crear el siguiente si NO hay ya un torneo en registration con el mismo schedule_interval
    const existingScheduled = await pool.query(`
      SELECT DISTINCT schedule_interval FROM tournaments 
      WHERE is_scheduled = TRUE AND status = 'registration'
    `);
    const existingIntervals = existingScheduled.rows.map(r => r.schedule_interval).filter(Boolean);
    
    const res = await pool.query(`
      SELECT * FROM tournaments 
      WHERE is_scheduled = TRUE 
        AND schedule_interval IS NOT NULL 
        AND status IN ('completed', 'cancelled')
        ORDER BY created_at DESC
    `);
    
    for (const parent of res.rows) {
      // Si ya hay un torneo en registration con este schedule_interval, no crear otro
      if (existingIntervals.includes(parent.schedule_interval)) continue;
      try {
        // Calcular próximo start_time según el intervalo
        let intervalMs = 0;
        switch (parent.schedule_interval) {
          case '1h': intervalMs = 60 * 60 * 1000; break;
          case '2h': intervalMs = 2 * 60 * 60 * 1000; break;
          case '4h': intervalMs = 4 * 60 * 60 * 1000; break;
          case '8h': intervalMs = 8 * 60 * 60 * 1000; break;
          case '12h': intervalMs = 12 * 60 * 60 * 1000; break;
          case 'daily': intervalMs = 24 * 60 * 60 * 1000; break;
          case 'weekly': intervalMs = 7 * 24 * 60 * 60 * 1000; break;
          default: continue; // intervalo no reconocido
        }
        
        const nextStart = parent.start_time + intervalMs;
        const nextRegUntil = parent.registration_until 
          ? parent.registration_until + intervalMs 
          : nextStart - 3600000; // 1h antes del start
        
        const nextName = parent.name.replace(
          /#\d+|\d+/g,
          (m) => {
            if (m.startsWith('#')) return '#' + (parseInt(m.slice(1)) + 1);
            const num = parseInt(m);
            return isNaN(num) ? m : String(num + 1);
          }
        ) || `${parent.name} #${Math.floor(Math.random() * 1000)}`;
        
        const newTourney = await createTournament(
          nextName,
          parent.description || '',
          parent.max_players,
          parent.fee || 0,
          (() => { try { return JSON.parse(parent.prizes || '[]'); } catch(e) { return []; } })(),
          nextStart,
          nextRegUntil,
          'system'
        );
        
        // Marcar como programado también
        await pool.query(`
          UPDATE tournaments SET is_scheduled = TRUE, schedule_interval = $1 WHERE id = $2
        `, [parent.schedule_interval, newTourney.id]);
        
        console.log(`✅ Auto-creado torneo #${newTourney.id} (${nextName}) - programado ${parent.schedule_interval}`);
      } catch (e) {
        console.error(`Error auto-creando torneo desde #${parent.id}:`, e.message);
      }
    }
  } catch (e) {
    console.error("Error en scheduled tournaments:", e.message);
  }
}

/**
 * Iniciar el loop de verificación automática
 */
function startAutoTournamentLoop() {
  // Ejecutar inmediatamente
  setTimeout(() => {
    checkAndAutoStartTournaments();
    checkAndCreateScheduledTournaments();
    checkAndNotifyUpcomingTournaments();
  }, 5000);
  
  // Luego cada 60 segundos
  if (_autoCheckInterval) clearInterval(_autoCheckInterval);
  _autoCheckInterval = setInterval(async () => {
    await checkAndAutoStartTournaments().catch(e => console.error('Auto-start error:', e.message));
    await checkAndCreateScheduledTournaments().catch(e => console.error('Scheduled create error:', e.message));
    await checkAndNotifyUpcomingTournaments().catch(e => console.error('Upcoming notify error:', e.message));
  }, 60000);
  console.log("⏰ Loop de torneos automáticos cada 60s");
}

// Parchear el initTournamentManager para también iniciar auto tournaments

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
  checkAndAutoStartTournaments,
  checkAndCreateScheduledTournaments,
  checkAndNotifyUpcomingTournaments,
  sendTournamentPushNotifications,
  setWsClients,
  startAutoTournamentLoop,
  activeTournaments,
  matchRooms,
};
