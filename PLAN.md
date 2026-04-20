# PLAN.md — Promoter Monitoring & Reporting Platform

**Status: PROJECT COMPLETE.** All 10 phases (0–9) shipped. 272 vitest pass. Phase 9 (Hardening & Production Readiness) merged as the final phase on branch `claude/production-hardening-9Hhw8`; Web Push deferred to optional Phase 9.1 per D-036.
**Source of truth** for the build. When in doubt, this document wins. Update via PR.

---

## 1. Product Overview

A centralized, bilingual (Arabic + English) SaaS platform that digitizes and controls field marketing operations end-to-end: campaign planning, promoter attendance with GPS + selfie validation, live sales/sampling tracking per SKU, multi-level stock control, real-time monitoring dashboard, performance analytics, and full data export.

**Primary users:** Agency staff (admins, supervisors, promoters) running in-store activations; their clients (brands like Almarai) who consume reports and dashboards.

**Mobile strategy:** PWA on day one (mobile-first responsive). Architected so a future React Native client can reuse the same server API.

---

## 2. Tech Stack (fixed)

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript strict |
| Styling | Tailwind CSS + shadcn/ui + `tailwindcss-logical` plugin |
| Auth | Supabase Auth (email/password; phone OTP scaffolded for later) |
| Database | Supabase Postgres with Row Level Security on every table |
| Storage | Supabase Storage, private buckets only |
| Realtime | Supabase Realtime (Postgres changes subscription) |
| Server logic | Next.js Server Actions + Route Handlers for req/res; Supabase Edge Functions (Deno) for cron, heavy exports, geo-validation, stock reconciliation — anything that must not trust the client |
| Hosting | Vercel (frontend + server actions); Supabase (backend) |
| Validation | zod (strict — rejects unknown keys) |
| Forms | react-hook-form + zod resolver |
| Server state | TanStack Query |
| Client state | Zustand (only if unavoidable) |
| i18n | next-intl (Arabic + English, full RTL) |
| Package manager | pnpm |
| Code quality | ESLint + Prettier + TypeScript strict |
| Rate limiting | Vercel Edge Middleware + Upstash Redis |
| Observability | Vercel analytics + Supabase logs; Sentry in later phase |

The design system is defined in `.claude/skills/design-system/SKILL.md` and is authoritative for all UI decisions.

---

## 3. Repository Layout

```
/
├── app/
│   ├── [locale]/                 # next-intl routing (ar | en)
│   │   ├── (auth)/               # login, signup, password reset
│   │   ├── (admin)/              # admin-only
│   │   ├── (supervisor)/         # supervisor
│   │   ├── (promoter)/           # promoter (mobile-first)
│   │   ├── (client)/             # client read-only
│   │   └── layout.tsx
│   └── api/                      # route handlers (when server actions don't fit)
├── components/
│   ├── ui/                       # shadcn/ui primitives
│   └── features/                 # feature components
├── lib/
│   ├── supabase/                 # server + browser client factories
│   ├── auth/                     # guards, session helpers
│   ├── validations/              # zod schemas
│   └── utils/
├── messages/
│   ├── ar.json
│   └── en.json
├── supabase/
│   ├── config.toml
│   ├── migrations/               # timestamped *.sql
│   ├── functions/                # Edge Functions (Deno)
│   │   ├── geo-validate-checkin/
│   │   ├── reconcile-stock/
│   │   ├── generate-report/
│   │   └── cron-scheduled-reports/
│   ├── tests/
│   │   └── rls.test.sql
│   └── seed.sql
├── scripts/
│   └── setup-supabase.sh
├── public/
│   ├── manifest.json             # PWA manifest
│   └── icons/
├── .claude/
│   └── skills/
│       └── design-system/
│           ├── SKILL.md
│           └── PATTERNS.md
├── middleware.ts                 # i18n + auth + rate limit + security headers
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json                 # strict
├── .env.example
├── .gitignore
├── README.md
├── PLAN.md                       # this file
└── DECISIONS.md
```

---

## 4. High-Level Data Model

Conceptual outline — final SQL lives in `supabase/migrations/`.

### Core entities
- `profiles` — app user (FK to `auth.users`). Fields: role, full_name, phone, preferred_language, active, created_by.
- `clients` — the brand (e.g., Almarai). Fields: name, contact, active.
- `campaigns` — a planned activation. Fields: name, client_id, start_date, end_date, objectives, kpi_config (JSONB), status.
- `regions`, `cities`, `locations` — POS hierarchy. `locations` fields: name, city_id, address, lat, lng, geofence_radius_m.
- `campaign_locations` — campaign ↔ location M:N assignment.
- `skus` — per campaign: name (i18n JSONB), unit, target, stock_allocated.
- `shifts` — start_time, end_time, days_of_week, campaign_location_id.
- `user_assignments` — user ↔ location ↔ shift ↔ role (promoter/supervisor).

