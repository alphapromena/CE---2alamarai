# compute-kpis

Server-side KPI **and performance** writer. Single source of truth lives in
two pure modules:

- `supabase/functions/_shared/kpis.ts` (mirrors `lib/kpis/compute.ts`) —
  per-shift KPI math, vitest-tested against the Almarai Safeway Jubeiha
  fixture.
- `supabase/functions/_shared/performance.ts` (mirrors
  `lib/performance/tiering.ts` + `lib/performance/rollups.ts`) — Phase 6
  rollups (promoter / location / campaign × daily / weekly /
  campaign_to_date) with auto-tier + dense rank. Tested against the
  Safeway Khalda vs Shini fixture.

**Never trust client math.** Service-role writes only — no authenticated
INSERT/UPDATE RLS policies on `kpi_snapshots` or `performance_snapshots`.

Whenever a `daily_report` is (re)computed, the function also recomputes
the affected campaign's `performance_snapshots` for three periods × three
scopes, UPSERTed against the
`(scope_kind, scope_id, campaign_id, period_kind, period_start)`
unique constraint.

## Modes

### 1. Targeted (default)

Called from the promoter submit and supervisor approve Server Actions.
Caller's JWT is verified by the platform (`verify_jwt = true`); RLS re-check
confirms the caller can `SELECT` the given `daily_report` before compute.

```
POST /functions/v1/compute-kpis
Authorization: Bearer <caller-jwt>
Content-Type: application/json

{ "daily_report_id": "<uuid>" }
```

Response 200:
```json
{
  "ok": true,
  "daily_report_id": "…",
  "computation_version": 1
}
```

### 2. Sweep

Safety net for the case where the submit/approve flow failed to invoke us
(network flake, browser crash). Finds reports in status `submitted` or
`approved` whose snapshot is missing or older than
`daily_reports.updated_at`, and recomputes each.

```
POST /functions/v1/compute-kpis
x-cron-secret: <CRON_SECRET>
Content-Type: application/json

{ "sweep": true }
```

Response 200:
```json
{
  "ok": true,
  "mode": "sweep",
  "ran_at": "2026-04-21T00:00:00.000Z",
  "considered": 3,
  "computed": 3,
  "failures": 0
}
```

## Deploy

```bash
supabase functions deploy compute-kpis
```

`verify_jwt = true` for the targeted mode; sweep mode checks
`x-cron-secret` in-handler, so the JWT verification does not block cron
(cron callers must still send a valid bearer token — use the service-role
key when scheduling with pg_cron/pg_net).

### Required secrets

Set in Supabase dashboard → Project settings → Functions → Secrets:

- `CRON_SECRET` — random string used by the sweep scheduler's header.

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are
auto-injected.

## Scheduling the sweep

Pick one — hourly is plenty (the submit/approve path is the primary
trigger, sweep is the safety net):

**Supabase scheduled functions** (dashboard): every 1 hour, with headers
`Authorization: Bearer <service-role-key>` and `x-cron-secret: <CRON_SECRET>`,
body `{"sweep": true}`.

**pg_cron + pg_net**:
```sql
select cron.schedule(
  'compute-kpis-sweep',
  '0 * * * *',
  $$
    select net.http_post(
      url := '<FN_URL>',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'authorization', 'Bearer <SERVICE_ROLE_KEY>',
        'x-cron-secret', '<CRON_SECRET>'
      ),
      body := '{"sweep": true}'::jsonb
    );
  $$
);
```

## Local verification

```bash
supabase functions serve compute-kpis
# Targeted:
curl -s -X POST \
  -H "Authorization: Bearer <promoter-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"daily_report_id":"<uuid>"}' \
  http://localhost:54321/functions/v1/compute-kpis
# Sweep:
curl -s -X POST \
  -H "Authorization: Bearer <service-role-key>" \
  -H "x-cron-secret: test-secret" \
  -H "Content-Type: application/json" \
  -d '{"sweep": true}' \
  http://localhost:54321/functions/v1/compute-kpis
```
