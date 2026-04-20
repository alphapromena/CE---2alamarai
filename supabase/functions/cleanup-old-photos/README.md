# cleanup-old-photos

Feature 4 / D-041 retention worker. Deletes attendance selfies and
supervisor-visit photos older than **90 days** from the private
`attendance-photos` bucket, and nulls the corresponding `check_in_photo_path`
/ `check_out_photo_path` columns on `public.attendance`.

`supervisor_visits.photo_path` stays NOT NULL per the Phase 3 schema; the
storage object is removed but the row keeps a reference for audit continuity.

## Deploy

```bash
supabase functions deploy cleanup-old-photos
```

`verify_jwt = false` — the function is cron-invoked and validates an
`x-cron-secret` header.

### Required secrets

- `CRON_SECRET` — any long random string, passed by the scheduler as
  `x-cron-secret: <value>`. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are
  auto-injected.

## Invocation

`POST /functions/v1/cleanup-old-photos`
Header: `x-cron-secret: $CRON_SECRET`
Body: none.

Response:
```json
{
  "ok": true,
  "ran_at": "2026-04-20T03:00:00.000Z",
  "retention_days": 90,
  "attendance_scanned": 123,
  "attendance_deleted": 4,
  "attendance_rows_updated": 4,
  "visits_scanned": 11,
  "visits_deleted": 1
}
```

## Scheduling

Run nightly at 03:00 local time. Use one of the options documented for
`detect-attendance-issues`. Example `pg_cron` snippet:

```sql
-- Replace <FN_URL> and <CRON_SECRET> with real values before running.
select cron.schedule(
  'cleanup-old-photos',
  '0 3 * * *',
  $$
    select net.http_post(
      url := '<FN_URL>',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-cron-secret', '<CRON_SECRET>'
      ),
      body := '{}'::jsonb
    );
  $$
);
```

## Companion retention job — `gc_location_pings()` (Feature 5 / D-042)

The Feature 5 migration ships a pure-SQL retention function
`public.gc_location_pings()` that deletes `location_pings` rows older than
**30 days**. Because it's a DB function (not an Edge Function) it can be
scheduled directly from `pg_cron` without an HTTP hop:

```sql
select cron.schedule(
  'gc-location-pings',
  '15 3 * * *',
  $$ select public.gc_location_pings(); $$
);
```

Run it once manually after migrating to confirm permissions:

```sql
select public.gc_location_pings();
```

Returns the number of deleted rows. Safe to re-run — idempotent.