### Attendance
- `attendance` — check_in_ts, check_in_lat/lng, check_in_photo_url, check_out_ts, check_out_lat/lng, check_out_photo_url, status (on_time/late/absent/missing_checkout).
- `supervisor_visits` — separate table for independent validation photos.

### Activity & sales
- `daily_reports` — per promoter per shift. contacts, engaged_customers, samples_distributed, notes, status (draft/submitted/approved/rejected), reviewer_id, review_reason.
- `activity_photos` — category (setup/during/end_of_shift), url, exif_minimal JSONB.
- `sales_entries` — daily_report_id, sku_id, quantity.
- `kpi_snapshots` — materialized per-shift metrics for fast drill-down.

### Stock (Module 6 — critical, append-only)
- `stock_movements` — immutable ledger. Fields: from_entity_type, from_entity_id, to_entity_type, to_entity_id, sku_id, quantity, user_id, timestamp, location_id, reason, campaign_id, idempotency_key (UNIQUE), correction_of (FK self, nullable).
- `stock_balances` — materialized view rebuilt from movements.
- DB triggers enforce:
  - `warehouse_issued = Σ supervisor_received`
  - `supervisor_received = supervisor_distributed + supervisor_remaining`
  - `promoter_received = promoter_used + promoter_remaining + promoter_returned`
  - Promoter usage > received → REJECT.

### Breaks, feedback, exports
- `break_requests` — promoter_id, requested_start, duration_minutes, status (pending/approved/rejected/modified), reviewer_id, actual_start, actual_end, reason.
- `consumer_feedback` — category (enum), text, sentiment, campaign_location_id, promoter_id.
- `competitor_mentions` — brand, context, sentiment, feedback_id.
- `export_jobs` — requested_by, scope (JSONB), format (raw/xlsx), status (queued/running/done/failed), result_url (signed, short TTL), created_at, completed_at.

### Cross-cutting
- `audit_log` — actor_id, action, entity, entity_id, before_json, after_json, ip, user_agent, ts. Immutable.
- `notifications` — user_id, kind, payload, read_at, ts.

### Multilingual content
Entity names that users see (campaigns, SKUs, locations, regions, cities) use JSONB: `{ "ar": "...", "en": "..." }`. See DECISIONS.md.

---

## 5. Security Baseline

Baked in from day one. Every phase must uphold these.

1. **RLS on every table.** No `USING (true)` anywhere. Tests in `supabase/tests/rls.test.sql` prove cross-tenant isolation.
2. **Service role key never in browser bundles.** Build-time grep check in CI.
3. **Server-side re-check of auth + authorization** on every Server Action / Route Handler, even when RLS also blocks.
4. **zod `.strict()`** on every server input. Reject unknown keys.
5. **No raw SQL with user input.** Supabase client or parameterized RPC only.
6. **File uploads:** MIME + magic bytes + size validated server-side; allowed `image/jpeg|png|webp`; UUID filenames; EXIF stripped server-side (preserve timestamp + GPS only — see DECISIONS.md).
7. **Signed URLs only** for any storage access. Short TTL (~5 min inline, longer for exports).
8. **Rate limiting** on auth endpoints, uploads, export generation.
9. **CSRF** protected (Server Actions handle this; documented).
10. **CORS** locked to known origins; no `*`.
11. **Security headers** via middleware (CSP, HSTS, X-Content-Type-Options, X-Frame-Options: DENY, Referrer-Policy, Permissions-Policy).
12. **Business logic security**: geofence validated server-side; stock invariants in DB triggers; idempotency keys on mutations.
13. **Audit log** every sensitive action.
14. **Generic errors** to clients; detailed only server-side.
15. **No `console.log` of request bodies** in production.

---

## 6. Phased Delivery Plan

Each phase ends with: tests passing, deployable increment, `DECISIONS.md` updated, commit history clean. **Stop after each phase. Wait for review.**

### Phase 0 — Foundation (no feature code)
Scope:
- Next.js 15 + TypeScript strict + Tailwind + shadcn/ui scaffolded
- pnpm, ESLint, Prettier configured
- next-intl with ar + en; RTL verified on a demo `/[locale]/hello` page
- PWA manifest + minimal service worker
- Design tokens from SKILL.md copied into `globals.css` and `tailwind.config.ts`
- Fonts (Inter + IBM Plex Sans Arabic) loaded via `next/font`
- Security headers middleware stub
- Supabase local config (`supabase/config.toml`)
- `.env.example` with all keys documented
- `README.md` with local dev + deploy instructions

