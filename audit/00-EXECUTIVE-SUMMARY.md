# Perception Platform — Quality Audit Executive Summary

> **Audit date:** 2026-04-25
> **Branch:** `main` @ `7fc49e7`
> **Scope:** ~46k LOC TypeScript/TSX, 46 SQL migrations, 10 Edge Functions, 28 vitest suites
> **Phases:** 7 read-only audit phases. Phase reports at `audit/01–07-*.md`. This document is the synthesis.

---

## 1. Headline

**The Perception platform is in unusually good shape for a codebase of this size and scope.** Security perimeter, RLS coverage, type discipline, i18n parity, RTL correctness, accessibility, query hygiene, bundle weight, and code consistency are all at the top end of what I'd expect from a mature Next.js + Supabase product. There are zero P0 findings, no production-breaking issues, and no urgent security exposure.

The single most consequential finding is **SEC-01** — `bulkImportAction` violates the documented D-044 pattern (uses the service-role admin client to UPDATE `profiles.created_by`, which the guard trigger rejects every time). Every bulk-imported user is reported as "partially failed" with `created_by=NULL` and `must_change_password` unset. Production-impacting today, fix is ~5 lines mirroring the already-shipped `inviteUserAction` correction.

Biggest **strategic** risk: the multi-tenant security posture rests on RLS policies that have **zero automated test coverage**. Today this is mitigated by careful policy review on every migration; it's a cost-of-failure problem (one bad policy leaks data across tenants and the test suite would not notice).

---

## 2. Severity-ranked findings table

23 total findings across 6 phases. Sorted P1 → P3.

