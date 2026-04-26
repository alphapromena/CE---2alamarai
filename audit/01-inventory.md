# Phase 1 — Repository Inventory

> Source-of-truth snapshot. Pure data, no commentary. Feeds Phases 2–7.
> Captured: 2026-04-25 against branch `main` @ HEAD `7fc49e7`.

---

## 1. Line counts by file type

Excludes `node_modules`, `.next`, `.git`, `audit/`.

| Extension | Files | LOC |
|---|---:|---:|
| `.ts` | 190 | 27,214 |
| `.tsx` | 193 | 18,826 |
| `.sql` | 55 | 8,454 |
| `.md` | 20 | 4,038 |
| `.json` | 20 | 3,654 |
| `.css` | 1 | 245 |
| `.mjs` | 2 | 57 |
| `.js` | 2 | 71 |

**Application code total**: ~46,000 LOC TS/TSX. SQL adds ~8,500. Docs (`md`) ~4,000.
55 `.sql` files = 46 migrations + remainder split between `supabase/seeds/` and `supabase/tests/`.

---

## 2. Top 20 largest source files (LOC, source code only)

Excludes `messages/*.json`. Includes `app/`, `components/`, `lib/`, `supabase/migrations/`, `supabase/functions/`.

| # | LOC | Path | Purpose |
|--:|--:|---|---|
| 1 | 731 | `lib/stock/ledger.test.ts` | Vitest — stock ledger reconciliation (server + client mirrors) |
| 2 | 707 | `lib/exports/builders.ts` | Export query builders (filters, scoping, aggregations) |
| 3 | 646 | `supabase/functions/stock-reconcile/index.ts` | Stock reconciliation + alert detection (targeted + sweep) |
| 4 | 608 | `lib/exports/builders.test.ts` | Vitest — export query builders |
| 5 | 579 | `lib/stock/ledger.ts` | Ledger reduction, balance, low-stock detection |
| 6 | 520 | `lib/exports/assemble.ts` | Export data assembly across attendance/reports/stock/visits |
| 7 | 439 | `supabase/functions/compute-kpis/index.ts` | KPI + performance snapshot computation |
| 8 | 407 | `supabase/functions/detect-live-issues/index.ts` | Low-performance + no-activity alert sweep |
| 9 | 387 | `lib/stock/actions-helper.ts` | Server Action helpers for stock movements |
| 10 | 363 | `supabase/functions/geo-validate-checkin/index.ts` | Geofence + selfie validation for check-in |
| 11 | 354 | `components/features/live/live-dashboard-client.tsx` | Live dashboard UI (Realtime + KPI display) |
| 12 | 340 | `lib/storage/exif.ts` | JPEG EXIF parse / strip / GPS extract |
| 13 | 313 | `lib/alerts/spec-cases.test.ts` | Vitest — alert triggering specs |
| 14 | 311 | `supabase/functions/geo-validate-checkout/index.ts` | Geofence + selfie validation for check-out |
| 15 | 309 | `lib/offline/queue.test.ts` | Vitest — offline-first queue |
| 16 | 297 | `lib/kpis/compute.test.ts` | Vitest — KPI computation (mirrors Edge Function) |
| 17 | 292 | `lib/queries/attendance.ts` | Attendance Supabase query helpers |
| 18 | 288 | `lib/alerts/detect.test.ts` | Vitest — alert detection |
| 19 | 282 | `lib/offline/queue.ts` | Offline-first sync queue (IndexedDB) |
| 20 | 280 | `supabase/functions/supervisor-visit-create/index.ts` | Supervisor visit logging Edge Function |

