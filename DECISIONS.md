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

---

## D-034 — Phase 9 email provider: Resend, env-gated, no npm dep; in-app notification always fires

- **Date:** 2026-04-20
- **Phase:** Phase 9 (Hardening)
- **Question:** D-031 deferred email delivery for export-ready signals. Which provider, how tightly coupled, and what happens when the provider fails?
- **Decision:**
  1. **Provider: Resend.** Called via `fetch('https://api.resend.com/emails', …)` directly — no npm dep. Same posture as D-032 (zero-dep XLSX writer) and consistent with the "provider choice belongs in one swappable file" rationale. Swapping to Postmark/SES is a one-file rewrite of `lib/email/send.ts`.
  2. **Env-gated.** `RESEND_API_KEY` + `RESEND_FROM_EMAIL` are both optional. If either is unset, `sendEmail()` returns `{ status: 'skipped', reason }` with a structured log line; nothing throws. The rest of the platform keeps working with in-app notifications only.
  3. **In-app notification always fires.** `notifyExportReady()` inserts a `notifications` row regardless of email success/skip/failure. The bell + Realtime channel (Phase 7) are the authoritative delivery surface; email is a convenience. This matches the D-029 posture of "notifications table is the single source of truth; delivery channels layer on top."
  4. **Email link = in-app page, not a signed URL.** The CTA in the email points at `/[locale]/admin/exports?job=<id>`. When the user clicks, `getExportDownloadUrlAction` mints a fresh short-TTL signed URL that checks their session first. Long-lived signed URLs would bypass the re-auth check on every download (rejected in D-031) — same logic here.
  5. **Fire-and-forget from the Server Action.** `queueExportAction` awaits `notifyExportReady` (to ensure logs + the notifications row land) but errors in that call are caught inside the function and logged; they never fail the export itself. The export is already saved to storage before the notification attempt.
- **Rationale:**
  - Adding `@resend/node` wouldn't save meaningful lines against the 40-line `send.ts` and would be one more dep to audit.
  - Env-gating keeps the rollout reversible: a brand-new tenant can run the platform without email plumbing and enable it later without a code change.
  - Email infrastructure is failure-prone in ways the platform can't fix (DNS, bounces, provider outages). Putting it on the critical path would couple export success to a third-party that's not part of the SLA.
- **Alternatives considered:**
  - **Postmark / SES.** Rejected for v1 on preference — Resend has the cleanest API for a simple transactional path. Swap is trivial via `lib/email/send.ts`.
  - **Supabase Auth email templates.** Rejected: those are for auth flows (invite / reset); overloading them for export notifications muddies the email-template UX + bounce-handling surface.
  - **Hard dependency on email success.** Rejected: couples the export happy-path to a provider we don't own.
- **Implementation:**
  - `lib/email/send.ts` — generic `sendEmail({to, subject, html, text})` + `isEmailConfigured()` helper.
  - `lib/email/templates.ts` — pure `exportReadyTemplate(locale, name, job_id, app_url)` returning `{subject, html, text}`. Bilingual (en + ar) with dir="rtl" on Arabic.
  - `lib/email/export-notify.ts` — orchestrator: resolve email via the Phase-9 `admin_get_user_emails` RPC + profile for preferred_language, compose, send, insert notifications row.
  - `lib/exports/actions.ts` — `queueExportAction` calls `notifyExportReady(job.id, me.id)` after the storage upload.
  - `supabase/migrations/20260426030000_phase9_notification_kind_export.sql` — `ALTER TYPE ... ADD VALUE IF NOT EXISTS 'export_ready'`.
  - Tests: 5 send-path cases (skip reasons × 2, successful call shape, http error, fetch exception) + 3 template cases (en + ar + URL encoding).
