# Observability Sweep — Inventory (SEC-03 + TS-02)

> **Phase 1 deliverable.** Read-only inventory built before any edits. Phase 2
> proceeds only after explicit go-ahead per the PR brief.

---

## 1.3 — Logger signature (read first; everything below assumes it)

`lib/observability/logger.ts` exports **flat functions**, not a `logger.error`
namespace. The PR brief used `logger.error(...)` as pseudocode — actual calls
must use the named exports.

| Export | Signature | Use |
|---|---|---|
| `logDebug(message, context?)` | `(string, LogContext?) => void` | Debug; suppressed unless `LOG_LEVEL=debug` |
| `logInfo(message, context?)` | `(string, LogContext?) => void` | Info |
| `logWarn(message, context?)` | `(string, LogContext?) => void` | Warning |
| `logError(message, context?)` | `(string, LogContext?) => void` | **Use for this sweep** |
| `reportError(error, context?)` | `(unknown, LogContext?) => void` | Wraps an `Error`/unknown, serializes it, forwards to Sentry if `SENTRY_DSN` is set + `globalThis.Sentry` is mounted. Use when handling a thrown exception, not when handling a Supabase `error` object. |

`LogContext = Record<string, unknown>`. Auto-redacts these keys before
emitting: `password`, `new_password`, `current_password`, `token`,
`access_token`, `refresh_token`, `api_key`, `apikey`, `authorization`,
`cookie`, `secret`, `service_role_key`. Recursive (depth-6 cap).

Output: one JSON line per log to stdout/stderr (`console.error` for
`error`/`warn`, `console.log` otherwise). Captured by Vercel + Supabase
Edge Runtime. Sentry forwarding only if `SENTRY_DSN` is set AND a Sentry
SDK has self-mounted on `globalThis.Sentry` (no hard dep).

### Conventions for this sweep

- **Use `logError`** (the noun-verb name) for both TS-02 and SEC-03 sites.
- **Message:** `'<callerName> failed'` (matches the existing one site shipped
  in the dashboard PR: `'listLiveAttendanceJoined failed'`).
- **Context:** include `code` and `message` from the Supabase error object,
  plus call-site identifiers (`actor_id`, `user_id`, `campaign_id`, etc.).
  Do **not** spread the whole Postgrest error — `details`/`hint` can leak
  table names and value fragments. Pluck `code` + `message` only.
- **Do not log** raw photo paths, JWT tokens, or anything not already in the
  request boundary (the redactor handles the obvious keys but it's defense in
  depth, not the contract).

---

## 1.1 — TS-02 sites in `lib/queries/**`

**19 silent fallbacks** across 9 files. The 20th site
(`attendance.ts:123-128`, `listLiveAttendanceJoined`) was already migrated
to `logError` in the dashboard PR — it is the proof-of-pattern.

The other ~12 query files (`assignments`, `campaigns`, `cities`, `clients`,
`client-campaigns`, `exports`, `feedback`, `locations`, `performance`,
`regions`, `shifts`, `stock`, `tasks`, `reports`) all `throw new Error(...)`
on DB errors instead of silently returning a fallback — they propagate
loudly and are **out of scope** for this sweep.

