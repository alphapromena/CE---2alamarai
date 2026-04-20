# DECISIONS.md — Resolved Ambiguities

A running log of decisions made during the build. When an ambiguity is resolved (in chat, in review, or in a spike), it gets a dated entry here with rationale.

**Format per entry:**
- **ID:** short identifier
- **Date:** YYYY-MM-DD
- **Phase:** which phase raised it
- **Question:** what was unclear
- **Decision:** the chosen answer
- **Rationale:** why
- **Alternatives considered:** what else was on the table
- **Revisit when:** condition that would cause us to reopen this

---

## D-001 — Application Stack

- **Date:** 2026-04-19
- **Phase:** Pre-kickoff
- **Question:** What should the core stack be, given the original Manus scaffold had Express + tRPC + custom JWT?
- **Decision:** Start fresh with **Next.js 15 (App Router) + Supabase Auth + Supabase Postgres (RLS) + Supabase Storage + Supabase Realtime + Supabase Edge Functions**, hosted on **Vercel + Supabase**.
- **Rationale:**
  - RLS provides defense-in-depth authorization at the DB layer. Essential for a multi-tenant platform where a client (e.g., Almarai) must never see another client's data.
  - Supabase Auth is battle-tested (email verification, password reset, rate limiting, session management). Custom JWT would add a large attack surface.
  - Supabase Realtime solves Module 8 (live dashboard) with no additional WebSocket infrastructure.
  - Next.js on Vercel is a native deployment path (no separate backend host).
  - Server Actions have built-in CSRF protection.
- **Alternatives considered:**
  - Keep Express + tRPC + custom JWT. Rejected: too much security burden and no RLS.
  - Next.js + custom JWT. Rejected: loses Supabase Auth benefits without gaining anything.
- **Revisit when:** Only if a concrete constraint forces a change (e.g., a hard requirement Supabase cannot meet).

---

## D-002 — Fresh Repo, Not Migration

- **Date:** 2026-04-19
- **Phase:** Pre-kickoff
- **Question:** Do we migrate the existing Manus-origin codebase or start from a clean repo?
- **Decision:** Start from a **clean repo**. Do not import code from the prior attempt.
- **Rationale:**
  - The prior code was built around Express + tRPC + custom JWT — substantially different architecture. Migrating would mean rewriting most of it anyway.
  - No production data, no users, no live deployment. Zero migration cost.
  - Clean repo lets us bake security in from commit 1, not retrofit it.
- **Alternatives considered:**
  - Salvage the DB schema only. Rejected: schema will be redesigned for RLS anyway, and we need JSONB multilingual columns.
  - Salvage UI components. Rejected: design system is new; components are cheap to rebuild correctly.
- **Revisit when:** Never. Decision final.

---

## D-003 — Mobile Strategy

- **Date:** 2026-04-19
- **Phase:** Pre-kickoff
- **Question:** Native mobile app or web?
- **Decision:** **PWA (web) first, native later.** Build mobile-first responsive UI with manifest + service worker. Architect the server API so a future React Native client can reuse it.
- **Rationale:**
  - Promoters need it now. A PWA ships in weeks; native ships in months.
  - A single codebase cuts maintenance 50%+ at this stage.
  - Camera API and Geolocation API (needed for Module 3) are available in mobile browsers.
- **Alternatives considered:**
  - React Native from the start. Rejected: slower time-to-value, double the code, and auth/data layers would need rework anyway.
  - Desktop-only web. Rejected: promoters work from phones.
- **Revisit when:** PWA limitations become blocking (e.g., background tasks, reliable offline, push notifications not sufficient on iOS). Likely in 6–12 months.

---

## D-004 — Bilingual (Arabic + English)

- **Date:** 2026-04-19
- **Phase:** Pre-kickoff
- **Question:** One language or multiple?
- **Decision:** **Arabic (RTL) + English (LTR)**, both supported from Phase 0. Arabic is first-class, not an afterthought.
- **Rationale:** Target market is Jordan + regional. Promoters and supervisors often prefer Arabic; clients may prefer English.
- **Implementation:**
  - `next-intl` with `/[locale]/...` routing.
  - `dir="rtl"` when `locale === "ar"`.
  - `tailwindcss-logical` plugin; use `ms-/me-/ps-/pe-/start-/end-` instead of `ml-/mr-/pl-/pr-/left-/right-`.
  - `preferred_language` stored on `profiles`.
  - Language switcher in app header.
- **Revisit when:** A third language is required.

---

## D-005 — Multilingual DB Content

- **Date:** 2026-04-19
- **Phase:** Pre-kickoff
- **Question:** Which DB entities need multilingual names, and how do we store them?
- **Decision:** Use **JSONB columns** `{ "ar": "...", "en": "..." }` for user-facing names on these entities:
  - `campaigns.name_i18n`
  - `skus.name_i18n`, `skus.unit_i18n`
  - `locations.name_i18n`
  - `regions.name_i18n`, `cities.name_i18n`
  - `consumer_feedback.category` (enum stays English; translation in messages files)
- **Rationale:**
  - JSONB is flexible, doesn't require a separate translations table, and Postgres queries it efficiently.
  - Fallback logic: `row.name_i18n[locale] ?? row.name_i18n.en ?? row.name_i18n.ar`.
  - Other tables (stock_movements, audit_log, etc.) don't need i18n — they're operational records.
- **Alternatives considered:**
  - Separate `translations` table keyed by (entity, id, lang, field). Rejected: heavier joins, more friction for developers.
  - Duplicate columns (`name_ar`, `name_en`). Rejected: doesn't scale to more languages later.
- **Revisit when:** We need full-text search in Arabic (then consider materialized search columns per language).

---

## D-006 — EXIF Handling on Selfie Uploads

- **Date:** 2026-04-19
- **Phase:** Phase 3 (Attendance)
- **Question:** What EXIF metadata do we keep on uploaded selfies?
- **Decision:** **Server-side strip all EXIF except `DateTimeOriginal` (timestamp) and GPS tags (`GPSLatitude`, `GPSLongitude`, `GPSLatitudeRef`, `GPSLongitudeRef`).** Store the stripped version as the canonical file. Optionally, write the preserved fields into a separate `exif_minimal` JSONB column on the attendance/photo row for auditability.
- **Rationale:**
  - Camera make/model, software version, and user-added comments are leakable PII.
  - Timestamp + GPS are operationally required for attendance validation.
  - Stripping server-side (not client-side) prevents a malicious client from retaining or injecting metadata.
- **Implementation:** Use `sharp` with custom metadata handling in an Edge Function, or `exiftool` via a container. Decide in Phase 3 based on what's simpler in Deno/Supabase Edge.
- **Revisit when:** Legal review requires keeping or removing different fields.

---

## D-007 — KPI "Sampling Rate" Denominator

- **Date:** 2026-04-19
- **Phase:** Phase 4 (Sales/Sampling)
- **Question:** The spec defines "Sampling Rate = Samples / Contacts or Engaged Customers." Which denominator?
- **Decision:** **Configurable per campaign** via `campaigns.kpi_config.sampling_rate_denominator` ∈ `"contacts" | "engaged"`. Default: `"contacts"`.
- **Rationale:** Spec explicitly leaves this open; different clients will have different conventions. Campaign-level config is the right granularity.
- **Revisit when:** We discover a client-level preference is more useful than campaign-level.

---

## D-008 — Stock Movement Corrections

- **Date:** 2026-04-19
- **Phase:** Phase 5 (Stock)
- **Question:** How do we correct a mistaken stock movement without breaking the append-only ledger?
- **Decision:** **Compensating entries only.** A mistaken movement is never UPDATEd or DELETEd. Instead, we insert a reversal row with `correction_of` pointing to the original movement's ID. The materialized `stock_balances` view accounts for both.
- **Rationale:**
  - Keeps the audit trail intact.
  - Standard practice in accounting ledgers.
  - Makes reconciliation and replay trivial.
- **Implementation:** DB triggers reject UPDATE/DELETE on `stock_movements`. Supervisor correction UI creates a reversal row + the corrected row in one transaction.
- **Revisit when:** Compliance requires a different audit model.