| ID | Sev | Area | Summary | File(s) | Effort |
|---|---|---|---|---|---|
| SEC-01 | **P1** | Service role / D-044 | `bulkImportAction` UPDATEs `profiles` on the service-role client; guard trigger raises every time → bulk-imported users have `created_by=NULL`, `must_change_password=false`, and the action reports partial failure for every row. | `app/[locale]/admin/imports/actions.ts:140-143` | XS |
| SEC-02 | P2 | PostgREST filter injection | `.or()` filter interpolates user-supplied `path` without escaping; can be tricked into returning attacker's own row, bypassing the row-ownership check, then signing a URL for the original (attacker-supplied) path. Real bug; immediate exploit blocked by RLS preventing path discovery. | `app/api/attendance/photo-url/route.ts:34` | XS |
| SEC-03 | P2 | Audit signal | Admin server actions return `{ error: 'unknown' }` on RLS denial / DB error without logging. Probing attempts leave no trail. | All `app/**/actions.ts` (~25 sites) | M |
| TS-01 | P2 | Type assertions | `as unknown as RawX[]` double-casts on Supabase responses (12 sites) hide types at the data boundary. | `app/[locale]/admin/dashboard/page.tsx`, `lib/exports/assemble.ts`, `lib/queries/{attendance,breaks}.ts`, etc. | M (or one PR via `supabase gen types`) |
| TS-02 | P2 | Error observability | 17 `if (error) return []` patterns in `lib/queries/**` swallow DB errors without logging. UI shows empty state indistinguishably from real emptiness. | `lib/queries/{attendance,alerts,breaks,notifications,supervisor-visits,supervisor-scope}.ts` | S |
| TS-03 | P2 | API contract | 12 `getX(id) → T \| null` helpers conflate "not found" with "DB error" (use `.single()` which errors on zero rows). Switching to `.maybeSingle()` separates the cases cleanly. | `lib/queries/{assignments,campaigns,clients,locations,regions,shifts,reports,stock,exports,client-campaigns,cities}.ts` | M |
| TS-04 | P2 | i18n / UX | (Downgraded after Phase 5) Server actions return raw English error codes; client maps them via `messages/*.json` by convention. Works today but not typesafe — a typed `<ActionError code={code} />` component would harden it. | All `app/**/actions.ts` consumers | M |
| DATA-01 | P2 | Pagination cap | `countMyPingsForDate()` in `lib/queries/location-pings.ts` has no `.limit()` cap. Will degrade as `location_pings` grows. | `lib/queries/location-pings.ts:40-44, 77-80` | XS |
| DATA-02 | P2 | Atomicity | `setCampaignLocationsAction` deletes `campaign_locations` rows in a per-row loop; if one fails the campaign is left half-reconfigured. Single `.in('location_id', toRemove)` call would fix it. | `app/[locale]/admin/campaigns/actions.ts` (~L164-170) | S |
| QUAL-01 | P2 | Tests — RLS | Zero tests verify RLS policy behavior. Single regression in a USING/WITH CHECK clause would leak data across tenants invisibly. | (test addition needed; pgTAP under `supabase/tests/`) | L |
| QUAL-02 | P2 | Tests — server actions | Only 1 of ~30 server actions has a test. Critical flows like login, invite, bulk import, report submit, stock allocate are untested. | (test additions; vitest + mocked Supabase) | L |
| QUAL-03 | P2 | Tests — E2E | No browser-driven test exists. Real Realtime + RLS + auth only behave correctly in integration. | (Playwright; new dep) | L |
| TS-05 | P3 | Type assertions | `skuId!` / `promoterId!` after `string.split('::')` without length guard. | `app/[locale]/supervisor/stock/actions.ts:311-312` | XS |
| TS-06 | P3 | Type assertions | `res.status!` on optional field; should refine return type. | `components/features/supervisor/reconcile-button.tsx:40` | XS |
| TS-07 | P3 | Type assertions | `as unknown as Record<string, unknown>` for an `Error` object in the logger. | `lib/observability/logger.ts:63` | XS |
| TS-08 | P3 | Control-flow | `loginAction` redirects on success but returns `{error}` on failure — implicit `undefined` return on success path is a minor confusion. | `app/[locale]/(auth)/login/actions.ts:13` | XS |
| SEC-04 | P3 | CSP | `script-src 'unsafe-inline'` retained as Next.js 15 streaming workaround. Per-request nonces are the modern alternative. | `middleware.ts` | L |
| SEC-05 | P3 | Logging consistency | `report-client.ts` uses `console.error` directly rather than the structured logger. | `lib/observability/report-client.ts:23` | XS |
| SEC-06 | P3 | RLS recursion watch | `competitor_mentions` policies use a single-level subquery to `consumer_feedback`. Safe today; worth a comment in the migration warning future authors not to go two levels. | `supabase/migrations/20260425010000_phase8_consumer_feedback.sql` | XS |
| DATA-03 | P3 | Order determinism | Two queries order by `full_name` with no tiebreaker. | `lib/queries/{assignments,stock}.ts` | XS |
| DATA-04 | P3 | Timezone hygiene | Two pages use `new Date().toISOString().slice(0,10)` instead of `todayLocalDateString()`. | `app/[locale]/{promoter/dashboard,supervisor/promoters/[id]}/page.tsx` | XS |
| DATA-05 | P3 | Index opportunity | `location_pings` lacks an index on `captured_at`. Add when the table grows past ~1M rows/month. | `supabase/migrations/20260430000000_feature5_location_pings.sql` | XS |
| I18N-01 | P3 | ICU plural mismatch | `Admin.dashboard.trend.summary` — EN uses ICU plurals; AR is a flat string and ignores Arabic's six plural categories. (Self-introduced in Phase 4.) | `messages/ar.json` | XS |
| PERF-01 | P3 | Service worker stale cache | `RUNTIME_CACHE = 'runtime-v1'` is hand-versioned with no TTL. Mobile PWA users may serve stale JS until VERSION is bumped. | `public/sw.js` | S |
| PERF-02 | P3 | Force-dynamic dashboard | Dashboard is `force-dynamic`; could use `revalidate = 30` to cut DB load ~95% with negligible freshness loss. Not urgent. | `app/[locale]/admin/dashboard/page.tsx:25` | XS |
| PERF-03 | P3 | Data-fetch-in-effect | `assignment-form.tsx` fetches shifts client-side via useEffect when location changes. Safe but a server-side pattern would be cleaner. | `components/features/admin/assignment-form.tsx` | M |
| PERF-04 | P3 | Pre-existing build warnings | 4 unused `eslint-disable` comments in `lib/observability/{logger,report-client}.ts`. Same finding flagged by Phase 2 / 6 / 7. | `lib/observability/{logger,report-client}.ts` | XS |
| QUAL-04 | P3 | DECISIONS.md | The `as unknown as` Supabase-cast pattern is repeated 12 times without a documented decision. | `DECISIONS.md` | XS (write D-NNN) or M (fix pattern) |
| QUAL-05 | P3 | Helper consolidation | `pickLocalized` duplicated inline in 4 places; should live at `lib/i18n/picker.ts`. | (new file + 4 callers) | XS |

