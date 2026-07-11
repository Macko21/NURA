/**
 * ══════════════════════════════════════════════════
 * LOS 10.000 DE MACKO — Service Worker v2
 * Cachea solo assets estáticos para funcionar offline
 * y permite instalar como PWA.
 * 
 * Cache busting: el nombre del cache incluye la versión
 * del juego, forzando recarga completa en cada actualización.
 * ══════════════════════════════════════════════════
 */

// ⚠️ ACTUALIZAR ESTA VERSIÓN CADA VEZ QUE CAMBIE EL JUEGO
// Debe coincidir con GAME_VERSION en version.js
const GAME_VERSION = '3.4.2';
const CACHE_NAME = 'macko-v' + GAME_VERSION;

const ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/styles.css',
  '/version.js',
  '/manifest.json',
  '/ceo-panel.html',
  '/ceo-panel.js',
  '/ceo-panel.css',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-1024.png',
  '/apple-touch-icon.png',
  'https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;900&family=Sora:wght@400;500;600;700&display=swap'
];

/* Instalar — cachear todos los assets */
self.addEventListener('install', event => {
  // Antes de instalar, limpiar TODOS los caches viejos
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key.startsWith('macko-') && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      );
    }).then(() => {
      return caches.open(CACHE_NAME).then(cache => {
        return cache.addAll(ASSETS).catch(() => {
          // Si algún asset falla (ej: fonts offline), seguir igual
        });
      });
    })
  );
  self.skipWaiting();
});

/* Activar — limpiar caches viejos y tomar control */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      );
    }).then(() => {
      // Notificar a todas las ventanas que hay una nueva versión
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'SW_UPDATED', version: GAME_VERSION });
        });
      });
      return self.clients.claim();
    })
  );
});

/* ── Push event: mostrar notificación + avisar a la app ── */
self.addEventListener('push', event => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    const title = data.title || 'Los 10.000 de Macko';
    const options = {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
      vibrate: [200, 100, 200],
      timestamp: data.timestamp || Date.now()
    };
    event.waitUntil(
      self.registration.showNotification(title, options).then(() => {
        // Notificar a todas las ventanas abiertas que llegó un push
        return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
          clients.forEach(client => {
            client.postMessage({
              type: 'PUSH_RECEIVED',
              title: title,
              body: data.body || '',
              url: data.url || '/',
              timestamp: data.timestamp || Date.now()
            });
          });
        });
      })
    );
  } catch(e) {
    event.waitUntil(
      self.registration.showNotification('Los 10.000 de Macko', {
        body: event.data.text(),
        icon: '/icon-192.png'
      })
    );
  }
});

/* ── Click en notificación: redirigir a la URL ──────── */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(location.host) && 'focus' in client) {
          client.focus();
          if (url !== '/') client.navigate(url);
          return;
        }
      }
      if (clients.openWindow) clients.openWindow(url);
    })
  );
});

/* Fetch — network first para HTML, cache first para assets */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Nunca cachear WebSocket ni endpoints del servidor
  if (
    event.request.url.startsWith('ws') ||
    event.request.url.startsWith('wss') ||
    url.pathname.startsWith('/api/') ||
    url.pathname === '/ranking'
  ) {
    return;
  }

  // Para el HTML principal: SIEMPRE red (evitar cachear HTML viejo)
  if (url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      fetch(event.request).then(response => {
        // Cachear la nueva versión del HTML
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => {
        // Si no hay red, devolver HTML cacheado
        return caches.match(event.request).then(cached => {
          return cached || caches.match('/index.html');
        });
      })
    );
    return;
  }

  // Para JS: network first — siempre buscar la última versión del servidor
  if (url.pathname.endsWith('.js')) {
    event.respondWith(
      fetch(event.request).then(response => {
        // Cachear la nueva versión
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => {
        // Sin red — devolver JS cacheado
        return caches.match(event.request);
      })
    );
    return;
  }

  // Para otros assets estáticos: cache first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cachear respuestas exitosas de assets estáticos
        if (
          response.ok &&
          (url.pathname.endsWith('.css') ||
           url.pathname.endsWith('.png') ||
           url.pathname.endsWith('.json') ||
           url.pathname.endsWith('.html'))
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Sin red — devolver asset cacheado
        return caches.match(event.request);
      });
    })
  );
});
