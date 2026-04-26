# Phase 4 — Data Integrity & Query Hygiene

> Audited: `.select('*')`, N+1 patterns, pagination caps, order determinism, index coverage, count(*) hot paths, multi-step writes, timezone hygiene.
> Scope: `app/**`, `components/**`, `lib/**` + cross-reference with `supabase/migrations/**`.

---

## Headline

Query hygiene is **mature**. No N+1 loops, no string-concatenated SQL, hot-path indexes are explicitly designed (`20260426010000_phase9_hot_path_indexes.sql`), all 7 `count: 'exact'` calls are admin-only on date-scoped or small tables. Two real findings: an **unbounded query on the growth table `location_pings`** (DATA-01), and a **multi-step delete loop on `campaign_locations`** that's not transactional (DATA-02). Three smaller hygiene items.

No P0/P1. **Two P2, three P3.**

---

## Findings table

| ID | Sev | Area | Summary | Files | Effort |
|---|---|---|---|---|---|
| DATA-01 | P2 | Pagination cap | `countMyPingsForDate()` in `lib/queries/location-pings.ts` filters by date but has no `.limit()`. As `location_pings` grows (Feature 5 GPS trail), a high-activity day could pull thousands of rows just to count them. | `lib/queries/location-pings.ts:40-44, 77-80` | XS |
| DATA-02 | P2 | Multi-step write atomicity | `app/[locale]/admin/campaigns/actions.ts` deletes `campaign_locations` rows one at a time in a loop. If one delete fails (FK conflict, RLS denial, network blip), the campaign is left half-reconfigured with no rollback. | `app/[locale]/admin/campaigns/actions.ts` (~L164-170) | S |
| DATA-03 | P3 | Order determinism | `lib/queries/assignments.ts:95` and `lib/queries/stock.ts:159` order by `full_name` with no tiebreaker. Pagination over equal names could shuffle rows on consecutive renders. Low impact today (lists are small) but worth a `.order('id')` tiebreaker for safety. | `lib/queries/{assignments,stock}.ts` | XS |
| DATA-04 | P3 | Timezone hygiene | `app/[locale]/promoter/dashboard/page.tsx:7` and `app/[locale]/supervisor/promoters/[id]/page.tsx:41` use `new Date().toISOString().slice(0, 10)` instead of `todayLocalDateString()` from `lib/attendance/shift-time.ts`. Today this works because Vercel runs UTC and Asia/Amman is UTC+3 (so the cutoff is 3 hours off, mostly harmless for "today's count" widgets), but it's a latent bug if the platform goes multi-region. | `app/[locale]/{promoter/dashboard,supervisor/promoters/[id]}/page.tsx` | XS |
| DATA-05 | P3 | Index opportunity | `location_pings` has no index on `captured_at`. Currently fine because `captured_at` queries also filter by `user_id` (which IS indexed), but if pings table grows past ~1M rows/month, a `(captured_at DESC)` or composite `(user_id, captured_at DESC)` index would help. | `supabase/migrations/20260430000000_feature5_location_pings.sql` (no change today; add when needed) | XS |

---

## Section A — `.select('*')` calls

**2 hits, both defensible.**

| File:Line | Where | Verdict |
|---|---|---|
| `lib/queries/stock.ts:56` | `stock_balances` view, single-campaign scope | OK — view has only the columns needed |
| `app/[locale]/promoter/stock/page.tsx:39` | `stock_balances` view, promoter dashboard widget | OK — same view |

A codebase this large with only 2 `select('*')` is a positive signal. The codebase pattern is to select explicit column lists (the `ATTENDANCE_COLS` constant in `lib/queries/attendance.ts` is a good example).

---

## Section B — N+1 patterns

**Zero found.** The dominant pattern is `Promise.all([...independent queries])` (e.g., dashboard, live page, exports). Where IDs need to be fanned out, the codebase consistently uses `.in('id', ids)` rather than per-ID loops.

This is genuinely good. A common smell pattern in Next.js codebases — `await Promise.all(items.map(async (i) => supabase.from(x).select().eq('id', i.id)))` — is absent.

---

## Section C — Pagination caps

**Most queries are bounded** (alerts: 200, attendance live: 100+, breaks: 50/100, exports: 100+, notifications: 30, supervisor_visits: 100, tasks: 100/200, reports: 100, performance: 60).

### DATA-01 — Unbounded growth-table query

**`lib/queries/location-pings.ts`** has two un-`.limit()`'d queries:

| Lines | Query | Concern |
|---|---|---|
| 40–44 | `select('*').eq('attendance_id', id).order('captured_at')` | Bounded by date+attendance, but a long shift with high ping density could be thousands of rows. |
| 77–80 | `select('id', { count: 'exact', head: true })` for "my pings today" | Counts all of today's pings for one user — acceptable now, but as the table grows, the COUNT(*) on a date+user_id slice becomes slow. |

**Fix (XS):** add `.limit(5000)` to both, document the assumption, fail loud if reached. Combined with DATA-05's index, this caps both runtime and worst-case latency.

---

## Section D — `.order()` determinism

**Most clauses are deterministic** (`created_at desc`, `check_in_time desc`, composite `attendance_date, check_in_time` — both unique-enough in practice).

### DATA-03 — Two non-deterministic orders

| File:Line | Order | Issue |
|---|---|---|
| `lib/queries/assignments.ts:95` | `full_name` only | Two assignees with the same name shuffle position |
| `lib/queries/stock.ts:159` | `full_name` only | Same |

Fix: append `.order('id', { ascending: true })` after the name. ~2 lines per call.

---

## Section E — Index coverage