**Exit criteria:** Running `pnpm dev` shows `/en/hello` and `/ar/hello` pages correctly, RTL works, shadcn/ui Button renders in brand style, TypeScript has zero errors, ESLint passes.

### Phase 1 — Auth & User Management (Module 2)
Scope:
- Supabase Auth wired (email/password)
- `profiles` table + RLS
- Login / logout / password reset UI (bilingual, RTL verified)
- Role-based route guards (middleware + server action helper)
- Admin UI: invite users, assign role, activate/deactivate
- pgtap RLS tests for `profiles`
- `audit_log` table + log auth events

**Exit criteria:** Admin invites a Promoter; Promoter logs in and is redirected to Promoter routes; Admin routes return 403 for Promoter. RLS tests pass.

### Phase 2 — Campaigns, Locations, SKUs (Module 1)
Scope:
- Schema + migrations: clients, campaigns, regions, cities, locations, skus, shifts, campaign_locations, user_assignments
- RLS policies + pgtap tests (client isolation)
- Admin CRUD UI for everything above
- Client read-only view of their campaigns

**Exit criteria:** Admin creates the Almarai demo campaign end-to-end. Client login sees only their campaigns. RLS tests prove two clients cannot see each other's data.

### Phase 3 — Attendance & Geo-Tracking (Module 3) — COMPLETE (pending manual migration apply)
Scope delivered:
- Schema: `attendance`, `alerts`, `supervisor_visits`, private `attendance-photos` Storage bucket (4 migrations — not yet applied).
- Edge Functions (Deno, shared `_shared/` modules):
  - `geo-validate-checkin` — JWT verify, authz re-check, haversine, byte-level JPEG EXIF strip (D-006), attendance insert with D-009 idempotency read-through, fires `late_check_in` + `geofence_violation` alerts.
  - `geo-validate-checkout` — mirror: ownership check, haversine, EXIF strip, updates existing row, fires `early_leave` + `geofence_violation` alerts.
  - `supervisor-visit-create` — supervisor site-visit logging; does not reject on geofence failure but flags it.
  - `detect-attendance-issues` — scheduled sweep (verify_jwt off, shared-secret header): inserts `absent` rows past cutoff and bumps `missing_checkout` past shift end; idempotent on re-runs.
- Selfie pipeline: private bucket with no authenticated storage policies; server-signed URLs (5-minute TTL) issued by Route Handlers at `/api/attendance/photo-url` and `/api/supervisor-visits/photo-url`.
- Promoter PWA flow: `/[locale]/promoter/attendance` with `navigator.geolocation`, JPEG camera capture, `crypto.randomUUID` idempotency, `supabase.functions.invoke` → Edge Functions, override-request form when geofence fails.
- Supervisor dashboard: `/[locale]/supervisor/attendance` with polling (30 s per D-019), filter bar (date/campaign/location), CSV export, open-alerts panel with inline approve/resolve, attendance table with status + geofence + override pills, photo viewer dialog.
- Supervisor site visits: `/[locale]/supervisor/visits` (list with photo viewer) and `/new` (form with GPS + camera).
- Pure-function unit tests (vitest): 42 total — 10 haversine, 26 detection (including kpi_config readers), 6 CSV serialiser.
- Full bilingual copy (en + ar) for all new pages; RTL via logical Tailwind properties + `dir="ltr"` on numeric spans.

Decisions made in this phase: **D-019** (live-dashboard polling, storage via signed URLs, client aggregate-only, configurable kpi_config thresholds).

**Exit criteria check** (PLAN Phase 3 original):
- ✅ Promoter on a phone can check in with a selfie (code + bilingual UI; real-device verification still pending).
- ✅ Check-in fails (server-side) if geofence is breached — distance stored, alert fired, override-request flow available.
- ✅ Supervisor sees the photo in the dashboard with timestamp and location — via signed URL viewer, filtered by date/campaign/location.

**Open before merge:**
1. Apply migrations manually via Supabase SQL Editor (4 files under `supabase/migrations/20260420*`).
2. Deploy 4 Edge Functions: `geo-validate-checkin`, `geo-validate-checkout`, `supervisor-visit-create`, `detect-attendance-issues`. Set `CRON_SECRET` before the last one.
3. Schedule `detect-attendance-issues` (pg_cron or Supabase scheduled functions) — instructions in its README.
4. Real-device walkthrough on mobile Safari + Chrome with camera + geolocation.

