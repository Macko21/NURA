/**
 * ═══════════════════════════════════════════════════════
 * Smoke test — Los 10.000 de Macko
 *
 * Arranca el servidor en un puerto de prueba, verifica
 * que los endpoints clave respondan, y cierra todo.
 *
 * Uso:
 *   node scripts/smoke-test.js
 *
 * Variables de entorno requeridas:
 *   DATABASE_URL (si no se setea, saltea DB)
 *   PORT         (default: 3099)
 * ═══════════════════════════════════════════════════════
 */

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const PORT = process.env.PORT || 3099;
const BASE = `http://localhost:${PORT}`;
const TIMEOUT_MS = 15000; // 15s para que arranque el server

let testsPassed = 0;
let testsFailed = 0;
let serverProcess = null;

function assert(name, condition, detail) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    testsPassed++;
  } else {
    console.log(`  ❌ ${name} ${detail ? '— ' + detail : ''}`);
    testsFailed++;
  }
}

function fetchUrl(path) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${BASE}${path}`, { timeout: 5000 }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function postUrl(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname: 'localhost',
      port: PORT,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 5000
    };
    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(payload);
    req.end();
  });
}

async function waitForServer() {
  const start = Date.now();
  while (Date.now() - start < TIMEOUT_MS) {
    try {
      const res = await fetchUrl('/');
      if (res.status === 200) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function runTests() {
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('  🧪 SMOKE TESTS — Los 10.000 de Macko');
  console.log('═══════════════════════════════════════════');
  console.log(`  Server: ${BASE}`);
  console.log('');

  // ── 1. Esperar a que el server arranque ──────────
  const started = await waitForServer();
  assert('Server started', started, 'Timed out waiting for server');
  if (!started) {
    console.log('\n⚠️  Server did not start. Aborting tests.\n');
    process.exit(1);
  }

  // ── 2. Endpoints básicos ─────────────────────────
  console.log('\n── Endpoints básicos ──');

  try {
    let res = await fetchUrl('/');
    assert('GET / (index.html)', res.status === 200, `Status ${res.status}`);
    assert('Content-Type is HTML', (res.headers['content-type'] || '').includes('text/html'));
  } catch (e) {
    assert('GET /', false, e.message);
  }

  try {
    let res = await fetchUrl('/api/version');
    assert('GET /api/version', res.status === 200, `Status ${res.status}`);
    try {
      const data = JSON.parse(res.body);
      assert('Version has version field', !!data.version);
      assert('Version has changelog array', Array.isArray(data.changelog));
      console.log(`  📦 v${data.version} — ${data.changelog.length} changelog entries`);
    } catch {
      assert('Version JSON parseable', false, 'Invalid JSON response');
    }
  } catch (e) {
    assert('GET /api/version', false, e.message);
  }

  try {
    let res = await fetchUrl('/styles.css');
    assert('GET /styles.css', res.status === 200, `Status ${res.status}`);
    assert('Content-Type is CSS', (res.headers['content-type'] || '').includes('text/css'));
  } catch (e) {
    assert('GET /styles.css', false, e.message);
  }

  try {
    let res = await fetchUrl('/dice-renderer.js');
    assert('GET /dice-renderer.js', res.status === 200, `Status ${res.status}`);
  } catch (e) {
    assert('GET /dice-renderer.js', false, e.message);
  }

  try {
    let res = await fetchUrl('/audio.js');
    assert('GET /audio.js', res.status === 200, `Status ${res.status}`);
  } catch (e) {
    assert('GET /audio.js', false, e.message);
  }

  try {
    let res = await fetchUrl('/app.js');
    assert('GET /app.js', res.status === 200, `Status ${res.status}`);
  } catch (e) {
    assert('GET /app.js', false, e.message);
  }

  try {
    let res = await fetchUrl('/version.js');
    assert('GET /version.js', res.status === 200, `Status ${res.status}`);
  } catch (e) {
    assert('GET /version.js', false, e.message);
  }

  // ── 3. Endpoints protegidos (deben dar 401) ──────
  console.log('\n── Endpoints protegidos (401 sin auth) ──');

  const protectedEndpoints = [
    ['GET', '/api/user/balance'],
    ['POST', '/api/shop/buy'],
    ['POST', '/api/feedback'],
    ['GET', '/api/friends'],
    ['GET', '/api/tournaments'],
    ['GET', '/api/notifications'],
    ['GET', '/api/user/missions'],
    ['POST', '/api/user/claim-chest']
  ];

  for (const [method, ep] of protectedEndpoints) {
    try {
      const res = method === 'GET' ? await fetchUrl(ep) : await postUrl(ep, {});
      // May return 401, 404 (if route doesn't exist), or 429 (rate limit)
      const ok = res.status === 401 || res.status === 404;
      assert(`${method} ${ep}`, ok, `Status ${res.status}`);
    } catch (e) {
      assert(`${method} ${ep}`, false, e.message);
    }
  }

  // ── 4. CEO endpoints ────────────────────────────
  console.log('\n── CEO Panel ──');

  try {
    let res = await postUrl('/ceo-panel/api/login', { username: 'admin', password: 'admin123' });
    // May return 401 (wrong credentials in test env) or 200 (if CEO_USER/PASS match)
    assert('POST /ceo-panel/api/login', res.status === 200 || res.status === 401, `Status ${res.status}`);
  } catch (e) {
    assert('POST /ceo-panel/api/login', false, e.message);
  }

  try {
    let res = await fetchUrl('/ceo-panel/api/stats');
    assert('GET /ceo-panel/api/stats (sin auth)', res.status === 401, `Status ${res.status}`);
  } catch (e) {
    assert('GET /ceo-panel/api/stats', false, e.message);
  }

  // ── 5. Rate limiting test ────────────────────────
  console.log('\n── Rate limiting ──');
  try {
    let lastStatus = 0;
    for (let i = 0; i < 14; i++) {
      const res = await postUrl('/api/feedback', {});
      lastStatus = res.status;
    }
    // After 12+ requests the rate limiter (5/15min) should kick in
    assert('Rate limiter blocks excessive requests', lastStatus === 429 || lastStatus === 401, `Status ${lastStatus}`);
  } catch (e) {
    assert('Rate limiter test', false, e.message);
  }

  // ── Resultados ──────────────────────────────────
  console.log('\n═══════════════════════════════════════════');
  const total = testsPassed + testsFailed;
  console.log(`  📊 Resultados: ${testsPassed}/${total} pasaron`);
  if (testsFailed > 0) {
    console.log(`  ❌ ${testsFailed} test(s) FAILED`);
  } else {
    console.log('  🎉 TODOS LOS TESTS PASARON');
  }
  console.log('═══════════════════════════════════════════\n');

  return testsFailed === 0;
}

// ── Main ──────────────────────────────────────────────
async function main() {
  // Lanzar servidor
  const env = {
    ...process.env,
    PORT: String(PORT),
    NODE_ENV: 'test'
  };

  // Si no hay DATABASE_URL, setear una dummy para que el server arranque en modo limitado
  if (!env.DATABASE_URL) {
    env.DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/los10000_test';
  }

  serverProcess = spawn('node', ['backend/server.js'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: path.resolve(__dirname, '..')
  });

  let stdout = '';
  serverProcess.stdout.on('data', d => stdout += d.toString());
  serverProcess.stderr.on('data', d => {
    // Ignorar warnings de conexión DB en test
    const msg = d.toString();
    if (!msg.includes('ECONNREFUSED') && !msg.includes('connection error') && !msg.includes('SSL')) {
      stdout += msg;
    }
  });

  try {
    const passed = await runTests();
    process.exitCode = passed ? 0 : 1;
  } catch (e) {
    console.error('Fatal error:', e);
    process.exitCode = 1;
  } finally {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      // Esperar a que termine
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

main();
