# Dashboard Visual QA — Findings

Read-only investigation of two issues seen on production at `/ar/admin/dashboard`.
No code or migrations changed.

---

## Issue 1 — Map tiles not loading (CSP block)

### Root cause

`middleware.ts:31` defines `img-src 'self' data: blob: https://*.supabase.co`.
OpenStreetMap raster tiles are served from `https://a.tile.openstreetmap.org`,
`https://b.tile.openstreetmap.org`, `https://c.tile.openstreetmap.org`, and
fall under the `img-src` directive. They are not in the allowlist, so the
browser blocks every tile request after the page renders.

What matches the symptom:

- The `<MapContainer>` div, the `<TileLayer>` element, the inline-SVG `DivIcon`
  marker, and Leaflet's `<a>` attribution all render — none of them require
  network fetches that CSP gates. (Leaflet attribution is built from inline
  HTML.)
- Only the `<img>` tile elements that Leaflet appends fail. Browser console
  would show `Refused to load the image '…tile.openstreetmap.org…' because
  it violates the following Content Security Policy directive: "img-src 'self'
  data: blob: https://*.supabase.co"`.

### Why `/admin/live` "appears to work"

`/admin/live` does **not** render a Leaflet map at all. The component at
`components/features/live/live-dashboard-client.tsx` renders only the KPI
strip, alerts feed, and a promoter table — no `<MapContainer>`. So there are
no tile requests on that page, hence no visible CSP failure. The dashboard
component (`components/features/admin/dashboard/live-checkins-map-impl.tsx:97`)
and the location-tracking trail map (`components/features/location-tracking/
ping-trail-map.tsx:76`) both use `https://{s}.tile.openstreetmap.org/...` and
are equally affected — anywhere a Leaflet tile renders in production, it will
be a gray void.

### Proposed fix (do not apply)

Add the OSM tile hosts to `img-src`. The tile subdomains `a/b/c.tile.
openstreetmap.org` are all covered by `*.tile.openstreetmap.org`. Patch
`middleware.ts:31`:

```diff
- `img-src 'self' data: blob: https://*.supabase.co`,
+ `img-src 'self' data: blob: https://*.supabase.co https://*.tile.openstreetmap.org https://*.openstreetmap.org`,
```

Notes:

- `connect-src` does **not** need updating: Leaflet uses plain `<img src=…>`
  for raster tiles, not `fetch()`/XHR.
- `*.openstreetmap.org` (the second host) is included so the attribution
  link's preconnect/favicon, if Leaflet ever requests it, is also allowed.
  Optional — `*.tile.openstreetmap.org` alone covers the actual tiles.
- No `default-src` change needed; `img-src` already overrides `default-src`
  for image requests.

A tighter alternative would be to enumerate `https://a.tile.openstreetmap.org
https://b.tile.openstreetmap.org https://c.tile.openstreetmap.org` instead
of the wildcard, if policy prefers explicit hosts.

---

## Issue 2 — Dashboard vs `/admin/live` data disagree

### Root cause

`/admin/live`'s data layer is silently broken. `lib/queries/attendance.ts:97`
defines `listLiveAttendanceJoined`, which both `/admin/live`, `/supervisor/
live`, and `/supervisor/attendance` rely on. Its select string is:

```ts
.from('attendance')
.select(
  `${ATTENDANCE_COLS},
   user:profiles ( full_name ),
   campaign:campaigns ( name_i18n ),
   location:locations ( name_i18n )`,
)
```

The `attendance` table has **two** foreign keys to `public.profiles`
(see `supabase/migrations/20260420000000_phase3_attendance.sql:36, 61`):

- `user_id → profiles(id)` (the promoter)
- `override_by → profiles(id)` (the supervisor who applied an override)