---

## D-009 — Idempotency Key Format

- **Date:** 2026-04-19
- **Phase:** Phase 5 (Stock) + Phase 3 (Attendance)
- **Question:** What format for idempotency keys on stock movements, sales submissions, check-ins?
- **Decision:** **Client-generated UUID v4**, sent in the request, stored as a UNIQUE constraint on each mutation table. Server rejects duplicate UUIDs with a 200 OK + the prior result (safe retry).
- **Rationale:** Mobile clients may retry over flaky networks; server must be safe under at-least-once delivery. UUID v4 is collision-proof in practice.
- **Implementation:** Each mutating Server Action takes an `idempotency_key: z.string().uuid()` param. Write + read-through pattern.
- **Revisit when:** We hit a case where the client cannot generate UUIDs reliably.

---

## D-010 — Offline Strategy for Promoter PWA

- **Date:** 2026-04-19
- **Phase:** Phase 4 (Activity)
- **Question:** How much offline support does the promoter PWA need, and how is it implemented?
- **Decision:** **Queue + retry** for write operations (daily reports, check-ins, sales entries). Read operations may fail offline. Use IndexedDB for the queue, flushed by a service worker background sync or on next app open.
- **Rationale:**
  - Retail stores often have poor cellular signal.
  - Losing a check-in or report due to connectivity is unacceptable.
  - Full offline reads are a much bigger lift and not justified at MVP.
- **Implementation:** `workbox-background-sync` or a custom IndexedDB queue with idempotency keys (see D-009).
- **Revisit when:** Promoters report missing read data causing workflow problems.

---

## D-011 — Edge Functions vs Server Actions

- **Date:** 2026-04-19
- **Phase:** Cross-cutting
- **Question:** When do we use a Supabase Edge Function vs a Next.js Server Action?
- **Decision:**
  - **Server Actions** for standard request/response mutations and queries called from the UI (CRUD, form submits, basic reads).
  - **Edge Functions (Deno)** for:
    - Cron jobs (scheduled reports, alert sweeps, reconciliation checks).
    - Heavy/long-running jobs (export generation).
    - Operations that must not trust the caller at all (geofence validation — reruns server-side even if called from Server Action).
    - Webhooks from third parties (email bounce, push delivery receipts).
- **Rationale:**
  - Server Actions are the low-friction default; they inherit Vercel's auth + rate limit middleware.
  - Edge Functions give us Deno isolation, cron scheduling, longer timeouts, and a place to run logic outside Vercel's request model.
- **Revisit when:** Vercel or Supabase capabilities change.

---

## D-012 — Design System: Light Mode Only, Stripe/Notion Aesthetic

- **Date:** 2026-04-19
- **Phase:** Phase 0
- **Question:** Visual direction?
- **Decision:** **Light mode only.** Stripe × Notion × Linear aesthetic. Neutral grayscale (white/black/10 grays) + a single indigo accent (`#4f46e5`). Typography-driven hierarchy, borders instead of shadows, no gradients, generous whitespace.
- **Full spec:** `.claude/skills/design-system/SKILL.md` and `.claude/skills/design-system/PATTERNS.md`.
- **Rationale:**
  - Professionals use the platform for hours. Clean, calm, low-visual-noise wins.
  - Single source of truth for design prevents drift across components and phases.
- **Revisit when:** Product marketing requires a different brand direction. If dark mode is added later, all tokens must be theme-ified first.

---

## D-013 — Admin Invite Flow via `supabase.auth.admin.inviteUserByEmail`

- **Date:** 2026-04-19
- **Phase:** Phase 1
- **Question:** How does an admin add a new user?
- **Decision:** Admin submits `{ email, full_name, role, preferred_language }`. Server action (admin-guarded, service-role client) calls `supabase.auth.admin.inviteUserByEmail(email, { redirectTo, data })` with the profile metadata packed into `user_metadata`. The recipient receives an email link that lands on `/[locale]/auth/callback?next=/set-password`; the callback exchanges the code for a session; the user completes sign-up by setting a password on `/set-password`.
- **Rationale:**
  - Passwords never pass through the admin's screen or the network.
  - Supabase's built-in email delivery, token expiry, and replay protection are reused rather than reinvented.
  - The DB trigger `handle_new_user` materialises the `profiles` row from `raw_user_meta_data`, so the admin flow works even if the user clicks the link days later — no race conditions with the UI.
- **Alternatives considered:**
  - Admin types a temporary password + user changes on first login. Rejected: password-in-transit risk and more moving parts (no-reset path, force-reset flag).
  - Self-signup + admin approval. Rejected: doesn't fit the closed-tenancy SaaS model; promoters don't know how to sign up.
- **Revisit when:** We need bulk invites (CSV import) — the same server action composes fine, but UI changes.

---

## D-014 — Role Column as Postgres ENUM

- **Date:** 2026-04-19
- **Phase:** Phase 1
- **Question:** How is `profiles.role` typed at the database layer?
- **Decision:** Postgres ENUM `user_role` with values `admin | supervisor | promoter | client`. Used as the column type on `profiles.role` and as the return type of the `current_role()` SECURITY DEFINER helper.
- **Rationale:**
  - Type safety at the DB boundary — SQL rejects unknown roles, RLS policies can compare against the enum, and generated TypeScript types are string-literal unions rather than `string`.
  - Fast index lookups (ENUM is a 4-byte oid internally).
  - Matches the fixed four-role model reflected in `app/[locale]/<role>/` subtrees and `LANDING_PATH_BY_ROLE`.
- **Alternatives considered:**
  - `text` with a CHECK constraint. Rejected: weaker typing, TS generates `string`, trivially defeated by anyone bypassing RLS.
  - Single bitmask / array-of-roles. Rejected: overkill for a fixed, mutually-exclusive role set; complicates RLS policies.
- **Revisit when:** A new role is needed — `ALTER TYPE user_role ADD VALUE 'name'` is cheap but cannot be undone; treat role additions as a considered decision.

---

## D-015 — `profiles.assigned_locations` shape without a `locations` FK in Phase 1

- **Date:** 2026-04-19
- **Phase:** Phase 1
- **Question:** PLAN.md §6 lists `assigned_locations[]` as a Phase 1 profile field, but `locations` doesn't exist yet (Phase 2).
- **Decision:** Ship `profiles.assigned_locations uuid[] NOT NULL DEFAULT '{}'` with a GIN index. No foreign-key enforcement in Phase 1. Phase 2's `locations` migration adds a constraint trigger that validates each element of the array on INSERT/UPDATE. Admin UI shows the count only in Phase 1.
- **Rationale:**
  - Lets Phase 1 ship without waiting on Module 1 schema.
  - Postgres does not support per-element array FOREIGN KEY constraints, so a trigger is required regardless of when it's added.
  - GIN index now means Phase 3 attendance queries (`assigned_locations @> ARRAY[loc]`) don't need a schema change later.
- **Alternatives considered:**
  - Skip the column until Phase 2. Rejected: diverges from PLAN.md §6 Phase 1 scope and forces Phase 2 to touch `profiles` again.
  - Stub `locations` table now. Rejected: creeps Module 1 scope into Phase 1.
- **Revisit when:** A user-assignments table (Phase 2, `user_assignments`) supersedes the array. The array becomes a denormalised cache; decide then whether to keep it or drop it.

---

## D-016 — Tenant isolation via `profiles.client_id` FK + CHECK

- **Date:** 2026-04-19
- **Phase:** Phase 2
- **Question:** How is multi-tenant isolation modelled at the database layer? A separate `client_users` junction table or a single column on `profiles`?
- **Decision:** Add `profiles.client_id uuid REFERENCES public.clients(id) ON DELETE RESTRICT`, plus a CHECK constraint enforcing `client_id IS NOT NULL` exactly when `role = 'client'`. Internal users (admin / supervisor / promoter) keep `client_id = NULL`. A SECURITY DEFINER helper `current_client_id()` returns the calling user's `client_id`, and every RLS policy on a tenant-scoped table compares `row.client_id = current_client_id()`.
- **Rationale:**
  - Closed-tenancy SaaS: a client user belongs to exactly one brand and never spans tenants.
  - Single FK is unambiguous and indexable; no junction-table joins inside RLS predicates (which would be slow and easy to get wrong).
  - The CHECK is the cheapest way to make "client without a tenant" unrepresentable rather than relying on application code.
