// scripts/checkMigration.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.NEON_URL });
(async () => {
  try {
    const res = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`);
    console.log('Tables in public schema:');
    res.rows.forEach(r => console.log('- ', r.table_name));
  } catch (e) {
    console.error('Error checking DB:', e);
  } finally {
    await pool.end();
  }
})();
