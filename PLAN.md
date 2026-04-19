# PLAN.md — Promoter Monitoring & Reporting Platform

**Status:** Phases 0–5 merged to `main`. Phase 6 (Performance Management) complete on branch `claude/phase-6-planning-f4pul`, pending review + manual migration application.
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

### Phase 7 — Real-Time Monitoring + Breaks (Modules 8 + 9)
Scope:
- Supabase Realtime subscriptions for live dashboard
- Dashboard: active promoters, attendance status, live sales/sampling tallies, stock status, with drill-down
- Auto issue detection (absence, low performance, no activity, stock shortage)
- Break request flow (promoter submit, supervisor approve/reject/modify)
- Web Push notifications + in-app notifications

**Exit criteria:** All 5 cases from spec pages 18–20 (Late, Absent, Low Performance, Stock Shortage, No Check-Out) work end-to-end with alerts and logged resolutions.

### Phase 8 — Feedback + Reporting/Export (Modules 10 + 11)
Scope:
- Feedback schema (structured + unstructured + competitor mentions) with forms
- Scheduled reports: Edge Functions on cron (daily/weekly/end-of-campaign)
- On-demand generation
- Export formats: raw CSV/JSONL + summarized XLSX with per-domain sheets
- Signed Storage URL delivery via email
- Role-scoped export (Client exports only their own campaigns — enforced in SQL)

**Exit criteria:** Admin triggers an end-of-campaign export for Almarai; receives an email with a signed URL; downloaded XLSX has sheets for Attendance, Activity, Stock, Performance, Supervisor Actions, Feedback; Client cannot export another client's campaign.

### Phase 9 — Hardening & Polish
Scope:
- Full `SECURITY_AUDIT.md` rerun against live code
- Performance audit (indexes, N+1 checks, query plans)
- Accessibility pass (WCAG AA, keyboard nav, screen reader)
- Mobile polish on real devices
- Seeded demo (Almarai: Safeway Jubeiha, C-Town, Cozmo; 3 promoters, 1 supervisor, SKUs, 1 week synthetic data)
- Deployment docs: Supabase project setup, Vercel env config, custom domain

**Exit criteria:** Production-ready. Security audit clean of Critical/High. All 11 modules demoable end-to-end with seeded data.

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

- None at Phase 0 start. All initial ambiguities are resolved in DECISIONS.md.

---

## 9. How to Work with This Plan

- Every phase starts by re-reading this file + DECISIONS.md + `.claude/skills/design-system/SKILL.md`.
- Phase boundaries are hard stops. Don't start Phase N+1 until N is reviewed and approved.
- Every commit message references the phase: `[Phase 3] Add attendance schema + RLS`.
- If a phase grows beyond its scope, split the excess into a new phase — don't silently expand.
- Ambiguities go into DECISIONS.md with the resolution, not into code comments.
