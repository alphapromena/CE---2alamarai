# RLS pgTAP — Findings (read-only flags from the QUAL-01 PR)

> Findings surfaced while writing the new test files. Per the PR brief,
> these are documented here and **not fixed in this PR** — each is a
> separate concern with its own review.

---

## Finding 1 — `feature4.test.sql` and `feature5.test.sql` use wrong campaigns column names

### Symptom

Both files insert into `public.campaigns` with `starts_on, ends_on`:

```sql
insert into public.campaigns (id, client_id, name_i18n, status, starts_on, ends_on)
values (...);
```

(`feature4.test.sql:47`, `feature5.test.sql:40`.)

### Schema reality

`public.campaigns` has columns `start_date` + `end_date`
(`supabase/migrations/20260419040000_phase2_campaigns.sql:25-26`). There is
no `starts_on` / `ends_on` on this table — those columns live on
`user_assignments` (`20260419060000_phase2_user_assignments.sql:24-25`),
which is presumably where the test author crossed wires.

### Likely consequence

If `supabase db test` is run against either file, the INSERT will fail
with `column "starts_on" of relation "campaigns" does not exist`, the
test transaction will abort, and every subsequent assertion in that file
will be reported as failed/skipped.

That means **the `feature4` and `feature5` test files have never produced
a green run since they were written**, or they passed against a since-
renamed schema (no rename migration exists in the repo, so this is
unlikely).

### Why I'm not fixing it here

- This PR's scope is **adding** RLS test files, not editing existing ones.
- Fixing the column names is two trivial replacements but the PR brief
  explicitly says don't touch the existing 8 files.
- The user's prior decision (helper extraction) reinforces that the
  existing files are off-limits for this PR.

### Recommended follow-up

Tiny PR: replace `starts_on, ends_on` → `start_date, end_date` in both
files. Then run `supabase db test` to confirm the suite is green
end-to-end.

---

## Finding 2 — None from `rls-attendance.test.sql` content itself

Every attendance RLS policy I tested behaves as the migration documents:

- `attendance_select_admin` — admin sees all. ✅
- `attendance_select_self` — promoter sees own. ✅
- `attendance_select_supervisor` — supervisor sees rows at their assigned
  locations only. ✅ (cross-supervisor filtered out)
- `attendance_insert_self_promoter` — promoter can insert own row at
  assigned location; rejected at unassigned location. ✅
- `attendance_update_supervisor` — supervisor can update own location's
  rows; cross-supervisor UPDATE silently filtered (no error, zero rows
  changed). ✅
- No policy grants client SELECT — client sees zero rows. ✅
- No policy grants promoter DELETE — silent no-op (RLS-filter behavior,
  not WITH-CHECK rejection). ✅

No RLS bug surfaced. The test file passes (modulo the user running
`supabase db test` to confirm).

---

End of findings.