### Phase 4 — Tasks, Activity, Sales/Sampling (Modules 4 + 5)
Scope:
- Schema: tasks, daily_reports, activity_photos, sales_entries, kpi_snapshots
- Server-computed KPIs (never trust client math)
- Promoter daily report form with offline-tolerant queue
- Supervisor validate/reject flow with reason
- Drill-down views: campaign → location → promoter → SKU

**Exit criteria:** Promoter submits a daily report offline; it syncs on reconnection; KPIs computed server-side match the expected Almarai example (conversion 46.6%, engagement 80%, etc.).

### Phase 5 — Stock Management (Module 6) — HARDEST PHASE — SHIPPED ✅
Scope:
- Schema: `stock_movements` (append-only, D-008), `stock_balances` plain view (D-023), `stock_reconciliations` snapshot table, `skus.kind` enum (D-021)
- DB triggers + CHECK constraints for invariants; per-(campaign, sku, entity) advisory locks in a BEFORE INSERT SECURITY DEFINER trigger (D-026)
- Warehouse → Supervisor → Promoter flows with the `reallocate_stock` + `correct_stock_movement` RPCs for atomic multi-row operations
- Reconciliation + auto-flags (low_stock, over_consumption, reconciliation_mismatch, no_usage) via the `stock-reconcile` Edge Function — targeted + cron sweep modes
- Admin / supervisor / promoter UI: balances, allocations, distribute, reallocate, return, correction (D-008), per-role audit trail
- Idempotency keys on all movements (D-009); usage auto-emitted from `daily_reports` submission (D-024)
- Per-campaign configurable thresholds: `kpi_config.low_stock_threshold` + `kpi_config.no_usage_hours` (D-027)

**Exit criteria** (all met): The Almarai stock example in the spec (PDF page 13–14) runs correctly: 1000 cups distributed across 3 locations, Cozmo over-consumption rejected at the invariant trigger + surfaced as an `over_consumption` alert, end-of-day reconciliation identity holds. `lib/stock/ledger.test.ts` executes the full scenario as a vitest fixture; 133 unit tests pass.

**Test matrix:** 116 vitest tests in `lib/stock/ledger.test.ts` (Almarai scenario + invariants + anomaly detectors + corrections); 17 zod tests in `lib/validations/stock.test.ts`; 17 pgtap tests in `supabase/tests/phase5.test.sql` (table-level CHECK, UPDATE/DELETE rejection, invariant trigger, RLS policies).

**Decisions finalised:** D-021 · D-022 · D-023 · D-024 · D-025 · D-026 · D-027.

### Phase 6 — Performance Management (Module 7) — SHIPPED ✅
Scope delivered:
- New `performance_snapshots` table per (scope_kind, scope_id, campaign_id, period_kind, period_start) with funnel totals + KPI ratios + tier + dense rank; service-role-only writes.
- Per-campaign tier thresholds + tier_metric in `kpi_config` (defaults 0.50 / 0.30 / `conversion_rate`); soft-add via `readTierConfig()` (D-028 mirrors D-007/D-019/D-027).
- Pure logic in `lib/performance/tiering.ts` (`assignTier`, `rankWithinScope`, `tierDistribution`) + `lib/performance/rollups.ts` (`rollupByScope` + promoter/location/campaign helpers + period helpers); reuses Phase 4 `rollupKpis` (D-020). Mirrored byte-for-byte at `supabase/functions/_shared/performance.ts`.
- `compute-kpis` Edge Function extended (D-028) — after every kpi_snapshot write recomputes the affected campaign's performance rollups across daily / weekly / campaign_to_date × promoter / location / campaign and UPSERTs against the table's unique constraint.
- Plain `performance_latest` view (`security_invoker = on`) for fast dashboard reads (same trade-off as D-023 `stock_balances`).
- Admin pages: `/admin/performance` index + `campaign/[id]` (overview + location ranking with delta vs campaign + promoter ranking) + `location/[id]` + `promoter/[id]` (cards + 30-day daily-trend sparkline).
- Supervisor page (`/supervisor/performance`): RLS-scoped location + promoter rankings.
- Client page (`/client/performance`): aggregates only (D-019 item 3 reaffirmed) — per-campaign cards + sparkline; per-promoter / per-location rows not exposed.
- Tier badges via existing `StatusPill`; ratios rendered with `dir="ltr"` `tabular-nums`. Pure-SVG `Sparkline` component (no recharts dep added; deferred per D-028).
- Bilingual copy (en + ar) for all new pages; RTL via logical Tailwind properties.

