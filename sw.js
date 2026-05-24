// NURA Service Worker — Realtime Database
const CACHE = 'nura-v10';
const SHELL = ['./', './index.html', './styles.css', './logo.png', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = e.request.url;
  // Firebase Realtime DB → siempre red
  if (url.includes('firebaseio.com') || url.includes('firebase') || url.includes('googleapis')) {
    e.respondWith(fetch(e.request).catch(()=>new Response('',{status:503})));
    return;
  }
  // CDN → red primero, caché fallback
  if (url.includes('cdn.jsdelivr.net') || url.includes('fonts.') || url.includes('cdnjs.')) {
    e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(CACHE).then(ca=>ca.put(e.request,c));return r;}).catch(()=>caches.match(e.request)));
    return;
  }
  // Archivos locales → caché primero
  e.respondWith(caches.match(e.request).then(cached=>{if(cached)return cached;return fetch(e.request).then(r=>{if(r&&r.status===200)caches.open(CACHE).then(c=>c.put(e.request,r.clone()));return r;}).catch(()=>caches.match('./index.html'));}));
});