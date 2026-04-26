# Phase 2 — Type Safety & Null Handling

> Audited: TypeScript escape hatches, Supabase result handling, error propagation.
> Scope: `app/**`, `components/**`, `lib/**`. Excludes `supabase/migrations`, `supabase/functions/_shared`, `messages/`, generated.

---

## Headline

Type discipline is **good overall, with one recurring smell**. The codebase makes minimal use of `any` (1 occurrence), few non-null assertions in production code (3 sloppy of 20 total), and zero silent `catch` blocks. Server actions universally validate input with Zod and call role guards. The recurring weakness is **`as unknown as RawX[]` double-casts on Supabase responses** — this pattern appears in ~12 sites across Phase 4 query/assemble code, my own `/admin/dashboard/page.tsx` (4 instances), and `lib/exports/assemble.ts` (8 instances).

No P0 or P1 findings. Eight P2/P3 findings below.

---

## Findings table

Sorted by severity. IDs are stable for the executive summary.

| ID | Sev | Area | Summary | Files | Effort |
|---|---|---|---|---|---|
| TS-01 | P2 | Type assertions | `as unknown as RawX[]` double-casts on Supabase responses (~12 sites) hide type information at data boundary | `app/[locale]/admin/dashboard/page.tsx`, `lib/exports/assemble.ts`, `lib/queries/{attendance,breaks}.ts`, `app/[locale]/supervisor/{stock/actions,reports/[id]}.ts` | M |
| TS-02 | P2 | Error observability | 17 `if (error) return []` patterns in `lib/queries/**` swallow DB errors without logging — UI shows "no data" indistinguishable from real emptiness | `lib/queries/{attendance,alerts,breaks,notifications,supervisor-visits,supervisor-scope}.ts` | S |
| TS-03 | P2 | API contract | `getX(id) → T \| null` helpers can't distinguish "not found" from "DB error" — at least 12 helpers in `lib/queries/`, callers (admin edit pages) can't surface real failures | `lib/queries/{assignments,campaigns,clients,locations,regions,shifts,reports,stock,exports,client-campaigns,cities}.ts` | M |
| TS-04 | P2 | i18n / UX | Server actions return raw English error codes (`'unknown'`, `'duplicate'`, `'frozen'`); client side never appears to map them through `messages/*.json` | All `app/**/actions.ts` (~30 files) | M |
| TS-05 | P3 | Type assertions | `app/[locale]/supervisor/stock/actions.ts:311–312` — `skuId!` / `promoterId!` after `string.split('::')` without guarding split-result length | `app/[locale]/supervisor/stock/actions.ts` | XS |
| TS-06 | P3 | Type assertions | `components/features/supervisor/reconcile-button.tsx:40` — `res.status!` on optional field; should refine return type | `components/features/supervisor/reconcile-button.tsx` | XS |
| TS-07 | P3 | Type assertions | `lib/observability/logger.ts:63` — `as unknown as Record<string, unknown>` for an `Error` object; `Object.fromEntries(Object.entries(err))` or explicit shape would type properly | `lib/observability/logger.ts` | XS |
| TS-08 | P3 | Control-flow surprise | `loginAction` (`(auth)/login/actions.ts:13`) returns `{ error: '...' }` on failure but `redirect()`s on success → implicit `undefined` return on the success branch, easy to misread; minor | `app/[locale]/(auth)/login/actions.ts` | XS |
| TS-09 | P3 | Audit signal | RLS denials in actions surface to the client as a flat `'unknown'` error with no audit-log entry — security-relevant access attempts aren't recorded for review | All admin/supervisor `actions.ts` `if (error) return { error: 'unknown' }` paths | M (cross-cutting) |

Eight findings; **none** at P0 or P1.

---

## Section A — `any` casts

**1 hit total.**

| File:Line | Code | Verdict |
|---|---|---|
| `lib/supabase/realtime.ts:62` | `(channel as any).on(...)` | **defensible** — supabase-js `.on()` overload doesn't admit dynamic event filters; documented on adjacent comment |

This is excellent. A codebase of ~46k LOC with one `any` indicates strong type discipline at the day-to-day level.

---

## Section B — Type assertions crossing a boundary

**72 hits total. 11 sloppy, 61 defensible.**

### Sloppy double-casts (`as unknown as T[]`) — the dominant smell

These cluster around Supabase response handling. The pattern is:

```ts
const { data } = await supabase.from('attendance').select('id, user:profiles!user_id(full_name), …');
const rows = (data as unknown as Raw[] | null) ?? [];
```

The author knows the response shape (it's defined inline as `Raw`), but supabase-js's inferred type for embed selects is `unknown` or `any`, so to project onto the local `Raw` type they widen via `unknown` first.

| File:Line | Where |
|---|---|
| `app/[locale]/admin/dashboard/page.tsx:221` | map points (my Phase 4 work) |
| `app/[locale]/admin/dashboard/page.tsx:252` | feed-attendance (my Phase 4 work) |
| `app/[locale]/admin/dashboard/page.tsx:261` | feed-visits (my Phase 4 work) |
| `app/[locale]/admin/dashboard/page.tsx:270` | feed-reports (my Phase 4 work) |
| `lib/exports/assemble.ts:92,156,204,253,312,416,470` | 8 export builders |
| `lib/queries/attendance.ts:125,265` | live-joined + recent-by-user |
| `lib/queries/breaks.ts:73` | break inbox |
| `app/[locale]/supervisor/stock/actions.ts:264,342` | stock action helpers |
| `app/[locale]/supervisor/reports/[id]/page.tsx:84` | report detail |
| `lib/observability/logger.ts:63` | error redaction |

**Recommended fix (cross-cutting, M effort):** generate Supabase types via the Supabase CLI (`supabase gen types typescript`) and pass the typed `Database` generic to `createServerClient<Database>()`. The CLI emits inferred types for `.select(...)` strings, eliminating the `unknown` bridge. Already-installed `@supabase/supabase-js` supports this via the existing factory at `lib/supabase/server.ts`. Per-call effort drops to ~zero.

Alternative (S effort, narrower): replace each `as unknown as Raw[]` with an inline helper `castRows<T>(data: unknown): T[]` that documents the discipline at the call site without requiring schema regen. Cosmetic, not structural.

### Defensible patterns (61 of 72)

These show up as clean, justified narrowings:

- **`(data ?? []) as RowType[]`** after a nullish-coalesce in `lib/queries/**` — fine.
- **`as Record<string, unknown>`** after a `typeof === 'object'` check in `lib/{kpis,alerts,attendance,performance}/` — fine.
- **`as Parameters<typeof t>[0]`** for next-intl key narrowing (~9 sites) — necessary because next-intl's strict-key types don't accept `${prefix}_${dynamic}`.
- **Test fixtures + spy mocks** in `lib/**/*.test.ts` — fine.

---

## Section C — `!` non-null assertions

**20 hits total. 3 sloppy, 17 defensible.**

### Sloppy

| File:Line | Code | Why it's sloppy |
|---|---|---|
| `app/[locale]/supervisor/stock/actions.ts:311` | `skuId!` | After `key.split('::')`; if input is malformed the split returns `['x']` and `[1]` is `undefined`. Result: silent NaN/`undefined` propagation into ledger inserts. |
| `app/[locale]/supervisor/stock/actions.ts:312` | `promoterId!` | Same pattern. |
| `components/features/supervisor/reconcile-button.tsx:40` | `res.status!` | `res.status` is typed as optional; should refine the return type or use `res.status ?? 'unknown'`. |

**Fix:** explicit destructuring with default + Zod validation on the parsed key shape. ~10 lines per call site.

### Defensible (17 of 20)

All in test files (`lib/alerts/spec-cases.test.ts`, `lib/alerts/detect.test.ts`) following an `expect(flag).not.toBeNull()` assertion — Vitest's narrowing isn't deep enough, so `flag!.field` is the idiomatic workaround. Acceptable.

A handful in promoter/attendance flows (`attendance-client.tsx:257`, `today-client.tsx:355`) are post-guard accesses where the bang is provably safe.

---

## Section D — `@ts-ignore` / `@ts-expect-error` / `eslint-disable`

**12 hits total, all defensible.**

| Category | Count | Notes |
|---|---|---|
| `@next/next/no-img-element` | 6 | Dynamic-src `<img>` for signed Storage URLs that Next's `<Image>` can't handle. Necessary. |
| `no-console` | 4 | All in `lib/observability/{logger,report-client}.ts` — the one place where direct `console.*` is intentional (the logger). |
| `@typescript-eslint/no-explicit-any` | 1 | Paired with the realtime cast above; documented inline. |
| `react-hooks/exhaustive-deps` | 1 | `lib/supabase/realtime.ts:109`; `handlerRef` captures handler intentionally to avoid resubscribe. |

**Zero `@ts-ignore` or `@ts-expect-error`.** That's clean.

Note: ESLint reports 4 *unused* `eslint-disable` comments in `lib/observability/{logger,report-client}.ts` (the same ones as Phase 1's lint warning). Removing the now-unnecessary disables would clear the project's only outstanding lint warnings.

---

## Section E — Supabase `.single()` discipline

**23 call sites. 21 OK, 2 borderline.**

Idiomatic guard in this codebase:
```ts
const { data, error } = await supabase.from('x').select('id').single();
if (error || !data) return { error: 'unknown' };
```

Found uniformly across `lib/auth/*`, all admin/supervisor/promoter `actions.ts`, and `lib/exports/actions.ts`.

### Borderline

| File:Line | Why |
|---|---|
| `app/[locale]/admin/users/actions.ts:140,192` | `.single()` then immediate `.eq('id', user.id)` filter — relies on auth layer to guarantee the row exists; defensible but a defensive `if (error \|\| !data)` would harden against the case where the user was deleted between the guard call and this query. |

Note for future authors: if you're not sure whether the row exists, prefer `.maybeSingle()` over `.single()`. `.single()` raises `PGRST116` when zero rows match, which the consuming code must specifically catch — easy to miss.

---

## Section F — Supabase `.maybeSingle()` discipline

**31 call sites. 31 OK.** No findings.

Patterns observed:
- Idempotency lookups: `if (existing) return existing.id;` — null is the happy path, no guard needed.
- Lookups by id: `if (!row) return { error: 'not_found' };` — null is treated as a domain not-found, distinct from DB error (which `error` would carry).

This part of the codebase is exemplary.

---

## Section G — FK embeds with nullable joins

**Spot-checked 13 high-traffic embed call sites.** All correctly use `?.` chaining where the underlying FK is nullable (e.g., `break_requests.promoter_id`, `break_requests.location_id`).

For non-nullable FKs (most join targets in this schema, since the migrations mostly mark FKs as `not null`), direct access without `?.` is correct.

The one place I'd want to spot-check more carefully is the new dashboard query at `app/[locale]/admin/dashboard/page.tsx:139–166` — the FK is `not null` per the `attendance` schema, so direct `r.user.full_name` would work, but I added `r.user?.full_name ?? unknownPromoter` as a defensive fallback. That's fine, just slightly belt-and-braces.

---

## Section H — Promise rejection handling

**13 try/catch blocks audited. 0 silent swallows. 1 smell.**

Discipline is strong. Common shapes:
- `catch (err) { reportError(err, ...); return null; }` — logged + graceful fallback.
- `catch (err) { logError('foo', { err }); return; }` — explicit fire-and-forget for non-blocking ops (email, location-trust cache).
- `catch (err) { setFormError(messageForError(err)); }` — surface to user.

### Smell (TS-09 above)

| File:Line | Behavior |
|---|---|
| `lib/email/send.ts:84` | Catches, logs via `logError`, returns void. Caller assumes the email was sent; failures are invisible to the call chain. Acceptable for the auth flow's "we sent you an email" pattern (where you don't want to leak whether a user exists), but a comment documenting the contract would help. |

---

## Section I — Functions silently returning `[]` on error

**17 call sites, all in `lib/queries/`.** All return `[]` when `error` is set:

```ts
if (error) return [];
return (data ?? []) as RowType[];
```

The argument *for* the pattern: in a list-rendering context, returning `[]` lets the page render an empty state rather than crash. The author's intent is graceful degradation.

The argument *against* (TS-02 above): the page renders an empty state for both "no data" and "RLS denied / DB down". An admin investigating "where are all my campaigns?" sees the same empty state whether the query crashed or there genuinely are no campaigns. There's no audit-log entry, no Sentry/observability signal — the failure is invisible.

**Fix (S effort):** add a `logError(...)` call before the silent return in every `lib/queries/**` helper that uses this pattern. The runtime behavior stays the same (empty array returned), but the failure is now visible in the logger output. Example pattern:

```ts
if (error) {
  logError('attendance.list_failed', { code: error.code, message: error.message });
  return [];
}
```

**Or go further:** move all `lib/queries/**` helpers to a `Result<T[], QueryError>` shape that callers can pattern-match. That's an XL effort and probably more friction than it's worth at this stage.

---

## Section J — Functions returning `T | null` for "not found"

**12 helpers in `lib/queries/`** (`getAssignment`, `getCampaign`, `getClient`, `getLocation`, `getRegion`, `getShift`, `getCity`, `getReportById`, `getKpiSnapshot`, `getMovement`, `getExportJob`, `clientGetCampaign`).

All have the shape:
```ts
const { data, error } = await supabase.from('x').select(...).eq('id', id).single();
if (error || !data) return null;
return data as Row;
```

The caller (typically an admin edit page) does:
```ts
const row = await getCampaign(id);
if (!row) notFound();
```

Issue: `notFound()` fires for both "the row doesn't exist" and "RLS denied / DB error" cases, which is misleading at best. The `error.code === 'PGRST116'` (zero-row) case is the only one that's truly "not found"; everything else is a real failure that deserves logging and possibly a 500.

**Fix (TS-03 above, M effort):** distinguish the two cases:

```ts
const { data, error } = await supabase.from('campaigns').select(...).eq('id', id).maybeSingle();
if (error) {
  logError('campaigns.get_failed', { id, code: error.code });
  throw error;  // surface to error boundary
}
return data as Row | null;  // null = genuinely not found
```

Switching from `.single()` to `.maybeSingle()` is the key — `.single()` returns an error for zero rows, which conflates the two cases. With `.maybeSingle()`, `data === null` cleanly means "not found" and `error !== null` means "real failure".

---

## Section K — Server actions: validation, guards, error surface

**~30 server actions audited across admin/supervisor/promoter.**

| Discipline | Compliance |
|---|---|
| Calls a guard (`requireAdmin()` / `requireRole(...)` / `getSessionProfile()`) before any DB work | **100%** |
| Validates input with Zod `safeParse()` before any DB work | **100%** |
| Returns a typed Result (`{ error: string \| null }` or discriminated union) | **~95%** (login + reset-request are the documented exceptions) |
| Calls `logAuditEvent()` after successful privileged action | **High** (admin actions) |
| Logs errors before returning `{ error: 'unknown' }` | **Low** — most actions return `'unknown'` without a log entry (TS-09) |

The 100% on the first two rows is genuinely excellent for a codebase this size. The audit-log discipline is also strong on the admin side.

The gap (TS-09): when the DB call fails (RLS denial, FK violation, timeout), the action falls into `if (error || !inserted) return { error: 'unknown' }`. The user sees "Something went wrong" and the developer sees nothing. Adding a `logError(...)` in those branches would make the codebase much more debuggable in production.

---

## Section L — Error message i18n (TS-04)

Server actions return raw English strings as error codes:

```ts
return { error: 'duplicate' };
return { error: 'frozen' };
return { error: 'forbidden' };
return { error: 'not_found' };
return { error: 'unknown' };
```

These look like keys (snake_case English nouns), and the client *should* be mapping them via `messages/*.json` to localized text. I spot-checked a few consumer components; they appear to render the raw string. Need to confirm in Phase 5 (i18n audit) whether there's a hidden lookup layer or whether Arabic users see "duplicate" / "frozen" verbatim.

If the latter, the fix is one of:
1. Per action: `return { error: t('error.duplicate') }` — inconsistent with the rest of the action layer and pulls i18n into actions.
2. Per consumer: build a `<ActionError code={error} fallbackKey="error.unknown" />` component that does the i18n lookup. Cleanest. Single place to add new error keys.
3. Replace string codes with structured `{ code: 'duplicate', params?: { name: 'Almarai 2026' } }` and let the client format. Most powerful but a refactor.

---

## Overall verdict

Type discipline: **B+**. The fundamentals are right (no `any` proliferation, no silent catches, every server action validates and guards). The recurring smell — `as unknown as RawX[]` — is fixable with one infrastructure change (`supabase gen types` + typed factory) that would eliminate ~12 sites in one PR.

The two structural findings — error observability (TS-02, TS-09) and `T | null` ambiguity (TS-03) — would close a real production-debugging gap. They're not bugs today; they're things you'd be glad you fixed when something does break in prod and you want to know why.

The error-message-i18n question (TS-04) needs a Phase 5 confirmation before recommending a fix.

---

## End of Phase 2.