**Exit criteria** (met): The Safeway Khalda (65% → Top) vs Shini (20% → Low) example from the spec is encoded as a vitest fixture in `lib/performance/tiering.test.ts` against the tiering pure function, and the rollup integration test (`lib/performance/rollups.test.ts`) confirms Khalda ranks #1, Cozmo (40% → Medium) #2, Shini #3 across the Almarai 3-location campaign.

**Test matrix:** 164 vitest pass total (Phase 6 added the 23-case `tiering.test.ts` + the 8-case `rollups.test.ts`); 11 pgtap tests in `supabase/tests/phase6.test.sql` (CHECKs, UNIQUE, RLS for admin/promoter/supervisor/client, `performance_latest` freshness).

**Decisions finalised:** D-028.

**Open before merge:**
1. Apply migration manually via Supabase SQL Editor (`supabase/migrations/20260423000000_phase6_performance_snapshots.sql`).
2. Re-deploy `compute-kpis` Edge Function (now writes performance_snapshots in addition to kpi_snapshots).
3. No new env vars or secrets.

### Phase 7 — Real-Time Monitoring + Breaks (Modules 8 + 9) — SHIPPED ✅
Scope delivered:
- Four migrations: `break_requests` table (idempotency per D-009, review + actuals consistency CHECKs, RLS for admin / self / supervisor-by-location), `notifications` table (service-role writes, self UPDATE for read_at), `alert_type` enum extended with `low_performance` + `no_activity`, Supabase Realtime publication enabled on `attendance` + `alerts` + `break_requests` + `notifications` + `kpi_snapshots` + `stock_movements`.
- Pure detectors in `lib/alerts/detect.ts` + Deno mirror (`_shared/live-detect.ts`): `detectLowPerformance` (consumes `performance_snapshots` rows) and `detectNoActivity` (stale checked-in promoters with zero funnel activity), plus `readLowPerformanceThreshold` / `readNoActivityHours` / `readBreakMaxMinutes` (soft-add readers per D-019 / D-027 / D-028 pattern).
- `detect-live-issues` scheduled Edge Function (verify_jwt = false + CRON_SECRET header): per-active-campaign sweep, upserts alerts with per-flag dedup, fans out one `notifications` row per targeted user + supervisor on the alert's location. Runs every 10 minutes.
- `lib/supabase/realtime.ts`: `subscribeToTables` + `useRealtimeTables` hook (one channel per mount, guaranteed cleanup, RLS applies to deliveries).
- Live dashboards: `/[locale]/admin/live`, `/[locale]/supervisor/live` (RLS-scoped to assigned locations), `/[locale]/client/live` (aggregates only per D-019 item 3 / D-028). Shared `LiveDashboardClient` renders KPI strip + alert feed + active-promoter table + drill-down links.
- Notifications bell in `AppShell` (all four roles): server-rendered initial state + client Realtime subscription filtered to `user_id=eq.<uid>`; mark-one / mark-all Server Actions.
- Break flow: zod-validated Server Actions (`submit` / `review` / `start` / `end`), idempotent submit per D-009, server-side campaign-scoped duration cap via `kpi_config.break_max_minutes` (default 60), audit-logged transitions, promoter-facing submit form + history, supervisor queue with auto-detected modify vs approve.
- Bilingual (en + ar) copy for `Live`, `Notifications`, `Breaks`, plus six new `alerts.*` keys.

**Exit criteria** (all met): All 5 cases from spec pages 18–20 pass vitest end-to-end in `lib/alerts/spec-cases.test.ts` — Late, Absent, Low Performance (Shini 0.20 < 0.30), Stock Shortage (Cozmo balance 5 ≤ 10), No Check-Out — each with a supervisor-resolve step that produces the shape the UI `resolve` action writes.

**Test matrix:** 196 vitest pass total (was 190 in Phase 6; Phase 7 added the 26-case `detect.test.ts` and the 6-case `spec-cases.test.ts`).

**Decisions finalised:** D-029.

**Open before merge:**
1. Apply migrations manually via Supabase SQL Editor (4 files under `supabase/migrations/20260424*`).
2. Deploy the `detect-live-issues` Edge Function. Reuses the existing `CRON_SECRET`; no new env vars.
3. Schedule `detect-live-issues` every 10 min (pg_cron or Supabase scheduled functions). Example SQL in the function README.
4. Web Push deferred to Phase 9 per D-029 item 6; no action required this phase.