| File:Line | Function | Returns on error | Currently logged? |
|---|---|---|---|
| `lib/queries/attendance.ts:58` | `listMyAttendanceToday` | `[]` | no |
| `lib/queries/attendance.ts:83` | `listLiveAttendance` | `[]` | no |
| `lib/queries/attendance.ts:160` | `listAttendanceForUser` | `[]` | no |
| `lib/queries/attendance.ts:193` | `signAttendancePhotoUrl` | `null` | no — storage signed URL; failure means no signed URL handed back to the route handler |
| `lib/queries/breaks.ts:46` | `listMyBreakRequests` | `[]` | no |
| `lib/queries/breaks.ts:67` | `listBreakRequestsForSupervisor` | `[]` | no |
| `lib/queries/alerts.ts:68` | `listAlerts` | `[]` | no |
| `lib/queries/alerts.ts:85` | `listAlertsByAttendance` | `[]` | no |
| `lib/queries/alerts.ts:107` | `listOpenAlerts` | `[]` | no |
| `lib/queries/notifications.ts:33` | `listNotifications` | `[]` | no |
| `lib/queries/notifications.ts:43` | `countUnreadNotifications` | `0` | no |
| `lib/queries/supervisor-visits.ts:77` | `listSupervisorVisits` | `[]` | no |
| `lib/queries/supervisor-visits.ts:95` | `listSupervisorVisitsForPromoter` | `[]` | no |
| `lib/queries/supervisor-scope.ts:27` | `listScopedCampaigns` | `[]` | no |
| `lib/queries/supervisor-scope.ts:42` | `listScopedLocations` | `[]` | no |
| `lib/queries/supervisor-scope.ts:81` | (third) | `[]` | no |
| `lib/queries/supervisor-scope.ts:114` | (fourth) | `[]` | no |
| `lib/queries/location-pings.ts:81` | `countMyPingsForDate` | `{ count: 0, lastPingAt: null }` | no |
| `lib/queries/activity-photos.ts:17` | `signActivityPhotoUrl` | `null` | no — storage signed URL parallel to attendance one |

### Sites that look intentional (ZERO)

None of the above is genuinely intentional. Every one is the same shape: the
function silently swallows an error and returns the "empty result" sentinel,
indistinguishable from a real empty result. The `/admin/live` zeros bug
(dashboard PR) is the canonical example of the harm.

The two storage helpers (`signAttendancePhotoUrl`, `signActivityPhotoUrl`)
are the only sites where `null` is also the intentional "no path" shape —
but the route handler can still log the error before the null reaches it.

---

## 1.2 — SEC-03 sites in `app/[locale]/**/actions.ts`

**60 sites total**, but they fall into four tiers and only some are clearly
in the audit's scope. Tiers below; please confirm which to sweep.

### Tier A — DB error → `'unknown'` (16 sites — the audit's clear scope)

These are the canonical SEC-03 shape: a Supabase error or RPC failure goes
to an opaque `'unknown'` user code with no log. Sweep all.

| File:Line | Action | Trigger |
|---|---|---|
| `app/[locale]/(auth)/reset-confirm/actions.ts:42` | `resetConfirmAction` | `auth.updateUser` error |
| `app/[locale]/(auth)/set-password/actions.ts:37` | `setPasswordAction` | `auth.updateUser` error |
| `app/[locale]/admin/campaigns/actions.ts:156` | `setCampaignLocationsAction` | initial fetch (`fetchErr`) |
| `app/[locale]/admin/campaigns/actions.ts:169` | `setCampaignLocationsAction` | DELETE (in for-loop — DATA-02 lives here too, separate PR) |
| `app/[locale]/admin/campaigns/actions.ts:176` | `setCampaignLocationsAction` | INSERT (in for-loop) |
| `app/[locale]/admin/campaigns/actions.ts:303` | `setCampaignSkusAction` | RPC `set_campaign_skus` |
| `app/[locale]/admin/shifts/actions.ts:55` | `createShiftAction` | INSERT-then-select returns no row |
| `app/[locale]/admin/shifts/actions.ts:101` | `updateShiftAction` | UPDATE error |
| `app/[locale]/admin/users/actions.ts:142` | `changeUserRoleAction` | profile UPDATE error |
| `app/[locale]/admin/users/actions.ts:192` | `setUserActiveAction` | profile UPDATE error |
| `app/[locale]/promoter/attendance/actions.ts:73` | `requestGeofenceOverrideAction` | INSERT into `alerts` |
| `app/[locale]/supervisor/attendance/actions.ts:72` | `approveOverrideAction` | UPDATE attendance |
| `app/[locale]/supervisor/attendance/actions.ts:135` | `rejectOverrideAction` | UPDATE attendance |
| `app/[locale]/supervisor/attendance/actions.ts:204` | `resolveAlertAction` | UPDATE alerts |
| `app/[locale]/promoter/attendance/location-actions.ts:118` | (catch block) | thrown exception → 'unknown' |
| `app/[locale]/promoter/attendance/location-actions.ts:124` | (catch block) | thrown exception → 'unknown' |

