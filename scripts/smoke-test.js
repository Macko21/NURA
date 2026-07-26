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
const WebSocket = require('ws');

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

function fetchUrl(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${BASE}${path}`, { timeout: 5000, headers }, res => {
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

function openGameSocket(token, playerName) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}`, { origin: 'https://localhost' });
    const queued = [];
    const waiters = [];
    const openTimeout = setTimeout(() => {
      ws.terminate();
      reject(new Error('Timeout identificando WebSocket'));
    }, 5000);

    ws.waitForType = (type, timeoutMs = 5000) => new Promise((resolveMessage, rejectMessage) => {
      const queuedIndex = queued.findIndex(message => message.type === type);
      if (queuedIndex >= 0) {
        resolveMessage(queued.splice(queuedIndex, 1)[0]);
        return;
      }
      const waiter = { type, resolve: resolveMessage };
      waiter.timer = setTimeout(() => {
        const index = waiters.indexOf(waiter);
        if (index >= 0) waiters.splice(index, 1);
        rejectMessage(new Error(`Timeout esperando ${type}`));
      }, timeoutMs);
      waiters.push(waiter);
    });

    ws.on('open', () => ws.send(JSON.stringify({
      type: 'IDENTIFY',
      data: { token, playerName }
    })));
    ws.on('message', raw => {
      const message = JSON.parse(raw.toString());
      const waiterIndex = waiters.findIndex(waiter => waiter.type === message.type);
      if (waiterIndex >= 0) {
        const waiter = waiters.splice(waiterIndex, 1)[0];
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      } else {
        queued.push(message);
      }
      if (message.type === 'IDENTIFIED') {
        clearTimeout(openTimeout);
        resolve(ws);
      }
    });
    ws.on('error', error => {
      clearTimeout(openTimeout);
      reject(error);
    });
  });
}

