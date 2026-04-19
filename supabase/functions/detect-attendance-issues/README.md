# detect-attendance-issues

Scheduled sweep that detects:

1. **Absent** — assigned promoter with no check-in past the absence cutoff.
2. **Missing check-out** — checked-in promoter past shift end with no
   check-out.

Runs are idempotent: the `attendance_unique_user_day_idx` unique index
prevents duplicate absent rows; alerts are deduplicated on re-run.

## Deploy

```bash
supabase functions deploy detect-attendance-issues
```

`verify_jwt = false` (see `config.toml`). Auth is a shared secret header
instead.

### Required secrets

Set in Supabase dashboard → Project settings → Functions → Secrets:

- `CRON_SECRET` — any long random string. The scheduler must pass this as
  the `x-cron-secret` header.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected.

## Invocation

`POST /functions/v1/detect-attendance-issues`
Header: `x-cron-secret: $CRON_SECRET`
Body: none.

Response:
```json
{
  "ok": true,
  "ran_at": "2026-04-20T12:05:00.000Z",
  "absent_created": 2,
  "missing_checkout_updated": 1,
  "alerts_created": 3,
  "shifts_considered": 7,
  "assignments_considered": 12
}
```

## Scheduling options

Pick one:

**a) Supabase scheduled functions** (dashboard):
- Frequency: every 10 minutes is plenty (absence cutoff default is 60
  minutes, so a 10-minute resolution doesn't matter).
- Headers: add `x-cron-secret: <value>`.

**b) pg_cron + pg_net** (SQL, requires the `pg_net` extension):
```sql
-- Replace <FN_URL> and <CRON_SECRET> with real values before running.
select cron.schedule(
  'detect-attendance-issues',
  '*/10 * * * *',
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

**c) External cron** (GitHub Actions, Vercel cron, etc.):
`curl -s -X POST -H "x-cron-secret: $CRON_SECRET" $FN_URL`.

## Local verification

```bash
supabase functions serve detect-attendance-issues
curl -s -X POST -H "x-cron-secret: test-secret" \
  http://localhost:54321/functions/v1/detect-attendance-issues
```

Set `CRON_SECRET=test-secret` in
`supabase/functions/detect-attendance-issues/.env.local` first.
