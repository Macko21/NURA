// ===== NURA — db.js: Supabase CRUD & Realtime =====
'use strict';

const _sb = () => window._supabase;
const COLS_LIST = ['productos','clientes','ventas','compras','combos','usuarios'];
const DB = { productos:[], clientes:[], ventas:[], compras:[], combos:[], usuarios:[] };

let _realtimeChannel = null;
let _lastUpdate = null;

function notifyUpdate(col) {
  _lastUpdate = Date.now();
  document.dispatchEvent(new CustomEvent('nura:datachange', { detail: { collection: col, timestamp: _lastUpdate } }));
}

function getLastUpdateStr() {
  if (!_lastUpdate) return 'Nunca';
  const diff = Math.floor((Date.now() - _lastUpdate) / 1000);
  if (diff < 5) return 'Ahora mismo';
  if (diff < 60) return `Hace ${diff}s`;
  return `Hace ${Math.floor(diff/60)}m`;
}

const RELOAD_PAGES = {
  productos: ['catalogo','stock','dashboard','reportes','misreportes'],
  clientes:  ['clientes','dashboard','ventas','deudas'],
  ventas:    ['ventas','dashboard','reportes','deudas','misreportes'],
  compras:   ['compras','dashboard','reportes'],
  combos:    ['combos','catalogo','ventas'],
  usuarios:  ['usuarios']
};

// ── Write tracking con timeout ────────────────────────────────────────
let _writes = 0;
let _writesTimeout = null;

function syncUI(s) {
  const dot = document.getElementById('syncDot');
  const txt = document.getElementById('syncTxt');
  const bar = document.getElementById('syncBar');
  if (!dot) return;
  if (s==='ok')     { dot.style.background='#52dad2'; txt.textContent='Sincronizado' + (_lastUpdate ? ' · ' + getLastUpdateStr() : ''); if(bar) bar.style.display='none'; }
  if (s==='saving') { dot.style.background='#f59e0b'; txt.textContent='Guardando...'; if(bar) bar.style.display='block'; }
  if (s==='off')    { dot.style.background='#f43f5e'; txt.textContent='Sin conexión'; }
}

function _startWriteTimeout() {
  clearTimeout(_writesTimeout);
  _writesTimeout = setTimeout(() => {
    if (_writes > 0) { _writes = 0; syncUI('ok'); console.warn('db: writes timeout — forced syncUI ok'); }
  }, 15000);
}

function pulseSyncDot() {
  const dot = document.getElementById('syncDot');
  if (!dot) return;
  dot.style.transition = 'none';
  dot.style.transform = 'scale(1.8)';
  dot.style.boxShadow = '0 0 8px rgba(82,218,210,0.6)';
  setTimeout(() => {
    dot.style.transition = 'all 0.4s ease';
    dot.style.transform = 'scale(1)';
    dot.style.boxShadow = 'none';
  }, 150);
  syncUI('ok');
}

async function fbSet(col_slash_id, data) {
  const parts = col_slash_id.split('/');
  const col = parts[0];
  const id  = parts.slice(1).join('/') || data?.id;
  _writes++; syncUI('saving'); _startWriteTimeout();
  try {
    const { error } = await _sb().from('nura_' + col)
      .upsert({ id, datos: data }, { onConflict: 'id' });
    if (error) { console.error('fbSet', col, error.message); toast('Error al guardar', 'error'); }
  } catch(e) { console.error('fbSet', col, e); toast('Error al guardar', 'error'); }
  finally { if (--_writes <= 0) { _writes=0; clearTimeout(_writesTimeout); syncUI('ok'); } }
}

async function fbDel(col_slash_id) {
  const parts = col_slash_id.split('/');
  const col = parts[0];
  const id  = parts.slice(1).join('/');
  _writes++; syncUI('saving'); _startWriteTimeout();
  try {
    const { error } = await _sb().from('nura_' + col).delete().eq('id', id);
    if (error) console.error('fbDel', col, error.message);
  } catch(e) { console.error('fbDel', col, e); }
  finally { if (--_writes <= 0) { _writes=0; clearTimeout(_writesTimeout); syncUI('ok'); } }
}

async function fbSave(col, item)      { await fbSet(`${col}/${item.id}`, item); }
async function fbRemove(col, id)      { await fbDel(`${col}/${id}`); }
async function fbSaveMany(col, items) {
  _writes++; syncUI('saving'); _startWriteTimeout();
  try {
    const rows = items.map(it => ({ id: it.id, datos: it }));
    const { error } = await _sb().from('nura_' + col).upsert(rows, { onConflict: 'id' });
    if (error) { console.error('fbSaveMany', col, error.message); toast('Error al guardar', 'error'); }
  } catch(e) { console.error('fbSaveMany', col, e); toast('Error al guardar', 'error'); }
  finally { if (--_writes <= 0) { _writes=0; clearTimeout(_writesTimeout); syncUI('ok'); } }
}

async function fbDescontarStock(productoId, cantidad, esAcc) {
  try {
    const { error } = await _sb().rpc('nura_descontar_stock', {
      p_producto_id: productoId, p_cantidad: cantidad, p_es_acc: esAcc
    });
    if (error) { console.error('fbDescontarStock', error.message); return false; }
    return true;
  } catch(e) { console.error('fbDescontarStock', e); return false; }
}

async function cargarColeccion(col) {
  try {
    const client = _sb();
    if (!client) { console.error('cargar', col, 'Supabase client not ready'); return; }
    const { data, error } = await client.from('nura_' + col).select('id, datos');
    if (error) { console.error('cargar', col, error.message); syncUI('off'); return; }
    DB[col] = (data || []).map(row => ({ ...row.datos, id: row.id }));
    console.log('cargar', col, DB[col].length, 'rows');
    notifyUpdate(col);
  } catch(e) { console.error('cargar', col, e); syncUI('off'); }
}

// ── Splash con fallback de error ──────────────────────────────────────
let _splashOk = false;
function hideSplash() {
  if (_splashOk) return; _splashOk = true;
  document.getElementById('app').style.display = '';
  const s = document.getElementById('splash');
  if (s) { s.style.opacity='0'; setTimeout(()=>s.remove(), 420); }
  syncUI('ok');
}
setTimeout(() => {
  if (!_splashOk) {
    console.warn('db: splash timeout — data may not have loaded');
    hideSplash();
    toast('Conexión lenta. Algunos datos pueden no estar disponibles.', 'error');
  }
}, 12000);

// ── Debounced realtime reload ─────────────────────────────────────────
const _reloadTimers = {};
function debouncedReload(col) {
  clearTimeout(_reloadTimers[col]);
  _reloadTimers[col] = setTimeout(async () => {
    await cargarColeccion(col);
    if (RELOAD_PAGES[col]?.includes(currentPage)) renderPage(currentPage);
    pulseSyncDot();
  }, 300);
}

async function suscribirColecciones() {
  console.log('nura: starting data load...');
  await Promise.all(COLS_LIST.map(cargarColeccion));
  console.log('nura: data loaded, DB.ventas:', DB.ventas.length, 'DB.productos:', DB.productos.length);
  hideSplash();

  try {
    _realtimeChannel = _sb().channel('nura-changes');
    COLS_LIST.forEach(col => {
      _realtimeChannel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'nura_' + col },
          () => debouncedReload(col)
        );
    });
    _realtimeChannel.subscribe(status => {
      if (status === 'SUBSCRIBED') syncUI('ok');
      else if (status === 'CHANNEL_ERROR') syncUI('off');
    });
  } catch(e) { console.error('nura: realtime error', e); }
}

window._nuraInit = suscribirColecciones;
