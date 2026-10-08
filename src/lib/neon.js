// src/lib/neon.js
// Cliente PostgreSQL para conectar con Neon
// Utiliza la variable de entorno NEON_URL definida en .env

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.NEON_URL,
  // Neon requiere SSL y channel binding; la URL ya incluye los parámetros.
  // pg will handle SSL automatically when sslmode=require is present.
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
