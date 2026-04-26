# Phase 7 — Code Quality, Consistency, Dead Code, Tests

> Audited: documented style + violations, naming, imports, dead code, duplication, TODO/FIXME, JSDoc, README quality, DECISIONS.md drift, tests inventory + coverage gaps + recommended additions.

---

## Headline

Code quality is **excellent** by the standards of a 46k-LOC codebase. Style is uniformly applied, naming is consistent, dead code is rare, no TODO/FIXME comments anywhere, README onboards in 15 minutes, DECISIONS.md is a living document and the code reflects every one of the architectural decisions I spot-checked.

The story changes for **tests**. The codebase has **28 test files** (~5,100 LOC, not the ~6 I incorrectly stated in Phase 1) — concentrated on algorithmic correctness in `lib/**`. Quality of existing tests is high. **What's missing is integration: zero RLS tests, zero E2E, almost no server-action tests, no component tests.** This is the single biggest tech-debt vector.

**Six findings.** None P0/P1. The big ones are the three test-coverage items.

---

## Findings table

| ID | Sev | Area | Summary | Files | Effort |
|---|---|---|---|---|---|
| QUAL-01 | P2 | Tests — RLS coverage | Zero tests verify RLS policy behavior. A single policy regression (overly-permissive `using` clause, broken USING-WITH CHECK pair) leaks data across tenants and is invisible to the test suite. The codebase is multi-tenant, so this is the highest-stakes coverage gap. | (test addition needed; recommend pgTAP under `supabase/tests/`) | L |
| QUAL-02 | P2 | Tests — server actions / route handlers | One server-action test exists (`app/[locale]/promoter/attendance/location-actions.test.ts`). The other ~30 server actions and 6 route handlers have no tests. Critical flows: `loginAction`, `inviteUserAction`, `bulkImportAction` (which has the SEC-01 bug), report submit/approve, stock allocate/distribute. | (test additions; vitest with mocked Supabase) | L |
| QUAL-03 | P2 | Tests — E2E | No browser-driven test exists. Real RLS, real Realtime, real auth flow only behave correctly in the integration. One critical-path E2E (promoter check-in → dashboard reflects it) would catch a wide class of regressions. | (Playwright; new dep) | L |
| QUAL-04 | P3 | DECISIONS.md gap | The `as unknown as RawX[]` Supabase-cast pattern (Phase 2 TS-01) appears in 12 places without an explicit decision. Either should be promoted to a D-NNN decision documenting the trade-off, OR fixed via supabase-gen-types and the pattern struck. | DECISIONS.md | XS (write decision) or M (fix the pattern) |
| QUAL-05 | P3 | Reusable helper opportunity | `pickLocalized(name_i18n, locale)` is implemented inline in 4 files (most recently `app/[locale]/admin/dashboard/page.tsx:58` from my Phase 4 work). Should live at `lib/i18n/picker.ts` and be imported. Carryover from Phase 5. | `lib/i18n/picker.ts` (new), 4 callers | XS |
| QUAL-06 | P3 | Pre-existing build warnings | Same 4 unused-eslint-disables in `lib/observability/{logger,report-client}.ts` showing in every build output. Same finding as PERF-04 / Phase 2 detail. Trivial cleanup. | `lib/observability/{logger,report-client}.ts` | XS |

---

## Section A — Style & consistency

### Documented style

- **`.claude/skills/design-system/SKILL.md` + `PATTERNS.md`** — design tokens, gradient discipline, typography hierarchy, KPI card patterns, etc.
- **`eslint.config.mjs`** — extends `next/core-web-vitals`, `typescript`, `prettier`. Enforces `@typescript-eslint/consistent-type-imports`, `_`-prefixed unused-vars exception.
- **`.prettierrc`** — semi, single quotes, trailing commas, 100-char width, Tailwind class ordering.
- **`DECISIONS.md`** — 45 architectural decisions, each with rationale, alternatives considered, and revisit conditions.

### Spot-check verdicts

| Check | Result |
|---|---|
| File names | All kebab-case (`allocate-stock-form.tsx`, `attendance-trend-chart.tsx`). 0 PascalCase or camelCase outliers. |
| Component names | All PascalCase functional components. No class components. No mixing of arrow-fn vs declaration syntax. |
| Hook names | All start with `use` (verified `lib/hooks/`). |
| Import order | All sampled files: `'server-only'` (where applicable) → external → `@/lib`/`@/components` → relative `./`. Consistent. |
| Props patterns | Destructured `interface ComponentProps` then `function Component({ prop }: Props)`. Consistent. |
| Gradient usage (D-012/SKILL.md) | Only `bg-gradient-accent` on the logo and `bg-gradient-strip` on the page accent strip. No decorative gradients on data cards. ✅ |

This is uniformly applied — the kind of consistency that's hard to retrofit and easy to break, so the discipline here is real.

---

## Section B — Dead code

**Audit method:** spot-grepped exports in `lib/`, `components/`, `types/` against import graph.

**Findings:** None significant. Sampled 30+ component and library exports; all are imported at least once. Patterns observed:

- All form components in `components/features/admin/` are imported by their corresponding `page.tsx`.
- All `lib/queries/**` helpers are imported by server actions or server components.
- All `lib/validations/**` schemas are imported by both client forms and server actions.
- The `supabase/functions/_shared/**` modules are used across the Edge Function bodies.
- Translation keys in `messages/{en,ar}.json` are referenced (sampled).

If there's dead code, it's below the noise floor for a spot-check audit. A precise sweep would require something like `ts-prune` or `knip` — not warranted today.

---

## Section C — Duplication

The codebase passes the Three Strikes test in most places I looked:

| Pattern | Sites | Verdict |
|---|---|---|
| Idempotency-key read-through (D-009) | 3 (breaks, exports, feedback) | OK — pattern is small and inline; extracting would add indirection |
| Query error pattern `if (error) return []` | 17 | Acceptable — Phase 2 TS-02 already flags this for an observability fix (add `logError`), not for extraction |
| Form components | 10 (admin) | OK — fields differ per domain; a `<FormTemplate>` wrapper wouldn't shrink LOC |
| `_shared/` mirrors between Edge & Next | enforced single-source via `supabase/functions/_shared/**` | ✅ exemplary |
| Status pill rendering | inline per consumer | OK — uses semantic tokens consistently |
| Date formatting | centralized in `lib/attendance/shift-time.ts` | ✅ |
| `pickLocalized(name_i18n, locale)` | **4 inline implementations** | ⚠️ QUAL-05 — promote to `lib/i18n/picker.ts` |

QUAL-05 is the only real duplication finding worth acting on.

---

## Section D — TODO / FIXME / HACK

**Zero occurrences** of `TODO`, `FIXME`, `HACK`, `XXX`, `@deprecated` across `app/**`, `components/**`, `lib/**`, `supabase/**`.

This is unusual and a positive signal — either the team uses an external tracker exclusively, or the work-in-progress hygiene is excellent. Either way: clean.

---

## Section E — Comments and docstrings

### Sampled lib functions (10)

All sampled functions in `lib/queries/{alerts,attendance}.ts`, `lib/auth/client-visibility.ts`, `lib/breaks/actions.ts`, `lib/exports/actions.ts`, `lib/feedback/actions.ts`, `lib/notifications/actions.ts`, `lib/stock/ledger.ts` carry leading JSDoc that:
- States purpose
- Identifies the role gate
- References relevant DECISIONS entries (D-009, D-019, D-044) where the function is decision-driven
- Notes side effects (audit log, rate limit, idempotency)

**Quality:** consistent and accurate. No drift between comment and implementation observed in the spot-check.

### Sampled server actions (10)

Same pattern. Each action has a leading comment block. Comments are accurate.

---

## Section F — README / CONTRIBUTING

### README.md — spot assessment

**Quick start path:** clone → `pnpm install` → `cp .env.example .env.local` → `pnpm dev` → done. Estimated time: under 15 minutes.

**Architecture pointers:** README links to `PLAN.md`, `DECISIONS.md`, `.claude/skills/design-system/SKILL.md`, and includes a project-layout section.

**Env vars:** `.env.example` exists, documents every required variable with inline explanation, doesn't leak any values.

**No CONTRIBUTING.md** — but the README has a "Contributing" section with ESLint / TypeScript / i18n guidelines.

**Verdict:** Excellent. A new dev onboards quickly with no missing pieces.

---

## Section G — DECISIONS.md drift

Spot-checked the most architecturally-loaded decisions:

| Decision | Implementation matches? |
|---|---|
| **D-009** (Idempotency UUID v4 on every promoter/supervisor write) | ✅ — all three sampled actions implement the read-through pattern |
| **D-019** (Client visibility: aggregates only, signed URLs, per-campaign thresholds) | ✅ — `lib/auth/client-visibility.ts` implements scrubbing; no RLS grant for `client` on attendance rows |
| **D-028** (No recharts; pure-SVG sparkline) | ✅ — comment in `sparkline.tsx`; new dashboard chart `attendance-trend-chart.tsx` followed the same pattern |
| **D-040** (Per-client visibility toggles) | ✅ — `clients` table has the four boolean columns; `getClientVisibility(clientId)` reads them |
| **D-044** (SSR client for guarded profile UPDATEs) | ✅ in `inviteUserAction`, `changeUserRoleAction`, `setUserActiveAction`. ❌ **violated** in `bulkImportAction` (already SEC-01) |
| **D-045** (text-4xl scoped to /admin/dashboard KPIs) | ✅ — only the dashboard `KpiCard` uses text-4xl |

The only drift is the SEC-01 violation already captured in Phase 3.

### QUAL-04 — One pattern that should be promoted to a decision

The `as unknown as RawX[]` Supabase-cast pattern (Phase 2 TS-01) appears 12 times. It's repeated 3+ times, has a real trade-off (typescript safety vs. supabase-gen-types tooling), and isn't documented anywhere. Either:
- Promote to D-NNN: "We accept `as unknown as` for embedded selects until we adopt `supabase gen types`. Reason: …"
- Or: adopt `supabase gen types` and strike the pattern (the structural fix from Phase 2).

