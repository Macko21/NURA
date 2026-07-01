/**
 * ═══════════════════════════════════════════════════════
 * LOS 10.000 DE MACKO — Service Worker
 * Cache-first strategy for static assets
 * ═══════════════════════════════════════════════════════
 */

const CACHE_NAME = 'macko-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/reset-password.html',
  '/styles.css',
  '/app.js',
  '/manifest.json'
];

// Instalación: precachear assets estáticos
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS).catch(err => {
        console.warn('SW precache skip:', err.message);
      });
    })
  );
  self.skipWaiting();
});

// Activación: limpiar caches viejos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

// Estrategia: Network First con fallback a cache
self.addEventListener('fetch', event => {
  // Solo manejar GET requests
  if (event.request.method !== 'GET') return;

  // No cachear API calls
  if (event.request.url.includes('/api/')) return;

  // No cachear WebSocket
  if (event.request.url.includes('/ws')) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cachear respuestas exitosas
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback a cache si está offline
        return caches.match(event.request).then(cached => {
          return cached || new Response('Offline', { status: 503 });
        });
      })
  );
});
