# Promoter Monitoring & Reporting Platform

A bilingual (Arabic + English) SaaS platform for Consumer Engagement & Field Execution Management. Manages field marketing campaigns end-to-end: planning, attendance with GPS + selfie validation, live sales/sampling tracking per SKU, multi-level stock control, real-time monitoring, performance analytics, and full data export.

> **Status:** Early development. Phase 0 (foundation) in progress.

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

> Full setup instructions will be added in Phase 0.

### Prerequisites
- Node.js 20+
- pnpm 9+
- Supabase CLI
- A Supabase project (or local Supabase via `supabase start`)

### Quick start (placeholder — finalized in Phase 0)

```bash
# 1. Install dependencies
pnpm install

# 2. Copy env template and fill in values
cp .env.example .env.local

# 3. Run local Supabase (optional, if not using hosted)
supabase start

# 4. Apply migrations
supabase db push

# 5. Start dev server
pnpm dev
```

Open http://localhost:3000/en or http://localhost:3000/ar.

## Environment Variables

See [`.env.example`](./.env.example) for the full list of required variables. Never commit `.env*` files with real values.

Key variables:
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL (safe to expose)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key (safe to expose)
- `SUPABASE_SERVICE_ROLE_KEY` — **server-only**, never ship to the browser

## Deployment

> Finalized in Phase 0.

- **Frontend:** deploy to Vercel. Configure env vars in the Vercel dashboard.
- **Backend:** Supabase project (separate envs for preview and production recommended).
- **Migrations:** apply via `supabase db push` in CI.

## Contributing

- Every PR references the current phase in the title: `[Phase N] Short description`.
- TypeScript strict mode is on; no `any` without a justified comment.
- ESLint + Prettier enforced in CI.
- RLS tests in `supabase/tests/rls.test.sql` must pass.
- UI work must match the design system in `.claude/skills/design-system/`.
- Bilingual: every UI string goes through `messages/*.json`. No hardcoded English.

## License

Proprietary. All rights reserved.
