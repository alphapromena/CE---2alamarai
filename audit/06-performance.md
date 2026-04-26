# Phase 6 — Performance, Bundle, Runtime

> Audited: bundle sizes (post-`pnpm build`), per-route weight, force-dynamic vs cache strategy, useEffect patterns, Realtime subscription discipline, heavy synchronous work, image / media handling, service worker.

---

## Headline

Bundle and runtime are **healthy**. Build succeeds in ~10s, generates 143 static pages, and produces a **103 KB shared first-load** chunk — well under the typical 200 KB budget for a SaaS app. The heaviest routes (197 KB at `/admin/live`, `/supervisor/live`, `/client/live`; 196 KB at `/promoter/attendance`) are justified by Realtime subscriptions and geolocation/photo capture respectively. Realtime subscription discipline is exemplary (debounced via `useTransition()`, guaranteed cleanup, stable subscription specs). No perf antipatterns or render storms detected.

**One real finding** (PERF-01) on the service worker, plus three observability/cosmetic items.

---

## Findings table

| ID | Sev | Area | Summary | Files | Effort |
|---|---|---|---|---|---|
| PERF-01 | P3 | Service worker stale cache | `public/sw.js` uses a manually-versioned `RUNTIME_CACHE = 'runtime-v1'` with no TTL. If a user visits the PWA, then a deploy bumps assets, the user can serve stale JS indefinitely until `VERSION` is manually bumped. Mobile PWAs are most at risk. | `public/sw.js` | S |
| PERF-02 | P3 | Force-dynamic dashboard | `app/[locale]/admin/dashboard/page.tsx` is `force-dynamic` (11 COUNT queries per load). Acceptable today, but `revalidate = 30` would cut DB load ~95% and keep the dashboard fresh enough. Not urgent. | `app/[locale]/admin/dashboard/page.tsx:25` | XS |
| PERF-03 | P3 | Data-fetch-in-effect | `components/features/admin/assignment-form.tsx:81-104` fetches shifts client-side via useEffect when location changes. Pattern is safe (cancellable + microtask) but a server-rendered shifts list keyed on the location query param would be cleaner and avoid a network round-trip per change. | `components/features/admin/assignment-form.tsx` | M |
| PERF-04 | P3 | Build warnings | 4 unused `eslint-disable` comments in `lib/observability/{logger,report-client}.ts`. Same warnings as Phase 2; they're shown on every build. Trivial cleanup. | `lib/observability/{logger,report-client}.ts` | XS |

No P0/P1/P2.

---

## Section A — Bundle sizes from `pnpm build`

### Shared first-load (every page pays this)

```
First Load JS shared by all   103 kB
  chunks/8974-…js              46.1 kB
  chunks/b4d41804-…js          54.2 kB
  other shared chunks          2.57 kB

Middleware                     100 kB
```

**Verdict: green.** A SaaS app with React 19 + next-intl + Supabase + Tailwind landing at 103 KB shared is on the lean side.

### Heaviest 5 routes by first-load JS

| Route | Page-specific | First-load total | Why |
|---|---:|---:|---|
| `/admin/live`, `/supervisor/live`, `/client/live` | 143 B | **197 KB** | `LiveDashboardClient` (354 LOC) + `useRealtimeTables` + supabase realtime channel |
| `/promoter/attendance` | 9.79 KB | **196 KB** | Geolocation hook + photo capture + dynamically-imported image compression |
| `/supervisor/breaks`, `/supervisor/visits/new` | 4.02 KB / 4.7 KB | **191 KB** each | Realtime + photo capture |
| `/admin/imports/[target]` | 6.73 KB | 134 KB | Bulk-import client form + papaparse |
| `/admin/dashboard` | 4.22 KB | **123 KB** | Phase 1–4 work — Leaflet correctly dynamic-imported behind `next/dynamic({ ssr: false })`, so it does NOT add to first-load |

The dashboard is the cleanest of the five — confirms that the Leaflet split-file pattern from Phase 3 is paying off (197 KB at `/admin/live` vs 123 KB at `/admin/dashboard`, even though both render maps).

### Build details

