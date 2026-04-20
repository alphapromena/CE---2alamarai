# cron-scheduled-reports

Phase 8, Module 11 — nightly (or more frequent) sweep of the
`scheduled_reports` table that enqueues + dispatches an `export_jobs` row
for every due schedule.

Due logic (UTC):

- `cadence = 'daily'` → due when current hour matches `hour_utc` and
  `last_run_at` is NULL or ≥ 23 h ago.
- `cadence = 'weekly'` → due when current day-of-week matches
  `day_of_week_utc` AND hour matches AND `last_run_at` is ≥ 6 days ago.
- `cadence = 'end_of_campaign'` → fires exactly once per schedule the first
  time any campaign in `scope.campaign_ids` has `status = 'completed'`.

Each due schedule:

1. Inserts a fresh `export_jobs` row (status = queued, generated UUID
   idempotency_key).
2. Calls `generate-report` with `{ job_id }` to process the artifact.
3. Updates `scheduled_reports.last_run_at` + `last_job_id`.

## Deploy

```bash
supabase functions deploy cron-scheduled-reports
```

`verify_jwt = false` (see `config.toml`). A shared-secret header is required.

### Required secrets

- `CRON_SECRET` — re-used from Phase 3 / 7.

## Schedule

Call hourly so hour-of-day schedules are picked up:

```sql
select cron.schedule(
  'phase8-scheduled-reports',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/cron-scheduled-reports',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);
```
