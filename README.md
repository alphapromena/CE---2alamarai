# Promoter Monitoring & Reporting Platform

A bilingual (Arabic + English) SaaS platform for Consumer Engagement & Field Execution Management. Manages field marketing campaigns end-to-end: planning, attendance with GPS + selfie validation, live sales/sampling tracking per SKU, multi-level stock control, real-time monitoring, performance analytics, and full data export.

> **Status:** Phases 0–5 shipped. Phase 5 (Stock Management) adds the append-only `stock_movements` ledger, RPC-backed reallocate + correct, a `stock-reconcile` Edge Function with sweep + targeted modes, and full admin/supervisor/promoter UI. The Almarai 1000-cup ground-truth scenario executes end-to-end in vitest.

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

Sent by `middleware.ts` on every page response: CSP (production tightening planned in a later phase), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(self), geolocation=(self), microphone=()`, and `Strict-Transport-Security` in production.

## Contributing

- Every PR references the current phase in the title: `[Phase N] Short description`.
- TypeScript strict mode is on; no `any` without a justified comment.
- ESLint + Prettier enforced in CI.
- RLS tests in `supabase/tests/rls.test.sql` must pass.
- UI work must match the design system in `.claude/skills/design-system/`.
- Bilingual: every UI string goes through `messages/*.json`. No hardcoded English.

## License

Proprietary. All rights reserved.