The first option is XS effort and stops the pattern from spreading without a documented decision.

---

## Section H — Tests

### Inventory

**28 test files, ~5,100 LOC.** I corrected my Phase 1 statement that "essentially no tests exist" — that was wrong. Phase 1 only counted the top-20 by LOC; 22 smaller tests exist outside that window.

Coverage by area:

| Area | Pure-fn unit | Component | Server-action | Route-handler | RLS | E2E |
|---|---|---|---|---|---|---|
| Auth (login/reset/set-password) | ✓ client-visibility | ✗ | ✗ | ✗ | ✗ | ✗ |
| Attendance | ✓ detection | ✗ | ✓ partial (location-actions) | ✗ | ✗ | ✗ |
| Campaigns | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Reports | ✓ builders, compose | ✗ | ✗ | ✗ | ✗ | ✗ |
| Stock | ✓ ledger, validation | ✗ | ✗ | ✗ | ✗ | ✗ |
| Alerts | ✓ detect, spec-cases | ✗ | ✗ | ✗ | ✗ | ✗ |
| Live dashboard | ✓ kpis, rollups, tiering | ✗ | ✗ | ✗ | ✗ | ✗ |
| Exports | ✓ builders, xlsx, zip | ✗ | ✗ | ✗ | ✗ | ✗ |
| Imports | ✓ parse, schemas | ✗ | ✗ | ✗ | ✗ | ✗ |
| Notifications | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| i18n | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Location trust | ✓ detect, ipqs, record | ✗ | ✗ | ✗ | ✗ | ✗ |
| Offline queue | ✓ queue | ✗ | ✗ | ✗ | ✗ | ✗ |

### Quality of existing tests (3 sampled in depth)

- **`lib/stock/ledger.test.ts` (731 LOC)** — high quality. Spec-grounded scenario (Almarai yoghurt example), edge cases covered (zero/negative, NaN, over-consumption, self-loops, conservation invariants on empty / pre-resolution / post-resolution), specific structural assertions.
- **`lib/kpis/compute.test.ts` (297 LOC)** — high quality. Ground-truth fixture (Almarai Safeway Jubeiha with known KPI targets). Null denominators, empty days, division-by-zero, weighted aggregation across rollups all tested.
- **`lib/alerts/detect.test.ts` (288 LOC)** — high quality. Threshold boundaries, zero-threshold-disables, null metrics don't fire, batch logic with mixed inputs.

These three would be a strong reference for any new tests — the team clearly knows how to write good tests when they decide to.

### Recommended new tests (minimal high-impact set, ~37h total)

| # | Area | Test | Type | Effort |
|---|---|---|---|---|
| 1 | Auth | `loginAction` invalid creds / not-found / rate-limit / inactive | vitest + mocked Supabase | 4h |
| 2 | Auth | Password-reset flow (request → confirm → set-password) | vitest | 3h |
| 3 | Stock | `allocateStockAction`, `distributeStockAction` | vitest + mocked Supabase | 5h |
| 4 | Reports | Submit → review → approve/reject lifecycle | vitest | 4h |
| 5 | Campaigns | Create + assign locations + assign SKUs | vitest | 4h |
| 6 | RLS | Policies on `attendance`, `daily_reports`, `stock_movements`, `notifications` (cross-tenant leak prevention) | pgTAP under `supabase/tests/` OR vitest+real-test-DB | 6h |
| 7 | Imports | `bulkImportAction` end-to-end with CSV fixture, including the post-create profile UPDATE (would catch SEC-01) | vitest + mocked Supabase | 4h |
| 8 | E2E | Promoter check-in → live dashboard reflects it | Playwright | 8h |

### Test-framework recommendation

- **Keep vitest for lib/server-action tests.** It's already doing its job well.
- **Add Playwright for 1–2 critical E2E paths.** Real Realtime + RLS + auth only behave correctly in the integration. Cost: ~2 days setup + ~1 day per test. Catches a wide class of bugs.
- **pgTAP (or Supabase test client) for RLS** — strongly recommended given multi-tenant nature. A single bad RLS policy leaks data across organizations and is otherwise undetectable.
- **Skip React Testing Library for now.** No urgent need; the codebase is heavily server-side. Revisit if the live dashboard or attendance flow grows interactive complexity.

---

## Overall verdict

Code quality: **A**. Style discipline, dead-code hygiene, comment quality, README onboarding, DECISIONS.md adherence are all uniformly excellent.

Test discipline: **B−** for what exists (high-quality unit tests covering critical algorithms), but the integration / E2E / RLS gap is real and earns the B−. The platform is multi-tenant and security-sensitive; running it without RLS regression tests is a calculated risk that depends on careful policy review on every migration.

The right framing isn't "tests are missing" — it's "the next 35–40 hours of test investment would buy a lot of confidence." The 8-test plan above is what I'd write first.

---

## End of Phase 7.
