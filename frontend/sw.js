/**
 * ══════════════════════════════════════════════════
 * LOS 10.000 DE MACKO — Service Worker v3
 * Cachea solo assets estáticos para funcionar offline
 * y permite instalar como PWA.
 * 
 * Cache busting: el nombre del cache incluye la versión
 * del juego, forzando recarga completa en cada actualización.
 * ══════════════════════════════════════════════════
 */

// ⚠️ ACTUALIZAR ESTA VERSIÓN CADA VEZ QUE CAMBIE EL JUEGO
// Debe coincidir con GAME_VERSION en version.js
const GAME_VERSION = '5.1.0';
const CACHE_NAME = 'macko-v' + GAME_VERSION;

const ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  `/app.js?v=${GAME_VERSION}`,
  '/styles.css',
  `/styles.css?v=${GAME_VERSION}`,
  '/version.js',
  `/version.js?v=${GAME_VERSION}`,
  '/audio.js',
  `/audio.js?v=${GAME_VERSION}`,
  '/dice-renderer.js',
  `/dice-renderer.js?v=${GAME_VERSION}`,

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

/* Instalar: preparar el cache nuevo sin borrar el de la versión activa. */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS).catch(() => {
        // Si algún asset falla (ej: fonts offline), seguir igual.
      });
    })
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
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
      data: {
        url: data.url || '/',
        action: data.action || null,
        roomId: data.roomId || null,
        roomCode: data.roomCode || null,
        inviteId: data.inviteId || null,
        fromId: data.fromId || null
      },
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
              timestamp: data.timestamp || Date.now(),
              action: data.action || null,
              roomId: data.roomId || null,
              roomCode: data.roomCode || null,
              inviteId: data.inviteId || null,
              fromId: data.fromId || null
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

/* ── Click en notificación: redirigir a la URL + pasar datos a la app ── */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const nd = event.notification.data || {};
  const requestedUrl = String(nd.url || '/');
  const url = requestedUrl.startsWith('/') && !requestedUrl.startsWith('//') ? requestedUrl : '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(location.host) && 'focus' in client) {
          client.focus();
          // Si la invitación tiene datos, avisar a la app
          if (nd.action === 'game_invite' && nd.roomId) {
            client.postMessage({
              type: 'INVITE_RECEIVED',
              roomId: nd.roomId,
              roomCode: nd.roomCode || '',
              inviteId: nd.inviteId || '',
              fromId: nd.fromId || ''
            });
          }
          if (url !== '/') client.navigate(url);
          return;
        }
      }
      if (clients.openWindow) {
        clients.openWindow(url).then(newWin => {
          // Si se abrió una nueva ventana y hay datos de invitación, esperar y postear
          if (newWin && nd.action === 'game_invite' && nd.roomId) {
            setTimeout(() => {
              try {
                newWin.postMessage({
                  type: 'INVITE_RECEIVED',
                  roomId: nd.roomId,
                  roomCode: nd.roomCode || '',
                  inviteId: nd.inviteId || '',
                  fromId: nd.fromId || ''
                });
              } catch(e) {}
            }, 2000);
          }
        });
      }
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
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.mjs')) {
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
           url.pathname.endsWith('.mp3') ||
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
