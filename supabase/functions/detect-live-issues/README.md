# detect-live-issues

Phase 7, Module 8 — scheduled sweep that emits two live-monitoring alert types:

1. **low_performance** — per-campaign, per-scope (promoter / location) rows in
   `performance_snapshots` (written by `compute-kpis`) whose tier metric is
   strictly below `kpi_config.low_performance_threshold` (default 0.30).
2. **no_activity** — checked-in promoters today whose reported
   contacts/engaged/samples sum is zero and whose check-in is older than
   `kpi_config.no_activity_hours` (default 3).

Each inserted alert fans out one `notifications` row per targeted user
(the promoter, if any, plus every supervisor assigned to the alert's
location) — so the bell icon lights up even if the user isn't on the live
dashboard.

Runs are idempotent: open `low_performance` / `no_activity` alerts are
deduplicated on (campaign, scope, period) and (attendance_id) respectively
before inserting.

## Deploy

```bash
supabase functions deploy detect-live-issues
```

`verify_jwt = false` (see `config.toml`). A shared-secret header is required
instead.

### Required secrets

Set in Supabase dashboard → Project settings → Functions → Secrets:

- `CRON_SECRET` — any long random string. The scheduler must pass this as
  the `x-cron-secret` header.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected.

## Schedule

Run every 10 minutes. Example using Supabase scheduled functions
(`supabase functions schedule`) or pg_cron:

```sql
select cron.schedule(
  'detect_live_issues',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://<ref>.functions.supabase.co/detect-live-issues',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

## Response shape

```json
{
  "ok": true,
  "ran_at": "2026-04-20T14:00:00Z",
  "campaigns_considered": 3,
  "low_performance_alerts_created": 1,
  "no_activity_alerts_created": 0,
  "notifications_created": 2,
  "errors": 0
}
```
