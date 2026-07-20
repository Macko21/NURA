"use strict";

const PUBLIC_TOURNAMENT_RETENTION_MS = 24 * 60 * 60 * 1000;
const SCHEDULE_INTERVALS_MS = Object.freeze({
  "1h": 60 * 60 * 1000,
  "2h": 2 * 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "8h": 8 * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
});

function parseTimestamp(value) {
  const timestamp = typeof value === "number" ? value : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : NaN;
}

function validateTournamentInput({ name, description, maxPlayers, fee, startTime, registrationUntil }, now = Date.now()) {
  const cleanName = String(name || "").trim();
  const cleanDescription = String(description || "").trim();
  const playerLimit = Number(maxPlayers);
  const entryFee = Number(fee || 0);
  const startsAt = parseTimestamp(startTime);
  const registrationEndsAt = registrationUntil ? parseTimestamp(registrationUntil) : startsAt;

  if (cleanName.length < 3 || cleanName.length > 80) throw new Error("El nombre debe tener entre 3 y 80 caracteres");
  if (cleanDescription.length > 300) throw new Error("La descripción no puede superar 300 caracteres");
  if (!Number.isInteger(playerLimit) || playerLimit < 4 || playerLimit > 64) throw new Error("La cantidad de jugadores debe estar entre 4 y 64");
  if (!Number.isSafeInteger(entryFee) || entryFee < 0 || entryFee > 100000000) throw new Error("El costo de inscripción no es válido");
  if (!Number.isFinite(startsAt) || startsAt <= now) throw new Error("La fecha de inicio debe ser futura");
  if (!Number.isFinite(registrationEndsAt) || registrationEndsAt > startsAt) throw new Error("La inscripción debe cerrar antes o al comenzar el torneo");
  if (registrationEndsAt <= now) throw new Error("El cierre de inscripción debe ser futuro");

  return {
    name: cleanName,
    description: cleanDescription,
    maxPlayers: playerLimit,
    fee: entryFee,
    startTime: startsAt,
    registrationUntil: registrationEndsAt,
  };
}

function isTournamentRegistrationOpen(tournament, now = Date.now()) {
  if (!tournament || tournament.status !== "registration") return false;
  const closesAt = Number(tournament.registration_until || tournament.start_time);
  return Number.isFinite(closesAt) && closesAt > now;
}

function nextScheduledOccurrence(startTime, interval, now = Date.now()) {
  const intervalMs = SCHEDULE_INTERVALS_MS[interval];
  const startsAt = Number(startTime);
  if (!intervalMs || !Number.isFinite(startsAt)) return null;
  const steps = Math.max(1, Math.floor((now - startsAt) / intervalMs) + 1);
  return startsAt + steps * intervalMs;
}

function nextScheduledName(name) {
  const cleanName = String(name || "Torneo").trim() || "Torneo";
  const numbered = cleanName.match(/^(.*?)(?:\s+#(\d+))$/);
  if (!numbered) return `${cleanName} #2`;
  return `${numbered[1].trim()} #${Number(numbered[2]) + 1}`;
}

module.exports = {
  PUBLIC_TOURNAMENT_RETENTION_MS,
  SCHEDULE_INTERVALS_MS,
  validateTournamentInput,
  isTournamentRegistrationOpen,
  nextScheduledOccurrence,
  nextScheduledName,
};