Observation for downstream phases: **6 of the top 20 are test files (#1, #4, #13, #15, #16, #18)** and another 7 are Edge Functions / shared business logic. The largest pure-React file (#11) is `live-dashboard-client.tsx` at 354 LOC — well within healthy range.

---

## 3. Folder structure (annotated)

- **`app/`** — Next.js 15 App Router
  - **`app/[locale]/`** — locale-prefixed routes (en/ar)
    - **`(auth)/`** — login, password reset, set password (route group)
    - **`auth/`** — `callback`, `confirm` route handlers (PKCE / token-hash)
    - **`admin/`** — admin panel (~40 pages)
    - **`supervisor/`** — supervisor panel (~22 pages)
    - **`promoter/`** — promoter panel (~10 pages)
    - **`client/`** — client tenant panel (~7 pages)
    - **`hello/`**, **`privacy/`** — public marketing/legal
  - **`app/api/`** — REST handlers for photo URL signing, uploads, location-trust check, admin shifts lookup
  - **`app/fonts/`** — `@next/font` setup
- **`components/`** — React component library
  - **`components/ui/`** — bespoke primitives (`button`, `dialog`, `table`, `status-pill`, `empty-state`, `skeleton`, `live-indicator`, `alert`, `i18n-field`, `datepicker`, etc. — NOT shadcn)
  - **`components/brand/`** — logo, brand wordmark
  - **`components/features/`** — feature-scoped UI (admin, alerts, app shell, auth, exports, feedback, live dashboard, location-tracking, notifications, performance, promoter, reports, stock, supervisor, visit form)
- **`lib/`** — backend & business logic
  - **`lib/queries/`** — typed Supabase query helpers per domain (attendance, stock, campaigns, performance, alerts, …)
  - **`lib/auth/`** — `guards.ts`, `roles.ts`, `session.ts`, `users-query.ts`
  - **`lib/supabase/`** — `server.ts` (SSR client), `admin.ts` (service role), `browser.ts`, `realtime.ts`, `env.ts`
  - **`lib/alerts/`** — `detect.ts` + spec-driven tests (mirrors Edge Function logic)
  - **`lib/stock/`** — `ledger.ts`, `actions-helper.ts` + tests
  - **`lib/exports/`** — `builders.ts`, `assemble.ts`, `xlsx.ts`, `actions.ts` + tests
  - **`lib/kpis/`** — `compute.ts` (mirrors `compute-kpis` Edge Function math) + tests
  - **`lib/performance/`** — performance rollups
  - **`lib/attendance/`** — `shift-time.ts` (Asia/Amman helper)
  - **`lib/offline/`** — IndexedDB-backed sync queue + tests
  - **`lib/storage/`** — EXIF parse / strip
  - **`lib/validations/`** — Zod schemas
  - **`lib/observability/`** — logger, client-side error reporter
  - **`lib/rate-limit/`**, `lib/geo/`, `lib/breaks/`, `lib/feedback/`, `lib/email/`, `lib/imports/`, `lib/notifications/`, `lib/test-utils/`, `lib/utils.ts` — domain-scoped helpers
- **`supabase/`**
  - **`supabase/migrations/`** — 46 SQL migrations (Phase 1 → Phase 10 + features)
  - **`supabase/functions/`** — 10 Deno Edge Functions + `_shared/` (~3.3k LOC of shared modules)
  - **`supabase/seeds/`** — local-dev seed data
  - **`supabase/tests/`** — pgTAP-style query tests (extension to verify)
- **`messages/`** — `en.json` (~1,300 lines) + `ar.json` (~1,300 lines)
- **`i18n/`** — `routing.ts`, `navigation.ts`, `request.ts` (next-intl wiring)
- **`public/`** — favicons, PWA manifest, offline fallback, `sw.js`
- **`types/`** — ambient `.d.ts` for Tailwind logical-property utilities
- **`audit/`** — this report (untracked)
- **`.claude/`** — workspace skills + memory
- **`DECISIONS.md`** — 45 architectural decisions
- **`PLAN.md`** — phase plan
- Standard config files: `next.config.mjs`, `tailwind.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`, `package.json`, `pnpm-lock.yaml`, `middleware.ts`

---

## 4. Routes inventory

> Counts: **~106 page.tsx**, **9 route handlers** (6 in `/api`, 2 in `/auth`, 1 admin template download), **8 layouts**, **6 error boundaries**, **6 loading states**, **1 middleware**.

### 4a. Public + auth

| Route | File | Type | Guard | Component |
|---|---|---|---|---|
| `/` | `app/[locale]/page.tsx` | page | `getSessionProfile` (redirect by role) | async server |
| `/hello` | `app/[locale]/hello/page.tsx` | page | none | async server |
| `/privacy/location-tracking` | `app/[locale]/privacy/location-tracking/page.tsx` | page | none | async server |
| `/login` | `app/[locale]/(auth)/login/page.tsx` | page | redirects if logged in | async server |
| `/reset-request` | `app/[locale]/(auth)/reset-request/page.tsx` | page | none | async server |
| `/reset-confirm` | `app/[locale]/(auth)/reset-confirm/page.tsx` | page | none | async server |
| `/set-password` | `app/[locale]/(auth)/set-password/page.tsx` | page | none | async server |
| `/auth/callback` | `app/[locale]/auth/callback/route.ts` | route | PKCE exchange | async handler |
| `/auth/confirm` | `app/[locale]/auth/confirm/route.ts` | route | token-hash exchange | async handler |
| layout (auth group) | `app/[locale]/(auth)/layout.tsx` | layout | none | async server |
| root layout | `app/[locale]/layout.tsx` | layout | none | async server |

### 4b. Admin (`/admin/**`) — layout calls `requireAdmin()`

| Route | File | Notes |
|---|---|---|
| `/admin/dashboard` | `dashboard/page.tsx` | re-calls `requireAdmin()` for `profile.full_name` |
| `/admin/users` | `users/page.tsx` | layout-only guard |
| `/admin/users/new` | `users/new/page.tsx` | layout-only |
| `/admin/users/[id]` | `users/[id]/page.tsx` | re-calls `requireAdmin()` |
| `/admin/clients` (+ `new`, `[id]/edit`) | `clients/...` | layout-only |
| `/admin/campaigns` (+ `new`, `[id]/edit`) | `campaigns/...` | layout-only |
| `/admin/locations` (+ `new`, `[id]/edit`) | `locations/...` | layout-only |
| `/admin/regions` (+ `new`, `[id]/edit`) | `regions/...` | layout-only |
| `/admin/assignments` (+ `new`, `[id]/edit`) | `assignments/...` | layout-only |
| `/admin/shifts` (+ `new`, `[id]/edit`) | `shifts/...` | layout-only |
| `/admin/reports` | `reports/page.tsx` | re-calls `requireAdmin()` |
| `/admin/performance` (+ `campaign/[id]`, `location/[id]`, `promoter/[id]`) | `performance/...` | layout-only |
| `/admin/stock` (+ `new`, `audit`, `audit/[id]/correct`) | `stock/...` | layout-only |
| `/admin/exports` (+ `new`) | `exports/...` | re-calls `requireAdmin()` |
| `/admin/imports` (+ `[target]`, `[target]/template/route.ts`) | `imports/...` | layout-only; `template/route.ts` re-calls `requireAdmin()` |
| `/admin/field-visits` | `field-visits/page.tsx` | re-calls `requireAdmin()` |
| `/admin/live` | `live/page.tsx` | re-calls `requireAdmin()` |
| layout | `admin/layout.tsx` | `requireAdmin()` |

### 4c. Supervisor (`/supervisor/**`) — layout calls `requireRole('supervisor')`

| Route | Guard at page level | Notes |
|---|---|---|
| `/supervisor/dashboard` | layout-only | placeholder page |
| `/supervisor/attendance` | `requireRole('supervisor', 'admin')` | re-guards |
| `/supervisor/breaks` | `requireRole('supervisor', 'admin')` | re-guards |
| `/supervisor/visits` (+ `new`) | `requireRole('supervisor', 'admin')` | re-guards |
| `/supervisor/reports` (+ `[id]`) | `requireRole('supervisor', 'admin')` | re-guards |
| `/supervisor/tasks` | `requireRole('supervisor', 'admin')` | re-guards |
| `/supervisor/performance` | layout-only | |
| `/supervisor/stock` (+ `distribute`, `reallocate`, `reconcile`, `return`) | mixed (layout-only on index, page-level on actions) | |
| `/supervisor/promoters/[id]` | `requireRole('supervisor', 'admin')` | re-guards |
| `/supervisor/feedback` | `requireRole('supervisor', 'admin')` | re-guards |
| `/supervisor/exports` (+ `new`) | `requireRole('supervisor', 'admin')` | re-guards |
| `/supervisor/live` | `requireRole('supervisor', 'admin')` | re-guards |

### 4d. Promoter (`/promoter/**`) — layout calls `requireRole('promoter')`

| Route | Guard at page level |
|---|---|
| `/promoter/dashboard` | `requireRole('promoter')` |
| `/promoter/attendance` | `requireRole('promoter')` |
| `/promoter/breaks` | `requireRole('promoter', 'admin')` |
| `/promoter/reports/today` | `requireRole('promoter')` |
| `/promoter/stock` (+ `return`) | `requireRole('promoter')` |
| `/promoter/tasks` | `requireRole('promoter')` |
| `/promoter/feedback` (+ `new`) | `requireRole('promoter', 'admin')` |
| `/promoter/visits` | `requireRole('promoter')` |

### 4e. Client (`/client/**`) — layout calls `requireRole('client')`

| Route | Guard at page level |
|---|---|
| `/client/dashboard` | layout-only |
| `/client/campaigns` (+ `[id]`) | layout-only |
| `/client/performance` | layout-only |
| `/client/live` | `requireRole('client')` |
| `/client/exports` (+ `new`) | `requireRole('client', 'admin')` |

### 4f. API route handlers

| Route | Guard |
|---|---|
| `/api/activity-photos/photo-url` | `requireRole('admin','supervisor','promoter')` |
| `/api/activity-photos/upload` | `requireRole('promoter','admin')` |
| `/api/attendance/photo-url` | `requireRole('admin','supervisor','promoter')` |
| `/api/attendance/location-trust` | `requireRole('promoter')` |
| `/api/admin/shifts-for-location` | `requireAdmin()` |
| `/api/supervisor-visits/photo-url` | `requireRole('admin','supervisor')` |

### 4g. Middleware

| File | Purpose |
|---|---|
| `middleware.ts` | i18n locale routing, Supabase session attachment, protected-path enforcement (`/admin`, `/supervisor`, `/promoter`, `/client`), CSP + security headers, temp-password user allowlist |

---

## 5. Migrations chronological (46 files, ~8.5k LOC)

Listed oldest → newest with one-line summaries.

| # | Filename | Summary |
|--:|---|---|
| 1 | `20260419000000_phase1_auth_profiles_audit.sql` | `user_role` enum, `profiles`, `audit_log` (append-only), helpers `current_role/is_admin/is_active`, `handle_new_user` trigger, `profiles_self_update_guard` trigger |
| 2 | `20260419010000_phase2_clients.sql` | `clients` (tenant root), `profiles.client_id` FK + role/tenant CHECK, `current_client_id()` helper |
| 3 | `20260419020000_phase2_regions_cities.sql` | `regions`, `cities` (bilingual `name_i18n`), RLS |
| 4 | `20260419030000_phase2_locations.sql` | `locations` with geo + `geofence_radius_m`; `profiles_validate_assigned_locations` trigger (per-element FK) |
| 5 | `20260419040000_phase2_campaigns.sql` | `campaigns` with `campaign_status` enum, `kpi_config`, `campaign_locations` join |
| 6 | `20260419050000_phase2_skus_shifts.sql` | `skus` + `shifts` with `days_of_week smallint[]` + validation trigger |
| 7 | `20260419060000_phase2_user_assignments.sql` | `user_assignments` SOT for who-works-where; `sync_assigned_locations` trigger; `current_user_locations()` helper |
| 8 | `20260419070000_phase2_rls.sql` | Bulk RLS for all Phase 2 tables (admin CRUD, client tenant, scoped reads) |
| 9 | `20260419075000_phase2_profile_guard_fix.sql` | Patches guard to allow nested-trigger updates (pg_trigger_depth detection) |
| 10 | `20260420000000_phase3_attendance.sql` | `attendance` table + status enum + 7 RLS policies |
| 11 | `20260420010000_feature3_client_visibility.sql` | 4 boolean opt-in flags on `clients` (D-040) |
| 12 | `20260420010000_phase3_alerts.sql` | `alerts` with `alert_type/severity/status` enums; i18n message_key + params |
| 13 | `20260420020000_phase3_supervisor_visits.sql` | `supervisor_visits` with photo + outcome + idempotency |
| 14 | `20260420030000_phase3_storage_bucket.sql` | Private bucket `attendance-photos` (no policies → service-role-only access) |
| 15 | `20260421000000_phase4_tasks.sql` | `tasks` with `task_status` enum + RLS |
| 16 | `20260421010000_phase4_daily_reports.sql` | `daily_reports` (one per promoter/location/day) with extensive status/timestamp CHECKs |
| 17 | `20260421020000_phase4_activity_sales_kpi.sql` | `activity_photos`, `sales_entries`, `kpi_snapshots` (read-only to authenticated) |
| 18 | `20260421030000_phase4_storage_bucket.sql` | Private bucket `activity-photos` |
| 19 | `20260422000000_phase5_stock_movements.sql` | Append-only `stock_movements` ledger + entity/kind enums + extensive CHECKs |
| 20 | `20260422010000_phase5_alerts_extend.sql` | Extends `alert_type` with low_stock, over_consumption, reconciliation_mismatch, no_usage |
| 21 | `20260422020000_phase5_stock_reconciliations.sql` | `stock_reconciliations` table for periodic reconcile snapshots |
| 22 | `20260422030000_phase5_stock_balances.sql` | View / materialized helper for balance reads |
| 23 | `20260422040000_phase5_stock_invariants.sql` | Stock invariant CHECKs + indices |
| 24 | `20260422050000_phase5_stock_rls.sql` | RLS policies for stock_* tables |
| 25 | `20260422060000_phase5_stock_rpcs.sql` | Stock RPC helpers (likely SECURITY DEFINER) |
| 26 | `20260423000000_phase6_performance_snapshots.sql` | `performance_snapshots` table for promoter/location/campaign rollups |
| 27 | `20260424000000_fix_campaign_locations_rls_recursion.sql` | Hotfix: breaks recursion in `campaign_locations` RLS policy |
| 28 | `20260424000000_phase7_alerts_extend.sql` | More `alert_type` values (low_performance, no_activity, location_trust_low, geofence_override_requested) |
| 29 | `20260424010000_phase7_break_requests.sql` | `break_requests` table with approval workflow |
| 30 | `20260424020000_phase7_notifications.sql` | `notifications` table for in-app + push delivery |
| 31 | `20260424030000_phase7_realtime_publication.sql` | Adds tables to `supabase_realtime` publication for client subscriptions |
| 32 | `20260425000000_phase8_scaffold.sql` | Scaffolding for Phase 8 (consumer-facing features) |
| 33 | `20260425010000_phase8_consumer_feedback.sql` | `consumer_feedback` table + RLS |
| 34 | `20260425020000_phase8_export_jobs.sql` | `export_jobs` queue with status lifecycle |
| 35 | `20260425030000_phase8_scheduled_reports.sql` | `scheduled_reports` for cron-driven exports |
| 36 | `20260425040000_phase8_exports_storage.sql` | Private `exports` bucket |
| 37 | `20260426000000_phase9_admin_user_emails.sql` | View / RPC to expose `auth.users.email` to admin queries |
| 38 | `20260426010000_phase9_hot_path_indexes.sql` | Hot-path index additions across Phase 1–8 tables |
| 39 | `20260426020000_phase9_rate_limits.sql` | `rate_limits` table + helpers |
| 40 | `20260426030000_phase9_notification_kind_export.sql` | Adds `notification_kind` enum value for export-ready notifications |
| 41 | `20260427000000_phase10_bulk_import.sql` | Bulk import surface (likely staging tables / RPCs) |
| 42 | `20260428000000_feature2_location_trust.sql` | `location_trust` infrastructure for Feature 2 |
| 43 | `20260429000000_feature4_attendance_photo_optional.sql` | Makes attendance check-in photo optional under Feature 4 toggle |
| 44 | `20260429010000_feature4_supervisor_visits_promoter.sql` | Adds `promoter_user_id` to `supervisor_visits` |
| 45 | `20260429020000_feature4_notification_kind_visit.sql` | Adds visit notification kind |
| 46 | `20260430000000_feature5_location_pings.sql` | `location_pings` table (Feature 5 GPS trail) |

---

## 6. Edge Functions (10)

| Function | LOC | Trigger | Purpose | Tables / Services |
|---|--:|---|---|---|
| `geo-validate-checkin` | 363 | HTTP POST + JWT (`verified_jwt=true`) | Trust boundary for promoter check-in: geofence haversine, EXIF strip, attendance insert with idempotency, alert firing | attendance, locations, campaigns, shifts, alerts, profiles |
| `geo-validate-checkout` | 311 | HTTP POST + JWT | Mirror for check-out: geofence + classifyCheckOut, alerts | attendance, shifts, alerts |
| `supervisor-visit-create` | 280 | HTTP POST + JWT | Server-side trust boundary for visits | supervisor_visits, locations, campaigns, profiles |
| `detect-attendance-issues` | 263 | CRON + `x-cron-secret` (`verify_jwt=false`) | ABSENT + MISSING_CHECKOUT detection with dedup | attendance, scheduled_absences, alerts, shifts |
| `compute-kpis` | 439 | Targeted POST + JWT, sweep CRON | KPI + performance snapshot computation; mirrors `lib/kpis/compute.ts` | daily_reports, kpi_snapshots, performance_snapshots, campaigns |
| `detect-live-issues` | 407 | CRON + `x-cron-secret` | LOW_PERFORMANCE + NO_ACTIVITY alerts; notification fan-out | performance_snapshots, attendance, daily_reports, alerts, notifications |
| `generate-report` | 156 | Targeted POST + secret, sweep CRON | Materializes export_jobs into CSV-zip / XLSX in `exports` bucket | export_jobs, campaigns, daily_reports, stock_movements, supervisor_visits |
| `cron-scheduled-reports` | 177 | CRON hourly + secret | Selects due `scheduled_reports`, queues export_jobs, calls generate-report | scheduled_reports, campaigns, export_jobs |
| `cleanup-old-photos` | 155 | CRON nightly + secret | Deletes attendance + visit photos > 90 days; nullifies stale paths | attendance, supervisor_visits, Storage |
| `stock-reconcile` | 646 | Targeted POST + JWT, sweep CRON | Ledger reconciliation + low_stock/no_usage/reconciliation_mismatch alerts | stock_movements, stock_reconciliations, alerts, campaigns, locations, profiles |

**`_shared/`** modules (~3.3k LOC): `ledger.ts` (575), `builders.ts` (586), `assemble.ts` (520), `exif.ts` (333), `performance.ts` (249), `xlsx.ts` (212), `zip.ts` (154), `live-detect.ts` (170), `exports-types.ts` (163), `compose.ts` (88), `kpis.ts` (86), `detection.ts` (47), `shift-time.ts` (39), `csv.ts` (39), `haversine.ts` (24).

Notable: `lib/kpis/compute.ts`, `lib/stock/ledger.ts`, `lib/alerts/detect.ts`, `lib/attendance/shift-time.ts` are **mirrored** between the Next.js side and the Edge Function side. Drift between these mirrors is a known risk vector — flagged for Phase 7.

---

## 7. RLS coverage summary

> Detailed policies per-table captured during discovery; this is the executive summary.

| Table | RLS | Policies | Notes |
|---|---|---|---|
| `profiles` | ✅ | self+admin select, self+admin update (guard trigger), admin insert/delete | All filters specific |
| `audit_log` | ✅ | admin select; self-or-admin insert | UPDATE/DELETE blocked at trigger + grant level |
| `clients` | ✅ | admin + self-tenant select; admin writes | |
| `regions`, `cities` | ✅ | authenticated select on active rows; admin writes | |
| `locations` | ✅ | admin / assigned-set / client-tenant select; admin writes | |
| `campaigns`, `campaign_locations`, `skus`, `shifts` | ✅ | admin / client-tenant / assigned select; admin writes | `campaign_locations` had recursion bug (migration 27 fixes) |
| `user_assignments` | ✅ | admin + self select; admin writes | |
| `attendance` | ✅ | admin / self / supervisor-by-location select; promoter self-insert at assigned location; supervisor + admin update; admin delete | |
| `alerts` | ✅ | admin / self / supervisor-by-location select; admin + supervisor update | System inserts via service-role (Edge Function bypass) |
| `supervisor_visits` | ✅ | admin / self / by-location select; supervisor self-insert + self-update | |
| `tasks` | ✅ | admin / self-assigned / supervisor-by-location select; promoter self-update bound to non-terminal status | |
| `daily_reports` | ✅ | admin / self / supervisor-by-location select; promoter self-insert (status=draft); promoter self-update bounded to draft+submitted | |
| `activity_photos`, `sales_entries`, `kpi_snapshots` | ✅ | Inherit visibility via subquery on parent `daily_reports` | `kpi_snapshots` is read-only to authenticated; writes via service role |
| `stock_movements` | ✅ | Append-only via grant + trigger; policies in migration 24 | |
| `stock_reconciliations`, `stock_balances` | ✅ | (covered by `phase5_stock_rls`) | |
| `performance_snapshots` | ✅ | (covered in migration 26) | |
| `break_requests`, `notifications`, `consumer_feedback`, `export_jobs`, `scheduled_reports`, `rate_limits`, `location_pings` | ✅ assumed | (not yet line-by-line audited) | Phase 3 will spot-check |

**Top-line findings (to be confirmed in Phase 3):**
- ✅ No tables found with RLS enabled but zero policies.
- ✅ No `using (true)` or naked-`authenticated` policies discovered.
- ✅ Append-only tables (`audit_log`, `stock_movements`) double-locked at trigger + grant level.

---

## 8. SECURITY DEFINER function inventory

All discovered have `set search_path = public, pg_catalog` except trigger-functions that don't query user tables (lower risk).

| Function | Returns | Scope | search_path |
|---|---|---|---|
| `current_role()` | `user_role` | Read `profiles`; used in RLS | ✅ |
| `is_admin()` | `boolean` | Read `profiles`; used in admin-bypass policies | ✅ |
| `is_active()` | `boolean` | Read `profiles`; soft-lock check | ✅ |
| `current_client_id()` | `uuid` | Read `profiles`; client tenant scoping | ✅ |
| `current_user_locations()` | `uuid[]` | Read `profiles.assigned_locations` (synced cache) | ✅ |
| `sync_assigned_locations(uuid)` | `void` | Update `profiles` from `user_assignments`; row-locks | ✅ |
| `user_assignments_sync_trigger()` | trigger | AFTER trigger calling `sync_assigned_locations` | ✅ |
| `profiles_self_update_guard()` | trigger | BEFORE UPDATE on `profiles`; nested-trigger detection | ✅ |
| `profiles_validate_assigned_locations()` | trigger | BEFORE INSERT/UPDATE; per-element FK | ✅ |
| `audit_log_deny_modification()` | trigger | Append-only enforcement; raises always | n/a (no SELECT) |
| `shifts_validate_days_of_week()` | trigger | Days array uniqueness | n/a |
| `stock_movements_deny_modification()` | trigger | Append-only enforcement | n/a |
| `set_updated_at()` | trigger | Generic `updated_at` setter | n/a |
| `handle_new_user()` | trigger | AFTER INSERT on `auth.users` → materialize `profiles` row | ✅ |

Phase 3 will audit each call site.

---

## 9. Tests inventory (preview — full assessment in Phase 7)

| Path | LOC | Coverage |
|---|--:|---|
| `lib/stock/ledger.test.ts` | 731 | Ledger reduction, balance, low-stock, no-usage, reconciliation invariants |
| `lib/exports/builders.test.ts` | 608 | Export filter/scope/aggregation builders |
| `lib/alerts/spec-cases.test.ts` | 313 | Alert triggering specs (geofence, late, absent, etc.) |
| `lib/offline/queue.test.ts` | 309 | IndexedDB offline-first sync |
| `lib/kpis/compute.test.ts` | 297 | KPI math (mirrors Edge Function `_shared/kpis.ts`) |
| `lib/alerts/detect.test.ts` | 288 | Alert detection logic |

Test runner: **vitest** 4.x (in `devDependencies`). All tests are unit-style on pure functions in `lib/`. **No tests yet for**: route handlers, server actions, React components, Edge Functions end-to-end, or RLS policy behavior.

---

## 10. Notable platform conventions discovered

These will be checked for compliance in Phases 2–7:

1. **D-009** — idempotency keys on every promoter/supervisor write (attendance, visits, reports, tasks, stock_movements).
2. **D-028** — no `recharts`; pure-SVG sparklines (and now the dashboard trend chart).
3. **D-044** — admin actions touching `profiles` guarded columns must use `createServerSupabase()`, never `createAdminSupabase()`.
4. **D-045** — admin dashboard `text-4xl` exception, scoped to `/admin/dashboard` only.
5. **Bilingual everywhere** — `name_i18n: jsonb {en, ar}` on every named entity; both languages required by CHECK constraint.
6. **Asia/Amman hardcoded** in `lib/attendance/shift-time.ts` + Edge `_shared/shift-time.ts` — mirrored copies, no DST.
7. **Mirror modules** between Next + Edge: `lib/{kpis,stock/ledger,alerts/detect,attendance/shift-time}` ↔ `_shared/`. Risk vector for drift.
8. **Append-only ledgers**: `audit_log`, `stock_movements` enforced at trigger + grant + RLS triple.
9. **Locale-aware Link**: `@/i18n/navigation` re-exports `Link` so locale prefix is automatic.
10. **CSP + security headers** applied in `middleware.ts` (audit in Phase 3).

---

## End of Phase 1 inventory.
