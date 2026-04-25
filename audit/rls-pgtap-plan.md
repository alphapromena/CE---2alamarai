# RLS pgTAP Coverage — Plan (QUAL-01)

> **Phase 1 deliverable.** Read-only inventory + plan. Phase 2 proceeds only
> after explicit go-ahead per the PR brief.

---

## Headline finding

**The audit's "zero RLS test coverage" claim is incorrect.** The codebase
already has **8 pgTAP test files** under `supabase/tests/` with **~106
RLS-shaped assertions** covering ~15 of the 32 RLS-enabled tables. They
were written incrementally per phase (`phase2.test.sql`, `phase5.test.sql`,
`feature3.test.sql`, etc.) and follow the same impersonate-and-assert
pattern the audit recommended.

What's actually missing:

1. **An `npm script` to run the suite.** Tests exist but `package.json`
   has no `test:rls` entry. Devs may not know they're there.
2. **Coverage gaps** for ~17 tables, including 2 of the 4 audit-named
   highest-stakes targets (`daily_reports`, `notifications`).
3. **Documentation** in the README pointing to the existing suite.

This PR's real shape is **smaller than the brief assumed**: add a runner,
fill the most important gaps, document. Not a from-scratch buildout.

Also flagging for the user's spec: **the RLS surface is 32 tables**, which
trips the brief's stop condition (">20 tables with active policies").

---

## 1.1 — RLS surface inventory (32 tables)

All have `enable row level security`. None set `FORCE ROW LEVEL SECURITY`
(verified by grep — service-role bypass is the documented isolation model).

Grouped by tier (defined in §1.3 below).

### Tier 1 — cross-tenant leak surface (12 tables)

| Table | Role-relevant ops | Existing test? |
|---|---|---|
| `profiles` | all roles | ✅ `rls.test.sql` |
| `clients` | admin write, client self-read | ✅ `feature3.test.sql` |
| `campaigns` | admin write, supervisor/promoter/client read | ✅ `phase2.test.sql` |
| `campaign_locations` | admin write, RLS via `user_visible_campaign_ids()` | ❌ touched as fixture only |
| `attendance` | promoter write, supervisor approve, admin all | ⚠️ partial (UPDATE only — `feature4.test.sql`) |
| `daily_reports` | promoter write, supervisor approve | ❌ **gap** |
| `sales_entries` | promoter write within own report | ❌ gap |
| `stock_movements` | append-only ledger, role-scoped | ✅ `phase5.test.sql` |
| `stock_reconciliations` | append-only, supervisor scope | ✅ `phase5.test.sql` |
| `consumer_feedback` | promoter write, client aggregate-only | ✅ `phase8.test.sql` |
| `competitor_mentions` | inherits parent feedback visibility | ✅ `phase8.test.sql` |
| `export_jobs` | requester self, admin all | ✅ `phase8.test.sql` |

**Tier 1 status:** 9 covered, 3 gaps (campaign_locations, daily_reports, sales_entries).

### Tier 2 — privilege-escalation / per-user write surface (10 tables)

| Table | Role-relevant ops | Existing test? |
|---|---|---|
| `audit_log` | append-only by self; admin read | ✅ `rls.test.sql` |
| `user_assignments` | admin write, sync to `profiles.assigned_locations` | ✅ `phase2.test.sql` (write + sync trigger) |
| `tasks` | supervisor create, promoter status updates | ❌ gap |
| `break_requests` | promoter create, supervisor approve | ❌ gap |
| `alerts` | system-authored, supervisor resolve | ❌ gap |
| `supervisor_visits` | supervisor write at assigned, promoter self-read | ✅ `feature4.test.sql` |
| `activity_photos` | promoter write own report, supervisor read scope | ❌ gap |
| `kpi_snapshots` | system-written, role-scoped read | ❌ gap |
| `performance_snapshots` | system-written, multi-scope read | ✅ `phase6.test.sql` |
| `notifications` | per-user delivery, self-read only | ❌ **gap** |

**Tier 2 status:** 4 covered, 6 gaps. The audit specifically flagged `notifications` as one of the 4 highest-stakes targets — currently uncovered.

### Tier 3 — read-mostly reference + system-internal (10 tables)

| Table | Role-relevant ops | Existing test? |
|---|---|---|
| `regions` | read for everyone, admin write | ❌ low-risk gap |
| `cities` | read for everyone, admin write | ❌ low-risk gap |
| `locations` | read for everyone, admin write | ❌ low-risk gap |
| `shifts` | read for assigned, admin write | ❌ low-risk gap |
| `skus` | read for campaign, admin write | ✅ `phase2.test.sql` (covered as part of cross-tenant) |
| `location_pings` | promoter self-write, supervisor read scope | ✅ `feature5.test.sql` |
| `scheduled_reports` | client own, admin all | ❌ gap |
| `import_audit` | admin only | ❌ gap |
| `rate_limits` | system-internal (RPC-only) | ❌ gap |
| `ip_reputation` | system-internal (Feature 2) | ❌ gap |

**Tier 3 status:** 2 covered, 8 gaps. Lower stakes — wrong policy here is more likely "everyone can read" than "wrong tenant can read".