PostgREST cannot resolve `user:profiles ( … )` to a single FK and returns
embedding error PGRST201 ("Could not embed because more than one
relationship was found for 'attendance' and 'profiles'"). The function then
hits `if (error) return [];` (line 119) — no logging, silent empty array.

Result: `/admin/live` always renders with `rows = []`, so every counter is
zero (`active=0`, `late=0`, `missing_checkout=0`, `0/0` in the active panel).
This is not a "real-time race"; it has been broken since this query was
introduced. The reason nobody noticed is that "all zeros" looks like a quiet
day, not a bug.

### Why the dashboard shows different numbers

The dashboard's queries in `app/[locale]/admin/dashboard/page.tsx` are correct
and use the disambiguated form:

- Attendance KPI count (`attendanceTodayRes`, line 119) — **no join**, just
  `count: 'exact', head: true` over `attendance` filtered by today's date and
  `check_in_time IS NOT NULL`. Returns the real count = 1.
- Map points (line 142) — joins via `profiles!user_id` (line 145). ✅
- Activity feed attendance (line 152) — joins via `profiles!user_id`
  (line 155). ✅ This is why "أحمد الصمادي سجّل حضور" surfaces.

Both views are reading the same `attendance` table with the same
`attendance_date = today` filter (Asia/Amman, via
`todayLocalDateString()` at `lib/attendance/shift-time.ts:50`). The
discrepancy is **not** a timezone or filter mismatch; it is `/admin/live`
silently dropping every row to an unhandled embedding error.

The dashboard is right (1 check-in today). `/admin/live` is wrong (0).

### Proposed fix (do not apply)

Disambiguate the FK hint in `lib/queries/attendance.ts:108`:

```diff
     .from('attendance')
     .select(
       `${ATTENDANCE_COLS},
-       user:profiles ( full_name ),
+       user:profiles!user_id ( full_name ),
        campaign:campaigns ( name_i18n ),
        location:locations ( name_i18n )`,
     )
```

`campaigns` and `locations` each have only one FK from `attendance`, so they
do not need hints.

Secondary recommendation: replace the silent `if (error) return [];` with a
logger call so the next breakage is loud. Consider extending
`lib/observability/logger.ts` use here:

```diff
-  if (error) return [];
+  if (error) {
+    logger.error('listLiveAttendanceJoined failed', { error });
+    return [];
+  }
```

Same pattern applies to the other RLS-aware list queries in this file that
swallow errors.

---

## Issue 3 (mini-KPI label) — confirmed mislabeled

The card the user calls a "mini-KPI" is actually one of the four big cards
in `KpiGrid` (`components/features/admin/dashboard/kpi-grid.tsx:28`), not the
hero strip. The exact card:

| Locale | Label                  | Sub                              | Source query |
|--------|------------------------|----------------------------------|--------------|
| ar     | "المروّجون النشطون"     | "نشطون حالياً على المنصة"          | `profiles where role='promoter' AND active=true` (count) |
| en     | "Active promoters"     | "Currently active on the platform" | same |

Source: `app/[locale]/admin/dashboard/page.tsx:113` — counts rows in
`profiles` filtered by `role='promoter'` and `active=true`.

`profiles.active` is the **account-enabled flag** (set false when an admin
deactivates a user; opposite of soft-delete). It is *not* a session flag,
*not* "logged in right now", *not* "checked in today". A value of 14 means
"14 promoter accounts exist and have not been deactivated."

The English copy ("Currently active on the platform") and Arabic copy
("نشطون حالياً على المنصة" — literally "currently active on the platform")
both strongly imply real-time presence/sessions. **This is mislabeled.**
A user reading the dashboard would assume 14 promoters are online or have
checked in today, which contradicts the "1 check-in since midnight" card
sitting next to it.

### Proposed fix (do not apply)

Two options, in order of preference:

**Option A — fix the copy to match the data (smaller change, recommended):**

`messages/en.json:163-166` and `messages/ar.json:163-166`:

```diff
   "promoters": {
-    "label": "Active promoters",
-    "sub": "Currently active on the platform"
+    "label": "Enabled promoters",
+    "sub": "Promoter accounts not deactivated"
   },
```

```diff
   "promoters": {
-    "label": "المروّجون النشطون",
-    "sub": "نشطون حالياً على المنصة"
+    "label": "المروّجون المفعّلون",
+    "sub": "حسابات مروّجين غير معطّلة"
   },
```

**Option B — change the data to match the copy (larger change):**

If the product really wants "currently checked in" here, swap the query to
`attendance where attendance_date=today AND status IN ('checked_in','late')`,
similar to the `summary.active` computation in `live-dashboard-client.tsx:97`.
That makes the card a duplicate of the "Attendance today" card next to it,
so this is probably not what's wanted unless the four-card grid is also
restructured.

---

## Summary of files to touch (when fixes are applied)

| Issue | File | Change |
|---|---|---|
| 1 | `middleware.ts:31` | Append `https://*.tile.openstreetmap.org https://*.openstreetmap.org` to `img-src`. |
| 2 | `lib/queries/attendance.ts:108` | `user:profiles` → `user:profiles!user_id`. |
| 2 | `lib/queries/attendance.ts:119` | Add an error log instead of silent `return []`. |
| 3 | `messages/en.json:163-166`, `messages/ar.json:163-166` | Rewrite KPI copy to describe enabled-account count, not real-time presence. |

All changes are minimal and isolated — no schema or RLS changes required.