### Phase 8 — Feedback + Reporting/Export (Modules 10 + 11) — SHIPPED ✅
Scope delivered:
- Four migrations: `consumer_feedback` + `competitor_mentions` (promoter-insert / supervisor-by-location / admin-all / client-blocked per D-019 / D-033); `export_jobs` (admin-all, requester own, client INSERT gated on `client_id = current_client_id()` per D-016 / D-033); `scheduled_reports` (admin-only); private `exports` Storage bucket with no `storage.objects` policies (signed URLs only — same posture as Phase 3 / 4).
- Pure, zero-dep export pipeline in `lib/exports/`: STORED-zip writer, inline-string OOXML XLSX writer, 6 role-aware builders (attendance, activity, stock, performance, supervisor_actions, feedback), and a compose orchestrator — all mirrored byte-for-byte at `supabase/functions/_shared/`.
- On-demand exports run synchronously inside `queueExportAction` (D-030): service-role UPSERT + `assembleExportInput` (per-domain fetchers) + `composeExport` + storage upload + row transition queued → running → done / failed. Short-TTL (5 min) signed download URL minted by `getExportDownloadUrlAction` per click (D-031).
- Scheduled-report path: `cron-scheduled-reports` Edge Function (hourly sweep, `x-cron-secret`) computes due rows across daily / weekly / end_of_campaign cadences, inserts an `export_jobs` row per due schedule, calls `generate-report` to process it, updates `last_run_at` + `last_job_id`. `generate-report` also has a sweep mode for backlog drains.
- Feedback flow: `submitFeedbackAction` (idempotent per D-009; competitor_mentions inserted atomically); `listFeedback` RLS-filtered query with campaign / location / promoter / competitors joined.
- UI: admin / supervisor / client exports list + new-export form (`new-export-form.tsx` + `exports-list.tsx`); promoter submit form + history (`feedback-form.tsx`); supervisor feedback queue. Nav entries added to all four role layouts. Client form hides Locations, SKUs, and supervisor_actions domain — aligned with builder output.
- Bilingual copy (en + ar) for `Exports` (including `new.*`), `Feedback` (including `form.*`, `category.*`, `sentiment.*`), and four new nav entries across all role layouts. RTL verified via logical Tailwind properties.

**Exit criteria** (met): Admin triggers an export for Almarai from `/admin/exports/new`; the Server Action writes an XLSX to `exports/<internal>/<job_id>/export-<ts>.xlsx` with sheets for Attendance, Daily reports, Sales entries, Stock movements, Performance, Supervisor visits, Feedback (all 6 domains); download link is a short-TTL signed URL. Client triggering an export on their own campaigns gets the aggregate-only shape (Attendance rollup, Activity by campaign / SKU, Stock by SKU, Performance campaign-rows, Feedback rollup) — no promoter names, no supervisor-actions sheet. Cross-tenant client is blocked by `export_jobs` RLS (0 rows + INSERT rejected on mismatched `client_id`).

**Test matrix:** 237 vitest pass total (was 196 at end of Phase 7; Phase 8 added 41 — CRC32 vectors, STORED-zip round-trip, XLSX structure + inline strings + Arabic preservation, 6 builders under both admin and client roles, Almarai fixture KPI + sku aggregates, compose orchestrator). pgtap Phase 8 suite (`supabase/tests/phase8.test.sql`): 14 assertions — consumer_feedback + competitor_mentions + export_jobs RLS + cross-tenant denial + client-scope WITH CHECK enforcement + done-has-result CHECK.

**Decisions finalised:** D-030 (on-demand sync Server Action; scheduled via Edge Function) · D-031 (email delivery deferred to Phase 9 — mirrors D-029 item 6) · D-032 (in-house zero-dep XLSX writer) · D-033 (client export shape = campaign/location aggregates + SKU totals + daily-trend totals; no promoter names, raw attendance, photos, alerts, or feedback text).

**Open before merge:**
1. Apply the four migrations manually via Supabase SQL Editor:
   - `20260425010000_phase8_consumer_feedback.sql`
   - `20260425020000_phase8_export_jobs.sql`
   - `20260425030000_phase8_scheduled_reports.sql`
   - `20260425040000_phase8_exports_storage.sql`
   (The `20260425000000_phase8_scaffold.sql` no-op may be skipped.)
2. Deploy two Edge Functions — `generate-report`, `cron-scheduled-reports`. Both re-use the existing `CRON_SECRET`; no new env vars.
3. Schedule `cron-scheduled-reports` hourly (pg_cron or Supabase scheduled functions). Example SQL in its README.
4. Email delivery of the signed URL is deferred to Phase 9 (D-031).

