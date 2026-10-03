"use strict";
const migrations = [
  { version: 1, sql: `
    CREATE TABLE commerce_orders (
      id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id),
      request_key UUID NOT NULL, provider TEXT NOT NULL DEFAULT 'mercadopago',
      pack_id TEXT NOT NULL, pack_snapshot JSONB NOT NULL,
      amount_cents BIGINT NOT NULL CHECK(amount_cents > 0), currency TEXT NOT NULL,
      live_mode BOOLEAN NOT NULL, status TEXT NOT NULL DEFAULT 'created',
      preference_id TEXT, redirect_url TEXT, payment_id TEXT UNIQUE,
      delivered_at BIGINT, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL,
      UNIQUE(user_id, request_key)
    );
    CREATE TABLE commerce_inbox (
      provider TEXT NOT NULL, payment_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT, next_attempt_at BIGINT NOT NULL, updated_at BIGINT NOT NULL,
      PRIMARY KEY(provider, payment_id)
    );
    CREATE INDEX commerce_inbox_retry ON commerce_inbox(next_attempt_at) WHERE status = 'pending';
  ` },
  { version: 2, sql: `
    CREATE TABLE finished_matches (
      id UUID PRIMARY KEY, room_id TEXT NOT NULL, payload JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT, next_attempt_at BIGINT NOT NULL,
      created_at BIGINT NOT NULL, settled_at BIGINT
    );
    CREATE INDEX finished_matches_retry ON finished_matches(next_attempt_at) WHERE status='pending';
    CREATE TABLE game_operations (
      operation_id TEXT PRIMARY KEY, match_id UUID NOT NULL REFERENCES finished_matches(id),
      player_id TEXT NOT NULL, kind TEXT NOT NULL, amount INTEGER NOT NULL,
      created_at BIGINT NOT NULL
    );
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS operation_id TEXT;
    CREATE UNIQUE INDEX transactions_operation_unique ON transactions(operation_id) WHERE operation_id IS NOT NULL;
  ` }
];
async function migrateProduction(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(100005003)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at BIGINT NOT NULL)');
    for (const migration of migrations) {
      const applied = await client.query('SELECT version FROM schema_migrations WHERE version = $1', [migration.version]);
      if (applied.rows.length) continue;
      await client.query(migration.sql);
      await client.query('INSERT INTO schema_migrations VALUES ($1, $2)', [migration.version, Date.now()]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
module.exports = { migrateProduction, schemaVersion: migrations.at(-1).version };
