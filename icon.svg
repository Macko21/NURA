/**
 * ══════════════════════════════════════════════
 * LOS 10.000 DE MACKO — Service Worker
 * Cachea el frontend para funcionar offline
 * y permite instalar como PWA.
 * ══════════════════════════════════════════════
 */

const CACHE_NAME = 'macko-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/styles.css',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  'https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=DM+Sans:wght@400;500;600&display=swap'
];

/* Instalar — cachear todos los assets */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS).catch(() => {
        // Si algún asset falla (ej: fonts offline), seguir igual
      });
    })
  );
  self.skipWaiting();
});

/* Activar — limpiar caches viejos */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

/* Fetch — cache first para assets, network first para API/WS */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Nunca cachear WebSocket ni endpoints del servidor
  if (
    event.request.url.startsWith('ws') ||
    event.request.url.startsWith('wss') ||
    url.pathname.startsWith('/ranking')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cachear respuestas exitosas de assets estáticos
        if (
          response.ok &&
          (url.pathname.endsWith('.js') ||
           url.pathname.endsWith('.css') ||
           url.pathname.endsWith('.png') ||
           url.pathname.endsWith('.html') ||
           url.pathname === '/')
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Sin red — devolver index.html cacheado
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