- **Alternatives considered:**
  - `client_users(user_id, client_id)` junction table. Rejected: introduces M:N semantics we don't have, and forces every RLS policy to subquery the junction.
  - Storing tenant in JWT claims only. Rejected: claims are mutable on refresh and harder to audit; the source of truth must be in the DB.
- **Revisit when:** A client account ever needs to span multiple tenants (e.g., agency consolidator). At that point we move to the junction table and update `current_client_id()` to return `setof uuid`.

---

## D-017 — Forms stack: react-hook-form + zodResolver client-side, Server Actions as the single mutation boundary

- **Date:** 2026-04-19
- **Phase:** Phase 2
- **Question:** What's the canonical form stack now that Phase 2 introduces non-trivial multi-field forms (campaigns, shifts, assignments)?
- **Decision:** All client forms use `react-hook-form` with `@hookform/resolvers/zod` for inline validation. Submission goes to a Next.js Server Action that re-runs the **same** zod schema with `.strict()` before any DB write. The schema lives in `lib/validations/` and is imported by both sides, so client and server agree on shape and error messages.
- **Rationale:**
  - One schema = one source of truth. Client validation is UX; server validation is security. Both pass through the same parser.
  - `.strict()` rejects unknown keys, defending against form-data injection.
  - Server Action remains the trust boundary: even a malicious client that bypasses RHF can't bypass the server re-validation.
  - RHF + zodResolver is already in `package.json` from Phase 1.
- **Alternatives considered:**
  - `useFormState` + raw zod parse on the server only. Rejected: no inline validation feedback, more re-render churn.
  - tRPC. Rejected: a different API style than the rest of the app and unnecessary given Server Actions.
- **Revisit when:** We need streaming server actions or partial form submission (probably not in this product).

---

## D-018 — `user_assignments` is the source of truth; `profiles.assigned_locations` is a denormalised cache

- **Date:** 2026-04-19
- **Phase:** Phase 2
- **Question:** Phase 1 (D-015) shipped `profiles.assigned_locations uuid[]`. Phase 2 introduces a relational `user_assignments` table. Which one wins?
- **Decision:** `public.user_assignments` is the only table application code writes to. A row-level trigger on `user_assignments` recomputes the affected user's `profiles.assigned_locations` to be exactly the distinct set of `location_id`s where `active = true`. The denormalised array stays because it's the read path Phase 3 attendance already uses (`assigned_locations @> ARRAY[loc]`, served by the existing GIN index). `profiles.assigned_locations` direct UPDATEs by anyone other than the trigger continue to be blocked by the existing self-update guard for non-admins; admins are advised (and eventually enforced via app code) to never touch the column directly.
- **Rationale:**
  - Two writable copies of the same fact would drift. Pinning writes to `user_assignments` and pushing to the cache via trigger gives consistency without sacrificing the indexed array query.
  - Keeps Phase 3 query plans unchanged — no migration cost for attendance.
  - Soft-delete (`active = false`) and date-bounded assignments (`starts_on`, `ends_on`) are first-class in `user_assignments`; the trigger only includes currently-active rows.
- **Alternatives considered:**
  - Drop `profiles.assigned_locations`. Rejected: forces every attendance check to JOIN `user_assignments`, losing the GIN-array fast path.
  - Make `assigned_locations` a generated column from a subquery. Rejected: Postgres generated columns can't reference other tables.
- **Revisit when:** Read patterns change such that the array is no longer queried (e.g., Phase 7 dashboards switch to joining `user_assignments` directly). At that point, drop the trigger + column.

---

## D-019 — Phase 3 live-monitoring, storage access, client visibility, and configurable detection thresholds

- **Date:** 2026-04-19
- **Phase:** Phase 3
- **Question:** Four Phase-3 ambiguities bundled into one entry because each is small on its own but all four shape the same feature surface: live dashboards, selfie storage access, the client role's visibility during Phase 3, and how lateness/absence thresholds are configured.
- **Decision:**
  1. **Live dashboards poll in Phase 3.** Supervisor + admin attendance views use TanStack-Query-style `router.refresh()` on a 30-second interval. Upgrade to Supabase Realtime subscriptions in Phase 7 (Module 8 — "Real-Time Monitoring"). PLAN §6 Phase 7 already scopes the Realtime wiring; duplicating it in Phase 3 would inflate scope and add a surface (Realtime + RLS interactions) we're not yet ready to test.
  2. **Selfies go through server-signed URLs, not direct storage reads.** The `attendance-photos` bucket is private with no `authenticated` policies on `storage.objects` → all direct client I/O is denied. Reads happen via Route Handlers that first verify (role, assigned_locations, or ownership) on the owning attendance or supervisor_visits row, then call `createSignedUrl` with a 5-minute TTL. Writes happen via service-role uploads inside Edge Functions after server-side EXIF stripping.
  3. **Clients see aggregate-only attendance in Phase 3.** No RLS policy on `attendance` grants `client` role access. Phase 8 (Module 11 — Reporting) is where client read access arrives, gated on a roll-up view rather than raw row reads. Until then, clients see campaigns + SKUs but not individual check-ins, photos, or alerts.
  4. **Lateness grace and absence cutoff are configurable per campaign** via `campaigns.kpi_config.lateness_grace_minutes` and `campaigns.kpi_config.absence_cutoff_minutes`. Defaults are 15 minutes (grace) and 60 minutes (cutoff). `kpi_config` is an existing JSONB column (D-007); the new keys are soft-added (absent-on-read → fall back to default), so no schema migration is required. Detection code reads via `readLatenessGrace` / `readAbsenceCutoff` which safely tolerate invalid/missing values.
- **Rationale:**
  - Polling keeps Phase 3 bounded and matches the staged rollout in PLAN §6.
  - Server-signed URLs put the authorization decision in one place (the Route Handler) and make storage policies trivial — "no direct access, full stop" — which is easier to audit than a stack of Storage RLS policies that mirror row-level visibility.
  - Deferring client raw-row visibility avoids leaking promoter photos/PII through an aggregate-only page that hasn't been built yet. Clients still see the campaigns + locations they already owned in Phase 2.
  - Per-campaign thresholds match D-007's pattern for `sampling_rate_denominator`: different brands have different SLA conventions; one-size-fits-all hard-codes would force a schema change the first time a client disagrees.
- **Alternatives considered:**
  - Realtime in Phase 3 now. Rejected: RLS + subscriptions combined are non-trivial; Phase 7's test budget already anticipates them.
  - Storage RLS policies mirroring attendance access. Rejected: two sources of truth for visibility (row-level + storage-level); any drift produces a bug that RLS tests don't catch.
  - Raw-row client access now. Rejected: PII/photos; aggregates-only is cheaper to ship and matches the Phase 8 reporting story.
  - Hard-coded 15/60-minute thresholds. Rejected: guaranteed to need a schema migration once a client pushes back.
- **Revisit when:**
  - Phase 7 ships Realtime (item 1). Migration plan: replace `useEffect(() => setInterval(...))` with a `supabase.channel(...)` subscription; keep polling as a fallback behind a feature flag for the first deploy.
  - A legal/compliance review changes photo retention or access rules (item 2 + 3).
  - A client requires a retention/threshold that doesn't fit a single numeric minute-value (e.g., rolling-window cutoffs). At that point `kpi_config` becomes a structured object per metric rather than flat keys.

---

## D-020 — Phase 4 KPI computation: Edge Function + sweep (not a DB trigger); promoter-per-(location,date) uniqueness; tasks self-complete; new `activity-photos` bucket; offline queue via `idb`

