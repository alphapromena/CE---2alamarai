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
