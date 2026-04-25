# Promoter Monitoring & Reporting Platform

A bilingual (Arabic + English) SaaS platform for Consumer Engagement & Field Execution Management. Manages field marketing campaigns end-to-end: planning, attendance with GPS + selfie validation, live sales/sampling tracking per SKU, multi-level stock control, real-time monitoring, performance analytics, and full data export.

> **Status: Project complete.** Phases 0–9 shipped. 272 vitest pass; TypeScript strict with zero `any`. Ops handoff checklist lives in [§ Operations](#operations).

## Documentation

- [`PLAN.md`](./PLAN.md) — architecture, phased delivery plan, risk notes. **Source of truth.**
- [`DECISIONS.md`](./DECISIONS.md) — resolved ambiguities with rationale.
- [`.claude/skills/design-system/SKILL.md`](./.claude/skills/design-system/SKILL.md) — design system rules (authoritative for all UI).
- [`.claude/skills/design-system/PATTERNS.md`](./.claude/skills/design-system/PATTERNS.md) — copy-paste component examples.

## Tech Stack

- **Frontend:** Next.js 15 (App Router) + TypeScript strict + Tailwind CSS + shadcn/ui
- **Backend:** Supabase (Postgres + Auth + Storage + Realtime + Edge Functions)
- **Hosting:** Vercel (frontend + server actions) + Supabase (backend)
- **i18n:** next-intl (Arabic RTL + English LTR)
- **Validation:** zod (strict)
- **Forms:** react-hook-form + zod resolver
- **Server state:** TanStack Query

See `PLAN.md` for the complete list.

## Local Development

### Prerequisites

- Node.js 20+ (tested on 22)
- pnpm 10+ (the repo declares `packageManager` so corepack will pick the right version automatically)
- Supabase CLI (only required once Phases 1+ start adding migrations)
- Docker (only required if running local Supabase via `supabase start`)

### Quick start

```bash
# 1. Install dependencies
pnpm install

# 2. Copy env template and fill in values
cp .env.example .env.local

# 3. (Optional, Phases 1+) Boot local Supabase
supabase start

# 4. Start the Next.js dev server
pnpm dev
```

Open http://localhost:3000 — the i18n middleware will redirect you to your preferred locale. Direct links:

- http://localhost:3000/en — English landing
- http://localhost:3000/ar — Arabic landing (RTL)
- http://localhost:3000/en/hello — bilingual demo with shadcn Button + RTL logical-property check
- http://localhost:3000/ar/hello — same page, mirrored

### Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Start Next.js dev server on :3000 |
| `pnpm build` | Production build (also runs lint + typecheck) |
| `pnpm start` | Serve the production build |
| `pnpm typecheck` | `tsc --noEmit` — strict TypeScript check |
| `pnpm lint` | ESLint flat config (next/core-web-vitals + typescript + prettier) |
| `pnpm format` | Prettier write — formats code + Tailwind class ordering |
| `pnpm format:check` | Prettier check (CI-friendly) |
| `pnpm test` | Vitest unit + integration suite |
| `pnpm test:rls` | pgTAP RLS suite via `supabase db test` (requires Docker + Supabase CLI) |

### Testing

Two suites live in this repo. They run independently and target different
risk surfaces.

- **Unit / integration tests (`pnpm test`)** — vitest. Lives at
  `lib/**/*.test.ts` and a handful of action-level tests under
  `app/[locale]/**/*.test.ts`. Pure-function correctness, no DB.

- **RLS regression tests (`pnpm test:rls`)** — pgTAP under
  `supabase/tests/`. Spins up the local Supabase Postgres (port `54322`
  per `supabase/config.toml`), applies all migrations + seeds + the
  `pgtap` extension, then runs every `*.test.sql` in the directory as a
  rolled-back transaction. Each test impersonates a Supabase auth role
  via `set_config('request.jwt.claims', …)` and asserts the policy
  shape — both positive ("admin can SELECT") and negative ("supervisor X
  cannot UPDATE supervisor Y's location's row").

  The suite covers ~140 assertions across 12 files; the RLS-specific
  files start with `rls-` (the older `phase*` / `feature*` files mix
  RLS, constraints, and trigger checks). Highest-stakes tables under
  coverage: `profiles`, `attendance`, `daily_reports`, `notifications`,
  `tasks`, `break_requests`, `alerts`, plus the cross-tenant cluster
  (`campaigns`, `clients`, `consumer_feedback`, `export_jobs`,
  `performance_snapshots`, `stock_movements`).

  Requires the Supabase CLI (`brew install supabase/tap/supabase` or
  the [official installer](https://supabase.com/docs/guides/cli)) and a
  running Docker daemon. First run will pull the Postgres + Studio
  container images; subsequent runs are fast.

### Project layout

See `PLAN.md` §3. Key directories:

- `app/[locale]/` — App Router pages, scoped under `/en` and `/ar`
- `components/ui/` — shadcn primitives (Button only at Phase 0; others added when used)
- `i18n/` — next-intl routing, request config, locale-aware navigation
- `messages/` — translation JSON per locale
- `lib/` — shared utilities (`cn()` helper)
- `middleware.ts` — i18n routing + security headers (CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy)
- `public/manifest.json`, `public/sw.js` — PWA scaffold (hand-written service worker, no Workbox)
- `supabase/` — config, migrations, Edge Functions, RLS tests (populated in Phases 1+)

## Environment Variables

See [`.env.example`](./.env.example) for the full list of required variables. Never commit `.env*` files with real values.

Key variables:
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL (safe to expose)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key (safe to expose)
- `SUPABASE_SERVICE_ROLE_KEY` — **server-only**, never ship to the browser

## Deployment

### Frontend (Vercel)

1. Import the repo into Vercel. Framework preset auto-detects Next.js.
2. Set the env vars from `.env.example` in the Vercel project settings (use separate values for Preview vs Production).
3. The build command is `pnpm build` (Vercel runs it automatically). Output is `.next/`.
4. PWA assets in `public/` are served as static files.

### Backend (Supabase)

1. Create a Supabase project (recommend separate orgs/projects for preview and production).
2. Note the project ref and copy the URL / anon key / service-role key into the corresponding env vars.
3. Link the local CLI: `supabase link --project-ref <ref>`.
4. From Phase 1 onwards, migrations live in `supabase/migrations/` and are applied via `supabase db push` (manually or in CI).

### Security headers

Sent by `middleware.ts` on every page response: CSP (Phase 9 hardened — `frame-src 'none'`, `manifest-src 'self'`, `worker-src 'self' blob:`, `media-src 'self' blob:`, `upgrade-insecure-requests` in prod; `'unsafe-inline'` retained on script+style until nonce wiring lands), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, 24-directive `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`, `X-DNS-Prefetch-Control: off`, and `Strict-Transport-Security` in production.

## Operations

**Target audience:** Almarai ops / on-call engineer handling day-to-day running of the deployed platform.

### First-time deploy checklist

1. **Create the Supabase project** (one per environment: `preview`, `production`). Note the project ref; it's `gzcooygyyinfvigivicx` for the current production project.
2. **Set env vars in Vercel + Supabase:**

   | Variable | Where | Required? | Purpose |
   |---|---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Vercel | Yes | Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel | Yes | Browser-safe Supabase key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Vercel (server only) | Yes | Full-access server key. Never ship to browser |
   | `NEXT_PUBLIC_APP_URL` | Vercel | Yes | Public origin, e.g. `https://app.promoter.example`. Used in password-reset redirectTo + email CTAs |
   | `CRON_SECRET` | Supabase Edge Function secrets | Yes | Shared secret for cron endpoints. Rotate quarterly |
   | `LOG_LEVEL` | Vercel | Optional | `debug` \| `info` (default) \| `warn` \| `error` |
   | `SENTRY_DSN` | Vercel | Optional | If set, `reportError()` forwards to Sentry; otherwise structured logs only |
   | `RESEND_API_KEY` | Vercel (server only) | Optional | If unset, export-ready emails are skipped (in-app notifications still fire) |
   | `RESEND_FROM_EMAIL` | Vercel | Optional (pairs with `RESEND_API_KEY`) | Verified sender address |

3. **Apply all migrations in `supabase/migrations/` in chronological order** via the Supabase SQL Editor or `supabase db push`. At production cut-over (Phase 9) the full set is ~37 files. All Phase 9 migrations are additive-only (no destructive changes).
4. **Deploy all Edge Functions** via `supabase functions deploy <name>`. Current set:
   - `geo-validate-checkin`
   - `geo-validate-checkout`
   - `supervisor-visit-create`
   - `detect-attendance-issues` (cron, verify_jwt off, shared-secret)
   - `compute-kpis` (targeted + sweep)
   - `stock-reconcile` (cron + targeted)
   - `detect-live-issues` (cron, 10 min)
   - `generate-report` (targeted + sweep)
   - `cron-scheduled-reports` (cron, hourly)
5. **Schedule cron jobs** via pg_cron (README for each function has the SQL):

   | Function | Cadence |
   |---|---|
   | `detect-attendance-issues` | every 5 min |
   | `detect-live-issues` | every 10 min |
   | `stock-reconcile` (sweep) | every 15 min |
   | `compute-kpis` (sweep) | hourly |
   | `cron-scheduled-reports` | hourly |
   | `gc_rate_limits` (DB function, no Edge Fn) | daily |

6. **Verify Realtime publication** is enabled on `attendance`, `alerts`, `break_requests`, `notifications`, `kpi_snapshots`, `stock_movements` (set in `20260424030000_phase7_realtime_publication.sql`).
7. **Seed the first admin user** by running `insert into auth.users` + profile manually in SQL, then invite other users from `/admin/users`.

### Monitoring

- **Vercel → Logs**: all server-action + route-handler errors. Structured JSON lines are searchable.
- **Supabase → Logs**: Postgres errors, Edge Function invocation logs, Realtime channel stats.
- **Sentry (if enabled)**: unhandled exceptions from `reportError()` and the client error boundary.
- **`audit_log` table**: first-line forensics for every sensitive action (logins, role changes, stock movements, export requests, rate-limit hits).
- **`export_jobs.status`**: look for stuck `running` rows (should never persist — the sync Server Action or sweep will clear them).

### On-call runbook

| Symptom | First check | Likely cause |
|---|---|---|
| Promoter can't check in | Edge Function logs for `geo-validate-checkin` | Geofence / EXIF / storage upload failure |
| Users report logins failing | `audit_log` for `auth.login_rate_limited` rows | Someone is brute-forcing; rate limit is doing its job |
| Live dashboard not updating | Supabase Dashboard → Realtime → active channels | Publication missed, or client WebSocket blocked |
| Exports stuck "running" | `export_jobs` rows + Edge Function logs | `generate-report` timed out; rerun sweep mode |
| Stock balances look wrong | `stock_movements` ledger is the source of truth | Check for concurrent distributions; invariant trigger should have blocked any illegal state |
| Notifications bell empty | `notifications` table + Realtime channel filter | RLS or realtime filter mismatch |

### Rollback

- **Vercel**: Deployments tab → "Promote to Production" on the prior good build. Instant (edge cache flushed within minutes).
- **Supabase**: migrations are forward-only. Phase 9 additions are all additive (new table, new indexes, new enum value, new SECURITY DEFINER function). To "roll back":
  - New indexes: `drop index if exists <name>;` — safe, no data loss.
  - `rate_limits` table + helper functions: `drop function public.check_rate_limit(...);` + `drop table public.rate_limits;` — safe.
  - `admin_get_user_emails` function: `drop function public.admin_get_user_emails(uuid[]);` but the app falls back to the broken GoTrue endpoint — don't do this without reverting the code change.
  - The `export_ready` enum value cannot be removed; it's harmless if never inserted.
- **Edge Functions**: `git checkout <prev-sha> -- supabase/functions/<name> && supabase functions deploy <name>`.

### Secret rotation

Every 90 days, rotate and redeploy:
- `SUPABASE_SERVICE_ROLE_KEY` (Supabase Dashboard → Settings → API)
- `CRON_SECRET` (regenerate, update on each Edge Function + pg_cron job)
- `RESEND_API_KEY` if email delivery is in use

## Contributing

- Every PR references the current phase in the title: `[Phase N] Short description`.
- TypeScript strict mode is on; no `any` without a justified comment.
- ESLint + Prettier enforced in CI.
- RLS tests in `supabase/tests/rls.test.sql` must pass.
- UI work must match the design system in `.claude/skills/design-system/`.
- Bilingual: every UI string goes through `messages/*.json`. No hardcoded English.

## License

Proprietary. All rights reserved.
