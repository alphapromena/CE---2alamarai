# Phase 3 — Security: Auth, Authorization, Inputs, Secrets, RLS

> Audited: page guards, server-action guards, service-role usage (D-044), RLS coverage, input validation, secret hygiene, XSS / injection, middleware / CSP.
> Scope: `app/**`, `components/**`, `lib/**`, `supabase/migrations/**`, `middleware.ts`, env files.

---

## Headline

The security perimeter is **mature and well-architected**. RLS is comprehensive (every public table enabled, no `using (true)`, no enabled-but-empty tables except `rate_limits` which is intentional). All ~30 server actions validate input with Zod and call role guards. CSP and security headers in `middleware.ts` are tight. Service-role import is gated by `'server-only'` and never reaches a `'use client'` file. No hardcoded secrets, no `dangerouslySetInnerHTML`, no string-concatenated SQL.

**One P1, two P2, three P3 findings**. Nothing P0. No URGENT issues.

---

## Findings table

| ID | Sev | Area | Summary | Files | Effort |
|---|---|---|---|---|---|
| SEC-01 | **P1** | Service role / D-044 | `bulkImportAction` UPDATEs `profiles.created_by` on the service-role admin client; `profiles_self_update_guard_trg` raises every time, so every bulk-imported user is reported as "created but profile update failed" with `created_by=NULL` and `must_change_password` unset. Identical defect-shape to the one fixed in commit `1520347` for `inviteUserAction`. | `app/[locale]/admin/imports/actions.ts:140-143` | XS |
| SEC-02 | P2 | PostgREST filter injection (defense-in-depth) | `app/api/attendance/photo-url/route.ts:34` interpolates user-supplied `path` into a `.or()` filter string without escaping. A crafted path containing a comma + `id.eq.<own-row-id>` would let the OR clause return the attacker's own row, bypass the row-ownership check, and then sign a URL for the original (attacker-supplied) path. Real exploit requires the attacker to first know a target photo path, which RLS already prevents — so no immediate exploit, but the bypass is real and the fix is trivial. | `app/api/attendance/photo-url/route.ts:34` | XS |
| SEC-03 | P2 | Audit signal | RLS denials and DB errors in admin server actions surface as `{ error: 'unknown' }` with no audit-log entry — a malicious or compromised account probing privileged actions leaves no trail. | All `app/**/actions.ts` `if (error \|\| !inserted) return { error: 'unknown' }` paths (~25 sites) | M |
| SEC-04 | P3 | CSP — `unsafe-inline` script-src | `middleware.ts` keeps `'unsafe-inline'` and `'unsafe-eval'` (dev) in `script-src`. Acknowledged in inline comment as a Next.js 15 streaming requirement. Modern alternative: per-request nonce wired into `<Script nonce>`. Cosmetic for now. | `middleware.ts` | L |
| SEC-05 | P3 | Auth helper hardening | `lib/observability/report-client.ts:23` uses `console.error` directly (with an `eslint-disable`) rather than the structured logger. Inconsistent with the rest of the observability module. | `lib/observability/report-client.ts:23` | XS |
| SEC-06 | P3 | RLS — single-level recursion via subquery | `competitor_mentions` policies use an `EXISTS` subquery to `consumer_feedback` for visibility inheritance. Safe today (one level, bounded), but a similar pattern caused the historical recursion fixed in `20260424000000_fix_campaign_locations_rls_recursion.sql`. Worth a comment in the migration warning future authors. | `supabase/migrations/20260425010000_phase8_consumer_feedback.sql` (competitor_mentions policies) | XS |

---

## Section A — Page-and-action guard discipline