**Effort scale:** XS ≤ 30 min · S ≤ 2h · M ≤ 1 day · L ≤ 1 week · XL > 1 week.

---

## 3. Top 5 risks

### Risk 1 — `bulkImportAction` is silently degraded in production (SEC-01)
The bulk-promoter-import flow appears to "work" — the auth user is created, a profile is materialized by the `handle_new_user` trigger — but the post-create UPDATE to set `created_by` and `must_change_password` is rejected by the `profiles_self_update_guard_trg` because `auth.uid()` is NULL on the service-role client. Every bulk-imported user shows up as "created but profile update failed", `created_by` is NULL (audit trail lost), and they aren't forced to rotate the temp password. The fix is the same shape as the already-shipped `inviteUserAction` correction (commit `1520347`): swap `createAdminSupabase()` for `createServerSupabase()` for the UPDATE. **Recommended: fix this week. ~10 minutes of work.**

### Risk 2 — RLS regressions are invisible to the test suite (QUAL-01)
The platform's multi-tenant security relies on RLS policies. Today nothing automatic verifies that policies behave correctly across tenants. A single mistake in a USING/WITH CHECK clause — even from a benign refactor — would leak data and ship through CI. The current mitigation is careful manual review on every migration. **Recommended: invest ~6 hours building a pgTAP (or Supabase test-client) suite covering at minimum `attendance`, `daily_reports`, `stock_movements`, `notifications` cross-tenant access. This is the highest-ROI test addition the codebase could make.**

### Risk 3 — Error observability gap (SEC-03 + TS-02)
Failures in DB calls — RLS denials, FK violations, network blips — surface to the user as `{ error: 'unknown' }` and to the operator as **nothing**. No log entry, no audit trail, no Sentry event. Users see "something went wrong" and developers can't reproduce. This is a classic "you only notice when you really need to debug" problem. **Recommended: a single sweep PR adding `logError(...)` to every `if (error) return { error: 'unknown' }` branch in admin/supervisor/promoter actions and to every `if (error) return []` in `lib/queries/**`. ~4 hours, mechanical.**