### Tier B — `safeParse` failure → `'unknown'` (13 sites — gray area)

These return `'unknown'` from a Zod parse failure. There is no Supabase
error to log — only the Zod issue list. Logging the issue list would tell
ops which form fields a client repeatedly fails (useful), but logs the
user's input shape (privacy-mild — usually IDs and free-text names).

The PR brief §2.3 said "validation errors with **specific** error codes
like `'duplicate_email'` are intentional." These sites use the **generic**
`'unknown'` code, so they sit in the middle. Two reasonable answers:

- **Skip:** the failure is structurally a client-side bug (form sent bad
  shape); `unknown` is fine and we don't need ops noise.
- **Log:** with the field names + `safeParse.error.issues` summary; helps
  catch broken client validation.

Sites: `admin/{assignments,campaigns,cities,clients,locations,regions,shifts,users}/actions.ts`,
`promoter/attendance/actions.ts:33`, `supervisor/attendance/actions.ts:{42,113,167}`.

**Recommendation:** skip these in this PR. If we want them logged, do it via
a single `parsedOrLog(schema, formData)` helper in a follow-up — adding
13 inline `logError` calls is just noise for the same shape.

### Tier C — DB error → specific-but-opaque code (15 sites — in scope)

The user-facing code is specific (`'update_failed'`, `'submit_failed'`,
`'reconcile_failed'`, etc.) but ops still has no idea **why** the DB call
failed. This is the audit's "without logging the underlying cause" exactly.

| File:Line | Action | Code returned |
|---|---|---|
| `app/[locale]/promoter/reports/actions.ts:104` | `upsertReportAction` (update path) | `'update_failed'` |
| `app/[locale]/promoter/reports/actions.ts:146` | `upsertReportAction` (insert path) | `'create_failed'` |
| `app/[locale]/promoter/reports/actions.ts:188` | `submitReportAction` | `'submit_failed'` |
| `app/[locale]/promoter/reports/actions.ts:230` | `upsertReportItemAction` | `'upsert_failed'` |
| `app/[locale]/promoter/reports/actions.ts:253` | `deleteReportItemAction` | `'delete_failed'` |
| `app/[locale]/promoter/reports/actions.ts:294` | `registerReportPhotoAction` | `'register_failed'` |
| `app/[locale]/promoter/reports/actions.ts:332` | `deleteReportPhotoAction` | `'delete_failed'` |
| `app/[locale]/promoter/tasks/actions.ts:46` | `setTaskStatusAction` | `'update_failed'` |
| `app/[locale]/supervisor/reports/actions.ts:59` | `approveReportAction` | `'approve_failed'` |
| `app/[locale]/supervisor/reports/actions.ts:101` | `rejectReportAction` | `'reject_failed'` |
| `app/[locale]/supervisor/reports/actions.ts:144` | `reopenReportAction` | `'reopen_failed'` |
| `app/[locale]/supervisor/stock/actions.ts:262` | `submitStockReconciliationAction` (movement) | `'reconcile_failed'` |
| `app/[locale]/supervisor/stock/actions.ts:346` | `submitStockReconciliationAction` (reconciliation) | `'reconcile_failed'` |
| `app/[locale]/supervisor/tasks/actions.ts:122` | `updateTaskAction` | `'update_failed'` |
| `app/[locale]/supervisor/tasks/actions.ts:164` | `setTaskStatusAction` | `'update_failed'` |

### Tier D — DB error → `'duplicate' or 'unknown'` (15 sites — in scope; partial log)

Pattern: `if (error) return { error: isUniqueViolation(error.message) ? 'duplicate' : 'unknown' };`.
`'duplicate'` is informative (unique-key violation, expected). `'unknown'`
is the catch-all. Log when **not** a unique violation.

