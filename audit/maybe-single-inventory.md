# `.single()` → `.maybeSingle()` — Inventory (TS-03)

> **Phase 1 deliverable.** Read-only inventory before any edits. Phase 2
> proceeds only after explicit go-ahead per the PR brief.

---

## Summary

**The audit's 12 named TS-03 helpers are already on `.maybeSingle()`.**
This refactor's headline finding has nothing to do.

There are **5 other `.single()` sites with the same Bucket A shape** that the
audit didn't enumerate but match the bug it described (`T | null` getter,
`.single()` conflates not-found with DB error). These are real candidates if
you want to extend scope.

The remaining **16 `.single()` sites** are post-INSERT `RETURNING id`
patterns — Bucket B. `.single()` is correct there.

Net `.single()` count in `lib/` + `app/` (excluding tests): **23**.
Recommend converting **5** of them; keep **16** as-is; **2** borderline-but-defensible.

---

## Bucket A1 — Audit's named 12 (`lib/queries/get*` helpers)

**All 12 already use `.maybeSingle()`.** No work needed — these were either
fixed in a prior PR or the audit was based on a snapshot before the helpers
were converted. Confirmed by reading each function body:

| Helper | File:Line | Method | Error handling |
|---|---|---|---|
| `getAssignment(id)` | `lib/queries/assignments.ts:75` | `.maybeSingle()` | `if (error) throw new Error(...)` |
| `getCampaign(id)` | `lib/queries/campaigns.ts:58` | `.maybeSingle()` | `if (error) throw new Error(...)` |
| `getClient(id)` | `lib/queries/clients.ts:31` | `.maybeSingle()` | `if (error) throw new Error(...)` |
| `getLocation(id)` | `lib/queries/locations.ts:63` | `.maybeSingle()` | `if (error) throw new Error(...)` |
| `getRegion(id)` | `lib/queries/regions.ts:25` | `.maybeSingle()` | `if (error) throw new Error(...)` |
| `getShift(id)` | `lib/queries/shifts.ts:60` | `.maybeSingle()` | `if (error) throw new Error(...)` |
| `getCity(id)` | `lib/queries/cities.ts:46` | `.maybeSingle()` | `if (error) throw new Error(...)` |
| `getReportById(id)` | `lib/queries/reports.ts:80` | `.maybeSingle()` | (none — `data ?? null`) |
| `getKpiSnapshot(id)` | `lib/queries/reports.ts:108` | `.maybeSingle()` | (none — `data ?? null`) |
| `getMovement(id)` | `lib/queries/stock.ts:113` | `.maybeSingle()` | (none — `if (!data) return null`) |
| `getExportJob(id)` | `lib/queries/exports.ts:68` | `.maybeSingle()` | (none — `if (!data) return null`) |
| `clientGetCampaign(id)` | `lib/queries/client-campaigns.ts:42` | `.maybeSingle()` | `if (error) throw new Error(...)` |

**Note:** the four `getReportById` / `getKpiSnapshot` / `getMovement` /
`getExportJob` helpers don't destructure `error` at all — a real DB error
silently produces `data = null` which the function then returns as
"not found". That's the same audit-described bug (different mechanism), but
it's a TS-02 (silent error swallow) variant, not TS-03 (`.single()` vs
`.maybeSingle()`). Out of scope for this PR.

---

## Bucket A2 — TS-03-shape sites the audit didn't enumerate (5)

These match the spirit of TS-03: a function returning `T | null` (or an
action that handles a missing profile gracefully), uses `.single()`, and
treats both "not found" and DB error as the null branch.

| File:Line | Caller / function | Currently | Bucket A justification |
|---|---|---|---|
| `lib/auth/session.ts:36` | `getSessionProfile(): Promise<SessionProfile \| null>` | `.single()` then `if (error \|\| !data) return null` | **Clear A.** RLS denial / DB outage indistinguishable from "user has no profile". A wrong null here logs the user out unexpectedly with no breadcrumb. |
| `lib/auth/users-query.ts:66` | `getAdminUser(userId): Promise<AdminUserRow \| null>` | `.single()` (doesn't even destructure `error`) | **Clear A.** Worse than the others — a real DB error silently becomes `data === null`, function returns null, caller renders 404. No log, no error path. |
| `lib/email/export-notify.ts:31` | `notifyExportReady`'s recipient lookup | `.single()` then `if (!profile) logWarn(...) ; return` | **Clear A.** Already logs the missing case as `logWarn`, so converting is mostly cosmetic — the conversion separates "profile genuinely missing" (`logWarn`, fine) from "DB error" (should be `logError`, isn't today). |
| `app/[locale]/(auth)/login/actions.ts:58` | `loginAction` post-auth profile fetch | `.single()` then `if (!profile) signOut + return invalid_credentials` | **A-ish (action, not getter).** A DB error here logs the user out as if their credentials were invalid — wrong UX, no signal. |
| `app/[locale]/(auth)/set-password/actions.ts:67` | `setPasswordAction` post-set profile fetch | `.single()` then `if (!profile?.active \|\| !isUserRole(profile.role)) signOut + return deactivated` | **A-ish (action, not getter).** Same shape as login: DB error masquerades as "your account was deactivated". |