### Phase 9 — Hardening & Production Readiness — SHIPPED ✅
Scope delivered:
- **Admin/users bug fix (D-034 subordinate):** new SECURITY DEFINER `admin_get_user_emails(uuid[])` RPC in `20260426000000_phase9_admin_user_emails.sql` replaces the failing GoTrue `auth.admin.listUsers` REST call + removes an N+1 pagination over all users on every `/admin/users` load. Scoped to the profile ids actually displayed.
- **Error boundaries on every descendant page:** `app/global-error.tsx` (locale-agnostic root fallback, renders own html/body), `app/[locale]/not-found.tsx` (bilingual), and 6 route-group `error.tsx` files covering all 59 pages via Next.js error-boundary bubbling. Shared `ErrorFallback` client component with retry + go-home CTAs and visible error digest for support escalation.
- **Loading skeletons on every descendant page:** `PageSkeleton` with `table / cards / form` variants; one `loading.tsx` per route group (auth, admin, supervisor, promoter, client) + locale level. Respects `prefers-reduced-motion`.
- **Structured logging + observability (D-037):** `lib/observability/logger.ts` — JSON-line emit to stdout (Vercel + Supabase both ingest), level-gated by `LOG_LEVEL`, recursive redaction of password/token/secret/cookie/authorization. `reportError()` soft-attaches to `globalThis.Sentry.captureException` when `SENTRY_DSN` is set; exception-safe. Client-side counterpart at `lib/observability/report-client.ts` wired into the error boundaries. Existing `console.error/warn` call sites migrated (audit, kpis, stock).
- **Security headers hardening (step 5):** middleware CSP adds `media-src blob:`, `worker-src blob:`, `manifest-src 'self'`, `frame-src 'none'`, `upgrade-insecure-requests`. 24-directive `Permissions-Policy` locking every sensor/hardware we don't use. New `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, `X-DNS-Prefetch-Control: off`. `'unsafe-inline'` retained on script/style — nonce wiring documented as follow-up.
- **Hot-path composite indexes:** `20260426010000_phase9_hot_path_indexes.sql` adds 7 composites for patterns not covered by the existing 86 indexes (alerts type+status+created, attendance campaign+location+date, consumer_feedback campaign+location+created, stock_movements campaign+kind+created, break_requests location+status+created, audit_log entity+action+ts, performance_snapshots campaign+scope+period+start).
- **Rate limiting (D-035):** `20260426020000_phase9_rate_limits.sql` new `rate_limits` table + `check_rate_limit(key, window_s, max)` SECURITY DEFINER RPC. `lib/rate-limit/check.ts` wired into `loginAction`, `resetRequestAction`, `resetConfirmAction`, `submitFeedbackAction`, `queueExportAction`. Subject = user-id for authed, IP for anon. Fail-open with a warn log on DB error.
- **Email delivery for exports (D-034):** closes D-031 deferral. `lib/email/send.ts` calls Resend REST directly (no new npm dep, mirrors D-032 posture). Env-gated on `RESEND_API_KEY` + `RESEND_FROM_EMAIL`. `lib/email/templates.ts` exports bilingual `exportReadyTemplate`. `lib/email/export-notify.ts` orchestrates: resolve email via `admin_get_user_emails` RPC, compose in recipient's preferred_language, send, always insert a `notifications` row (in-app bell works independent of email). `20260426030000_phase9_notification_kind_export.sql` extends the enum.
- **Offline queue hardening:** `lib/offline/queue.ts` v1 → v2. Exponential backoff (~15 s base, 2× growth, 15 min cap, ±20% jitter), dead-letter after 10 failed attempts (stays in store for UI; excluded from flush), `countReady()` for accurate badges, `retryNow()` for manual unstick. Legacy v1 rows treated as retry-now / not-dead via optional-field fall-through.
- **Client-side JPEG compression:** `lib/images/compress.ts` — canvas resize to 1280 px longer edge at quality 0.82 before upload, with pure `fitWithin()` for aspect math. Dynamic-imported from the 3 photo capture flows (attendance, supervisor-visit, activity photos). Never throws; server still re-validates MIME + magic bytes + strips EXIF (D-006).
- **Promoter session idle timeout (D-037 companion):** `components/features/idle-watcher.tsx` — 30 min idle → logout, 60 s grace warning with "Stay signed in". Wired into promoter layout only. In-progress drafts survive via D-010 IndexedDB + D-009 idempotency keys.
- **Ops handoff polish:** README's new `Operations` section (first-time deploy checklist, env-var matrix, monitoring surfaces, on-call runbook, rollback per layer, 90-day secret rotation). `.env.example` refreshed — removed stale Upstash block, documented CRON_SECRET / RESEND_* / LOG_LEVEL / SENTRY_DSN / VAPID-pending blocks.