### Risk 4 — Type-safety smell at the data boundary (TS-01 + QUAL-04)
Twelve `as unknown as RawX[]` casts in Supabase response handling. Each is a place where the inferred type is `unknown` (because the embed select isn't typed), and the author projects it onto a local `Raw` type via the unknown bridge. Today this is "works fine, looks gross". The structural fix is to run `supabase gen types typescript` and pass the typed `Database` generic to `createServerClient<Database>()` — eliminates all 12 casts in one PR. **Recommended: fix structurally. ~1 day including regen wiring + verification. Promote it to D-NNN.**

### Risk 5 — Service worker staleness on mobile PWA (PERF-01)
`public/sw.js` versions caches manually via `VERSION = 'v1'`. Mobile users who saved the app to their home screen can serve stale JS for days after a deploy until VERSION is bumped — and there's nothing forcing the bump. Desktop browsers eagerly update SW so they're mostly fine. **Recommended: inject the build commit SHA as VERSION (Next.js exposes `process.env.NEXT_PUBLIC_BUILD_ID`), or add a 7-day TTL to the runtime cache. ~2 hours.**

---

## 4. Top 5 quick wins (afternoon's work, total ~2 hours)

These are P3 items that are trivial individually and produce visible improvements when bundled:

1. **Remove the 4 unused `eslint-disable` comments** in `lib/observability/{logger,report-client}.ts` (PERF-04 / QUAL-06). Drops the project's only persistent build warnings to zero. **5 minutes.**
2. **Promote `pickLocalized` to `lib/i18n/picker.ts`** and update 4 callers (QUAL-05). Removes the only real duplication finding. **20 minutes.**
3. **Fix the AR ICU plural in `Admin.dashboard.trend.summary`** (I18N-01). Self-introduced in Phase 4; full ICU form provided in `audit/05-i18n-a11y.md`. **15 minutes.**
4. **Replace `.toISOString().slice(0,10)` with `todayLocalDateString()`** in 2 files (DATA-04). Closes a latent multi-region TZ bug with two import + two call swaps. **15 minutes.**
5. **Validate `path` format in `attendance/photo-url`** (SEC-02). One regex check `if (!/^[a-zA-Z0-9_./-]+$/.test(path)) return 400`. Closes the `.or()` injection. **10 minutes.**

Doing all five in one afternoon: a clean build with zero warnings, one structural duplication removed, one i18n correctness bug fixed, one latent TZ bug fixed, and a real (if low-impact) injection closed. ~75 minutes of focused work; I'd take it on a Friday afternoon.

---

## 5. Strategic recommendations

### S1 — Test investment plan (next 1–2 sprints)
The codebase has 28 high-quality unit tests on pure functions and zero on integration / RLS / E2E. The right next batch is the 8-test plan in `audit/07-quality.md`:
- 4 server-action tests (login, password reset, stock actions, report submit/approve)
- 1 RLS suite covering the 4 highest-stakes tables (~6h with pgTAP)
- 1 bulk-import action test (would catch SEC-01 if we'd had it)
- 1 Playwright E2E (promoter check-in → live dashboard)
- 1 notification-dispatch test

Total ~37h. Closes ~70% of regression vectors. Highest-ROI test investment available.

### S2 — Adopt `supabase gen types` (next sprint)
Eliminates the `as unknown as RawX[]` smell across 12 sites in one PR. Wiring is ~1 day including the typed factory swap, type regen pipeline (could even be a CI step), and verification. Remove the temptation to ship more `as unknown as` going forward.

### S3 — Build observability sweep (single PR)
Combine TS-02 + SEC-03: add `logError(...)` to every silent-fail branch in `lib/queries/**` and every `if (error) return { error: 'unknown' }` in `app/**/actions.ts`. Mechanical change, big debuggability payoff. ~4h. Pair with introducing a small `failed<E>(code: string, error: PostgrestError)` helper in `lib/observability/` that does the standard log + return shape.

### S4 — D-NNN for the supabase-cast pattern (today)
Whether or not the team adopts `supabase gen types` immediately, write a one-paragraph DECISIONS entry documenting "we accept `as unknown as Raw[]` for embed selects until we adopt typed Database generic" with a revisit-when. Stops the pattern from spreading without a documented trade-off.

### S5 — Service worker / PWA hardening
PERF-01 plus a one-time review of the SW logic. Wire `VERSION` to the build SHA, document the cache strategy, add a TTL on the runtime cache. Also confirm: does the SW interfere with the temp-password redirect flow? (Likely fine since the SW uses network-first for navigations, but worth verifying.) ~half a day.

---

## 6. What's working well

Code review is unbalanced if it only flags problems. These are areas where the team has clearly invested and the discipline shows:

### Security perimeter
- 100% of server actions guard role + validate with Zod
- Service-role import gated by `'server-only'`; never reaches a `'use client'` file
- All public tables have RLS enabled; no `using (true)`, no naked-`authenticated`
- Storage buckets all private; service-role signed URLs only
- No hardcoded secrets, no `dangerouslySetInnerHTML`, no string-concatenated SQL
- Logger has automatic redaction for `service_role_key` and other sensitive keys
- CSP, HSTS, X-Frame-Options, COOP/CORP, Permissions-Policy all set tightly
- The auth-helper layer (`requireAdmin`, `requireRole`, `requireSessionProfile`) checks role exhaustively, blocks inactive users at both RLS and app layer, force-redirects must-change-password users

### RTL and i18n
- **Zero physical Tailwind classes** in shipping code. No `pl-`, `pr-`, `ml-`, `mr-`, `text-left`, `text-right`, `border-l-`, `rounded-tl-`. The codebase uses logical equivalents uniformly. This is **rare** even in projects that claim RTL support.
- **100% en/ar key parity** across 1,311 keys. Zero missing translations.
- All UI strings flow through `useTranslations()` / `getTranslations()`. No hardcoded English in JSX.
- 31 of 32 plural keys use full ICU form in both languages (one exception: I18N-01, which I introduced in Phase 4).

### Type discipline
- 1 `as any` in 46k LOC (defensible — supabase realtime workaround)
- 0 `@ts-ignore`, 0 `@ts-expect-error`
- 0 silent `catch (err) {}` swallows
- All 31 `.maybeSingle()` calls handle the null path
- 21 of 23 `.single()` calls have the standard `if (error || !data) return { error }` guard

### Realtime + Performance
- Custom `useRealtimeTables` hook with idempotent cleanup, debounced via `useTransition()`, stable subscription specs. I'd hold this up as a reference implementation for any Next.js + Supabase Realtime app.
- Bundle: 103 KB shared first-load. 143 SSG pages. Build in 10s.
- Dashboard correctly defers Leaflet behind `next/dynamic({ ssr: false })`, keeping the first-load to 123 KB.

### Architecture and documentation
- DECISIONS.md is a living document with 45 entries, each with rationale + alternatives + revisit conditions. Code adheres to every decision I spot-checked (with one exception: SEC-01 / D-044 in `bulkImportAction`).
- README onboards a new developer in under 15 minutes.
- 0 TODO / FIXME / HACK comments anywhere in the codebase.
- `lib/auth/`, `lib/supabase/`, `lib/queries/` boundaries are clean and consistent.
- Mirror modules between Next (`lib/{kpis,stock/ledger,alerts/detect,attendance/shift-time}`) and Edge Functions (`supabase/functions/_shared/`) are the documented single-source pattern (D-020) and stay in sync.

### Existing test quality
The 28 vitest suites that exist are **high quality**. Spec-grounded scenarios (Almarai yoghurt for stock, Almarai Safeway Jubeiha for KPIs, Case-3 Shini for alerts), explicit edge-case coverage (zero, NaN, boundary values, null inputs), specific structural assertions. The team clearly knows how to write good tests when they decide to. The gap is breadth, not depth.

---

## 7. Recommended sequencing

### This week (≤1 day total)
1. **SEC-01** — fix `bulkImportAction` D-044 violation. ~10 min.
2. **SEC-02** — add path regex validation to `attendance/photo-url`. ~10 min.
3. **Quick-wins bundle** (5 items above). ~75 min.
4. **SEC-03 + TS-02** — observability sweep. ~4h.

### This sprint
5. **TS-01** — adopt `supabase gen types`, eliminate the 12 `as unknown as` casts in one PR. ~1 day.
6. **PERF-01** — service worker version bump + TTL. ~2h.
7. **DATA-02** — campaign_locations atomic delete. ~30 min.
8. **DATA-01** — location_pings limit cap. ~15 min.

### Next sprint
9. **QUAL-01 / QUAL-02 / QUAL-03** — the 8-test plan from `audit/07-quality.md`. ~37h split across whoever owns each domain.

### Parking lot
- TS-04 (typed `<ActionError>` component) — desirable, not urgent.
- SEC-04 (CSP nonces) — significant effort, marginal benefit on top of what's already there.
- PERF-02 (revalidate dashboard) — only if metrics show DB load matters.

---

## 8. Audit deliverables index

All seven phase reports are at the repo root in `audit/`:

| File | Topic |
|---|---|
| `audit/00-EXECUTIVE-SUMMARY.md` | this document |
| `audit/01-inventory.md` | repository inventory (LOC, routes, migrations, Edge Functions, RLS, SECURITY DEFINER fns) |
| `audit/02-type-safety.md` | TypeScript escape hatches + Supabase null/error handling + error propagation |
| `audit/03-security.md` | auth/RBAC, RLS coverage, service-role usage, input validation, secrets, XSS / injection, middleware / CSP |
| `audit/04-data-integrity.md` | query hygiene, indexes, pagination, atomicity, timezone |
| `audit/05-i18n-a11y.md` | en/ar parity, ICU plurals, RTL classes, accessibility |
| `audit/06-performance.md` | bundle, cache strategy, useEffect, Realtime, service worker |
| `audit/07-quality.md` | style, dead code, duplication, comments, README, DECISIONS drift, tests |

---

## End of executive summary.

No code changes were made during the audit. Awaiting triage decisions on which findings to act on.