- **Date:** 2026-04-19
- **Phase:** Phase 4
- **Question:** Five Phase-4 ambiguities bundled into one entry because they shape the same feature surface (daily reports, KPI snapshots, photos, offline mobile UX) and resolve together:
  1. Who writes `kpi_snapshots` — a DB trigger or an Edge Function?
  2. Are activity photos stored in the existing `attendance-photos` bucket or a new one?
  3. Is the uniqueness key for `daily_reports` per (promoter, date) or per (promoter, location, date)?
  4. Do tasks need a supervisor sign-off on completion, or can the promoter self-close?
  5. Which IndexedDB primitive powers the offline write queue (D-010)?
- **Decision:**
  1. **`kpi_snapshots` is written by a Supabase Edge Function (`compute-kpis`), not a DB trigger.** The targeted mode is invoked from the promoter-submit and supervisor-approve Server Actions with the caller's JWT; verify_jwt = true plus an RLS re-check via a user-scoped client proves authorization before service-role writes the snapshot. A second sweep mode (cron-gated with `x-cron-secret`, hourly) recomputes any submitted/approved report whose snapshot is stale vs `daily_reports.updated_at` — the safety net for missed invocations. The actual KPI math lives exactly once in TypeScript, at `lib/kpis/compute.ts`, with a byte-for-byte mirror at `supabase/functions/_shared/kpis.ts`; both are exercised by `lib/kpis/compute.test.ts` (Almarai Safeway Jubeiha fixture: 50/80/66.6/46.6/70 + SKU contributions 57/29/14).
  2. **Activity photos land in a new private `activity-photos` bucket**, declared in `20260421030000_phase4_storage_bucket.sql`. Same "no storage.objects policies → all direct client I/O denied → server-signed URLs only" posture as the Phase 3 `attendance-photos` bucket (D-019). Separating the buckets lets retention, lifecycle, and audit posture diverge later without coupling attendance selfies to activity documentation.
  3. **`daily_reports` uniqueness is `(promoter_user_id, location_id, report_date)`**, not `(promoter_user_id, report_date)`. A promoter who works two stores in a day therefore has two reports. `campaign_id` is intentionally excluded from the uniqueness key: a location can currently be active in only one campaign at a time, and making campaign part of the key would let two campaigns fight for the same day's numbers. If that ever becomes possible, revisit and add campaign to the key.
  4. **Tasks are self-completable by the promoter.** Status enum: `open | in_progress | done | cancelled`. Promoter can flip `open → in_progress → done`; supervisor can re-open by flipping `done → in_progress` if unsatisfied. No separate "approval" gate — approval lives at the daily_report layer where money/KPIs are decided. Supervisors cancel with a reason (soft-delete) instead of hard DELETE, preserving the audit trail.
  5. **Offline queue uses `idb` (the typed IndexedDB wrapper).** Schema: `{ id, actionName, payload, idempotencyKey, createdAt, attemptCount, lastError }`. Flushed by an in-page `online` listener plus a periodic interval — not Background Sync, because iOS Safari's BG-Sync support is still patchy and most promoters are on iPhone. D-010 is upheld: all mutations send a client-generated UUID (D-009); server replay is safe.
  6. **Draft autosave cadence: on-blur + every 30 s**, whichever comes first. Writes go to IndexedDB only; server-side save is explicit via a "Save draft" button so network errors can't silently corrupt partial reports.
  7. **Client role has no RLS access to any Phase-4 table.** Consistent with Phase 3 (D-019 item 3). Client rollups arrive in Phase 8 via an aggregate view.
- **Rationale:**
  1. One source of truth for KPI math beats two. A DB trigger would duplicate `compute.ts` in PL/pgSQL — hard to unit-test, hard to evolve, and a guaranteed drift when we add a KPI. The targeted-invoke-plus-sweep pattern gives us atomic-enough updates (users see fresh KPIs the moment they submit) plus a self-healing background refresh. Service role bypasses `kpi_snapshots` RLS cleanly; no authenticated write policies exist.
  2. Naming buckets after what they hold beats name-squatting. Cheap to add a bucket; expensive to retroactively untangle two unrelated domains sharing one.
  3. The spec's Almarai example (a single store-day) and the general retail reality (supermarkets, multi-location shifts) both fit per-(promoter, location, date). Per-(promoter, date) would collapse two locations into one row and lose KPI breakdown.
  4. Two-step tasks approval doubles the surface for little gain. The substantive review point for the business is the daily report (KPIs, photos, sales). Tasks exist to coordinate work, not audit it.
  5. `workbox-background-sync` nominally solves this but the iOS Safari story is historically broken. A small `idb`-backed queue replayed on `online` events and short intervals is deterministic and testable.
- **Alternatives considered:**
  - **DB trigger for KPIs.** Rejected: forces duplicate math + harder tests. If we ever need strict atomicity (e.g., a reconciliation invariant), revisit.
  - **Reuse `attendance-photos` bucket.** Rejected: couples unrelated retention policies; mixes selfie-PII with activity-shots.
  - **`(promoter, date)` uniqueness.** Rejected: breaks the multi-store-in-a-day case.
  - **Supervisor sign-off on tasks.** Rejected: duplicated approval workflow without a distinct audit need.
  - **`workbox-background-sync` / raw IndexedDB.** Rejected: unreliable on iOS / too much code to own.
  - **Expose aggregate client rollups now.** Rejected: Phase 8 ships the reporting surface; no point half-building it here.