### Surface summary

- Total RLS-enabled tables: **32**
- Tested in some form: **15** (47%)
- Untested: **17** (53%)
- Existing assertion count: **~106** (8 files)
- `FORCE ROW LEVEL SECURITY`: **0 tables** — service role bypasses RLS by design

---

## 1.2 — SECURITY DEFINER helpers used in policies

All in `public` schema unless noted. All have `set search_path = public, pg_catalog` per D-008.

| Function | Purpose | Used by |
|---|---|---|
| `is_admin()` | `auth.uid()` matches a profile with `role='admin'` and `active=true` | every admin-only USING/WITH CHECK |
| `current_role()` | returns `user_role` of caller (NULL if inactive) | scattered policy checks |
| `is_active()` | shorthand `active=true` filter for `auth.uid()` | scattered |
| `current_client_id()` | tenant id for `role='client'` callers (NULL otherwise) | every tenant-scoped table's USING |
| `user_visible_campaign_ids()` | set of campaign_ids the caller can see (handles campaign_locations recursion fix from `20260424000000_fix_campaign_locations_rls_recursion.sql`) | `campaign_locations`, `campaigns` SELECT policies |
| `admin_get_user_emails(p_user_ids)` | pulls `auth.users.email` for a UUID list (admin-only RPC) | not in policies; used by admin server actions |
| `handle_new_user()` | trigger that materialises `profiles` from `auth.users.raw_user_meta_data` | INSERT trigger on `auth.users` |
| `profiles_self_update_guard_trg` (function: `profiles_block_self_role_change`) | rejects guarded-column changes when `auth.uid()` isn't admin | BEFORE UPDATE on `profiles` (the D-044 mechanism) |
| `set_updated_at()` | maintains `updated_at` column | many tables |
| `user_assignments_sync_trigger()` | mirrors writes to `profiles.assigned_locations` | AFTER on `user_assignments` |

**Bypass risk note:** all of these are `security definer` with locked
`search_path`. Calling them from RLS policies is safe because they evaluate
against `auth.uid()` (which is NULL for the service-role client). Service
role bypasses RLS unconditionally — the audit's D-044 finding (SEC-01)
already documented this.

**Test coverage of helpers themselves:**
- `is_admin()` is sanity-checked in `rls.test.sql:298` (`select ok(public.is_admin(), …)`).
- `handle_new_user()` is verified in 4 tests at `rls.test.sql:31-50`.
- The other helpers are exercised transitively by the policies that call
  them. No direct unit tests.

---

## 1.3 — Tier definitions

- **Tier 1** — wrong USING clause **directly** leaks data across tenants
  or across user boundaries. Highest-stakes; admin/supervisor/promoter/
  client all interact with these tables.
- **Tier 2** — wrong policy lets a low-privilege role write rows they
  shouldn't, or read records intended for another user (per-user, not
  cross-tenant). Privilege escalation surface.
- **Tier 3** — reference tables, mostly read-public; admin-only writes
  with low blast radius if the write side ever broke.

---

## 1.4 — Recommended Phase 2/3 scope

The audit's own §S1 / Section "8-test plan" specifically called out the **4
highest-stakes tables**: `attendance`, `daily_reports`, `stock_movements`,
`notifications`.

Of those:
- `stock_movements` ✅ already covered (`phase5.test.sql`)
- `attendance` ⚠️ partial (`feature4.test.sql` covers UPDATE/supervisor-override; SELECT and INSERT under each role are untested)
- `daily_reports` ❌ gap
- `notifications` ❌ gap

### Recommended starting scope (4 files, ~30 assertions total)

| New test file | Tables | Why |
|---|---|---|
| `supabase/tests/rls-attendance.test.sql` | `attendance` | Complete the partial coverage. SELECT/INSERT/DELETE per role; cross-supervisor isolation; supervisor cannot see another supervisor's promoters. ~10 assertions. |
| `supabase/tests/rls-daily-reports.test.sql` | `daily_reports` + `sales_entries` + `activity_photos` (the report family) | Per-promoter ownership; supervisor sees scope only; cross-supervisor isolation; client cannot see promoter PII. ~10 assertions. |
| `supabase/tests/rls-notifications.test.sql` | `notifications` | Per-user delivery; user cannot see another user's notifications. Small surface, easy ~6 assertions. |
| `supabase/tests/rls-tasks-breaks-alerts.test.sql` | `tasks`, `break_requests`, `alerts` | Tier 2 promoter/supervisor write surface; ~10 assertions covering "promoter can write own break_request, supervisor approves at own location, cross-supervisor blocked". |

### Plus infrastructure (Phase 2)

- Add `test:rls` npm script wrapping `supabase db test`.
- Add `supabase/tests/_helpers.sql` (or extract from existing test files)
  for the shared `tests_auth_as(uuid)` impersonation helper currently
  duplicated across all 8 files.
- README "Testing" section: document `pnpm test:rls` and the 8 existing
  test files.

### Tier 3 left for follow-up

8 reference/system tables uncovered. Lower stakes; not worth the next 2-3
hours unless you want completeness.

### Estimated effort

