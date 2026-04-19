// Hand-written minimal service worker — no Workbox / @serwist dependency.
// Phase 0 scope: install + activate lifecycle, network-first for navigations
// with an offline fallback, cache-first for same-origin static assets.
// The promoter offline write-queue (D-010) lands in Phase 4.

const VERSION = 'v1';
const STATIC_CACHE = `static-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first, fall back to cached offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(STATIC_CACHE);
        return (await cache.match(OFFLINE_URL)) || new Response('Offline', { status: 503 });
      }),
    );
    return;
  }

  // Static assets: cache-first, then populate runtime cache on miss.
  if (/\.(?:js|css|woff2?|png|jpg|jpeg|svg|webp|ico)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
            }
            return response;
          }),
      ),
    );
  }
});