- **Revisit when:**
  - KPI math must be atomic with the write (e.g., a future invariant that depends on the snapshot existing). Option then: keep the Edge Function as primary and add a thin `DEFERRED` trigger that enqueues a compute request to pg_net.
  - Retention requirements force us to merge or re-split buckets.
  - Locations start belonging to multiple simultaneous campaigns (breaks item 3's assumption).
  - Tasks grow a real "evidence of completion" concept (photo proof, geo-proof) — then a reviewer gate earns its keep.
  - Background Sync gets solid cross-browser support, including iOS.

---

## D-021 — Stock SKU types via `skus.kind` enum (not separate tables)

- **Date:** 2026-04-19
- **Phase:** Phase 5 (Stock)
- **Question:** How do we model sample / giveaway / sale_unit without duplicating the SKU table three times?
- **Decision:** Add a single `skus.kind` enum column with values `sample | giveaway | sale_unit`. One ledger (`stock_movements`) serves all three — every row carries both `sku_id` and, transitively, its kind. The Almarai fixture tests both types (yogurt cups = sample, giveaways = giveaway) to prove the ledger handles them uniformly.
- **Rationale:**
  - Operationally all three are "units on a shelf" moving through the same warehouse → supervisor → promoter → consumer path.
  - A separate table per kind would require three parallel ledgers — triple the RLS surface, triple the invariant triggers, triple the queries — for zero behavioural benefit.
  - Kind is the only dimension that matters at report time (count sold vs count sampled). It's a column, not a schema boundary.
- **Alternatives considered:** Separate `samples`, `giveaways`, `sale_units` tables. Rejected for the reasons above.
- **Revisit when:** A kind needs fields the others don't (e.g., `sale_units.price` that never applies to samples). Then split.

---

## D-022 — Warehouse is infinite; `skus.stock_allocated` is a planning value

- **Date:** 2026-04-19
- **Phase:** Phase 5 (Stock)
- **Question:** Does the warehouse have a balance the ledger has to track?
- **Decision:** No. The warehouse is the infinite source. Allocations (warehouse → supervisor) never fail on a balance check. The invariant trigger explicitly short-circuits `from_entity_type = 'warehouse'`. The existing `skus.stock_allocated` column stays as a **planning / target** value — "we intend to produce 10 000 cups for this campaign" — not an initial ledger balance.
- **Rationale:**
  - The platform tracks field-side inventory (what the promoter has), not production-side inventory (what the client has pledged). Modelling production stock would double the scope without unlocking a user need.
  - Infinite warehouse makes the identity `Σ distributed = Σ allocated` trivially holdable: an allocation creates the supervisor balance out of thin air.
- **Alternatives considered:** Seed an explicit `(warehouse, sku, campaign)` row from `stock_allocated` at campaign start. Rejected: adds a migration burden + a special-case "what if the client produced more than expected?" failure mode.
- **Revisit when:** The platform needs to reconcile against the client's production-side ledger.

---

## D-023 — `stock_balances` is a plain SQL view (not materialized)

- **Date:** 2026-04-19
- **Phase:** Phase 5 (Stock)
- **Question:** Plain view or materialized view for the balance rollup?
- **Decision:** Plain `CREATE VIEW WITH (security_invoker = on)`. The supervisor and promoter live dashboards read this view; freshness is a product requirement. Materialized + refresh-on-insert would put a hot-path cost on every distribution. Phase 7 may layer a nightly-refreshed materialized read cache on top for admin dashboards if p95 measurements justify it; the plain view stays authoritative.
- **Rationale:** With composite indexes on `stock_movements (campaign, sku, to_*)` and `(campaign, sku, from_*)`, the view's GROUP BY is index-only and sub-millisecond per (campaign, sku) at realistic row counts. Materialized refresh during the most write-heavy moments (lunch-rush distributions) is the wrong cost to absorb.
- **Alternatives considered:**
  - Materialized view with `REFRESH CONCURRENTLY` on trigger. Rejected: adds latency + complexity; concurrency mode requires a unique index.
  - Client-side computation from `stock_movements`. Rejected: RLS-filtered reads can miss rows a supervisor needs to see aggregated in their own balance. View-with-`security_invoker` + supervisor-visible-promoters RLS policy is cleaner.
- **Revisit when:** Phase 7 dashboard p95 exceeds target and the row count grows into the millions per campaign.

---

## D-024 — Usage is emitted from `daily_reports` submission (not an independent entry)

- **Date:** 2026-04-19
- **Phase:** Phase 5 (Stock)
- **Question:** How does a promoter tell the ledger they used N samples?
- **Decision:** Usage movements (promoter → consumer) are **emitted from the existing `daily_reports` submit Server Action**, not from a separate "log usage" form. When a daily report is submitted with `sales_entries[sku].samples = N`, the submit action inserts one `stock_movements` row per SKU with `quantity = N` and `movement_kind = 'usage'`, sharing the daily report's idempotency key so retries are safe.
- **Rationale:**
  - The promoter already enters samples dispensed per SKU on the daily report form. A second "log usage" UI would duplicate that entry and invite drift.
  - Over-consumption (reported usage > received) is rejected at the ledger's invariant trigger, which gives us a single enforcement point. The promoter sees the error attached to the daily-report submit, which is where the business state they care about lives.
  - `daily_reports` idempotency already exists; we inherit it for free.
- **Implementation:** Wiring lives in the `submitDailyReportAction` + `approveDailyReportAction` paths. Each call computes the delta from the prior emitted-usage count (if any) and inserts a correction + new-usage pair to keep the ledger consistent with the latest report state.
- **Alternatives considered:**
  - Dedicated "log usage" Server Action. Rejected: double-entry for promoters with no data-quality upside.
  - Usage as a trigger on `sales_entries`. Rejected: pushes business logic into the DB, makes the retry/idempotency story harder.
- **Revisit when:** Usage events need to decouple from daily reports (e.g., real-time live-sales counter that must not wait for end-of-day submission).

---

## D-025 — Inter-supervisor reallocation is open for v1; inter-campaign is blocked

- **Date:** 2026-04-19
- **Phase:** Phase 5 (Stock)
- **Question:** Who may reallocate to whom?
- **Decision:**
  1. **Inter-supervisor reallocation (A → B within the same campaign) is admitted in v1 without a dedicated approval step.** The from-side supervisor initiates it; an audit_log row captures the actor; the ledger's `reallocation_group_id` + `created_at` preserve traceability. A future "approval" workflow is sketched as optional and will be added if field operations show supervisors abusing the freedom.
  2. **Inter-campaign reallocation is not a concept.** The `stock_movements` schema requires both the from and to legs of a reallocation to share a `campaign_id`. A physical transfer between campaigns is expressed as "return to warehouse in campaign X + allocate from warehouse in campaign Y" — two separate audited operations.
- **Rationale:**
  - Supervisors are trusted operators; a heavyweight approval step adds friction for a class of action (helping a peer cover a shortfall) we actively want to happen.
  - Inter-campaign reallocation conflates two accounting contexts. The separation-of-concerns benefit of two explicit movements beats the convenience of a single row.
- **Revisit when:** Audit data shows reallocations being used to mask over-consumption, or customers request inter-campaign transfers.

---

## D-026 — Concurrency guarded by per-entity advisory locks inside a BEFORE INSERT trigger

- **Date:** 2026-04-19
- **Phase:** Phase 5 (Stock)
- **Question:** How do we prevent two concurrent distributions from the same supervisor double-spending?
- **Decision:** A `BEFORE INSERT` trigger on `stock_movements` takes `pg_advisory_xact_lock(hash_of(campaign, sku, from_entity))` before computing the balance and validating the from-side. The lock is released on transaction commit; a peer transaction blocks until the first either commits or rolls back. The reallocate RPC additionally takes the TO-side lock because both entities' balances are materially affected.
- **Rationale:**
  - MVCC alone is not enough: two concurrent `INSERT`s each observe a pre-commit balance that excludes the other's pending row. The advisory lock serialises the read-validate-insert critical section.
  - A table lock would be far too coarse. Row locks don't exist here because the rows being read (prior movements) aren't the rows being written. Advisory locks are the right granularity.
- **Implementation:** `20260422040000_phase5_stock_invariants.sql` BEFORE INSERT trigger — SECURITY DEFINER with locked `search_path`. See the file-level comment for the full reasoning on why BEFORE INSERT rather than AFTER.
- **Alternatives considered:**
  - `SERIALIZABLE` transaction isolation level. Rejected: cross-cutting configuration, retry-on-conflict logic everywhere, surprising failures for unrelated queries.
  - Explicit row-level lock on a synthetic "balance row" table. Rejected: adds a table to keep consistent + the read-write amplification we wanted to avoid with the plain view (D-023).
- **Revisit when:** Advisory lock contention becomes measurable (e.g., a very hot supervisor). Mitigation: shard the lock key by sub-second bucket so concurrent writes of different SKUs don't fight.

---

## D-027 — `no_usage_hours` is per-campaign in `kpi_config`; default 4

- **Date:** 2026-04-19
- **Phase:** Phase 5 (Stock)
- **Question:** How long without a usage event before a promoter gets a `no_usage` anomaly flag?
- **Decision:** Campaign-configurable via `campaigns.kpi_config.no_usage_hours`. Read via `readNoUsageHours(kpiConfig)` in `lib/stock/ledger.ts`, with a default of 4 hours for legacy / unconfigured rows. A similar `low_stock_threshold` key (default 10 units) controls the low-stock detector. Both keys are soft-added (absent-on-read → default), so no migration is needed; admins set them via the campaign form.
- **Rationale:** Mirrors D-019 for attendance thresholds — different brands have different operational rhythms. A cosmetics sampling booth runs at a different cadence from a yogurt sampling booth; hard-coding one number forces a schema change the first time a client disagrees.
- **Implementation:** `readNoUsageHours` + `readLowStockThreshold` in both `lib/stock/ledger.ts` and `supabase/functions/_shared/ledger.ts` (byte-for-byte mirror). Safely ignore non-numeric / non-positive values and fall back to default.
- **Revisit when:** Clients want sub-hour granularity ("flag after 30 minutes"). The detector currently operates on an hourly threshold; minutes would work too, but the surface now is hours.

---

## D-028 — Phase 6 performance: new `performance_snapshots` table; per-campaign tier config; daily/weekly/CTD periods; plain view; single Edge Function; client aggregates-only

- **Date:** 2026-04-19
- **Phase:** Phase 6 (Performance Management)
- **Question:** Six Phase-6 ambiguities resolved together because each shapes the same surface (rollup writer, dashboards, role visibility):
  1. New `performance_snapshots` table or extend `kpi_snapshots`?
  2. Tier thresholds: per-campaign config or global defaults?
  3. Which periods does the MVP support?
  4. `performance_latest` view: materialized or plain?
  5. New `compute-performance` Edge Function or extend `compute-kpis`?
  6. What does the client role see exactly?
- **Decision:**
  1. **New `performance_snapshots` table.** `kpi_snapshots` is 1:1 with `daily_reports` (single shift, single promoter, single location, single date). Performance is rolled up over a *period* and a *scope* (promoter / location / campaign), with tier + rank columns derived from configurable thresholds. Different cardinality, different lifecycle, different indexes; conflating two grains in one table would force every query to filter on a synthetic discriminator.
  2. **Per-campaign tier config in `kpi_config`** (`tier_high` default 0.50, `tier_medium` default 0.30, `tier_metric` default `'conversion_rate'`). Read via `readTierConfig()` with a soft-add posture — invalid / out-of-range / inverted thresholds fall back to defaults per field. Same pattern as D-007 (sampling denominator), D-019 (lateness/absence), D-027 (no-usage hours): one schema migration covers all future per-campaign tuning.
  3. **MVP periods are exactly three: `daily`, `weekly` (Mon..Sun UTC), and `campaign_to_date`.** `period_start` + `period_end` are explicit columns rather than an enum so future custom ranges plug in without a migration. Monthly / custom ranges are deferred until a customer asks for them.
  4. **Plain view (`performance_latest`) with `security_invoker = on`.** Same trade-off as D-023 for `stock_balances`: the snapshot table itself is the read cache; a `DISTINCT ON` view over the indexed `(scope_kind, scope_id, campaign_id, period_kind, period_start)` columns is sub-millisecond at realistic row counts. A materialized layer can be added in Phase 9 if dashboard p95 measurements justify it; the plain view stays authoritative.
  5. **Extend `compute-kpis`** rather than ship a second Edge Function. The trigger (daily report submit/approve), the JWT model, the sweep cron, and the secret rotation are all already in place. After every kpi_snapshot write, the function recomputes the affected campaign's performance rollups across daily / weekly / campaign_to_date × promoter / location / campaign and UPSERTs them in one statement against the table's unique constraint. A failure in the performance write is logged but does not fail the kpi_snapshot write — the sweep mode catches it on the next run.
  6. **Client visibility (D-019 item 3, refined for Phase 6): campaign-scope rows ONLY.** Per-promoter and per-location rows are not exposed under client RLS. The client page shows per-campaign aggregate cards (conversion / engagement / sampling / reports) and a daily trend sparkline; it intentionally hides tier distribution because that count requires visibility into location / promoter rows the client does not have. Phase 8 reporting may expand this when location-level rollups are agreed with the brand contact.
- **Rationale:**
  - One table = one grain. Two grains in one table forces every read to disambiguate and breaks the unique key story.
  - Per-campaign threshold config is cheaper to ship than a schema migration the first time a brand disagrees with our defaults.
  - Three periods cover the spec's "daily / weekly / end-of-campaign" cadence; more grains can be added incrementally.
  - Plain view sidesteps the materialized-refresh hot-path cost while submits are happening.
  - One Edge Function = one auth scaffold = one cron = one secret. A second function would duplicate everything for no behavioural benefit.
  - Aggregates-only client view matches the closed-tenancy data-share posture without compromising operational privacy of individual promoters.
- **Implementation:**
  - Migration: `supabase/migrations/20260423000000_phase6_performance_snapshots.sql`.
  - Pure logic: `lib/performance/tiering.ts` + `lib/performance/rollups.ts`; mirrored at `supabase/functions/_shared/performance.ts`.
  - Edge Function: `supabase/functions/compute-kpis/index.ts` (extended).
  - Tests: `lib/performance/tiering.test.ts` (Safeway Khalda vs Shini exit fixture + boundary policy + soft-add config), `lib/performance/rollups.test.ts` (Almarai 3-location integration + period helpers), `supabase/tests/phase6.test.sql` (CHECKs, UNIQUE, RLS for admin/promoter/supervisor/client, `performance_latest` freshness).
  - UI: `/[locale]/admin/performance` index + `campaign/[id]` + `location/[id]` + `promoter/[id]`; `/[locale]/supervisor/performance`; `/[locale]/client/performance`. Tier badges via existing `StatusPill`; ratios rendered with `dir="ltr"` `tabular-nums`. Recharts intentionally NOT added; a small pure-SVG `Sparkline` component covers the spec's time-series needs without a new dependency. Switch to recharts in a later phase if interactivity is required.
- **Alternatives considered:**
  - **Extend `kpi_snapshots`.** Rejected: conflates grains; would force every existing query to add a scope filter.
  - **Global tier thresholds.** Rejected: same reason as D-007 — different brands have different SLAs.
  - **Materialized `performance_latest`.** Rejected for v1: refresh on every submit would absorb the cost we explicitly pushed off the write path.
  - **Separate `compute-performance` Edge Function.** Rejected: doubles the cron/secret/auth surface for zero behavioural gain.
  - **Add `recharts`.** Considered; deferred. The spec time-series are simple ratios in `[0, 1]`; a pure-SVG sparkline is enough and avoids a new dep + SSR-vs-client gymnastics.
- **Revisit when:**
  - A customer asks for monthly / custom date ranges (item 3) → add a `'custom'` period_kind and an explicit start/end input.
  - Dashboard p95 exceeds target (item 4) → layer a materialized view + cron refresh on top of the table.
  - Location-level rollups are agreed for the client surface (item 6) → relax the client RLS policy to include scope_kind = 'location'.
  - Charts need interactivity (zoom, hover tooltips, brush) → swap `Sparkline` for `recharts`.

---

## D-029 — Phase 7 live monitoring + breaks: per-page Realtime, notifications as DB rows, configurable live thresholds, 10-min sweep, Web Push deferred

- **Date:** 2026-04-20
- **Phase:** Phase 7 (Real-Time Monitoring + Breaks)
- **Question:** Seven Phase-7 ambiguities resolved together because each shapes the same surface (live dashboards, detection cadence, break flow, notification delivery):
  1. Realtime subscription scope: per-page or global app-level?
  2. Notifications: DB rows + Realtime, broadcast channel, or polling?
  3. Break duration cap: per-campaign config or hard-coded?
  4. Low-performance threshold: what value / where configured?
  5. No-activity threshold: what value / where configured?
  6. Web Push: implement now or defer?
  7. Detection sweep cadence.
- **Decision:**
  1. **Realtime subscriptions are per-page**, scoped to the channel `live-<scope>` (admin / supervisor) or `notifications-<user_id>` for the bell. One channel per mount; `useRealtimeTables` returns a cleanup function that calls `supabase.removeChannel` on unmount. No app-level global channel — stale subscriptions across navigations were the risk we explicitly wanted to avoid.
  2. **Notifications are DB rows fanned out by the same Edge Function / Server Action that emits the alert**, with the bell subscribing to Realtime `postgres_changes` filtered to `user_id=eq.<uid>`. No broadcast channel (bypasses RLS), no polling fallback (Realtime is Phase 7's marquee feature — if it's not ready, the live dashboard isn't either). Retention is out-of-band; no schedule shipped in this phase.
  3. **Break duration cap is per-campaign**, via `kpi_config.break_max_minutes` (default 60). Read through `readBreakMaxMinutes` (same soft-add pattern as D-019 / D-027). DB enforces a hard ceiling of 480 minutes (8h) — campaigns can tighten below that but never above.
  4. **Low-performance threshold is per-campaign**, via `kpi_config.low_performance_threshold` (default 0.30 — matches the Phase 6 `tier_medium` lower bound from D-028). The metric tiered on is `kpi_config.tier_metric` (already defined by D-028). Strictly-below-threshold fires; at-or-above does not. Setting threshold to 0 disables the detector.
  5. **No-activity threshold is per-campaign**, via `kpi_config.no_activity_hours` (default 3). Distinct from stock `no_usage_hours` (D-027, default 4): no_usage watches the sample ledger, no_activity watches the engagement funnel (contacts + engaged + samples + sales on `daily_reports`). A promoter can legitimately have zero samples dispensed but lots of customer contacts — both signals matter.
  6. **Web Push is deferred.** The `notifications` table is push-ready (kind + payload), but no service-worker push-subscription UI ships in Phase 7. Revisiting in Phase 9 polish once iOS PWA push reliability is tested on target devices.
  7. **Detection sweep every 10 minutes.** Matches `detect-attendance-issues` cadence; a single cron entry calls `detect-live-issues` with `x-cron-secret`. More frequent sweeps don't earn their cost (alerts dedupe on re-run, so a faster cadence just burns function invocations for no operational benefit). Scheduling is not wired in code — it's a deploy-time operation documented in the function's README.
- **Rationale:**
  - Per-page subscriptions avoid the leak class where a global channel keeps delivering events to a component that's no longer mounted. The one concession is the bell's user-scoped channel in the shell, which is intentionally tied to the session profile lifecycle.
  - DB rows + Realtime keeps RLS as the single authorisation surface — every notification a client sees is one it could also have SELECTed. Broadcast channels bypass RLS and expand the attack surface.
  - Per-campaign thresholds (items 3, 4, 5) mirror the already-established D-007 / D-019 / D-027 / D-028 pattern: one JSONB column, soft-add, no schema migrations when tuning defaults for a new brand.
  - Deferring Web Push keeps the phase shippable within the 60–75 min budget the user specified; the rest of the phase is usable without it.
  - A 10-minute sweep cadence is tight enough for operational response and relaxed enough for cost. Alert dedup keys (documented in `detect-live-issues/index.ts`) make the cadence safe to increase or decrease without risking duplicate noise.
- **Implementation:**
  - Migrations: `20260424000000_phase7_alerts_extend.sql` (enum + 2 values), `20260424010000_phase7_break_requests.sql`, `20260424020000_phase7_notifications.sql`, `20260424030000_phase7_realtime_publication.sql`.
  - Pure detectors: `lib/alerts/detect.ts` + mirror `supabase/functions/_shared/live-detect.ts`.
  - Edge Function: `supabase/functions/detect-live-issues/index.ts` (+ README + deno.json + `config.toml` entry).
  - Realtime client: `lib/supabase/realtime.ts` with `subscribeToTables` + `useRealtimeTables` hook.
  - Live dashboards: `LiveDashboardClient` shared across `/[locale]/admin/live`, `/[locale]/supervisor/live`, `/[locale]/client/live` (aggregates-only).
  - Notifications: `lib/queries/notifications.ts`, `lib/notifications/actions.ts`, `NotificationBell` + `NotificationBellServer` wired into every role's `AppShell`.
  - Breaks: `lib/validations/breaks.ts`, `lib/queries/breaks.ts`, `lib/breaks/actions.ts`, `/[locale]/promoter/breaks` (submit + history + start/end), `/[locale]/supervisor/breaks` (queue with approve/reject/modify + Realtime refresh).
  - Tests: `lib/alerts/detect.test.ts` (26 cases incl. Case-3 Shini), `lib/alerts/spec-cases.test.ts` (5 spec cases — Late, Absent, Low Performance, Stock Shortage, No Check-Out — with supervisor resolve). Total: 196 vitest pass (was 190 in Phase 6; +6 new).
  - Bilingual copy: `messages/en.json` + `messages/ar.json` extended with `Live`, `Notifications`, `Breaks`, and six new `alerts.*` keys.
- **Alternatives considered:**
  - **App-level Realtime client.** Rejected: coupling a global channel's lifecycle to per-page navigation is the classic leak pattern; per-page subs keep cleanup deterministic.
  - **Notifications via broadcast channel.** Rejected: bypasses RLS, needs a parallel authorisation story.
  - **Polling fallback for notifications.** Rejected: added complexity for a feature whose whole purpose is to replace polling. If Realtime is down, the dashboard isn't live — we should fix Realtime.
  - **Hard-coded 60-min break cap.** Rejected: same reasoning as D-019 / D-027 (guaranteed first-customer-disagreement migration).
  - **Hard-coded 0.30 low-performance threshold.** Rejected: same.
  - **Ship Web Push this phase.** Rejected: service-worker push subscription + VAPID keys + per-platform quirks are a separate feature that would risk the phase-7 timebox. Phase 9 polish is the right home.
  - **5-min or 1-min sweep cadence.** Rejected: operationally the difference between 5 and 10 minutes is noise; the difference between 10 min and a shift-length gap is real. 10 min is the least frequent schedule that still feels "live."
- **Revisit when:**
  - Real-device testing shows iOS Realtime WebSocket flakiness significant enough to force a polling fallback for the bell.
  - A customer wants per-user (not per-campaign) thresholds → move the readers to a per-user JSONB on `profiles` and fall back to `kpi_config`.
  - Web Push is greenlit → `notifications.payload` already carries what a push envelope needs; add a `push_subscriptions` table and a `send-web-push` Edge Function.
  - Sweep cadence becomes measurably too coarse (alert latency complaints from ops) → halve it and monitor.

---

## D-030 — Phase 8 export pipeline: synchronous on-demand in a Server Action; cron-scheduled path through a dedicated Edge Function

- **Date:** 2026-04-20
- **Phase:** Phase 8 (Reporting/Export)
- **Question:** Where does the CSV/XLSX generation happen — Server Action, Edge Function, background worker, or a queue?
- **Decision:**
  - **On-demand (interactive) exports** run synchronously inside the requesting Server Action (`queueExportAction`): the same `assembleExportInput` + `composeExport` + `storage.upload` pipeline, called with the service-role admin client. The `export_jobs` row transitions queued → running → done (or failed) in one invocation; the caller blocks until it's done, then the UI navigates to the list with the fresh row already visible. A client-generated UUID provides idempotency (D-009).
  - **Cron-scheduled exports** flow through two Edge Functions: `cron-scheduled-reports` (hourly sweep; inserts an `export_jobs` row per due `scheduled_reports` row + invokes generate-report) and `generate-report` (targeted + sweep modes; shares the exact same byte-for-byte pipeline via `supabase/functions/_shared/`). Gated by `x-cron-secret`, same trust model as `detect-live-issues` / `detect-attendance-issues`.
- **Rationale:**
  - Realistic scope sizes at MVP (hundreds of rows per domain per campaign) run in well under Vercel's 10 s Server Action budget. Adding an async queue for the interactive path would double the surface (queue + worker + status polling) without buying measurable latency.
  - Scheduled reports need a place to run outside a user request, and cron has to dispatch somewhere — giving it a dedicated Edge Function keeps the two trust models cleanly separated (user JWT for on-demand; shared secret for cron).
  - One pipeline, two entry points: the TS logic under `lib/exports/` is mirrored byte-for-byte at `supabase/functions/_shared/` (matches the D-020 / D-028 pattern for `compute-kpis`), so both paths produce identical artifacts.
- **Alternatives considered:**
  - **Always go through an Edge Function.** Rejected for v1: forces the UI into a polling model even for interactive exports, and doubles latency for the common path (hundreds of rows).
  - **Queue + worker (pg_queue, BullMQ, etc.).** Rejected: operational weight not justified at current data volumes.
  - **Emit a webhook on `export_jobs` INSERT → Edge Function.** Rejected: trigger-based HTTP calls from Postgres require `pg_net`, add failure modes (silent drops), and are less observable than an explicit call in the Server Action.
- **Implementation:**
  - `lib/exports/actions.ts` — `queueExportAction` (sync) + `getExportDownloadUrlAction` (signed URL).
  - `lib/exports/assemble.ts` + `lib/exports/compose.ts` — runtime-neutral; imported by both runtimes.
  - `supabase/functions/generate-report/` — targeted (`{ job_id }`) + sweep (empty body) modes; writes to the private `exports` bucket.
  - `supabase/functions/cron-scheduled-reports/` — hourly sweep; inserts `export_jobs` row, calls `generate-report`, updates `last_run_at` + `last_job_id`.
- **Revisit when:** p95 interactive export generation crosses ~6 s on real data (then move to Edge Function + polling UI), or the scheduled backlog grows to the point where one-at-a-time sweep is too slow (then parallel invocation).

---

## D-031 — Email delivery of export signed URLs deferred to Phase 9

- **Date:** 2026-04-20
- **Phase:** Phase 8 (Reporting/Export)
- **Question:** The PLAN Phase 8 bullet says "Signed Storage URL delivery via email." Do we wire that now or defer?
- **Decision:** **Defer.** Phase 8 surfaces the signed URL in-app on the Exports page — the user clicks "Download" and `getExportDownloadUrlAction` mints a 5-minute signed URL. No email is sent.
- **Rationale:**
  - Email infrastructure (SES / Resend / transactional provider), template system, bounce handling, and deliverability testing are a feature-sized unit on their own. Bundling them into Phase 8 puts the whole phase at risk.
  - The in-app path is the most common usage anyway (admin pulls the file immediately after queueing); email is "nice-to-have" for end-of-day deliveries.
  - `export_jobs.result_path` + `scheduled_reports.last_job_id` are already in place; Phase 9 only needs to add `notifications.payload.download_url` and a send-email Edge Function.
  - Mirrors D-029 item 6 (Web Push deferred same phase boundary).
- **Alternatives considered:**
  - Ship an email-on-done path now. Rejected: out-of-scope for the phase budget; forces a provider decision prematurely.
  - Store a persistent signed URL on `export_jobs.result_url`. Rejected: long-lived signed URLs bypass the re-auth check at download time; we want TTL to be short and to re-verify access on every click.
- **Revisit when:** Phase 9 polish opens the email-delivery workstream. Work: provider choice, DNS (SPF/DKIM), template system, `send-export-email` Edge Function, `notifications` kind extension.

---

## D-032 — XLSX writer: in-house minimal OOXML + STORED zip; no new npm dep

- **Date:** 2026-04-20
- **Phase:** Phase 8 (Reporting/Export)
- **Question:** XLSX emission — add `exceljs` / `xlsx` / `fflate`-based lib, or write a minimal one?
- **Decision:** Ship `lib/exports/xlsx.ts` (inline-string OOXML) on top of `lib/exports/zip.ts` (STORED-only, CRC32, no compression). Zero new npm dependencies. Byte-for-byte deterministic output; Arabic text preserved without a BOM inside the XML parts.
- **Rationale:**
  - The OOXML spec parts we need are small: `[Content_Types].xml`, `_rels/.rels`, `xl/workbook.xml`, `xl/_rels/workbook.xml.rels`, one `xl/worksheets/sheetN.xml` per sheet. ~140 lines of TypeScript.
  - STORED (uncompressed) zip is the simplest ZIP layout; both `unzip`, Excel, LibreOffice, and Numbers accept it. Size cost at Phase 8 scale is negligible (~a few hundred KB uncompressed per campaign-month).
  - Existing repo has zero-dep CSV serialisation (`lib/utils/csv.ts`). Matching that posture keeps the bundle lean and the attack surface small.
  - `exceljs` is ~300 KB min+gz plus transitive deps; `xlsx` (community fork) has licensing churn; `fflate` adds DEFLATE we don't need. None would save meaningful implementation time against the in-house writer's ~200 lines.
- **Alternatives considered:**
  - **`exceljs`.** Rejected: bundle size + a richer API than we need; locks us into its abstractions for simple tables.
  - **`xlsx` (community).** Rejected: packaging / licensing ambiguity; sunsetted community build on npm.
  - **DEFLATE-zipped XLSX via `fflate`.** Rejected: one extra dep for a size win we don't need yet.
- **Implementation:**
  - `lib/exports/zip.ts` — CRC32 table, little-endian writers, local + central + EOCD records. Deterministic (DOS epoch 1980-01-01 frozen). Fully tested: CRC vectors, structural invariants, UTF-8 filenames, determinism.
  - `lib/exports/xlsx.ts` — `xmlEscape` (strips illegal XML 1.0 control chars), `colLetters`, `sanitizeSheetName` (Excel's `:\/?*[]` forbidden chars + 31-char limit + dedupe), `buildXlsx`. Inline strings (`t="inlineStr"`) so no `sharedStrings.xml` is needed.
  - Mirrored at `supabase/functions/_shared/zip.ts` + `xlsx.ts` for the Edge Function path (import paths tweaked for Deno explicit `.ts`).
- **Revisit when:**
  - Payload size becomes a real constraint (e.g., exports regularly exceeding tens of MB). At that point, switch to DEFLATE: add fflate and flip the zip writer's method byte.
  - Rich formatting (frozen panes, column widths, styles) is required. Then swap for `exceljs`.

---

## D-033 — Client export scope: aggregates only; no promoter rows, no raw attendance, no feedback text

- **Date:** 2026-04-20
- **Phase:** Phase 8 (Reporting/Export)
- **Question:** PLAN says "Client exports only their own campaigns." What shape?
- **Decision:** For `role = 'client'` inside the export builders + RLS combined, the artifact contains:
  1. **Attendance** — per-(campaign, location, date) counts: total, on_time, late, absent, missing_checkout, geofence_violations. No promoter names.
  2. **Activity** — per-campaign totals (reports / traffic / contacts / engaged / samples / sales) + recomputed interaction / engagement / conversion ratios. Per-SKU totals (samples + sales). No per-promoter rows.
  3. **Stock** — per-(campaign, SKU) rollup: allocated / distributed / used. No ledger rows, no supervisor or promoter entity ids.
  4. **Performance** — campaign-scope rows only. Promoter- and location-scope rows are filtered out at the builder. Matches the Phase 6 `/client/performance` page (D-028 item 6).
  5. **Supervisor actions** — sheet omitted entirely. Supervisor activity is operational; not client-facing.
  6. **Feedback** — per-(campaign, category, sentiment) counts. No body text, no competitor_brands column, no per-promoter rows. Parent consumer_feedback RLS already blocks client reads, so the builder never receives raw rows anyway; this keeps the output shape honest even if the caller supplies rows.
  Plus: `export_jobs.client_id` **must** equal `profiles.client_id` on INSERT (RLS WITH CHECK), and the Server Action intersects `scope.campaign_ids` with the client's campaigns before handing off to the builder.
- **Rationale:**
  - Reaffirms D-019 item 3 (client sees aggregates only, not PII / photos / raw attendance) and D-028 item 6 (client performance is campaign-scope only). Phase 8 is where the client first gets any export at all, and the shape has to match the posture that's already been in force for three phases.
  - Shipping raw attendance or feedback rows to a client silently crosses a line we've explicitly not crossed in Phase 3, 6, or 7. One leak channel is enough to blow the whole posture.
  - The aggregates are the ones the brand persona actually cares about (conversion at campaign level, engagement rollups, SKU performance, feedback category mix). Per-promoter data is operational, not client-facing.
- **Enforcement layers:**
  1. **RLS** — `consumer_feedback` + `supervisor_visits` + `attendance` + `daily_reports` + `kpi_snapshots` all block direct client access. `performance_snapshots` limits client to `scope_kind = 'campaign'`.
  2. **Server Action (`queueExportAction`)** — intersects `scope.campaign_ids` with the client's campaigns; rejects if `client_id` doesn't match the caller's `profiles.client_id`; the `export_jobs` row is INSERTed with `client_id = caller.client_id`, which the RLS WITH CHECK enforces as defence in depth.
  3. **Builders** — for `role = 'client'`, emit aggregate-only sheets; for `supervisor_actions`, emit zero sheets. Hard-coded in the pure-logic layer so a bug in the wiring still yields safe output.
- **Alternatives considered:**
  - **Ship raw rows with a "client redaction" post-pass.** Rejected: two places to get right (query + redact), and a leak means the raw rows already left the database.
  - **Per-client configurable shape.** Rejected: v1 — get the default right first.
  - **Omit exports for client role entirely.** Rejected: clients asked for this. The aggregate shape is genuinely useful without crossing the PII line.
- **Revisit when:**
  - A client signs an operational agreement that covers per-promoter visibility (then widen the builder for that tenant).
  - Phase 9 polish adds location-level rollups to the client surface (matching the D-028 item 6 revisit clause).

