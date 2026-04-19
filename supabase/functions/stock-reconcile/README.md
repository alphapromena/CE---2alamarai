# stock-reconcile

Computes per-(campaign, sku, entity) balances from the `stock_movements` ledger
and emits alerts for low-stock, no-usage, and reconciliation-mismatch. Writes
a `stock_reconciliations` snapshot row in targeted mode.

## Modes

**TARGETED** — `POST /stock-reconcile` with `Authorization: Bearer <jwt>` and
body:

```jsonc
{
  "campaign_id": "uuid",
  "scope": "supervisor" | "location" | "campaign",
  "entity_id": "uuid | null",
  "declarations": [               // optional
    {
      "sku_id": "uuid",
      "declared_on_hand": 250,
      "promoter_ids": ["uuid"]    // optional — for mismatch detection
    }
  ],
  "note": "end-of-day count"      // optional
}
```

Admins may target any scope. Supervisors may target `supervisor` with their
own id or `location` with one of their assigned location ids.

**SWEEP** — `POST /stock-reconcile` with `x-cron-secret: <CRON_SECRET>` and
body `{ "sweep": true }`. Iterates every active campaign, reduces its
ledger, and upserts low-stock + no-usage alerts (de-duped against open ones).

## Environment

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET` — required for sweep mode.

## Invariants

- **Ledger math lives in `../_shared/ledger.ts`** — a byte-for-byte mirror of
  `lib/stock/ledger.ts`. `lib/stock/ledger.test.ts` is the source-of-truth
  suite. Update both files together.
- **Alert deduplication**: each new flag is keyed by
  `(type, campaign, sku, entity)` and compared against currently-OPEN alerts
  for the same campaign. If an open alert with the same key already exists,
  the new one is skipped. Acknowledged / resolved / dismissed alerts are not
  considered — if the condition persists and the prior alert was closed, a
  new one is raised.
- **No writes to `stock_movements` from this function.** Corrections and new
  movements always go through the Server Actions in `app/[locale]/**/stock/`.

## Scheduling

Suggested: `pg_cron` every 10 minutes:

```sql
select cron.schedule(
  'stock-reconcile-sweep',
  '*/10 * * * *',
  $$
    select net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/stock-reconcile',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-cron-secret', current_setting('app.cron_secret')
      ),
      body := '{"sweep":true}'::jsonb
    );
  $$
);
```
