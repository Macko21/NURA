'use strict';
require('dotenv').config({ quiet: true });
const { pool } = require('../backend/database');

async function main() {
  const client = await pool.connect();
  try {
    // This report cannot mutate production, even if a later query is added incorrectly.
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout = '10s'");
    const tables = (await client.query(`SELECT to_regclass('finished_matches') AS results,
      to_regclass('commerce_orders') AS orders,to_regclass('payment_events') AS events`)).rows[0];
    const report = { checkedAt: new Date().toISOString(), readOnly: true, databaseConnected: true, schema: tables };
    if (tables.events) report.recordedPayments = (await client.query('SELECT provider,COUNT(*)::int AS count FROM payment_events GROUP BY provider')).rows;
    if (tables.orders) report.orders = (await client.query('SELECT status,COUNT(*)::int AS count FROM commerce_orders GROUP BY status')).rows;
    if (tables.results) {
      report.matches = (await client.query('SELECT status,COUNT(*)::int AS count FROM finished_matches GROUP BY status')).rows;
      report.overdueAwards = Number((await client.query("SELECT COUNT(*)::int AS count FROM finished_matches WHERE status='pending' AND created_at<$1", [Date.now()-15*60_000])).rows[0].count);
      report.ledgerMismatches = Number((await client.query(`SELECT COUNT(*)::int AS count FROM game_operations g
        LEFT JOIN transactions t ON t.operation_id=g.operation_id
        WHERE g.kind IN ('coins','bet_payout','daily_reward') AND (t.id IS NULL OR t.amount<>g.amount)`)).rows[0].count);
      if (report.overdueAwards || report.ledgerMismatches) process.exitCode = 2;
    }
    await client.query('COMMIT');
    console.log(JSON.stringify(report,null,2));
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
main().catch(error => { console.error('No se pudo completar el informe de solo lectura:',error.code || 'report_failed'); process.exitCode=1; }).finally(()=>pool.end());
