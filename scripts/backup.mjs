// Backup de datos del proyecto NURA (modelo jsonb heredado).
// Descarga cada tabla nura_* completa desde PostgREST y guarda JSON restaurable.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const URL = 'https://niwikufqwwpcsoqxifbe.supabase.co/rest/v1/';
const KEY = 'sb_publishable_Gp_4lmWZhyB8ZUbFwgCKfw_aKo3Rbbj';
const TABLES = ['nura_productos', 'nura_clientes', 'nura_ventas', 'nura_compras', 'nura_combos', 'nura_usuarios'];

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = join(process.cwd(), 'backup', stamp);
await mkdir(outDir, { recursive: true });

async function fetchAll(table) {
  const rows = [];
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const range = `${from}-${from + pageSize - 1}`;
    const r = await fetch(`${URL}${table}?select=*`, {
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        Prefer: 'count=exact',
        Range: range,
      },
    });
    if (!r.ok) throw new Error(`${table}: HTTP ${r.status} ${await r.text()}`);
    const batch = await r.json();
    rows.push(...batch);
    const total = parseInt(r.headers.get('content-range')?.split('/')[1] ?? '0', 10);
    if (rows.length >= total || batch.length === 0) break;
    from += pageSize;
  }
  return rows;
}

const summary = {};
for (const t of TABLES) {
  const rows = await fetchAll(t);
  summary[t] = rows.length;
  const file = join(outDir, `${t}.json`);
  await writeFile(file, JSON.stringify(rows, null, 2), 'utf8');
  console.log(`${t}: ${rows.length} rows -> ${file}`);
}
await writeFile(join(outDir, '_summary.json'), JSON.stringify({ stamp, ...summary }, null, 2), 'utf8');
console.log('\nBackup completo:', JSON.stringify(summary));
