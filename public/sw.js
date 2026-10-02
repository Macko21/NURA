// NURA Service Worker — Cache estático + Network-first para API
const CACHE = 'nura-v3';
const SHELL = [
  '/', '/index.html', '/manifest.json', '/logo.png',
  '/src/main.ts', '/src/styles.css'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;
  // Supabase API → siempre network (no cachear llamadas)
  if (url.includes('supabase.co') || url.includes('supabase')) {
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })));
    return;
  }
  // CDN fonts → network-first, fallback cache
  if (url.includes('fonts.') || url.includes('cdn.')) {
    e.respondWith(fetch(e.request).then((r) => {
      const c = r.clone();
      caches.open(CACHE).then((ca) => ca.put(e.request, c));
      return r;
    }).catch(() => caches.match(e.request)));
    return;
  }
  // Navegación → network-first, fallback index.html
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('/index.html')));
    return;
  }
  // Recursos estáticos → cache-first
  e.respondWith(caches.match(e.request).then((cached) => cached || fetch(e.request).then((r) => {
    if (r && r.status === 200) caches.open(CACHE).then((c) => c.put(e.request, r.clone()));
    return r;
  })));
});