The hot-path index migration (`20260426010000_phase9_hot_path_indexes.sql`) is **comprehensive**. Cross-checked filters in `lib/queries/**` against it:

| Cross-check | Result |
|---|---|
| `alerts` filter+sort by `(type, status, created_at)` | covered by `alerts_type_status_created_idx` ✅ |
| `attendance` live by `(campaign_id, location_id, attendance_date)` | covered by `attendance_campaign_location_date_idx` ✅ |
| `consumer_feedback` queue by `(campaign_id, location_id, created_at)` | covered ✅ |
| `stock_movements` audit by `(campaign_id, kind, created_at)` | covered ✅ |
| `break_requests` queue by `(location_id, status, created_at)` | covered ✅ |
| `audit_log` by `(entity, action, ts)` | covered ✅ |
| `performance_snapshots` by `(campaign_id, scope_kind, period_start)` | covered ✅ |
| `attendance` by `attendance_date + user_id` | covered by primary index ✅ |
| `location_pings` by `captured_at` range | **not covered** (DATA-05) |

Only one gap and it's not a problem yet — flagged for when the table grows.

---

## Section F — `count: 'exact'` hot-path scan

**7 sites.** All admin-only or self-scoped:

| Where | Filter | OK? |
|---|---|---|
| `app/[locale]/admin/dashboard/page.tsx:115` | `profiles` (role+active) | ✅ small table, admin |
| `app/[locale]/admin/dashboard/page.tsx:120, 133` | `attendance` (date) | ✅ date-scoped, admin |
| `app/[locale]/admin/dashboard/page.tsx:125, 138` | `supervisor_visits` (date) | ✅ date-scoped, admin |
| `app/[locale]/admin/dashboard/page.tsx:129` | `campaigns` (status) | ✅ small table, admin |
| `lib/queries/notifications.ts:41` | `notifications` per-user unread | ✅ self-scoped |

The dashboard hits I added in Phase 1–4 are admin-only and date-bounded — they were a deliberate trade-off (freshness over caching). `revalidate = 30` would cut DB load by ~95% if needed; deferred unless metrics show it as a problem.

---

## Section G — Multi-step writes

### DATA-02 — Non-atomic delete loop

**`app/[locale]/admin/campaigns/actions.ts`** (`setCampaignLocationsAction`, ~L164-170):

```ts
for (const locId of toRemove) {
  await admin
    .from('campaign_locations')
    .delete()
    .eq('campaign_id', campaignId)
    .eq('location_id', locId);
}
```

Each delete is its own statement; if the second fails (e.g., FK conflict because an `attendance` row still references the `(campaign_id, location_id)` pair, which IS the case per the schema's `attendance_campaign_location_fk`), the campaign is left with the first location removed and the second still attached.

**Fix (S):**
1. Single statement: `.in('location_id', toRemove)` — one round trip, atomic by Postgres semantics.
2. Same goes for the matching INSERT loop if it exists (haven't checked) — `.insert(toAdd.map(id => ({ campaign_id, location_id: id })))` is one round trip.

### Other multi-step writes

`lib/stock/actions-helper.ts` write+audit sequences are intentionally non-atomic: the audit-log insert is a fire-and-forget after the primary write. If the audit fails, the primary write isn't rolled back. This is a documented pattern (D-001) and is fine — losing an audit log entry is preferable to losing the underlying write.

`lib/notifications/actions.ts:24-29` mark-read sequence is single-table, RLS-guarded. Fine.

---

## Section H — Timezone hygiene

### Strong patterns

- **`lib/attendance/shift-time.ts`** centralizes the Asia/Amman offset (`SHIFT_TZ_OFFSET_MINUTES = 3 * 60`).
- **`todayLocalDateString()`** is the canonical "today" helper, used by `lib/queries/attendance.ts`, all check-in/check-out flows, and the new `app/[locale]/admin/dashboard/page.tsx`.
- All `submitted_at`, `created_at`, `visited_at`, `check_in_time` writes use `now()` server-side or `new Date().toISOString()` (UTC instant) — correct.
- `lib/breaks/actions.ts:130, 217, 240` write UTC instants (`new Date().toISOString()`) — correct.

### DATA-04 — Two naive `.toISOString().slice(0,10)` patterns

| File:Line | Use |
|---|---|
| `app/[locale]/promoter/dashboard/page.tsx:7` | "today" cutoff for the promoter's location-ping count widget |
| `app/[locale]/supervisor/promoters/[id]/page.tsx:41` | "today" cutoff in supervisor's per-promoter view |

Both compute "today" against the host's UTC clock. Vercel runs UTC. Asia/Amman is UTC+3. Result: between UTC midnight and UTC 03:00, the displayed "today" is one calendar day behind the user's local "today". For a count widget, this is mostly harmless — but the convention exists (`todayLocalDateString()`) and these two pages just don't use it.

Fix is one import + one call swap per file.

---

## Overall verdict

Data layer: **A−**. The big things are right — RLS-aware queries, deterministic orders (mostly), explicit hot-path indexes, no N+1 loops, no `select('*')` proliferation. The two P2 findings are isolated:
- DATA-01 is a "do this before location_pings actually grows" item; takes minutes.
- DATA-02 is a real correctness bug today (partial-failure window during campaign reconfigure) that's a small refactor.

The three P3s are tidiness items. Nothing here is urgent.

The dashboard count queries I added in Phase 1–4 are scoped correctly (admin-only, date-bounded). If load ever becomes a concern, `export const revalidate = 30` would cut the COUNT(*) traffic ~95% with one line. Not needed today.

---

## End of Phase 4.