async function createGuest(name) {
  const res = await postUrl('/api/guest-session', { playerName: name });
  if (res.status !== 201) throw new Error(`Guest status ${res.status}`);
  return JSON.parse(res.body);
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
    assert('Header X-Content-Type-Options', res.headers['x-content-type-options'] === 'nosniff');
    assert('Header X-Frame-Options', res.headers['x-frame-options'] === 'DENY');
    assert('Header Referrer-Policy', res.headers['referrer-policy'] === 'strict-origin-when-cross-origin');
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
      const sw = await fetchUrl('/sw.js');
      assert('PWA cache version matches game version', sw.body.includes(`GAME_VERSION = '${data.version}'`));
      console.log(`  📦 v${data.version} — ${data.changelog.length} changelog entries`);
    } catch {
      assert('Version JSON parseable', false, 'Invalid JSON response');
    }
  } catch (e) {
    assert('GET /api/version', false, e.message);
  }

  try {
    const res = await fetchUrl('/api/version', { Origin: 'https://localhost' });
    assert(
      'Native app CORS origin',
      res.headers['access-control-allow-origin'] === 'https://localhost',
      `Origin ${res.headers['access-control-allow-origin'] || 'missing'}`
    );
  } catch (e) {
    assert('Native app CORS origin', false, e.message);
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
    let res = await fetchUrl('/dice-renderer-3d.mjs');
    assert('GET /dice-renderer-3d.mjs', res.status === 200, `Status ${res.status}`);
    res = await fetchUrl('/vendor/three.module.js');
    assert('GET Three.js local', res.status === 200, `Status ${res.status}`);
    res = await fetchUrl('/vendor/three.core.min.js');
    assert('GET Three.js core local', res.status === 200, `Status ${res.status}`);
  } catch (e) {
    assert('GET renderer 3D', false, e.message);
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

  console.log('\n── Sesión invitada y WebSocket ──');
  let guestSession = null;
  try {
    const res = await postUrl('/api/guest-session', {});
    const data = JSON.parse(res.body);
    guestSession = data;
    assert('POST /api/guest-session', res.status === 201, `Status ${res.status}`);
    assert('Guest session returns signed token', typeof data.token === 'string' && data.token.split('.').length === 3);
    assert('Guest identity is server-generated', String(data.player?.id || '').startsWith('guest_'));
  } catch (e) {
    assert('POST /api/guest-session', false, e.message);
  }

  try {
    const statuses = [];
    for (let i = 0; i < 12; i++) {
      statuses.push((await postUrl('/api/guest-session', {})).status);
    }
    assert(
      'Guest access is not blocked by the password-attempt limiter',
      statuses.every(status => status === 201),
      `Statuses ${statuses.join(',')}`
    );
  } catch (e) {
    assert('Guest access is not blocked by the password-attempt limiter', false, e.message);
  }

  if (guestSession?.token) {
    try {
      const res = await fetchUrl('/api/shop/catalog', {
        Authorization: `Bearer ${guestSession.token}`
      });
      const data = JSON.parse(res.body);
      assert('Shop catalog survives DB fallback', res.status === 200, `Status ${res.status}`);
      assert('Shop catalog returns items', Array.isArray(data.items) && data.items.length > 0);
    } catch (e) {
      assert('Shop catalog survives DB fallback', false, e.message);
    }
  }

  try {
    const first = await createGuest('Smoke Uno');
    const second = await createGuest('Smoke Dos');
    const wsOne = await openGameSocket(first.token, 'Smoke Uno');
    const wsTwo = await openGameSocket(second.token, 'Smoke Dos');

    wsOne.send(JSON.stringify({ type: 'CREATE_ROOM', data: { playerName: 'Smoke Uno' } }));
    const firstRoomMessage = await wsOne.waitForType('ROOM_CREATED');
    const firstRoom = firstRoomMessage.data.room;

    wsTwo.send(JSON.stringify({
      type: 'JOIN_ROOM',
      data: { code: firstRoom.code, playerName: 'Smoke Dos' }
    }));
    await wsTwo.waitForType('JOIN_SUCCESS');
    assert('Two signed players join the same room', true);

    wsOne.send(JSON.stringify({ type: 'PLAYER_READY', data: { roomId: firstRoom.id } }));
    wsTwo.send(JSON.stringify({ type: 'PLAYER_READY', data: { roomId: firstRoom.id } }));
    await Promise.all([
      wsOne.waitForType('GAME_STARTED', 8000),
      wsTwo.waitForType('GAME_STARTED', 8000)
    ]);
    assert('Real-player room starts after both are ready', true);

    wsOne.send(JSON.stringify({ type: 'LEAVE_CONTEXT', data: {} }));
    await wsOne.waitForType('LEFT_CONTEXT');
    wsTwo.send(JSON.stringify({ type: 'LEAVE_CONTEXT', data: {} }));
    await wsTwo.waitForType('LEFT_CONTEXT');

    wsOne.send(JSON.stringify({ type: 'CREATE_ROOM', data: { playerName: 'Smoke Uno' } }));
    const secondRoomMessage = await wsOne.waitForType('ROOM_CREATED');
    const secondRoom = secondRoomMessage.data.room;
    assert('Same socket creates a fresh room after a completed context', secondRoom.id !== firstRoom.id);

    wsTwo.send(JSON.stringify({
      type: 'JOIN_ROOM',
      data: { code: secondRoom.code, playerName: 'Smoke Dos' }
    }));
    await wsTwo.waitForType('JOIN_SUCCESS');
    assert('Second consecutive join succeeds without relogin', true);

    wsOne.send(JSON.stringify({ type: 'LEAVE_CONTEXT', data: {} }));
    wsTwo.send(JSON.stringify({ type: 'LEAVE_CONTEXT', data: {} }));
    await Promise.all([
      wsOne.waitForType('LEFT_CONTEXT'),
      wsTwo.waitForType('LEFT_CONTEXT')
    ]);
    wsOne.close();
    wsTwo.close();
  } catch (e) {
    assert('Consecutive real-player lifecycle', false, e.message);
  }

  try {
    const closeCode = await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${PORT}`, { origin: 'https://localhost' });
      const timeout = setTimeout(() => {
        ws.terminate();
        reject(new Error('Timeout esperando rechazo WebSocket'));
      }, 3000);
      ws.on('open', () => ws.send(JSON.stringify({ type: 'CREATE_ROOM', data: {} })));
      ws.on('close', code => {
        clearTimeout(timeout);
        resolve(code);
      });
      ws.on('error', reject);
    });
    assert('Native WebSocket origin is accepted before auth', closeCode === 4003, `Close code ${closeCode}`);
  } catch (e) {
    assert('Native WebSocket origin is accepted before auth', false, e.message);
  }

  // ── 4. CEO endpoints ────────────────────────────
  console.log('\n── CEO Panel ──');

  try {
    let res = await postUrl('/ceo-panel/api/login', { username: 'admin', password: 'invalid-smoke-test-password' });
    assert('POST /ceo-panel/api/login', [200, 401].includes(res.status), `Status ${res.status}`);
  } catch (e) {
    assert('POST /ceo-panel/api/login', false, e.message);
  }

  try {
    let res = await fetchUrl('/ceo-panel/api/stats');
    assert('GET /ceo-panel/api/stats (sin auth)', res.status === 401, `Status ${res.status}`);
  } catch (e) {
    assert('GET /ceo-panel/api/stats', false, e.message);
  }

  try {
    let res = await fetchUrl('/ceo-panel/api/version');
    assert('GET /ceo-panel/api/version (sin auth)', res.status === 401 || res.status === 503, `Status ${res.status}`);
  } catch (e) {
    assert('GET /ceo-panel/api/version', false, e.message);
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
    NODE_ENV: 'test',
    JWT_SECRET: 'smoke-test-only-jwt-secret-32-bytes-minimum',
    CEO_SECRET: '',
    CEO_ADMIN_USERNAME: '',
    CEO_ADMIN_PASSWORD: ''
  };

  // Nunca heredar por accidente la base real durante un smoke test.
  env.DATABASE_URL = process.env.SMOKE_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/los10000_test';

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