- ✅ Compiled successfully in **10.2s**
- ✅ All 143 static pages generated (every locale × every route)
- ✅ 0 errors
- ⚠️ 4 warnings (the now-familiar unused-eslint-disables in `lib/observability/*` — PERF-04)

---

## Section B — Heavy client imports

Walked the import graphs of the five heaviest routes. **No bloat surprises.** Notes per route:

### `/admin/live` family (197 KB)

`app/[locale]/admin/live/page.tsx → components/features/live/live-dashboard-client.tsx`. Top deps:
1. `useRealtimeTables` (custom, ~2 KB) — subscribes to 4 tables
2. `lucide-react` (5 named icons; tree-shaken)
3. `next-intl` `useTranslations` (already in shared)
4. UI primitives (`Button`, `StatusPill`, `EmptyState`)
5. Local `formatTime` / `pickLocalizedName`

**Verdict ✅ justified.** Realtime channel is heavy by nature; everything else is lean.

### `/promoter/attendance` (196 KB)

Geolocation + photo capture + EXIF strip. Image compression is dynamically imported only on file selection. All correct.

### `/supervisor/breaks` (191 KB)

Realtime subscription on `break_requests` only. Nothing surprising.

### `/supervisor/visits/new` (191 KB)

Geolocation + photo capture, mirrors the promoter attendance flow.

### `/admin/dashboard` (123 KB)

Phase 1–4 work. Leaflet behind `next/dynamic({ ssr: false })`. Trend chart is pure SVG. Activity feed is server-rendered. Hero strip + KPI grid are server components.

---

## Section C — Cache strategy

### `force-dynamic` declarations

| File | Why | Could swap for revalidate? |
|---|---|---|
| `app/[locale]/admin/dashboard/page.tsx:25` | 11 COUNT queries per page load | **Yes** (PERF-02). `revalidate = 30` cuts DB load by ~95%, dashboard stays fresh enough. |

That's the only `force-dynamic` declaration in the codebase. Every other page uses Next.js defaults (static when possible, dynamic when cookies/headers are read).

### Static / SSG

143 pages were SSG-rendered at build time. The `●` mark in the build output indicates `generateStaticParams` did its job for both `en` and `ar` locales. ✅

### `revalidate` declarations

None found anywhere. The codebase is using "static OR force-dynamic" with no middle ground. Could be a missed opportunity for the dashboard (PERF-02) and possibly the live pages — but live pages need true freshness, so dynamic is correct.

---

## Section D — `useEffect` audit

8 `useEffect` instances spot-checked across client components. **All defensible.**

| File:line | What | Verdict |
|---|---|---|
| `live-dashboard-client.tsx:90-93` | Sets `channelStatus = 'live'` after 1.2s to avoid "connecting" flash | ✅ UX timing |
| `live-checkins-map-impl.tsx:41-43` | `FitBounds` calls `map.fitBounds()` on mount | ✅ Map lifecycle |
| `assignment-form.tsx:66-76` | Syncs `roleScope` to user role via microtask | ✅ Form state sync |
| `assignment-form.tsx:81-104` | Fetches shifts when location changes | ⚠️ PERF-03 — safe but could be server-side |
| `app-nav-mobile.tsx:57-69` | Esc key + body overflow lock | ✅ Event listener with cleanup |
| `app-nav.tsx:23-37` | Click-outside + Esc | ✅ Same |
| `idle-watcher.tsx:47-79` | Activity tracking + auto-logout (D-037) | ✅ Required pattern, proper ref usage to avoid re-renders |
| `notification-bell.tsx` (via `useRealtimeTables`) | Subscribe to user's notifications | ✅ Cleanup via hook |

**Zero missing-deps warnings**, no setState-in-render, no infinite-loop risk.

---

## Section E — Realtime subscription discipline

The `useRealtimeTables` hook in `lib/supabase/realtime.ts` is the central abstraction. Used in three places:

| Consumer | Tables | Cleanup | Debounce |
|---|---|---|---|
| `live-dashboard-client.tsx` | attendance, alerts, break_requests, kpi_snapshots | ✅ via hook unmount | ✅ `useTransition()` coalesces bursts |
| `supervisor-breaks-client.tsx` | break_requests | ✅ | ✅ |
| `notification-bell.tsx` | notifications (filtered by `user_id`) | ✅ | ✅ |

