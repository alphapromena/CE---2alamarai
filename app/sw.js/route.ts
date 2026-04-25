// PERF-01: serve the service worker through a route handler so its cache
// names can carry the build SHA. Each Vercel deploy gets a fresh
// VERCEL_GIT_COMMIT_SHA, the SW byte-changes, the browser detects an update
// on next navigation (per the SW spec — it byte-compares the response), the
// new SW activates, and the activate handler purges the old caches.
//
// Before this route existed, `public/sw.js` was a static file with
// `const VERSION = 'v1'` hand-coded. Mobile PWA users could serve stale JS
// for days after a deploy because nothing invalidated the runtime cache.
//
// Dev: VERCEL_GIT_COMMIT_SHA is unset, falls back to 'dev'. The SW only
// registers in production (see components/sw-register.tsx), so the dev
// version string is inert — but the route still serves so manual /sw.js
// fetches in dev work.

const VERSION =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev';

// The SW source is inlined as a template literal. Inner template literals
// that should be evaluated inside the SW (not at route-handler load time)
// have their `${...}` escaped as `\${...}`. Only the top `const VERSION = '${VERSION}'`
// substitutes the build SHA at route-handler load time.
const SW_SOURCE = `// Hand-written minimal service worker — no Workbox / @serwist dependency.
// Phase 0 scope: install + activate lifecycle, network-first for navigations
// with an offline fallback, cache-first for same-origin static assets.
// The promoter offline write-queue (D-010) lands in Phase 4.
//
// VERSION is injected by app/sw.js/route.ts at module-load time (PERF-01).
// Each Vercel deploy substitutes a new build SHA → new cache names → the
// activate handler purges the previous deploy's caches.

const VERSION = '${VERSION}';
const STATIC_CACHE = \`static-\${VERSION}\`;
const RUNTIME_CACHE = \`runtime-\${VERSION}\`;
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
  if (/\\.(?:js|css|woff2?|png|jpg|jpeg|svg|webp|ico)$/i.test(url.pathname)) {
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
`;

export async function GET(): Promise<Response> {
  return new Response(SW_SOURCE, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      // Allow the SW to control the entire origin scope, not just /sw.js.
      'Service-Worker-Allowed': '/',
      // Browsers re-validate the SW byte-by-byte on every navigation per the
      // SW spec, so caching the response is mostly moot — but `must-revalidate`
      // pins behavior for any intermediate CDN.
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}