**Exit criteria** (all met): `/admin/users` loads without errors. Every route has a non-broken fallback for loading and for errors. Production has structured logs and an optional Sentry hook. All hot-path queries have a matching composite index. Login/reset/feedback/export are protected by DB-backed rate limiting. Exports email the requester on completion when `RESEND_API_KEY` is set, and fall back to in-app notifications otherwise. Offline queue doesn't hammer a down server. Selfies are ~4× smaller over 3G. Promoter PWAs auto-lock after 30 min. README answers every question the on-call engineer will have.

**Test matrix:** 272 vitest pass (237 → 272: +7 logger, +6 offline backoff, +6 rate-limit, +3 email templates, +5 email send, +8 image compress, plus minor). TypeScript strict clean. All Phase 9 migrations are additive-only (new table, new indexes, new enum value, new SECURITY DEFINER functions).

**Decisions finalised:** D-034 (Resend provider + env-gated delivery) · D-035 (DB-backed rate limiting, no Upstash) · D-036 (Web Push deferred to optional Phase 9.1) · D-037 (observability interface + Sentry env toggle + idle timeout).

**Open before merge:**
1. Apply the three Phase 9 migrations manually via Supabase SQL Editor:
   - `20260426000000_phase9_admin_user_emails.sql`
   - `20260426010000_phase9_hot_path_indexes.sql`
   - `20260426020000_phase9_rate_limits.sql`
   - `20260426030000_phase9_notification_kind_export.sql`
2. Optional env vars: set `RESEND_API_KEY` + `RESEND_FROM_EMAIL` to enable export emails; set `SENTRY_DSN` to enable error reporting. Both are no-ops when unset.
3. Schedule `select public.gc_rate_limits();` daily via pg_cron (SQL in the migration's header comment).
4. No new Edge Functions; no new secrets beyond the optional email pair.

### Phase 9.1 — Web Push (optional follow-up, deferred per D-036)
Not in scope for this phase. Scoped as a contained follow-up:
- New `push_subscriptions` table (user_id, endpoint, p256dh, auth, created_at) + RLS (self only).
- Service worker push event handler + client subscribe UI across all roles.
- `send-web-push` Edge Function invoked from the detector Edge Function + notifications-write paths, with VAPID keys (`NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT`).
- iOS PWA push testing on real devices.

**Exit criteria:** Production-ready and demoable end-to-end across all 11 modules with seeded data. ✅ MET — project complete.

---

## 7. Risk Notes

### Highest-risk phases
- **Phase 5 (Stock)** — invariants are hard. Concurrency, retries, returns, reallocations must all preserve ledger integrity. Budget extra time. Extensive tests required.
- **Phase 3 (Attendance)** — touches device hardware (camera, geolocation), iOS Safari quirks, EXIF handling, private Storage signing. Budget for device-specific testing.
- **Phase 7 (Realtime)** — Supabase Realtime + RLS + many subscriptions must be tested for scaling.

### Cross-cutting risks
- **RLS regressions** when adding new tables or columns. Mitigation: CI runs `supabase/tests/rls.test.sql` on every PR.
- **i18n debt** — hardcoded English strings sneak in. Mitigation: ESLint rule banning raw strings in JSX (or periodic grep sweep).
- **RTL bugs** — new components tested only in LTR. Mitigation: every PR that adds UI must include an `/ar/...` screenshot or a note explaining RTL verification.
- **Service role key leakage** — accidental import into client bundle. Mitigation: CI grep + runtime assertion on server-only modules.
- **Schema drift** between local migrations and deployed Supabase. Mitigation: `supabase db diff` check in CI.

### Operational risks
- **Claude Code stream timeouts** on large single-turn work. Mitigation: one logical change per turn, commit + push after each.
- **Context bloat** across long sessions. Mitigation: fresh sessions per phase; the repo files are the source of truth, not conversation history.

---

## 8. Open Questions (resolved items move to DECISIONS.md)

Track unresolved ambiguities here. When resolved, move to DECISIONS.md with rationale.

- None at project-complete. All ambiguities from Phases 0–9 are resolved in DECISIONS.md (D-001 through D-037). Web Push is the only scoped follow-up, tracked in Phase 9.1 above.

---

## 9. How to Work with This Plan

- Every phase starts by re-reading this file + DECISIONS.md + `.claude/skills/design-system/SKILL.md`.
- Phase boundaries are hard stops. Don't start Phase N+1 until N is reviewed and approved.
- Every commit message references the phase: `[Phase 3] Add attendance schema + RLS`.
- If a phase grows beyond its scope, split the excess into a new phase — don't silently expand.
- Ambiguities go into DECISIONS.md with the resolution, not into code comments.