Hook implementation properties:
- One channel per mount, removed via `removeChannel()` on unmount
- Idempotent cleanup (safe under React 18 StrictMode)
- Subscription spec stabilized via `JSON.stringify(subs)` to prevent re-subscribe thrash
- `handlerRef` pattern lets consumers pass inline callbacks without breaking sub stability

**Verdict: exemplary.** I'd hold this up as a reference Realtime pattern for any Next.js + Supabase project.

---

## Section F — Heavy synchronous work in render

Spot-checked the 354-LOC `live-dashboard-client.tsx` (the biggest client component) and the dashboard / activity feed components I added in Phase 1–4:

- `live-dashboard-client.tsx:96-116` — summary computation memoized with `[rows, alerts]` deps ✅
- `live-dashboard-client.tsx:174` — `alerts.slice(0, 30)` after sort ✅ small subset
- Date parsing (`new Date(iso).toLocaleTimeString(...)`) appears inline in JSX in a few places (notification-bell, live-dashboard rows). Each call is one date — not in a list-map of hundreds. Acceptable.
- No JSON.parse of large strings in hot paths.

**No findings.**

---

## Section G — Image / media

| Pattern | Count | Verdict |
|---|---:|---|
| `<Image>` (next/image) | 1 (brand logo at `components/brand/perception-logo.tsx`) | ✅ correct for static asset |
| `<img>` | 6 (all for user-uploaded photos via signed Storage URLs or blob previews) | ✅ correct — `<Image>` doesn't work for dynamic Storage URLs without `remotePatterns` config, and blob URLs are explicitly client-side |

All `<img>` uses have `eslint-disable @next/next/no-img-element` with intent documented. No improper usage.

---

## Section H — Service worker (PERF-01)

`public/sw.js`:

- `STATIC_CACHE = 'static-v1'` — precaches `/offline.html` + `/manifest.json`. Versioned.
- `RUNTIME_CACHE = 'runtime-v1'` — cache-first for static assets on first fetch.
- Navigation requests use network-first with `/offline.html` fallback.
- Activate handler removes old caches whose name doesn't match the current `VERSION`.

### What's good

- Versioned caches with cleanup on activate.
- Navigation network-first prevents the worst staleness scenario (HTML always fresh).
- Offline fallback exists.

### What's risky

- **No TTL on runtime cache.** A user who visits once gets the runtime cache filled. If a deploy ships with new JS, the user gets stale assets from the runtime cache **until `VERSION` is manually bumped**. Desktop browsers update SW eagerly so this is mostly fine. Mobile PWAs (especially saved-to-home-screen) can serve stale JS for days.
- **VERSION is hand-maintained.** Easy to forget on a deploy.

### Suggested fixes (S effort)

1. **Auto-bump VERSION on build.** Inject the build commit SHA: `const VERSION = '<%= COMMIT_SHA %>';` via a build-time replacement (Next.js supports `process.env.NEXT_PUBLIC_BUILD_ID` or read from `.next/BUILD_ID`).
2. **Add a 7-day max-age check** in the runtime cache fetch handler. Tag each response with a timestamp; skip cache after N days.
3. **Or** switch to a stale-while-revalidate strategy for the runtime cache (always serve cached, refresh in background). Workbox provides this primitive; rolling your own is ~30 lines.

---

## Overall verdict

Performance: **A−**. The fundamentals are right — small shared bundle, justified per-route weights, Realtime properly debounced, no useEffect smells, no render-time heavy work, correct image handling, dashboard correctly defers Leaflet behind a dynamic boundary.

The one finding worth fixing (PERF-01) is the service worker staleness window. Low daily impact, high pain when it bites (a user complaining "your site is broken" while everyone else sees the fix). The fix is small and the build pipeline already has access to the commit SHA.

PERF-02 (revalidate the dashboard) is a "do this if metrics show DB load matters" item. Premature today.

PERF-03 and PERF-04 are cosmetic.

I haven't run Lighthouse / Core Web Vitals because I don't have a running browser. The bundle data + runtime audit suggest LCP / TBT / CLS are likely well within targets, but a real audit would need a deployed environment.

---

## End of Phase 6.
