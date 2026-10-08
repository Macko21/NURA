-- 20231007_create_game_schema.sql
-- Schema for persisting rooms (salas) and partidas en PostgreSQL (Supabase)
-- Esta migración corresponde al bloque P0-01

CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; -- para generar UUIDs

-- Tabla que representa una sala (room)
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,               -- código de 6 dígitos
  private BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'waiting',  -- waiting | playing | closed
  max_players INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Índice para búsquedas rápidas por código
CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms (code);

-- Tabla que representa jugadores dentro de una sala
CREATE TABLE IF NOT EXISTS room_players (
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  player_id UUID NOT NULL,
  name TEXT NOT NULL,
  alias TEXT NOT NULL,
  ready BOOLEAN NOT NULL DEFAULT FALSE,
  score INTEGER NOT NULL DEFAULT 0,
  entered BOOLEAN NOT NULL DEFAULT FALSE,
  connected BOOLEAN NOT NULL DEFAULT TRUE,
  is_guest BOOLEAN NOT NULL DEFAULT FALSE,
  inactivity_strikes INTEGER NOT NULL DEFAULT 0,
  reconnect_attempts INTEGER NOT NULL DEFAULT 0,
  bet INTEGER DEFAULT 0,
  bet_confirmed BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (room_id, player_id)
);

-- Tabla para registrar el estado de apuestas de una sala
CREATE TABLE IF NOT EXISTS room_betting (
  room_id UUID PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  pot INTEGER NOT NULL DEFAULT 0,
  house_edge NUMERIC(5,2) NOT NULL DEFAULT 0.10
);

-- Triggers to update updated_at timestamp
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_timestamp_before_update
BEFORE UPDATE ON rooms
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- Guardar historial de partidas (opcional, para futuras auditorías)
CREATE TABLE IF NOT EXISTS game_history (
  game_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  state JSONB NOT NULL, -- snapshot completo del estado de la partida
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
