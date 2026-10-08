// src/lib/neon.js
// Cliente PostgreSQL — usa la misma variable DATABASE_URL que todo el proyecto
// (Supabase). La URL ya incluye los parámetros SSL (sslmode=require).

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Exportamos tanto el pool como un helper simple para consultas
module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: async () => {
    const client = await pool.connect();
    return client;
  },
  // Para cerrar graceful en tests/teardown
  end: async () => pool.end(),
};