| Surface | Compliance |
|---|---|
| All admin/supervisor/promoter/client layouts call `requireAdmin()` / `requireRole(...)` | **100%** |
| All server actions re-call the guard at the top of the function (don't trust the layout) | **100%** of ~30 actions audited |
| All `app/api/**/route.ts` handlers re-call the guard | **100%** of 6 handlers |
| Auth helpers redirect on unauth, `notFound()` on wrong role | **Correct** (`lib/auth/guards.ts`) |
| Inactive users (`profiles.active = false`) blocked at both layers | **Yes** — `requireSessionProfile()` checks, plus `is_active()` SQL helper used in RLS |
| `must_change_password` users force-redirected to `/set-password` | **Yes** (`middleware.ts:115-121`); `/set-password`, `/logout`, `/auth/*` are the only paths whitelisted |
| Per-call (not per-module) guard placement | **Yes** — guards live inside each exported function, so direct-POST-to-action attacks can't bypass them |
| Service-role fetches followed by explicit ownership re-check | **Yes** — e.g., `supervisor/attendance/actions.ts:54-59` checks `supervisorCanAccessLocation()` after the admin-client fetch |

This is genuinely strong. No gaps to flag at the guard layer.

---

## Section B — Service role usage (D-044)

`createAdminSupabase()` is called in 47+ places. **One violation, all others justified.**

### B.1 — Violation (SEC-01 above)

**`app/[locale]/admin/imports/actions.ts:140-143`** — `bulkImportAction`:

```ts
const profileUpdate: Record<string, unknown> = {
  must_change_password: true,
  created_by: actor.id,
};
if (parsed.data.phone) profileUpdate.phone = parsed.data.phone;
const { error: updateError } = await admin
  .from('profiles')
  .update(profileUpdate)
  .eq('id', data.user.id);
```

The `created_by` column is on D-044's guarded list. The guard trigger calls `is_admin()` which calls `auth.uid()`; on the service-role connection that's `NULL`, so `is_admin()` returns false, the guard falls through to the column checks, and:

```sql
if new.created_by is distinct from old.created_by then
  raise exception 'profiles: created_by is immutable';
end if;
```

…always raises. The new user IS created (auth row + profile row via `handle_new_user` trigger), but the post-create UPDATE always fails. The error is captured into `failedRows`, so every bulk-imported user shows up in the result set as `"created but profile update failed: profiles: created_by is immutable"`.

The canonical correct pattern is documented at `app/[locale]/admin/users/actions.ts:73-78` with this comment:

> The service-role admin client would silently fail this UPDATE (the guard raises 'profiles: created_by is immutable' when auth.uid() is NULL).

The fix is mechanical: import `createServerSupabase`, swap the admin call for the SSR call. Same shape as the already-shipped fix at commit `1520347`. **Effort: XS. Estimated 5–10 lines + a follow-up commit message reusing the D-044 reasoning.**

### B.2 — Justified service-role usage (sample)

- `supabase.auth.admin.inviteUserByEmail` — service role required by Supabase
- All `app/api/**/route.ts` storage signing — private buckets, no policies, service role required
- `lib/auth/audit.ts` — `audit_log` INSERTs (regular users lack the grant; D-044 documented exception)
- All 10 Edge Functions in `supabase/functions/**` — cron / system context, no auth.uid

### B.3 — Service-role import boundary

- `lib/supabase/admin.ts` line 1 imports `'server-only'`. ✅
- 47 importers audited; all are server actions (`'use server'`), `lib/**` modules with `'server-only'`, or route handlers (intrinsically server). ✅
- **Zero `'use client'` files import from `lib/supabase/admin`.** ✅

No risk of the service-role key reaching the browser bundle.

---

## Section C — RLS coverage

**Every public table has RLS enabled. No `using (true)`. No naked-`authenticated` policies.** Detailed table from the inventory in Phase 1; the deep audit confirms it.

### C.1 — Special cases

| Table | Policy count | Why it's still safe |
|---|---:|---|
| `rate_limits` | 0 | Intentional. All I/O via `check_rate_limit()` SECURITY DEFINER RPC. No authenticated/anon access path. |
| `audit_log` | 2 (SELECT, INSERT) | UPDATE/DELETE blocked at trigger + grant level (`audit_log_deny_modification`). |
| `stock_movements` | 4 (SELECT, INSERT) | UPDATE/DELETE blocked at trigger + grant level (`stock_movements_deny_modification`). Compensating entries via `correction_of`. |
| `notifications` | 2 (SELECT, UPDATE for mark-read) | INSERT happens via service role from Edge Functions; no DELETE policy is correct (notifications are read-only history). |
| `performance_snapshots` | 3 (SELECT only) | Writes are service-role from `compute-kpis` Edge Function. |

### C.2 — Storage buckets

| Bucket | Public? | Policies on `storage.objects` | Access path |
|---|---|---|---|
| `attendance-photos` | private | none | service-role signed URLs only |
| `activity-photos` | private | none | service-role signed URLs only |
| `exports` | private | none | service-role signed URLs only (after job-ownership re-check) |

Pattern is consistent and correct.

### C.3 — Recursion watch (SEC-06)

`competitor_mentions` (Phase 8) policies use a single-level `EXISTS` subquery to `consumer_feedback`. The pattern is safe (the parent table's own RLS policies cap the depth at one level), but a similar pattern caused the historical recursion bug fixed in `20260424000000_fix_campaign_locations_rls_recursion.sql`. Worth adding a comment to the migration warning future authors not to extend this pattern across two levels.

---

## Section D — Input validation

### D.1 — Server actions (~30 actions across admin/supervisor/promoter/client)

**100% use Zod `.safeParse()`** before any DB / Storage / external-service call. All validation schemas live in `lib/validations/**`. No "manual checks only" actions found.

### D.2 — URL params consumed by server components

All searchParams / route params accessed in `app/[locale]/**/page.tsx` go through one of:
- explicit UUID regex (`admin/cities/page.tsx`)
- enum membership check (`admin/stock/audit/page.tsx`)
- typed query helper that does the validation (`supervisor/attendance/page.tsx`)
- string comparison against an in-memory list, not a DB filter (`admin/performance/promoter/[id]/page.tsx`)

**Zero unvalidated user-controlled values flowing into a Supabase `.eq()` / `.in()` / `.gte()` filter.**

### D.3 — File uploads

`app/api/activity-photos/upload/route.ts`:
- 8 MiB body cap (`MAX_IMAGE_BYTES`)
- MIME check + magic-byte JPEG check (`isJpeg()` parses header)
- Storage path generated server-side from `${dailyReportId}/${photoKind}/${uuid()}.jpg` — user cannot supply path
- `dailyReportId` validated as UUID; `photoKind` validated against `PHOTO_KINDS` enum
- Ownership re-check: promoter must own the daily_report; status restricted to `draft`/`submitted`
- EXIF stripped before storage; only `exif_minimal` retained

This route is exemplary.

---

## Section E — `.or()` filter injection (SEC-02)

**`app/api/attendance/photo-url/route.ts:34`:**

```ts
const path = typeof body?.path === 'string' ? body.path : null;
// ...
const { data: row } = await admin
  .from('attendance')
  .select('id, user_id, location_id')
  .or(`check_in_photo_path.eq.${path},check_out_photo_path.eq.${path}`)
  .maybeSingle();
```

PostgREST `.or()` parses commas as logical separators. A `path` value of `evil.jpg,id.eq.<attacker-own-row-uuid>` produces the filter:
```
check_in_photo_path.eq.evil.jpg,id.eq.<attacker-row>,check_out_photo_path.eq.evil.jpg,id.eq.<attacker-row>
```
which evaluates to `OR (check_in_photo_path = 'evil.jpg', id = '<attacker-row>', check_out_photo_path = 'evil.jpg', id = '<attacker-row>')`.

The query returns the attacker's own row. The downstream check at lines 40-48 validates `row.user_id` / `row.location_id` against the actor — **passes** (it's the attacker's own row). Then `signAttendancePhotoUrl(path, 300)` is called with the original `path` string (the attacker-supplied value) — and the URL is signed for whatever path was in there.

If the attacker can name a real Storage path that isn't theirs (the part before the comma), the route happily signs a URL for it. **Auth check evaluates the row but the signing uses the request payload — the two are decoupled.**

### Why the immediate exploit risk is limited

- Storage paths in this codebase are `attendance/<YYYY-MM-DD>/<uuid>.jpg`. UUIDs are unguessable.
- The only way to learn another row's `check_in_photo_path` is to be authorized to read that attendance row — and if the attacker can already read the row, they can already pass the auth check normally.
- Promoters can't read other promoters' attendance rows under RLS, so they can't discover paths to target.
- Supervisors and admins already have access to the photos they can discover paths for, so the bypass doesn't widen their reach.

**Net**: the injection is real but the exploit chain requires the attacker to already have a path they wouldn't otherwise be able to sign — which RLS appears to prevent. P2, not P1.

### Fix (XS)

Either:

1. **Validate the path format** before using it in the filter:
   ```ts
   if (!/^[a-zA-Z0-9_./-]+$/.test(path)) {
     return NextResponse.json({ error: 'invalid_path' }, { status: 400 });
   }
   ```
   The character class explicitly excludes the `,`, `(`, `)`, and `:` that PostgREST uses as filter syntax.

2. **Or** restructure the query to avoid `.or(...)` interpolation — fetch by `check_in_photo_path` and `check_out_photo_path` as two separate `.eq()` calls and union the results.

Option 1 is one line and matches the file's existing style.

---

## Section F — Secrets and PII

| Check | Result |
|---|---|
| Hardcoded JWT (`eyJ` prefix) anywhere | none |
| Hardcoded Stripe / API keys (`sk_live`, `Bearer xxx`) | none |
| `SUPABASE_SERVICE_ROLE_KEY` referenced outside `lib/supabase/env.ts` (server-only) | none |
| `NEXT_PUBLIC_*` accidentally containing secrets | none |
| `.env.example` exists and documents `SUPABASE_SERVICE_ROLE_KEY` without leaking | ✅ |
| Logger `REDACT_KEYS` includes `service_role_key` | ✅ (`lib/observability/logger.ts:42`) |
| `console.log`/`console.error` of user objects, tokens, profile rows | none in `app/**` or `components/**`; only in `lib/observability/{logger,report-client}.ts` (intentional, eslint-disabled) |
| 4 ESLint warnings about *unused* `eslint-disable` directives in `lib/observability/*` | known; trivial cleanup |

PII discipline is genuinely strong.

### Note on `report-client.ts` (SEC-05)

`lib/observability/report-client.ts:23` uses `console.error('[client-error]', payload)` directly. The payload could include error stacks containing user data (URLs, query strings, form fields). Two concerns:

1. **Inconsistent with the rest of `lib/observability/`** — every other path goes through the structured logger.
2. **Browser console output is visible to end users**, including any PII the error handler decides to capture.

Reasonable today (it's bounded to the client-side error reporter) but worth a comment documenting the PII expectations.

---

## Section G — XSS / injection

| Vector | Result |
|---|---|
| `dangerouslySetInnerHTML` | **None found anywhere.** Zero occurrences. |
| `supabase.rpc(name, params)` calls | 4 RPCs (`check_rate_limit`, `reallocate_stock`, `correct_stock_movement`, plus the helper-functions on RLS tables). All defined with `SECURITY DEFINER set search_path = public, pg_catalog`. All consumer code passes UUIDs validated by Zod. ✅ |
| String-concatenated SQL | None found. |
| User-supplied URLs in `<a href={...}>` / `<img src={...}>` | All discovered hrefs are server-derived (UUIDs from queries, enum constants). No `<a href={user.website}>` patterns. |
| User-supplied content rendered as HTML attributes | None found. |
| CSRF on server actions | Next.js action-id token mechanism enabled by default. No custom POST handlers that mutate without auth. |

---

## Section H — Middleware & CSP

`middleware.ts` audit (full read):

### Strong:
- ✅ Session refresh via `attachSupabaseSession()` on every request
- ✅ Protected paths regex includes locale prefix: `/^\/(?:ar|en)\/(?:admin|supervisor|promoter|client)(?:\/|$)/`
- ✅ Temp-password whitelist: only `/set-password`, `/logout`, `/auth/*` reachable while `must_change_password=true`
- ✅ HSTS `max-age=63072000; includeSubDomains; preload` (prod)
- ✅ X-Frame-Options DENY, X-Content-Type-Options nosniff
- ✅ Permissions-Policy locks down camera/geolocation/microphone to `(self)` or off
- ✅ Cross-Origin-Opener-Policy + Cross-Origin-Resource-Policy = same-origin
- ✅ `frame-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, `object-src 'none'`

### CSP unsafe-inline (SEC-04 above)

`script-src 'self' 'unsafe-inline'` (+ `'unsafe-eval'` in dev). The inline comment acknowledges this is a Next.js 15 streaming requirement; per-request nonces would be the modern alternative but require wiring via `<Script nonce>` everywhere. Cosmetic for now — the rest of CSP is tight enough that XSS would still need to either get inline JS into the page (no `dangerouslySetInnerHTML` exists, so high bar) or exfiltrate through `connect-src` (locked to self + supabase).

---

## Section I — Error message i18n (carryover from Phase 2)

Spot-checked 3 admin form clients (campaigns, locations, users). Server actions return raw English string codes (`'duplicate'`, `'frozen'`, `'unknown'`). Consumer components do the i18n lookup via `messages/*.json` keys (e.g. `Auth.errors.invalid_credentials`) — the codes returned by actions are designed as keys, and the UI consistently passes them through `t(...)` with a fallback to a generic error message.

So the Phase 2 TS-04 finding is **not** as severe as feared. There IS a translation layer; it's just convention-driven rather than typesafe. A typed `<ActionError code={code} />` component would harden it but isn't urgent.

---

## Overall verdict

Security perimeter: **A−**. The fundamentals are exemplary — RLS coverage, role-guard discipline, secret hygiene, CSP, file uploads, RPC parameterization, lack of `dangerouslySetInnerHTML`, role exhaustiveness. There are no critical exposure paths and nothing that warranted an URGENT prefix.

The one P1 (SEC-01, the `bulkImportAction` D-044 violation) is a known anti-pattern that was missed in one place. It's a 5-line fix that mirrors the already-shipped `inviteUserAction` correction. After that fix, the only remaining material finding is SEC-02 (the `.or()` injection), which is a real bug but not exploitable without first defeating RLS.

Recommended sequencing for triage:
1. **SEC-01** first (production bug; 10-minute fix; high value).
2. **SEC-02** next (real injection; 1-line fix; defense-in-depth).
3. **SEC-03** as a follow-on (add `logError(...)` to all `if (error) return { error: 'unknown' }` branches; pairs with TS-02 from Phase 2; can be a single sweep PR).
4. SEC-04 / SEC-05 / SEC-06 are cosmetic and can wait.

---

## End of Phase 3.
