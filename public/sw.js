// Hand-written service worker — no Workbox / @serwist dep (D-032 posture, D-038).
//
// Strategies
//   - Navigations (request.mode === 'navigate')
//         → network-first; fall back to the locale-aware offline page
//           (/ar/offline or /en/offline), precached at install.
//   - Same-origin GET under /api/  → network-first with a 3s soft timeout,
//           RUNTIME_CACHE fallback; non-GET never cached (offline queue owns writes).
//   - Static assets (js/css/woff2/png/jpg/svg/ico/webp)
//         → stale-while-revalidate: serve cached, revalidate in background.
//   - Cross-origin                  → pass-through (browser default fetch).
//
// Caches are versioned under a single `ce-v2-` prefix; any cache not matching
// that prefix is purged on `activate`. Bumping VERSION is the supported way to
// invalidate everything.

const VERSION = 'ce-v2';
const SHELL_CACHE = `${VERSION}-shell`;
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

const OFFLINE_URLS = ['/ar/offline', '/en/offline'];
const PRECACHE = [
  ...OFFLINE_URLS,
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

const API_TIMEOUT_MS = 3000;
const STATIC_ASSET_RE = /\.(?:js|css|woff2?|png|jpg|jpeg|svg|webp|ico|gif|avif)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Best-effort: a 404 on any one URL shouldn't abort the install.
      await Promise.allSettled(PRECACHE.map((url) => cache.add(url)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => !key.startsWith(`${VERSION}-`)).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

// Driven by ServiceWorkerRegister when the user taps the "new version" toast.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function offlineFallback(url) {
  const seg = url.pathname.split('/')[1];
  const locale = seg === 'ar' ? 'ar' : 'en';
  return caches.match(`/${locale}/offline`);
}

function networkFirstWithTimeout(request, cacheName, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(async () => {
      if (settled) return;
      settled = true;
      const cached = await caches.match(request);
      resolve(cached || fetch(request));
    }, timeoutMs);
    fetch(request)
      .then(async (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (response && response.ok) {
          const cache = await caches.open(cacheName);
          cache.put(request, response.clone()).catch(() => {});
        }
        resolve(response);
      })
      .catch(async () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const cached = await caches.match(request);
        resolve(cached || Response.error());
      });
  });
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
      return response;
    })
    .catch(() => cached);
  return cached || fetchPromise;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first, fall back to bilingual offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response && response.ok) {
            const cache = await caches.open(SHELL_CACHE);
            cache.put(request, response.clone()).catch(() => {});
          }
          return response;
        } catch {
          const fallback = await offlineFallback(url);
          return fallback || new Response('Offline', { status: 503 });
        }
      })(),
    );
    return;
  }

  // Same-origin /api GETs: network-first with timeout, runtime-cache fallback.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstWithTimeout(request, RUNTIME_CACHE, API_TIMEOUT_MS));
    return;
  }

  // Static assets: stale-while-revalidate.
  if (STATIC_ASSET_RE.test(url.pathname) || url.pathname.startsWith('/_next/static/')) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
  }
});
