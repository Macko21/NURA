// scripts/runMigration.js
// Simple Node script that reads the SQL migration file and executes it against Neon PostgreSQL
// Usage: `node scripts/runMigration.js <path-to-sql>`

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const neonUrl = process.env.NEON_URL;
if (!neonUrl) {
  console.error('NEON_URL not defined in .env');
  process.exit(1);
}

const pool = new Pool({ connectionString: neonUrl });

const migrationPath = process.argv[2] || path.join(__dirname, 'migrations', '20231007_create_game_schema.sql');

(async () => {
  try {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    const client = await pool.connect();
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Migration applied successfully');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