- Phase 2 (PoC + infrastructure): **~1.5h** as the brief estimated
- Phase 3 (3 more files = 26 assertions): **~2h**
- README + cleanup: **~0.5h**

**Total: ~4h,** vs. the brief's "L" estimate. The existing scaffolding
saves most of the time.

---

## Test infrastructure plan

### Where pgTAP runs

Local Supabase dev DB via `supabase db test`. The CLI runs every `*.test.sql`
in `supabase/tests/` against a fresh database (it applies migrations + seeds
+ extensions, then runs each test file as one transaction with `rollback` at
the end).

Verify this is the right command for the project's CLI version: this repo's
`config.toml` shows `db.major_version = 15` and the existing test files'
header comment says "Run with: supabase db test" — so the existing dev
workflow already uses this.

Proposed `package.json` entry:

```json
"test:rls": "supabase db test"
```

### Test file location

`supabase/tests/` — match the existing layout. Naming: `rls-<table>.test.sql`
or `rls-<group>.test.sql` to make the suite's purpose obvious vs. the older
`phaseN.test.sql` / `featureN.test.sql` files (which mix RLS with constraint
and trigger tests).

The brief suggested a `supabase/tests/rls/` subdirectory. **Recommend
against** — the existing 8 files don't sub-folder, and the Supabase CLI
test runner walks the directory non-recursively (need to verify, but
flat-layout matches the repo convention).

### Test data strategy

All 8 existing files use **option A** (transaction-per-file with rollback).
Fixtures inserted at the top of each file, asserts run, `rollback` discards.
This is the right pattern; new tests follow the same shape.

### Role simulation

The existing `tests_auth_as(p_user_id uuid)` helper at `rls.test.sql:55-64`
sets both `role` and `request.jwt.claims` per the standard Supabase pattern:

```sql
create or replace function tests_auth_as(p_user_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user_id::text,
    'role', 'authenticated'
  )::text, true);
end;
$$;
```

This is duplicated verbatim in `phase2.test.sql`, `phase5.test.sql`,
`phase6.test.sql`, `phase8.test.sql`, `feature3.test.sql`,
`feature4.test.sql`, `feature5.test.sql`. **Should be extracted to a
shared `_helpers.sql`** (the brief's §2.3 plan), but doing so means
editing 8 existing files to remove their local copies — risk of
breaking the existing suite if the load order is wrong.

**Decision request:** for Phase 2, extract the helper or leave it duplicated?

- **Extract:** cleaner, but touches all 8 files and risks changing load
  order. Validate by running the full suite before/after.
- **Leave duplicated:** new files copy the helper. Adds a tiny bit of
  duplication; zero risk to existing tests.

Recommend **leave duplicated** for this PR; do the extraction in a
follow-up if it's worth the churn.

### Assumed CLI behavior

`supabase db test` is a Supabase CLI subcommand. Documented at
[supabase docs](https://supabase.com/docs/reference/cli/supabase-test-db).
Behavior: spins up local DB if not already running, applies migrations + seeds,
runs each `.test.sql` file in `supabase/tests/`, reports TAP output. **Have
not actually run** — would need `supabase` CLI installed locally + a running
Docker. The audit's plan presumes this works; if it doesn't, that's a
blocker.

---

## 1.5 — Stop conditions hit

The brief's spec says:
> **Stop and ask if** the RLS surface is much larger than expected (>20
> tables with active policies)

**32 RLS-enabled tables.** Triggers this stop.

Plus the un-anticipated case: **substantial existing coverage** already
exists, so the PR's premise needs reframing before implementation.

---

## Decision request

Three reasonable scopes for this PR:

1. **Minimum reframe** (~1h)
   - Add `test:rls` npm script + README "Testing" section.
   - Verify the existing 8 test files still run cleanly via `supabase db test`.
   - Document the existing coverage. **No new tests.**

2. **Audit-target gaps** (~3h, recommended)
   - #1 above
   - Plus 4 new test files for the audit-named highest-stakes tables:
     `daily_reports`, `notifications`, full `attendance` SELECT/INSERT,
     and `tasks`+`break_requests`+`alerts`.

3. **Full coverage push** (~6-8h)
   - #1 + #2
   - Plus Tier 3 reference tables (`regions`, `cities`, `locations`,
     `shifts`, `scheduled_reports`, `kpi_snapshots`, `import_audit`,
     `activity_photos`, `campaign_locations`, `sales_entries`).

My recommendation: **#2.** Scope #1 alone undersells the work; scope #3
includes a lot of low-stakes coverage that doesn't earn its review weight.
#2 closes the audit's stated highest-stakes gaps and brings tested-table
count from 15/32 to ~22/32.

If you take #2, also tell me:

- **Helper extraction**: extract `tests_auth_as` to a shared `_helpers.sql`
  now (touches 8 existing files), or leave duplicated for this PR?
- **Verify before adding new tests**: should I attempt to run
  `supabase db test` against the existing suite first to confirm baseline?
  (Requires Docker + Supabase CLI — may not be feasible from my sandbox;
  if so I'll note it and you can confirm locally before merging.)

Awaiting direction. **Phase 2 will not start until you reply.**