- **Revisit when:**
  - Ops picks a different provider — change `lib/email/send.ts` only.
  - Bounce / complaint webhooks matter operationally — add a new Edge Function + provider-webhook secret; `notifications.payload` already has room for delivery status.
  - Email becomes the primary delivery surface (e.g. scheduled reports to clients who don't log in daily) — promote it above the in-app notification and re-evaluate the fire-and-forget coupling.

---

## D-035 — Phase 9 rate limiting: DB-backed fixed-window counters; fail-open; no Upstash

- **Date:** 2026-04-20
- **Phase:** Phase 9 (Hardening)
- **Question:** Rate-limit the abuse-prone Server Actions (login / reset / feedback / export) with what backend, what algorithm, and what failure mode?
- **Decision:**
  1. **DB-backed** via a new `public.rate_limits (key, window_start, count, updated_at)` table + `check_rate_limit(p_key, p_window_seconds, p_max_requests)` SECURITY DEFINER RPC. RLS on the table has no policies; all I/O is through the RPC.
  2. **Fixed-window** counter (not sliding, not token-bucket). Atomic via `INSERT … ON CONFLICT (key) DO UPDATE` with a conditional window reset inside the SET clause; Postgres serialises on the row's xmin so no explicit lock is needed.
  3. **No Upstash / no Redis.** Keeps the zero-new-dep posture (D-032 / D-034). These boundary paths are bursty and infrequent per-subject; the DB handles them fine. If a truly high-throughput path appears (not today), we'd reach for Redis then.
  4. **Subject key = user-id when authed, `x-forwarded-for` first hop otherwise.** Authed subject dominates the public IP key so a shared-office NAT doesn't punish legit users sharing an egress address.
  5. **Fail-open on DB error.** If the RPC returns an error, the check returns `{ allowed: true }` with a `warn` log. Breaking legit users during an infrastructure glitch is strictly worse than leaking one free window to a potential attacker — every other primitive (Supabase's own auth rate limits, audit logs) still catches them.
  6. **Initial policies (per-subject, per-window):**
     - `login`:           10 / 60 s
     - `reset_request`:    5 / 300 s
     - `reset_confirm`:   10 / 300 s
     - `feedback_submit`: 20 / 60 s
     - `export_queue`:    10 / 60 s
  7. **GC.** `gc_rate_limits()` deletes rows idle > 24 h. Scheduled daily via pg_cron (example SQL in the migration header). No-op if not scheduled; the table grows ~1 row per (subject × action) with a 60-byte footprint.
- **Rationale:**
  - DB for rate limits mirrors the "one transactional source of truth" posture we already took with the audit log (D-011 boundary) and rate_limits join for free — an over-limit counts as a normal DB row and shows up in forensic queries.
  - Fixed-window is the simplest algorithm that gets the job done; sliding-window + token-bucket add state + math for marginal smoothness on boundary traffic we don't see.
  - Fail-open is the standard posture for anti-abuse rate limits. Fail-closed is reserved for budget / billing controls where we can't afford a free lunch.
- **Alternatives considered:**
  - **Upstash / Redis.** Rejected for v1: new vendor, new secret, new failure mode, and Redis rate limits fail-closed by default which would break legit users if Upstash had a bad hour.
  - **Next.js middleware + in-memory counters.** Rejected: Vercel serverless is multi-region + multi-instance; per-process counters aren't counters, they're noise.
  - **Token-bucket.** Considered. Deferred — the boundary paths don't benefit from burst tolerance; 10/min on login is the right shape either way.
  - **Fail-closed.** Considered. Rejected per the rationale above.
- **Implementation:**
  - Migration: `supabase/migrations/20260426020000_phase9_rate_limits.sql`.
  - Client: `lib/rate-limit/check.ts` with `RATE_LIMITS` registry + `checkRateLimit(keyName, userId?)`.
  - Wired into: `loginAction`, `resetRequestAction` (replies ok silently to avoid leaking rate-limit state), `resetConfirmAction`, `submitFeedbackAction`, `queueExportAction`.
  - Bilingual copy: `rate_limited` key added under `Exports.errors` and `Feedback.form.errors`; `Auth.errors.rate_limited` already existed from Phase 1.
  - Tests: 6 cases (policy registry sanity, RPC key shape with/without user id, allowed/denied, fail-open on DB error + empty data).
- **Revisit when:**
  - A public Server Action starts seeing >1 qps per subject — switch to sliding-window or move that path to Upstash.
  - A brand pushes for per-tenant rate policies — add `tenant_id` to the key and widen the registry.
  - Fail-closed becomes the right posture (e.g. rate limiting export generation cost because it's expensive) — flip the fallback on that one policy only.

---

## D-036 — Web Push deferred to Phase 9.1

- **Date:** 2026-04-20
- **Phase:** Phase 9 (Hardening) — deferred to Phase 9.1
- **Question:** D-029 item 6 deferred Web Push from Phase 7 to Phase 9. Should Phase 9 ship it?
- **Decision:** **Defer to optional Phase 9.1.** Web Push is a well-scoped, self-contained follow-up that needs 2–3 hours of focused work done right. Phase 9's core hardening items (error boundaries, indexes, rate limiting, email, observability) all landed cleanly; shipping a half-done VAPID + subscription UI would be strictly worse than a clean deferral.
- **Rationale:**
  - VAPID key management, service-worker push handling (with iOS Safari's specific quirks around user-gesture requirements), per-user subscription storage, and notification payload shaping each have their own testing matrix. Real-device testing on iOS + Android + desktop is not a vitest job.
  - The `notifications` table (Phase 7) already carries `kind + payload`, which is everything a push envelope needs. The integration is bolted on top, not a structural change.
  - Phase 9's exit criteria don't require push — the in-app bell + Realtime channel (D-029 item 1) covers the core notifications UX.
- **Alternatives considered:**
  - **Ship a minimal Web Push path in Phase 9.** Rejected: minimal in this space means "skips the iOS testing," which is equivalent to not shipping it.
  - **Cancel Web Push permanently.** Rejected: the ask is legitimate and the foundation is already in place.
- **Implementation plan (Phase 9.1 scope):**
  - Migration: new `push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, created_at, active)` table with self-only RLS.
  - Client: subscribe button in notification-bell dropdown (all roles); `pushManager.subscribe({ userVisibleOnly, applicationServerKey })`; POST subscription to a Server Action that upserts the row.
  - Service worker: `self.addEventListener('push', …)` reading `event.data.json()` and calling `self.registration.showNotification(title, opts)`.
  - Edge Function `send-web-push` invoked from `detect-live-issues` + notifications fan-out paths; uses Web Push protocol headers (VAPID + aes128gcm) either via a Deno library or by hand.
  - Env: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` (mailto). Generated via `npx web-push generate-vapid-keys`.
  - Real-device test matrix: iOS 16.4+ Safari PWA (home-screen install required for push on iOS), Android Chrome, desktop Chrome/Firefox.
- **Revisit when:**
  - Ops signs off on the Phase 9.1 scope + gets VAPID keys generated + rotation plan agreed.
  - A user persona — likely supervisor — is missing push badly enough in field feedback to justify the work.

---

## D-037 — Phase 9 observability: structured JSON logs always; Sentry soft-attach via env; promoter idle-timeout companion

- **Date:** 2026-04-20
- **Phase:** Phase 9 (Hardening)
- **Question:** How do we add production observability without forcing a vendor choice, and how do we handle session hygiene on shared-phone promoter devices?
- **Decision:**
  1. **Always-on structured logging.** `lib/observability/logger.ts` emits JSON lines to stdout via `console.log/warn/error` (Vercel + Supabase both capture these). Level-gated by `LOG_LEVEL` (`debug|info|warn|error`, default `info`). Recursive redaction on every payload — the key set overlaps with `lib/auth/audit.ts` (password / token / access_token / refresh_token / api_key / authorization / cookie / secret / service_role_key) plus case-insensitive match.
  2. **Sentry as a soft-attach.** `reportError()` always writes the error as a structured log line. If `SENTRY_DSN` is set AND `globalThis.Sentry.captureException` is mounted (e.g. from an `instrumentation.ts` that `require`s `@sentry/nextjs`), it also forwards. If not, everything still works via stdout logs. This keeps the feature additive — ops can pick Sentry later by installing the SDK + setting the env var + adding instrumentation.ts; no Phase 9 code change needed.
  3. **Client-side mirror.** `lib/observability/report-client.ts` is a minimal client bundle that does the same Sentry check against `window.Sentry`. Wired into `ErrorFallback` (step 2) and `global-error.tsx`.
  4. **Existing `console.error/warn` call sites migrated:** `lib/auth/audit.ts`, `lib/kpis/invoke.ts`, `lib/stock/actions-helper.ts` now use the structured logger. Browser-side `console.warn` in `supervisor/visits/new/new-visit-client.tsx` is left as-is (client context, already visible to the user).
  5. **Companion: promoter idle-timeout.** `components/features/idle-watcher.tsx` auto-calls `logoutAction()` after 30 min of no activity on promoter pages. Activity = mouse / keyboard / touch / visibilitychange. 60 s grace warning with "Stay signed in". Retail phones are often left on shelves unlocked; this closes the stale-session exposure. In-progress drafts survive via D-010 IndexedDB + D-009 idempotency keys — loggin back in replays them cleanly.
  6. **No Sentry npm dep at this time.** Recording the contract here so ops can enable it without a new phase: install `@sentry/nextjs`, add `instrumentation.ts` with `Sentry.init({ dsn: process.env.SENTRY_DSN })`, and everything described above picks it up.
- **Rationale:**
  - One interface that always works + optional vendor attach = no coupling to a vendor decision.
  - Structured JSON is the right default: `vercel logs` + Supabase log drain (pg_net on audit inserts) + Axiom/Logtail if ops wants that tier later all read JSON natively.
  - Redaction at the logger level means every new call site gets it for free; we don't need per-call discipline.
  - The idle-timeout belongs in this entry because it's the client-side observability surface (when a user's session goes away, we want the audit trail + notifications bell empty state to both reflect that) and it was scoped together in the Phase 9 plan.
- **Alternatives considered:**
  - **Install `@sentry/nextjs` in Phase 9.** Rejected: vendor lock + new dep. The soft-attach contract lets ops pick Sentry or any other SDK that exposes `captureException` via instrumentation.
  - **Custom log schema (e.g. pino).** Rejected: pino would be a dep, and the JSON shape we ship matches the common denominator of Axiom + Logtail + Datadog without it.
  - **Skip the idle-timeout; rely on Supabase's JWT expiry.** Rejected: Supabase sessions are ~1 hour default — that's an hour of exposure on a shared phone. Client-side nudge + server-side signOut is the cheap defense-in-depth move.
  - **60-minute idle threshold.** Considered. 30 is the right shop-floor number; a promoter actively running a shift will have activity inside 30 min; a promoter who doesn't shouldn't be logged in.
- **Implementation:**
  - `lib/observability/logger.ts` (server) + `lib/observability/report-client.ts` (client, no `server-only` import so it doesn't pull server code into the browser bundle).
  - `lib/test-utils/server-only-stub.ts` + vitest alias for `server-only` — enables unit-testing server modules in node. 7 new logger tests (JSON shape, level gating, redaction, Sentry pass-through with + without DSN, Sentry exception isolation).
  - `components/features/idle-watcher.tsx` + en/ar copy under `IdleWatcher.*` namespace. Wired into `app/[locale]/promoter/layout.tsx` only.
- **Revisit when:**
  - Ops enables Sentry — install + instrumentation per the contract; no Phase code changes.
  - Log volume grows enough to need sampling — add a `logger.sample(p)` helper and gate the `debug` level through it.
  - Idle-timeout threshold rejected by field teams as too aggressive — move it behind `kpi_config.idle_timeout_minutes` per the D-019 / D-027 / D-028 / D-029 pattern.
  - Supervisor / admin roles ever run from shared devices — extend `IdleWatcher` to their layouts with a role-appropriate threshold.

---

## D-039 — Feature 2 location trust detection: IPQS free-tier, 24h cache, signal-only never-blocking, false-positive risk explicitly accepted

- **Date:** 2026-04-20
- **Phase:** Post-project Feature 2 (VPN / Location Trust Detection)
- **Question:** How do we surface VPN / proxy / spoofed-location signals at promoter check-in without adding a blocker on a flow that is already fragile (mobile carriers, roaming, retail Wi-Fi), and without coupling to a specific IP reputation vendor?
- **Decision:**
  1. **IPQualityScore free-tier provider.** `lib/location-trust/ipqs.ts` calls the public endpoint with the key in `IPQUALITYSCORE_API_KEY`. Unset key = feature no-ops (same posture as `SENTRY_DSN` / `RESEND_API_KEY` in D-034 / D-037). Swappable by replacing the single file; the detector in `detect.ts` depends only on the normalised `IpReputationResult` shape.
  2. **24h Supabase-backed cache.** `public.ip_reputation` stores one row per IP with `raw_response`. Lookups read-through with a 24h freshness window; misses fetch + upsert. RLS is enabled with no policies, so only the service-role path reads/writes — no client bundle, no authenticated reader.
  3. **Fire-and-forget wiring.** The check-in flow is the Supabase Edge Function `geo-validate-checkin`; we do not modify it. Instead, a new Next.js Route Handler `POST /api/attendance/location-trust` is called from the promoter PWA with `fetch(..., { keepalive: true })` immediately after a successful check-in. The handler extracts the source IP from `x-forwarded-for` (first hop) with `x-real-ip` fallback, verifies attendance ownership, and kicks off `recordLocationTrustCheck(...)` without awaiting it. The handler always responds 202. The orchestrator is guaranteed never to throw.
  4. **Signal, not block.** When suspicious (VPN / proxy / fraud_score ≥ 85 / country mismatch) we insert a `location_trust_low` alert (`severity=warning`) with `message_params.reasons` + `message_params.trust_signals`. Check-in is never rejected, delayed, or retried. The UI footer ("Check-in was allowed — verification signal, not a block") documents this to supervisors.
  5. **Country mismatch via a bundled MENA bounding-box table** (13 countries: JO, SA, AE, EG, BH, QA, KW, OM, LB, IQ, SY, YE, PS). Neighbour-accurate only. Points outside the covered region return `null` → no mismatch is flagged, deliberately avoiding false-positives at coverage edges. We accept the tradeoff that travellers outside MENA won't get a country-mismatch signal; the VPN / proxy / fraud_score signals still fire.
  6. **False-positive risk is explicitly accepted.** Mobile carrier NAT sometimes geolocates to neighbouring countries or data-centre ranges (flagged as proxy/VPN). Corporate egress, home-router routing through a corporate VPN, and frequent travellers all fall in the same bucket. Because this is a signal and not a block, false-positives cost the supervisor one click to dismiss; the cost of a false-negative (spoofed attendance) is much higher.
- **Rationale:**
  - Free-tier IPQS is the cheapest off-the-shelf option with a documented JSON shape; the normalisation layer makes it swappable.
  - Caching in Postgres (vs. another Redis dep) mirrors D-035's anti-Upstash posture. `ip_reputation` is a new low-traffic table; the composite `(ip_address, checked_at desc)` index is enough.
  - Fire-and-forget via a Route Handler (not a Server Action) keeps the promoter check-in client-side latency unchanged: the client does not await the trust check. `keepalive: true` lets the browser finish the request even if the page reloads.
  - A signal-only posture keeps parity with the existing alert-centric model (D-019). Blocking on IP-based signals on retail Wi-Fi would be a field support disaster.
- **Alternatives considered:**
  - **Extend the `geo-validate-checkin` Edge Function.** Rejected: tightens coupling to a flow that is already doing too much (EXIF strip, geofence math, alert fan-out); Deno runtime adds test surface; `EdgeRuntime.waitUntil` semantics are non-uniform.
  - **Server Action wrapper around the Edge Function.** Rejected: the check-in is already a `supabase.functions.invoke` call from the client; wrapping it in a Server Action introduces a second round-trip for no benefit.
  - **Geolocate the IP via an external API (MaxMind, ipapi, etc.) instead of a bundled box table.** Rejected as overkill for the country-mismatch signal — a bbox table resolves 13 operationally-relevant countries in <1µs without a second network call.
  - **Block check-in on high-fraud-score.** Rejected per D-019: the platform surfaces signals; supervisors decide.
  - **30-day or 7-day cache.** Rejected: IPs rotate (DHCP, mobile-carrier pools), and IPQS reclassifies over time; 24h is the documented sweet spot for this signal.
- **Implementation:**
  - Migration: `supabase/migrations/20260428000000_feature2_location_trust.sql` (additive: enum value + `ip_reputation` table + composite index + RLS enabled with no policies).
  - `lib/location-trust/ipqs.ts` (server-only), `lib/location-trust/detect.ts` (pure), `lib/location-trust/record.ts` (server-only), `lib/validations/location-trust.ts` (zod).
  - `app/api/attendance/location-trust/route.ts` — Route Handler.
  - `app/[locale]/promoter/attendance/attendance-client.tsx` — client-side `fetch(..., { keepalive: true })` right after check-in success (no await).
  - `components/features/alerts/location-trust-detail.tsx` — detail block with `ShieldAlert` + reason pills + footer note.
  - `components/features/live/live-dashboard-client.tsx` + `lib/queries/alerts.ts` — extend the `AlertType` union and the `ALERT_VARIANT` map.
  - i18n: new `LocationTrust` namespace in ar + en; new `alerts.location_trust_low` key.
  - Env: `IPQUALITYSCORE_API_KEY` (optional, unset = no-op).
  - 20 new vitest cases under `lib/location-trust/*.test.ts` (321 total, up from 301 baseline).
- **Revisit when:**
  - IPQS rate limits bite (free tier) — swap to a paid plan or a different provider by editing `ipqs.ts` only.
  - Supervisors routinely dismiss `location_trust_low` alerts as noise — tighten the fraud-score threshold or gate the country-mismatch check behind a `kpi_config.require_country_match` flag per the D-019 / D-027 / D-028 soft-add pattern.
  - The feature needs to cover promoters outside MENA — replace the bundled bbox table with an IP-geolocation service or a world-covering bbox file.
  - The same IP is shared by many promoters (corporate egress) — add per-user rate-limiting on the alert so a bad corporate IP doesn't fan out N alerts per check-in.

---

## D-040 — Per-client promoter visibility toggles: privacy-first default, admin override per tenant

- **Date:** 2026-04-20
- **Phase:** Post-project Feature 3 (Configurable Promoter Visibility)
- **Question:** D-019 item 3, D-028 item 6, and D-033 together lock every client tenant into the same aggregates-only posture: no promoter names, no photos, no alerts, no per-row data. Some tenants have signed operational agreements that cover deeper visibility (e.g. a brand paying the promoters directly). The only way to satisfy those tenants today is to change source code, which cannot be scoped to one client. How do we add a per-tenant escape hatch without silently changing the default posture for the other tenants?
- **Decision:**
  1. **Four boolean toggles live on `public.clients`**, added in migration `20260420010000_feature3_client_visibility.sql`:
     - `show_promoter_names` — promoter real name instead of the display id.
     - `show_promoter_photos` — selfie / activity photo URLs included.
     - `show_promoter_alerts` — promoter-scoped alert rows included.
     - `show_promoter_full_profile` — per-promoter rows instead of aggregates.
     All four are `NOT NULL DEFAULT false`. Every existing tenant (and every new tenant that an admin does not explicitly configure) retains the D-019 / D-028 / D-033 aggregates-only posture byte-for-byte.
  2. **Admin-only editable, audit-logged.** A new "Visibility settings" section on the admin client edit form (`components/features/admin/client-form.tsx`) renders the four checkboxes plus a warning banner: "Enabling any option exposes personal data to this client — review the privacy agreement before turning it on." The `updateClientAction` Server Action (`requireAdmin()`-guarded, already audit-logged) picks them up via the extended Zod schema; the `before` / `after` diff in `audit_log` captures every flip for compliance review.
  3. **No new RLS policy.** The existing `clients_select_self_tenant` policy already lets a client read their own `clients` row; the new columns flow through it automatically. Cross-tenant isolation is unchanged — a client can never read another tenant's toggles regardless of their own flags. `clients_update_admin` still gates writes to admin-only.
  4. **`promoter_display_id` is a deterministic pseudonym, not a mapping table.** `promoterDisplayId(uuid)` = `'P' + sha256(uuid).slice(0, 6).toUpperCase()`. ~16.7M distinct values; stable across exports and pages; no DB state to maintain. When `show_promoter_names=false` every surface that would render a promoter emits this id instead of the real name.
  5. **Server-side enforcement at two layers, defence in depth.**
     - `lib/auth/client-visibility.ts::getClientVisibility(clientId)` loads the flags with a safe default — any DB error returns `ZERO_VISIBILITY` so transient failures never accidentally leak data.
     - `lib/auth/client-visibility.ts::scrubPromoterFields()` applies field-level redaction per flag. Callers that forget to pass flags get the all-false safe default via a literal constant (`ALL_FALSE_VISIBILITY` in `builders.ts`), not via ambient globals.
  6. **Phase 8 export builders extend, not replace, the D-033 shape.** When `role='client'` and `show_promoter_full_profile=true`, the orchestrator appends a new `Promoters` sheet after the aggregate sheets (`lib/exports/builders.ts::buildClientPromoterSheet`). The identity column is the display id; `show_promoter_names=true` adds a second `Promoter name` column with the real name. The existing aggregate sheets remain unchanged regardless of the flags. All-false tenants get byte-identical output to the pre-D-040 shape — vitest `client toggles` describe block proves this.
  7. **Out of v1:** expanding the client `live` / `performance` pages to render promoter data when the flags are true. Those surfaces currently show no promoter data at all; widening them is a UX change deferred to a follow-up. The helper (`getClientVisibility` + `scrubPromoterFields`) is ready; only the query-layer joins and the page components need extending.
- **Rationale:**
  - Columns on `clients` rather than a side-car table: one row per client is wasteful, the flags are always loaded together with the client context, and it mirrors the existing `active` column pattern exactly.
  - Defaults false so the change is zero-impact until an admin makes a deliberate, audited decision. D-019 / D-028 / D-033 remain the documented posture for every tenant that hasn't explicitly opted in.
  - No new RLS policy keeps the cross-tenant isolation story simple — every existing pgtap test for client isolation continues to apply unchanged.
  - Deterministic display id avoids a mapping-table migration (`promoter_display_ids` with a sequence per tenant), which would also have to be backfilled for existing promoters and kept in sync.
  - Styled native checkboxes (matching the existing `active` field) avoid pulling `@radix-ui/react-switch` into the bundle for a form that is rarely used; consistency with the rest of admin matters more than a polished toggle visual.
  - The aggregate sheets are intentionally preserved when `show_promoter_full_profile=true` — a client who opted in still gets the KPI roll-ups they already depended on, plus the new per-promoter sheet. No breakage for existing users of the export.
- **Alternatives considered:**
  - **Side-car `client_settings` table.** Rejected: adds a join for every visibility check, zero benefit over four columns.
  - **Single JSONB `visibility_config` column.** Rejected: weaker typing, no per-field defaults, harder to grep, more migration ceremony when we add the fifth flag.
  - **Sequential display id via a `promoter_display_ids` table.** Rejected: requires a migration + backfill; benefit (short "P01" instead of "P7A3F2B") is small and cosmetic; the hashed form is stable and collision-rare.
  - **Per-field UI flags that default `null` (unset).** Rejected: three-state flags invite bugs where the UI reads `null` as "inherit" and silently opens data. `false` as the unopinionated default is safer.
  - **RLS-level enforcement (new policies referencing `show_promoter_*`).** Rejected for v1: today the client role has zero direct RLS access to `attendance`, `daily_reports`, `kpi_snapshots`, `consumer_feedback`, `supervisor_visits`, so there are no policies to toggle. When the query layer grows surfaces that need the flags (see Revisit), the policies can be added on a case-by-case basis alongside each surface.
  - **Per-campaign visibility overrides within a client.** Rejected for v1: no tenant has asked for sub-client granularity. Revisit via a structured JSONB column if needed.
- **Implementation:**
  - Migration: `supabase/migrations/20260420010000_feature3_client_visibility.sql` (additive, IF NOT EXISTS, single-line comments).
  - Helper: `lib/auth/client-visibility.ts` — `ClientVisibility`, `ZERO_VISIBILITY`, `getClientVisibility`, `promoterDisplayId`, `scrubPromoterFields`.
  - Schema: `lib/validations/clients.ts` extended with 4 booleans defaulting to `false`.
  - Query type: `lib/queries/clients.ts::ClientRow` + `SELECT_COLUMNS` extended so the admin form can prefill.
  - Server Action: `app/[locale]/admin/clients/actions.ts` reads the 4 checkboxes, threads them into insert + update payloads, and captures `before` / `after` in `logAuditEvent`.
  - UI: `components/features/admin/client-form.tsx` "Visibility settings" section — warning banner + 4 styled native checkboxes + per-toggle helper text.
  - i18n: `Admin.clients.form.visibility.{title, warning, names_label/help, photos_label/help, alerts_label/help, profile_label/help}` in ar + en.
  - Export types: `lib/exports/types.ts::ExportClientVisibility` + `ExportInput.clientVisibility` (optional).
  - Export builder: `lib/exports/builders.ts::buildClientPromoterSheet` + `buildAllSheets` appends the Promoters sheet when the flag is on.
  - Tests: `lib/auth/client-visibility.test.ts` (9 cases), `lib/exports/builders.test.ts` new `client toggles (D-040)` describe (5 cases), `supabase/tests/feature3.test.sql` (11 pgtap cases: defaults, admin update, client self-read, cross-tenant denial both sides). Vitest: 321 → 335.
- **Revisit when:**
  - A tenant asks to see promoter photos or alerts. Today the flags are honoured at the builder's scrub helper, but the query layer (`lib/queries/*`) does not select photo URLs or alert rows for the client role. Widen the query-layer select list + the page components gated on the flag.
  - A tenant asks to see per-promoter data on the `/client/live` or `/client/performance` pages. Current surfaces render no promoter data at all; extend the page-level query to call `getClientVisibility(clientId)` and branch. The helper + display id + scrub are ready.
  - Per-campaign visibility overrides are requested. Revisit by replacing the four booleans with a structured JSONB column (`visibility_config`) that can hold a per-campaign map.
  - A legal or compliance review requires that toggled-on fields be read-only or approved by a second party. Today any admin can flip any flag; if dual-control becomes a requirement, wire it through a pending-approval table similar to the reconciliation flow (D-032 pattern).

---

## D-041 — Feature 4: attendance photos OPTIONAL + supervisor field visits linked to promoter

- **Date:** 2026-04-20
- **Phase:** Post-project Feature 4 (Check-in/out Photos + Supervisor Field Visits)
- **Question:** Phase 3 forced every check-in and check-out to include a JPEG selfie via two DB CHECK constraints (`attendance_status_check_in_consistency`, `attendance_status_check_out_consistency`) plus hard requirements in the `geo-validate-checkin` / `geo-validate-checkout` edge functions. Supervisor visits logged the campaign + location but could not tie a visit to a specific promoter, which blocked "your supervisor visited you today" notifications and a per-promoter visit history. How do we relax the photo requirement without losing the audit trail when a photo IS taken, and how do we link visits to a promoter without duplicating schema?
- **Decision:**
  1. **Attendance photos OPTIONAL.** Migration `20260429000000_feature4_attendance_photo_optional.sql` drops + recreates `attendance_status_check_in_consistency` and `attendance_status_check_out_consistency` to require only `time + lat + lng` when the row represents a real presence record. The `check_in_photo_path` / `check_out_photo_path` columns are preserved (nullable), and every other attendance invariant (coord pairing, check-out-after-check-in, override fields, idempotency) is preserved byte-for-byte. When a photo IS attached the existing EXIF-strip + bucket-upload path runs unchanged.
  2. **Edge functions accept missing image.** `geo-validate-checkin` and `geo-validate-checkout` now branch on presence: if the multipart body has no `image` field, MIME validation / EXIF strip / bucket upload are skipped and the attendance row is inserted with `check_in_photo_path = null` + `check_in_exif_minimal = null` (mirror for check-out). Response shape is unchanged.
  3. **Photo upload failure never blocks check-in.** If the client-side compressor throws or the file picker fails, the UI surfaces a non-blocking alert and still allows submit. The only hard requirement for check-in is a geolocation fix.
  4. **Supervisor visits gain `promoter_id`.** Migration `20260429010000_feature4_supervisor_visits_promoter.sql` adds a nullable `promoter_id uuid references profiles(id) on delete set null` to the existing `public.supervisor_visits` table, a partial index on `(promoter_id, visited_at desc)`, and a new RLS policy `supervisor_visits_select_promoter_self` letting the promoter SELECT their own visits. Nullable at the column level so legacy rows survive; required at the edge-function validation layer for every new row.
  5. **`supervisor-visit-create` fans a notification to the visited promoter.** After inserting the visit row, the edge function inserts a `notifications` row `{ user_id: promoter_id, kind: 'supervisor_visit', payload: { visit_id, supervisor_id, location_id, visited_at, outcome } }` via the service-role client. Migration `20260429020000_feature4_notification_kind_visit.sql` appends `'supervisor_visit'` to the `notification_kind` enum (mirrors the Phase 9 `export_ready` pattern).
  6. **Photos reused across surfaces.** Attendance selfies and supervisor-visit photos land in the existing private `attendance-photos` bucket under `attendance/{user_id}/{date}/check_in.jpg` and `visits/{supervisor_id}/{visit_id}.jpg`. Signed URLs are issued from Server Actions / Route Handlers (D-019 posture — no direct storage.objects read policies). A new `/api/supervisor-visits/photo-url` route mirrors the existing `/api/attendance/photo-url`.
  7. **Retention: 90 days, cleanup edge function.** A new `supabase/functions/cleanup-old-photos/index.ts` iterates both path prefixes nightly, deletes objects whose timestamp is older than 90 days, and nulls the matching `check_in_photo_path` / `check_out_photo_path` / `photo_path` columns. Scheduled via `cron.schedule` snippet in the function README (same pattern as `detect-attendance-issues`). No `pg_cron` migration added.
  8. **Client role unchanged, show_promoter_photos preserved.** Client role has no SELECT on `attendance` or `supervisor_visits` regardless of Feature 4; the export-layer `scrubPromoterFields` from D-040 still nulls `promoter_photo_url` when `show_promoter_photos=false`. An additional vitest regression case locks this invariant against Feature 4 changes.
  9. **Admin view at `/admin/field-visits`.** New route shows every visit with filters (supervisor, promoter, date range), thumbnails via signed URL. Uses the existing admin table pattern from `/admin/exports`. Route name diverges from `/supervisor/visits` intentionally — admin has different filters and needs the dedicated surface.
  10. **Promoter view.** A visit-history section on the promoter profile page lists rows where `promoter_id = auth.uid()`. Read-only: timestamp, supervisor name, location, outcome, notes. The audit photo is NOT shown to the promoter (the supervisor's shot is the supervisor's audit record, not a customer-facing artifact).
- **Rationale:**
  - Photos-mandatory failed in the field. Retail malls in the GCC region restrict in-store photography; many promoters work night shifts with poor lighting; broken cameras on cheap Android handsets are common. Making the photo optional removes a daily friction point without losing the audit data when a photo IS captured.
  - Extending `supervisor_visits` is cheaper than a new `supervisor_field_visits` table: the edge function, RLS scaffold, outcome enum, and index set already exist. One nullable column + one new SELECT policy delivers the feature.
  - Nullable `promoter_id` at the column level + required at the edge-function layer preserves any pre-existing rows (none in production yet, but the pattern protects future migrations) and gives a clean validation boundary without a CHECK constraint whose meaning changes over time.
  - Notifications through the existing `notification_kind` enum keep the bell surface uniform; the client already renders arbitrary `payload` JSONB through a message_key lookup, so no UI change is needed beyond the kind-label translation.
  - 90-day retention is the shortest interval that still lets an incident investigation reach back one full monthly cycle without storing photos indefinitely. Cleanup in the edge function (not cron-in-SQL) matches the detection functions' pattern and keeps the migration additive.
- **Alternatives considered:**
  - **Keep photos mandatory + add a supervisor-approved override for missing photos.** Rejected. The supervisor is rarely on site at check-in; a "missing photo → override" queue would create a daily backlog with no privacy benefit.
  - **New `supervisor_field_visits` table.** Rejected. Duplicates the existing `supervisor_visits` schema, edge function, and UI. Adding one column is the smaller change.
  - **Make `promoter_id NOT NULL` from the start.** Rejected for backwards compatibility — even though production has no rows today, the nullable + edge-function-validated pattern is more forgiving if a reporting job or data migration produces a row without a promoter.
  - **Require the photo when the promoter is geofence-compliant (skip only for overrides).** Rejected. The field-condition reasons (lighting, mall rules) apply regardless of geofence status; coupling the two surfaces confuses both flows.
  - **Per-client override of the photo requirement.** Rejected for v1. The Feature 3 / D-040 override table is reserved for visibility, not collection. If one client insists on photos, add a `require_attendance_photo` flag then; today no tenant has asked.
  - **Store visit photos in a separate bucket.** Rejected. Same privacy class, same retention, same access model — one bucket + path-prefix separation is simpler.
- **Implementation:**
  - Migrations: `supabase/migrations/20260429000000_feature4_attendance_photo_optional.sql`, `20260429010000_feature4_supervisor_visits_promoter.sql`, `20260429020000_feature4_notification_kind_visit.sql` (all additive, IF NOT EXISTS where applicable, single-line `comment on ...`).
  - Edge functions: `supabase/functions/geo-validate-checkin/index.ts`, `geo-validate-checkout/index.ts` (make image optional), `supervisor-visit-create/index.ts` (accept + validate `promoter_id`, fan notification). New `supabase/functions/cleanup-old-photos/index.ts` for 90-day retention.
  - UI: `app/[locale]/promoter/attendance/attendance-client.tsx` (optional photo, non-blocking compressor errors), `app/[locale]/supervisor/visits/new/new-visit-client.tsx` + `page.tsx` (promoter dropdown, pre-fill from query param), `app/[locale]/supervisor/promoters/[id]/page.tsx` (new promoter-detail page with visit + attendance history and "Log visit" CTA), `app/[locale]/admin/field-visits/page.tsx` + `field-visits-client.tsx` (admin listing), `app/[locale]/promoter/profile/page.tsx` visit-history section.
  - Route handler: `app/api/supervisor-visits/photo-url/route.ts` mirrors `/api/attendance/photo-url` (service-role-signed URL, 1-hour TTL, role-gated).
  - i18n: `AttendancePhoto.*` (5 keys: `attach_optional`, `attach_cta`, `photo_optional_hint`, `skip_photo`, `upload_failed_toast`) + `FieldVisits.*` (~14 keys covering promoter picker, admin filters, notification strings, visit history) + `Notifications.kinds.supervisor_visit`.
  - Tests: `supabase/tests/feature4.test.sql` pgtap covering the relaxed CHECK, promoter SELECT policy, client denial, notification row shape. Vitest cases on `lib/exports/builders.test.ts` (photo-scrub regression with Feature 4 data), `app/[locale]/supervisor/visits/new/new-visit-client.test.tsx` (promoter dropdown + pre-fill).
- **Revisit when:**
  - A tenant signs an agreement that requires a check-in photo as proof of presence. Flip the default back via a new `clients.require_attendance_photo` flag + edge-function branch + conditional constraint.
  - An incident investigation needs photos older than 90 days. Lengthen the retention window in the cleanup function's constant (single-line change) or attach retention-per-client via a clients-level flag.
  - A second audit-photo lineage (e.g. SKU spot-checks) is added. The path-prefix pattern + the signed-URL route handler scale; add `audit/{supervisor_id}/*` and a new route handler before the bucket count grows past one.
  - Supervisor visits need a camera-stream option rather than a single still. Switch the input to a short-video capture and extend the compressor — out of scope today since mobile promoter handsets still struggle with video upload on 3G.

---

## D-042 — Feature 5: live GPS tracking every 15 minutes while checked-in

- **Date:** 2026-04-20
- **Phase:** Post-project Feature 5 (Live GPS Tracking)
- **Question:** Phase 3 records one GPS pin at check-in and one at check-out. In between — often four to eight hours — the platform has no visibility into whether the promoter stayed at the assigned location. A promoter could check in, walk away, and return at check-out without anyone noticing. We need continuous-ish presence verification without over-reaching on privacy and without promising background behaviour PWAs cannot deliver.
- **Decision:**
  1. **Sampling interval: 15 minutes.** While a promoter has an open attendance row (`check_out_time IS NULL`), the client captures one GPS reading every 15 minutes and sends it to the server. First ping fires immediately on check-in to anchor the trail.
  2. **Tracking bounded to an open attendance.** The hook is disabled unless there's an open attendance id for the active assignment. No tracking before check-in, no tracking after check-out, no tracking on any other page of the app. `enabled` is derived purely from the matched attendance row.
  3. **New table `public.location_pings`.** Columns `attendance_id`, `promoter_id`, `lat`, `lng`, `accuracy_m`, `battery_pct`, `captured_at`, `created_at`, with CHECK constraints on every physical quantity. Indexes `(attendance_id, captured_at)` and `(promoter_id, captured_at desc)`. RLS: admin full access, promoter SELECT + INSERT own (INSERT further gated on the referenced attendance being open and owned), supervisor SELECT by `assigned_locations` intersection via a join on `attendance`, **no client-role policy**.
  4. **Retention: 30 days.** `gc_location_pings()` deletes rows older than 30 days; scheduled as a direct `pg_cron` call (no Edge Function hop — it's pure SQL) at 03:15 UTC. Documented in the `cleanup-old-photos` README's companion section.
  5. **Server-side guards in `recordLocationPingAction`.** Zod-strict payload; rejects `(lat, lng) = (0, 0)` as a common no-fix stub; verifies attendance belongs to caller + is open; enforces `check_rate_limit('ping:<attendanceId>', 600, 1)` — max one ping per 10 minutes per attendance — using the Phase 9 D-035 RPC directly (not the helper, since the helper's policy table is for static keys); haversine-rejects pings more than 5 km from the check-in pin and logs a warning for supervisor follow-up.
  6. **Client ingestion via a pure scheduler + thin React hook.** The scheduler (`lib/location-tracking/tracker.ts`) is dependency-injected and fully unit-tested in the node environment (9 cases). The hook (`lib/hooks/use-location-tracker.ts`) wires `navigator.geolocation.getCurrentPosition` + the Battery Status API + the existing Phase 9 offline queue (`lib/offline/queue.ts`). Permission-denied, timeout, and unavailable errors surface as `lastError`; transient network failures enqueue the payload (with a fresh UUID idempotency key) for retry on reconnect.
  7. **iOS foreground-only is documented honestly.** Safari suspends JS timers on backgrounded tabs; we cannot work around that in a PWA. The privacy page states this explicitly. No Background Sync, no silent Push, no overstated claim. On Android-Chrome-foreground the 15-minute cadence runs reliably; when the tab is backgrounded on Android it is similarly paused — this is an accepted limitation for v1.
  8. **Persistent privacy indicator.** A shared module-level signal (`lib/location-tracking/state-signal.ts`) carries tracker state to `TrackingIndicator`, which is mounted once in `AppShell`. When tracking is inactive, the indicator returns `null` (no-op for supervisor / admin / client). When active, it renders a pulsing pill ("Tracking active" / "جاري تتبع الموقع") with a tap-popover linking to `/privacy/location-tracking`.
  9. **Supervisor daily ping trail.** `lib/queries/location-pings.ts::listPingsForPromoterOnDate` is RLS-scoped; the supervisor promoter-detail page gains a "Today's Trail" section with a date picker clamped to the last 30 days. The map component is dynamic-imported with `ssr:false` so Leaflet's `window`/`document` access does not break Next's build. Markers show time + accuracy circle + battery; the check-in pin is a distinct diamond.
  10. **Promoter transparency.** The promoter dashboard shows "My location log (today)" — count of pings + last ping time, no map. Transparency without complexity.
  11. **Mapping library: Leaflet + react-leaflet.** No API key, no token, 43 kB gzipped. `@types/leaflet` for types. Inline SVG DivIcons avoid the Leaflet default-marker-image bundler headache. Deferred import so the supervisor promoter-detail route's first-load JS grows by just the section wrapper (2.65 kB) until the map is actually rendered.
- **Rationale:**
  - **Why 15 minutes.** A one-minute cadence drains battery fast and floods the table with ~500 rows per 8-hour shift per promoter. An hour is too coarse to notice an abandoned post before significant loss. 15 minutes yields ~32 rows per shift, low battery impact on modern phones, and is the same cadence used by several well-known field-force tools (Hubstaff, Jibble). The server-side 10-minute rate-limit floor is deliberately *less* than the client cadence so one missed tick followed by an immediate retry still fits.
  - **Why in-session only.** The product's trust model with the promoter is "we check you're on-site while you're working." Background tracking would break that promise AND would not work reliably on iOS anyway. The constraint is a feature, not a limitation.
  - **Why 30-day retention.** Pings are operational, not historical. They let a supervisor verify today's presence and let an admin investigate last week's disputed shift. Beyond 30 days the signal is no longer actionable, and keeping coordinate history longer increases both the legal blast-radius of a breach and the table size (which hits index scans).
  - **Why no client-role access.** Clients pay for outcomes (sales, reach, stock) — not for watching where individual promoters stand. Exposing pings to the client role would cross a trust line that agency operators have drawn firmly. Client-facing deliverables continue to be aggregates (D-033).
  - **Why reuse the offline queue.** The Phase 9 queue already solves idempotent retry with exponential backoff and dead-letter handling. Rolling a separate ping-only retry system would duplicate all of that.
  - **Why a pure scheduler + React wrapper.** The node vitest environment has no DOM / testing-library. Keeping all branching logic in `startTracker` (pure, inject-deps) means we cover every edge — offline, permission denied, rate-limit, far-from-check-in, throw — with fast unit tests. The React wrapper is a 40-line lifecycle-only shim; manual QA covers it.
  - **Why Leaflet.** No API key (Mapbox + Google both want one), smaller bundle than Mapbox GL, OpenStreetMap tiles are free. react-leaflet is ergonomic. Inline SVG DivIcons sidestep the well-known Leaflet default-icon bundler bug in Next.
- **Alternatives considered:**
  - **Continuous polling (1/min or 1/5 min).** Rejected. Battery + data cost + row volume don't justify the precision improvement for presence verification.
  - **WebSocket live updates via Supabase Realtime.** Rejected for v1. Adds persistent connection cost across thousands of devices; periodic HTTP insert is fine at 15-minute cadence. Supervisor view is also fine with a page refresh or date-picker change.
  - **Background geolocation via a native wrapper (Capacitor).** Rejected for v1 per D-003 (PWA-first). Revisit when the promoter app is ported to React Native; the server API here is unchanged.
  - **Store as PostGIS `geography(Point)`.** Rejected. Plain lat/lng doubles + haversine match the attendance table's pattern (D-011-esque). Adding PostGIS for this feature alone is overkill; revisit if we need spatial queries (radius search across many promoters) in the future.
  - **Push retention down to 7 days.** Rejected. 7 days fails the "investigate last week's disputed shift" case. 30 days is the product-manager-requested default; extendable via a constant in the gc function.
  - **Push pings to a separate Edge Function.** Rejected. Server Action + admin client + RLS INSERT policy is simpler, already how check-in/out alert flows work, and Server Actions have built-in CSRF.
  - **Hide the indicator.** Rejected hard. Persistent visibility while tracking is the privacy contract. A tap-to-reveal privacy page reinforces it.
  - **Allow the client role to view pings on an opt-in basis per D-040.** Rejected. Unlike names/photos, real-time location data of individual workers is categorically different — a privacy and labour-relations red line. Do not expose even with an admin flag.
- **Implementation:**
  - Migration: `supabase/migrations/20260430000000_feature5_location_pings.sql` (additive, IF NOT EXISTS, single-line `comment on ...`, no `||`).
  - Pgtap: `supabase/tests/feature5.test.sql` — 7 cases covering promoter-own SELECT + cross-promoter denial + supervisor scope + client denial + cross-owner INSERT denial + admin SELECT + `gc_location_pings()` smoke.
  - Validation: `lib/validations/location-pings.ts` — strict zod schema + constants `MAX_PING_DISTANCE_FROM_CHECKIN_M`, `PING_RATE_LIMIT_WINDOW_SECONDS`, `PING_RATE_LIMIT_MAX`.
  - Server Action: `app/[locale]/promoter/attendance/location-actions.ts::recordLocationPingAction` with full branching + `reportError` wrapping. Tests `location-actions.test.ts` cover all 9 outcomes.
  - Tracker core: `lib/location-tracking/tracker.ts` + `tracker.test.ts` (9 cases under fake timers).
  - Hook: `lib/hooks/use-location-tracker.ts` — binds geolocation + Battery Status API + `lib/offline/queue.ts` + publishes state via `lib/location-tracking/state-signal.ts`.
  - Indicator: `components/features/location-tracking/tracking-indicator.tsx` — `useSyncExternalStore` subscription; mounted in `AppShell`.
  - Privacy page: `app/[locale]/privacy/location-tracking/page.tsx` — static copy explaining when/what/who/retention/iOS reality.
  - Supervisor trail: `lib/queries/location-pings.ts`, `components/features/location-tracking/ping-trail-section.tsx` (date picker + dynamic-imported map wrapper), `components/features/location-tracking/ping-trail-map.tsx` (Leaflet, inline SVG icons, accuracy circles, polyline).
  - Promoter transparency: `app/[locale]/promoter/dashboard/page.tsx` card with `countMyPingsForDate`.
  - Retention: `gc_location_pings()` in the Feature 5 migration + `pg_cron` snippet in `supabase/functions/cleanup-old-photos/README.md`.
  - Dependencies: `leaflet`, `react-leaflet`, `@types/leaflet`.
  - i18n: `messages/{ar,en}.json` namespace `LocationTracking.*` (22 keys including ICU pluralised Arabic).
- **Revisit when:**
  - Promoter complaints surface about battery drain on older Android hardware. Lengthen the interval to 20 or 30 min, or add a "low battery" branch that skips pings below 15 %.
  - A client (with admin approval) requests presence dashboards. Build an aggregate (e.g. "hours inside geofence this week") that does NOT expose raw coordinates.
  - The product moves from a web PWA to a Capacitor wrapper. Background geolocation unlocks reliable tracking across iOS foreground/background. The server API and schema are unchanged; only the client-side capture swaps.
  - Spatial queries across many promoters become common (heatmaps, cluster detection). Migrate lat/lng to PostGIS geography and add a GIST index; the row structure otherwise is stable.
  - A tenant asks to hold pings for more than 30 days. Update `gc_location_pings()`'s interval constant; confirm DB size impact first.
  - A legal or labour regulation requires richer consent UX. The privacy page has a stable URL; add a click-through acknowledgement + a `location_tracking_ack_at` column on `profiles` if needed.

## D-043 — Demo seed data: auth users via dashboard, data via SQL Editor, idempotent, 30-day rolling window
- **Date:** 2026-04-20
- **Context:** The platform was feature-complete (D-001 through D-042) but had no reproducible demo dataset. Opening the app on a freshly-migrated database meant empty dashboards, which made sales demos and reviewer walkthroughs impossible without ad-hoc one-off scripts. Feature 6 needed a dataset that renders every role's dashboard populated and stays recent over time.
- **Decision:**
  - Demo data ships as a hand-runnable SQL file at `supabase/seeds/demo_seed.sql`. It is **not** part of the migration replay — migrations remain the authoritative schema record; seeds sit on top.
  - Auth users are created manually through the Supabase Dashboard (Authentication → Users) with a shared `Demo@1234` password. The seed resolves them by email against `auth.users` and raises a clear error if any are missing. This keeps the seed out of the auth-admin API and avoids shipping hashed passwords or the service-role key anywhere.
  - The seed wraps in a single transaction and begins with a tag-driven cleanup block (Almarai client, campaigns prefixed `Almarai `, cities in {Amman, Zarqa, Irbid}, demo emails) so re-runs always converge on the same state. Running the seed twice is the canonical reset path.
  - All timestamps are derived from `now() - interval 'N days'`, never literal dates. The demo window always ends "today", so dashboards keep displaying recent activity without touching the seed file.
  - Admin (`admin@almarai.com`) and any non-demo data are never deleted, updated, or re-tagged.
  - The `stock_movements` append-only deny-trigger is temporarily disabled inside Stage 1 only for the cleanup's `delete`, then re-enabled. The `profiles_self_update_guard_trg` is temporarily disabled inside Stage 2.7 only so the seed can set role/client_id on the demo profiles (in the SQL Editor `auth.uid()` is NULL and `is_admin()` returns false).
- **Alternatives rejected:**
  - **Creating auth users through the Admin API inside the SQL file.** Rejected. Would require smuggling service-role credentials into SQL and bypasses dashboard policy. Manual creation is trivially one-time per environment and self-documenting.
  - **Storing demo data as a migration.** Rejected. Migrations should be idempotent schema, not data that decays over time (30-day window). Mixing data into migrations also means `supabase db reset` would re-seed — we want explicit, opt-in demo data.
  - **A Node/TypeScript seed runner using the service-role client.** Rejected. Adds a new build target, a new dependency set, and a new credentials surface. Pure SQL keeps the seed readable, diffable, runnable by anyone with SQL Editor access, and zero-dependency.
  - **Faker-style random data with stable seeds.** Rejected for simplicity. `random()` per-row is fine for demo purposes; we want fresh variance on each run, not byte-exact reproducibility.
  - **Leaving `stock_movements` append-only during cleanup and inserting compensating correction rows.** Rejected. Correction rows are for real incidents, not demo resets. Temporarily disabling the deny trigger is explicit, audited in the seed file, and touches nothing outside the cleanup block.
  - **Populating Storage with real selfie + activity photos.** Rejected. Requires service-role uploads, adds binary assets to the repo, and breaks the "pure SQL, paste to run" promise. Placeholder paths (`demo/checkin_<uuid>.jpg`) are enough for UI layout demos; the selfie viewer will 404, which is acceptable for a demo.
  - **Adding a `price` column to `skus`.** Rejected (out of scope). Prices are documented in the seed file header only.
  - **Creating a separate reset SQL file.** Rejected. Duplication. The cleanup block inside the seed is already self-contained and can be copied into SQL Editor on its own.
- **Implementation:**
  - Seed file: `supabase/seeds/demo_seed.sql` — single transaction, header with Part A auth user list + JOD prices + demo tags, Stage 0 (resolve users), Stage 1 (cleanup), Stages 2.1–2.13 (client, geography, locations, campaigns, SKUs, shifts, profiles, assignments, attendance, pings, daily_reports, sales_entries, breaks, stock ledger, supervisor visits).
  - Docs: `DEMO.md` at repo root — prerequisites, auth user matrix, step-by-step run, reset, role-login map, troubleshooting.
  - Decision record: this entry.
- **Revisit when:**
  - The auth-admin API becomes scriptable without leaking service-role credentials into repo (e.g., Supabase CLI gains a first-class `create-user` step with a passwordless JIT token). Then the Part A manual step can be collapsed into the seed.
  - A customer or reviewer asks for real selfies / activity photos. Add a follow-up that uploads tiny placeholder JPEGs to `attendance-photos` + `activity-photos` buckets via the service-role client. Requires a separate non-SQL runner.
  - The demo story outgrows a single-tenant dataset. Add a `demo_tag` config flag or a second seed file for a multi-client scenario. The tag-based cleanup generalises trivially (swap `like 'Almarai %'` for a table-driven filter).
  - Random-variance per-run becomes a problem (e.g., demo script expects specific KPI numbers). Switch `random()` to a deterministic hash of `(user_id, date)` + a constant seed exposed at the top of the file.

# Append this entry to the end of DECISIONS.md
# (Before the final `---` or at the very bottom, depending on your file's convention.)

---

## D-014 — Design System Rebrand to Perception Visual Identity

- **Date:** 2026-04-22
- **Phase:** Phase 0 (foundation revision)
- **Question:** The Stripe/Notion aesthetic established in D-012 did not match the brand direction the platform needs. Should we fully rebrand the design system to match the Perception (Creative & Marketing Solutions) brand identity?
- **Decision:** **Yes — full rebrand.** Replaced the single-indigo grayscale design system with the Perception brand palette and guidance. Key changes:

  **Colors:**
  - Primary accent changed from Indigo `#4f46e5` → **Cyan Wave `#0ABCD4`**.
  - New secondary accent: **Teal Flow `#2DD9B4`** (used for success states, positive highlights).
  - Inverse surfaces allowed: sidebar and featured KPI cards now use **Ink `#0F1B2E`** as background — gives the platform a Linear-like premium feel.
  - Neutral grayscale shifted from warm neutrals to **blue-tinted grays** that harmonize with the Navy anchor.
  - Full palette: Navy Deep `#1B2A4A`, Cyan Wave `#0ABCD4`, Teal Flow `#2DD9B4`, Mint `#8AE8C0`, Lime `#E8F26A`, Sun `#F5D033`, Ink `#0F1B2E`, Slate `#8A96AA`.
  - Theme color (mobile browser chrome) changed from `#4f46e5` → `#0abcd4`.

  **Gradients:** Previously forbidden. Now **allowed in exactly three controlled places** per page:
  1. 4px accent strip at the top of the app shell (`--gradient-strip`).
  2. Logo mark container (`--gradient-accent`).
  3. One hero CTA per page on marketing/auth surfaces (`--gradient-accent`).
  Still forbidden: gradient cards, gradient KPI tiles (except decorative orb on inverse card), gradient inputs, gradient page backgrounds.

  **Shadows:** Previously "borders not shadows". Now cards may use a subtle navy-tinted `shadow-card` for modern depth. Floating elements (modals, dropdowns) still use `shadow-md`/`shadow-lg`.

  **Border radius:** Increased defaults — `--radius-md` 6→8px, `--radius-lg` 8→12px, `--radius-xl` 12→16px. Cards now use `rounded-xl` (16px) for the modern look.

  **Typography:** Inter + IBM Plex Sans Arabic retained (already working well). `font-bold` (700) now permitted for KPI numbers and marketing headlines; `font-semibold` (600) remains the default for emphasis everywhere else.

  **Status pills:** Shape changed from `rounded` (4px) → `rounded-full` (pill) to match modern SaaS conventions.

- **Rationale:**
  - The platform is built by Perception (Creative & Marketing Solutions) for their agency operations. Using their own brand identity creates consistency between the platform, the marketing materials, and the company's external presence.
  - Stripe/Notion aesthetic is excellent but generic — it doesn't tell anyone this is "our" product.
  - The Perception palette is vibrant enough to feel modern, but anchored by Navy Deep to remain professional for long work sessions.
  - Dark sidebar + light content is a proven pattern (Linear, Vercel) that gives premium feel without fatiguing users.
  - Typography discipline is retained — the rebrand adds personality through color and surface choices, not through adding more fonts or complexity.

- **Scope of change:**
  - `app/globals.css` — replaced all CSS variables.
  - `tailwind.config.ts` — updated color tokens, added `accent-2`, `brand.*` shortcuts, and gradient background utilities.
  - `.claude/skills/design-system/SKILL.md` — rewritten to reflect new rules.
  - `.claude/skills/design-system/PATTERNS.md` — component examples updated.
  - `app/[locale]/layout.tsx` — added 4px gradient accent strip at top; updated `themeColor`.
  - `app/[locale]/client/dashboard/page.tsx` — rebuilt as proof of concept.
  - `messages/{en,ar}.json` — added translation keys for the new dashboard content.

- **Supersedes:** D-012 (Light Mode Only, Stripe/Notion Aesthetic) — the light-mode-primary principle survives; the monochrome-plus-indigo aesthetic is replaced.

- **Does NOT supersede:**
  - Light-mode primary (still true — no theme toggle).
  - Typography-first hierarchy.
  - Accessibility requirements (focus rings, contrast ratios, RTL support).
  - The "data-dense is fine, cluttered is not" principle.

- **Migration status:** Foundation (`globals.css`, `tailwind.config.ts`, skill docs) + proof-of-concept page done. Subsequent pages (auth screens, admin lists, campaign detail) must be visited one by one; most will not require template changes because they already reference semantic tokens.

- **Revisit when:** Perception's own brand identity changes, or a new parent brand is adopted.

---

## D-044 — Admin server actions: guarded `profiles` UPDATEs run on the SSR client

- **Date:** 2026-04-25
- **Phase:** Production hotfix
- **Question:** Which Supabase client should an admin server action use when updating columns that the `profiles_self_update_guard_trg` BEFORE-UPDATE trigger protects (`role`, `active`, `client_id`, `created_by`, `assigned_locations`)?
- **Decision:** Any UPDATE on `public.profiles` that touches one of those columns **MUST** run on the SSR server client (`createServerSupabase()` from `lib/supabase/server.ts`), not the service-role admin client (`createAdminSupabase()`). Authorization is still gated explicitly with `requireAdmin()` at the top of the action — do not rely on the trigger as the gate.
- **Rationale:** The guard trigger short-circuits only when `public.is_admin()` returns true, and `is_admin()` is defined in terms of `auth.uid()`. Service-role connections carry no end-user JWT, so `auth.uid()` is NULL, `is_admin()` returns false, and the trigger raises (`'profiles: only admins may change <col>'` or `'profiles: created_by is immutable'`). The SSR client carries the acting admin's session cookie, which satisfies the guard. Two reported call sites surfaced this as `{ error: 'unknown' }` toasts; a third was failing silently because the error wasn't destructured.
- **Exceptions that stay on the service-role admin client:**
  - `supabase.auth.admin.*` calls (invite, delete user, etc.) — require service role by design.
  - Inserts into `audit_log` via `logAuditEvent` — regular users lack INSERT privilege on that table.
- **Reference:** Commit `1520347` (`fix/admin-user-actions-use-ssr-client`) for the three call sites this rule was derived from: `inviteUserAction`, `changeUserRoleAction`, `setUserActiveAction` in `app/[locale]/admin/users/actions.ts`.
- **Revisit when:** The guard trigger is replaced by RLS-only enforcement, or a SECURITY DEFINER RPC absorbs the admin-write surface.

---

## D-045 — Admin dashboard KPI numbers use `text-4xl`

- **Date:** 2026-04-25
- **Phase:** Admin dashboard rebuild
- **Question:** The design system fixes KPI-card numerals at `text-3xl font-bold tabular-nums` (SKILL.md typography table, KPI Card section). Should the new admin dashboard inherit that, or is a larger size justified for the headline experience?
- **Decision:** KPI numerals on `/admin/dashboard` use `text-4xl font-bold tabular-nums tracking-tight`. Every other table, list, stat strip, and KPI card in the application — including the live dashboard's `Tally` component, performance summaries, and any future role dashboards — continues to use the `text-3xl` default.
- **Rationale:**
  - The admin dashboard is the operator's primary landing experience and is intentionally a brand showcase. Slightly larger numerals reinforce the "command your operations" hero feel set by the gradient strip directly above them, without disturbing density on data-rich pages elsewhere.
  - Scoping the exception to a single route keeps the rest of the app coherent and prevents the size from spreading by mimicry.
  - The card label, sub line, and delta indicator stay at the design-system defaults (`text-xs`), so vertical rhythm within the card remains conventional.
- **Alternatives considered:**
  - Update the design system default to `text-4xl` globally. Rejected: too disruptive — every list page would look heavier and the existing `Tally` strip would compete with its surroundings.
  - Use `text-3xl` to stay with the system. Rejected: the prompt explicitly framed the dashboard as a brand moment, and after side-by-side mockups `text-3xl` looked underweight against the hero.
- **Revisit when:** The design system rev next bumps base font sizes, or another dashboard adopts the same hero pattern (in which case promote `text-4xl` to a `kpi-hero` token rather than re-declaring it inline).

---

## D-046 — `updateProfileAsAdmin` is the canonical helper for admin-driven `profiles` UPDATEs

- **Date:** 2026-04-25
- **Phase:** Production hotfix (SEC-01 + architectural guard)
- **Question:** D-044 fixed three call sites, was published, and was still violated a second time. How do we stop this happening a third time without bolting on lint rules whose false-positive surface is larger than the bug?
- **Decision:** All admin-initiated UPDATEs on `public.profiles` go through a single helper, `updateProfileAsAdmin(userId, patch)`, exported from `lib/supabase/admin-helpers.ts`. The helper uses the SSR client internally; callers cannot accidentally route a guarded column through the service-role admin client because they never see the client at all. The rule applies even for benign columns (`phone`, `full_name`, `preferred_language`) — consistency makes the right path the only path, and the guard surface is the same regardless of which column was patched.
- **Rationale:**
  - D-044 has been violated twice in production: commit `1520347` corrected `inviteUserAction` / `changeUserRoleAction` / `setUserActiveAction`, then SEC-01 (audit, 2026-04-25) found `bulkImportAction` had repeated the same defect. Pure documentation has been tried twice and failed twice. The recurrence rate justifies a structural defense.
  - A helper makes the correct path the easy path. The signature does not accept a client parameter, so the wrong client cannot be passed in. Calls read uniformly across the admin codebase.
  - The helper is the natural home for a future swap to a SECURITY DEFINER RPC or a typed `Database['public']['Tables']['profiles']['Update']` patch type — both upgrades happen in one file.
- **Alternatives considered:**
  - **Custom ESLint rule.** Detect `createAdminSupabase()` followed by `.from('profiles').update(...)` via AST. Rejected: false-positive surface is wide (any future admin-client call that legitimately touches a non-guarded write would trip), the rule is brittle (alias renames, wrapper functions, and `as` assertions defeat AST detection), and a developer who copy-pastes the wrong pattern from another file would still ship before lint catches it. The helper achieves the same prevention without the maintenance cost.
  - **Relax the guard trigger to allow service-role bypass.** Rejected: wrong trade-off. The guard is the last line of defense against a malformed RLS policy or a leaked service-role key being used for privilege escalation; weakening it to accommodate developer ergonomics inverts the security posture.
  - **Documentation only (status quo).** Rejected: empirically does not work — see the two prior recurrences.
- **Reference:**
  - Helper: `lib/supabase/admin-helpers.ts` (`updateProfileAsAdmin`).
  - First D-044 violation: commit `1520347` (`inviteUserAction`, `changeUserRoleAction`, `setUserActiveAction`).
  - Second D-044 violation: SEC-01 in `audit/03-security.md` (`bulkImportAction` at `app/[locale]/admin/imports/actions.ts:140-143`), fixed by routing through this helper.
- **Verification:** `git grep -n "createAdminSupabase" app/ | grep -A2 "from('profiles')"` followed by `.update(` should return zero matches.
- **Revisit when:** The guard trigger is replaced by RLS-only enforcement, a SECURITY DEFINER RPC absorbs the admin-write surface, or `supabase gen types` lands and the `patch` parameter can be replaced with the generated `Database['public']['Tables']['profiles']['Update']` type.

---

## D-047 — Supabase generated types (`database.types.ts`) are the source of truth for all client typing

- **Date:** 2026-04-26
- **Phase:** Type safety hardening (TS-01 from audit/02-type-safety.md)
- **Question:** The four Supabase clients (`admin`, `browser`, `server`, `middleware`) were instantiated without a `<Database>` generic, so every `.from(...)`, `.update(...)`, `.insert(...)`, `.in(...)`, `.eq(...)`, and `.rpc(...)` call returned `any`/`unknown` shapes. How do we restore strict typing across the data access layer without a multi-day refactor?
- **Decision:** A single generated file, `lib/supabase/database.types.ts`, exports `Database` and `Json` and is wired into all four client factories via `createClient<Database>(...)` / `createBrowserClient<Database>(...)` / `createServerClient<Database>(...)`. The file is regenerated from production schema with `pnpm db:types` (script in `package.json`), which runs `supabase gen types typescript --linked --schema public`. It is checked into the repo so CI typecheck does not require Supabase CLI auth. Hand-rolled row interfaces and ad-hoc `Record<string, unknown>` shapes elsewhere in the codebase are migrated to `Database['public']['Tables'][T]['Row' | 'Insert' | 'Update']` or `Database['public']['Enums'][E]` where they touch the data access layer.
- **Rationale:**
  - Generated types catch class-of-bug regressions at compile time: enum drift (`photo_kind`, `alert_type`, `feedback.category`), JSON column shape mismatches (`audit_log.before_json/after_json`, `ip_reputation.raw_response`, `stock_reconciliations.details`), and patch object widening (`tasks.update()` previously typed as `Record<string, unknown>`, lost all column safety). All three classes were latent in the codebase before TS-01 and surfaced as the first 16 typecheck errors when the generic was wired in.
  - Regeneration via `pnpm db:types` keeps the file synchronized with the linked project (`CEAlmarai`) — no manual editing, no schema drift between code and DB.
  - The four-client wiring is the single chokepoint: once `<Database>` flows through the factories, every consumer downstream inherits the typing without per-call-site annotation.
- **Alternatives considered:**
  - **Per-query manual typing with `as` casts at call sites.** Rejected: scales linearly with the codebase, every new query is a fresh opportunity to drift, and casts hide the kind of bugs (enum mismatch, JSON shape) the generic catches for free.
  - **Skip generation, hand-write `Database` interface.** Rejected: must be re-edited on every migration, and historical evidence (the existing `ConsumerFeedbackListRow`, `ClientCampaignDetail`, etc.) shows hand-written shapes drift from schema within weeks.
  - **Defer adoption until a "bigger refactor."** Rejected: the audit's TS-01 estimate was one full day; actual cost was ~1.5 hours because the codebase already used Supabase idioms cleanly. Deferring would have let the bug classes accumulate.
- **Patterns adopted during migration:**
  - **RPC null args:** Postgres functions tolerate `null` for non-`STRICT` params, but `gen-types` emits all RPC args as required strings. Cast at call site (`p_location_id: input.location_id as string`) with a comment referencing this decision rather than weakening the runtime contract.
  - **JSON columns receiving `Record<string, unknown>`:** Cast to `Json` (`raw_response: result.raw_response as Json`). The application layer guarantees the shape; the column type is intentionally `Json` in the schema.
  - **JSON columns read with known shapes (`name_i18n`, `kpi_config`):** Cast at the read site (`as { ar?: string; en?: string }`). Same rationale — schema is `Json`, application enforces shape.
  - **Mutable patch objects:** Type as `Database['public']['Tables'][T]['Update']` instead of `Record<string, unknown>`.
  - **String narrowing through `Set` membership:** Type the `Set` as `Set<EnumType>` and capture the narrowed value (`const validPhotoKind = photoKind as PhotoKind`) for use in `.eq()` / `.upsert()` calls.
- **Reference:**
  - Generated file: `lib/supabase/database.types.ts`.
  - Regeneration: `pnpm db:types`.
  - Wiring: `lib/supabase/{admin,browser,server,middleware}.ts`.
  - Migration commit: `refactor(types): adopt Supabase generated database types (TS-01)`.
- **Verification:** `pnpm typecheck` returns zero errors; `pnpm build` compiles; `pnpm lint` is clean.
- **Revisit when:** Supabase changes the generator output format, a CI guard is added to fail builds when `database.types.ts` is stale relative to the linked schema (Phase 5 follow-up), or the application moves to a typed query builder that subsumes the generated types.