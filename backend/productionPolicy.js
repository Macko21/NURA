"use strict";

// Safe defaults: enabling a flag requires the operational checks in the runbook.
function paymentsEnabled(env = process.env) { return env.PAYMENTS_ENABLED === 'true'; }
function paidCompetitionEnabled(env = process.env) { return env.PAID_COMPETITION_ENABLED === 'true'; }

function assertJoinAllowed(room, playerId, { approved = false, code = null } = {}) {
  if (room.players.some(player => player.id === playerId)) return;
  if (room.isTournamentMatch) throw new Error('Esta sala es exclusiva para los participantes del torneo');
  if (room.status === 'playing' && (Number(room.betting?.pot) > 0 || room.players.some(p => Number(p.bet) > 0))) {
    throw new Error('No se puede ingresar a una partida con apuestas ya iniciada');
  }
  if (room.private && !approved && String(code || '') !== String(room.code)) {
    throw new Error('Necesitás el código de la sala privada');
  }
  if (room.private && room.status === 'playing' && !approved) {
    throw new Error('Necesitás la aprobación del creador');
  }
}

function createAttemptLimiter({ limit = 10, windowMs = 60_000, maxKeys = 10_000 } = {}) {
  const attempts = new Map();
  return (key, now = Date.now()) => {
    for (const [id, state] of attempts) if (state.expires <= now) attempts.delete(id);
    let state = attempts.get(key);
    if (!state) {
      if (attempts.size >= maxKeys) return false;
      state = { count: 0, expires: now + windowMs };
      attempts.set(key, state);
    }
    return ++state.count <= limit;
  };
}

module.exports = { paymentsEnabled, paidCompetitionEnabled, assertJoinAllowed, createAttemptLimiter };