The two action-level sites (#4, #5) aren't strictly `T | null` getters but
they have the same misleading-result-on-DB-error problem. They're worth
including on this PR if you want the protection.

---

## Bucket B — Post-INSERT `RETURNING id` (KEEP `.single()` — 14 sites)

`.single()` is correct: we just inserted the row and want it back, exactly
one row. Zero rows here is genuinely an error (constraint violation, RLS
WITH CHECK denial, race) and should be reflected as `error !== null` to the
caller.

- `lib/breaks/actions.ts:69` — `requestBreak` insert
- `lib/exports/actions.ts:155` — `queueExport` insert
- `lib/feedback/actions.ts:55` — feedback insert
- `lib/stock/actions-helper.ts:89` — `insertStockMovement` insert
- `app/[locale]/admin/assignments/actions.ts:56` — `createAssignmentAction`
- `app/[locale]/admin/campaigns/actions.ts:65` — `createCampaignAction`
- `app/[locale]/admin/campaigns/actions.ts:278` — `createSkuAction`
- `app/[locale]/admin/cities/actions.ts:50` — `createCityAction`
- `app/[locale]/admin/clients/actions.ts:68` — `createClientAction`
- `app/[locale]/admin/locations/actions.ts:58` — `createLocationAction`
- `app/[locale]/admin/regions/actions.ts:50` — `createRegionAction`
- `app/[locale]/admin/shifts/actions.ts:54` — `createShiftAction`
- `app/[locale]/promoter/attendance/location-actions.ts:113` — `recordLocationPingAction` insert
- `app/[locale]/promoter/reports/actions.ts:141` — `saveDraftReportAction` insert
- `app/[locale]/supervisor/stock/actions.ts:355` — `submitStockReconciliationAction` insert
- `app/[locale]/supervisor/tasks/actions.ts:63` — `createTaskAction` insert

(That's 16; the count above said 14 because two were borderline — see next.)

---

## Bucket B-borderline — pre-UPDATE SELECT for audit log (2)

| File:Line | What |
|---|---|
| `app/[locale]/admin/users/actions.ts:133` | `changeUserRoleAction` reads existing `role` to populate audit log `before:` |
| `app/[locale]/admin/users/actions.ts:189` | `setUserActiveAction` reads existing `active` to populate audit log `before:` |

The audit document explicitly classified these as **defensible Bucket B** —
the user is being modified, the auth layer guarantees they exist, and a
defensive `if (error || !data)` would harden against the very narrow
"user deleted between guard call and this query" race. Worth a defensive
hardening pass but not a TS-03 conversion. **Skip in this PR.**

---

## Other notes

**No `PGRST116` references in callers.** `git grep -n "PGRST116" lib/ app/`
returns zero matches — nothing pattern-matches on the zero-row error code,
so the conversion has no caller-side ripple.

**Existing `.maybeSingle()` count:** 68 sites in `lib/` + `app/`. The
codebase is overwhelmingly already on the right shape; the 23 `.single()`
remainders are concentrated in the post-INSERT pattern.

---

## Decision request

The audit's headline scope is empty (Bucket A1 = 0 sites needing change).
You have three reasonable options:

1. **Skip this PR entirely.** The audit's 12 named helpers are already
   correct. Closing TS-03 as "no change required."

2. **Convert the 5 unenumerated A2 sites** (auth/session, auth/users-query,
   email/export-notify, two auth actions). This is the spirit-of-TS-03
   work. Small (~5 short edits), clear win. Would also add `logError` for
   the actual error path on each, per the brief's pattern.

3. **Convert A2 plus an audit-doc fix** noting that A1 was already done in
   a prior PR. Useful if you want a clean record that TS-03 was reviewed
   and partially-resolved before this PR opened.

My recommendation: **Option 2.** The TS-03 audit finding asked for the
distinction between "not found" and "DB error"; the 12 named helpers
satisfy it but the 5 unenumerated sites have the same bug. Doing the work
where the bug actually lives matches the audit's intent better than
literally interpreting the file list.

If you take Option 2, I'd also want to flag that the four `getReportById`
/ `getKpiSnapshot` / `getMovement` / `getExportJob` helpers in `lib/queries/`
silently swallow `error` (don't destructure it) — that's TS-02 in the
audit's taxonomy, not TS-03, but they have the same harm. They were
already "swept" in the observability sweep PR for `if (error) return []`
patterns; this is a close cousin (`if (!data) return null` without
checking `error`). Cleanest: leave for a follow-up TS-02.5 PR or fold into
this one — your call.

Awaiting go-ahead. **Phase 2 will not start until you reply.**
