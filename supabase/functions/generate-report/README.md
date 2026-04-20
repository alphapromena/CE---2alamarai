# generate-report

Phase 8, Module 11 — processes queued `export_jobs` rows: assembles rows from
the relevant domain tables, composes a CSV-zip or XLSX artifact, uploads it
to the private `exports` Storage bucket, and marks the row `done`.

Runs in two modes:

1. **Targeted** — `POST { "job_id": "<uuid>" }`. The cron-scheduled-reports
   function calls this immediately after inserting a new queued row.
2. **Sweep** — `POST {}` with no body. Picks the oldest queued row and
   processes one per invocation. Safe to call repeatedly.

On-demand exports initiated from the admin / supervisor / client UI do NOT
come here — they run synchronously in the `queueExportAction` Server Action
(see `lib/exports/actions.ts`). This function is the cron / scheduled-
reports path only (D-030).

## Deploy

```bash
supabase functions deploy generate-report
```

`verify_jwt = false` (see `config.toml`). A shared-secret header is required
instead.

### Required secrets

Set in Supabase dashboard → Project settings → Functions → Secrets:

- `CRON_SECRET` — any long random string. The scheduler must pass this as
  the `x-cron-secret` header. Re-used from Phase 3 / 7.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected.

## Schedule

Not directly scheduled. Invoked on demand by `cron-scheduled-reports` after
it queues a new row. A backlog drain can also be scheduled manually:

```sql
select cron.schedule(
  'phase8-generate-report-drain',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/generate-report',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);
```