| File:Line | Action |
|---|---|
| `app/[locale]/admin/assignments/actions.ts:58` | `createAssignmentAction` |
| `app/[locale]/admin/assignments/actions.ts:106` | `updateAssignmentAction` |
| `app/[locale]/admin/campaigns/actions.ts:67` | `createCampaignAction` |
| `app/[locale]/admin/campaigns/actions.ts:115` | `updateCampaignAction` |
| `app/[locale]/admin/campaigns/actions.ts:234` | (campaign-level action) |
| `app/[locale]/admin/campaigns/actions.ts:274` | (campaign-level action) |
| `app/[locale]/admin/cities/actions.ts:52` | create |
| `app/[locale]/admin/cities/actions.ts:96` | update |
| `app/[locale]/admin/clients/actions.ts:70` | create |
| `app/[locale]/admin/clients/actions.ts:123` | update |
| `app/[locale]/admin/locations/actions.ts:60` | create |
| `app/[locale]/admin/locations/actions.ts:108` | update |
| `app/[locale]/admin/regions/actions.ts:52` | create |
| `app/[locale]/admin/regions/actions.ts:96` | update |
| `app/[locale]/supervisor/tasks/actions.ts:65` | create (`'duplicate' / 'create_failed'`) |

### Skip — specific user-facing codes (~30+ sites, intentional per §2.3)

`'invalid_credentials'`, `'rate_limited'`, `'session_expired'`,
`'cannot_self_demote'`, `'cannot_self_deactivate'`, `'duplicate_email'`,
`'deactivated'`, `'forbidden'`, `'not_found'`, `'invalid_input'`,
`'location_not_assigned'`, `'not_submitted'`, `'frozen'`,
`'invalid_transition'`, `'not_yours'`, `'not_applicable'`,
`'already_overridden'`, `'not_authorized'`. These describe the failure
mode unambiguously — no log needed.

---

## 1.4 — Summary + open questions

**Counts:**

- TS-02: **19 sites** to sweep (zero look intentional).
- SEC-03 Tier A (DB → 'unknown'): **16 sites** (clear scope).
- SEC-03 Tier C (DB → specific opaque code): **15 sites** (audit-target framing).
- SEC-03 Tier D (DB → `'duplicate'` or `'unknown'`): **15 sites** (log on non-dup branch).
- SEC-03 Tier B (safeParse → 'unknown'): **13 sites** (gray area; recommend skip).

**Total without B:** 19 + 16 + 15 + 15 = **65 logger calls** to add.
**Total with B:** **78**.

The audit estimated SEC-03 at "~25 sites". They were probably counting
Tier A + a partial sample. I'm being more thorough — but you can scope
me down. See questions.

### Questions before I proceed to Phase 2

1. **Tier B (safeParse 'unknown', 13 sites) — sweep or skip?**
   Recommend skip; if you want them logged, suggest a follow-up PR with a
   `parseOrLog(schema, formData)` helper rather than 13 inline calls.

2. **Tier C (15 sites with specific-but-opaque codes like `'update_failed'`) — sweep?**
   I read the audit's "without logging the underlying cause" framing as
   yes. The user-facing code is fine; the missing piece is the ops log.

3. **Tier D (15 sites with `'duplicate' / 'unknown'`) — sweep?**
   Same logic as Tier C. Logger fires only on the non-dup branch (we don't
   need to log expected unique-key violations).

4. **Storage signed-URL helpers** (`signAttendancePhotoUrl`,
   `signActivityPhotoUrl`) — log here, or push the log to the route
   handler that consumes the `null`? Both work; logging at the helper is
   more co-located with the failure but means duplicate logs if the route
   also logs the `null`. I'll do helper-level unless you say otherwise.

5. **Logger context fields.** I plan to include `actor_id`, `entity_id`
   (e.g. `parsed.data.user_id`), and the Supabase error's `code` +
   `message` only — not `details`/`hint` (those can leak field values).
   Confirm or override.

Awaiting go-ahead. **Phase 2 will not start until you reply.**
