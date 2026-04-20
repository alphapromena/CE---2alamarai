# Demo Seed — Almarai Dataset

This project ships a SQL seed that produces a realistic, 30-day rolling
Almarai activation across 8 Jordanian locations for product demos and
reviewer walkthroughs. The seed is hand-runnable through the Supabase SQL
Editor and is fully idempotent — running it again resets and repopulates
the demo data without touching admin or non-demo rows.

## What you get

- 1 demo client (Almarai) linked to `client@almarai.com`
- 1 region (Jordan) + 3 cities (Amman, Zarqa, Irbid), bilingual
- 8 locations with real-ish coordinates + 100 m geofence + Arabic addresses
- 3 campaigns:
  - **Almarai Laban Ramadan 2026** — active, all 8 locations
  - **Almarai Juice Summer** — active, 4 Amman locations
  - **Almarai Cheese Promo** — completed, 4 Zarqa + Irbid locations
- 6 SKUs across the campaigns (Laban 1L + 500ml, Mango + Orange Juice 1L,
  Feta 500g, Mozzarella 250g)
- 12 shifts (09:00–17:00, Sun–Thu) for the active campaign-location pairs
- 3 supervisors + 15 promoters with Arabic full names
- 30-day rolling attendance: ~85% on-time / ~10% late / ~5% absent,
  ~3% outside geofence, ~3% early leave. Placeholder check-in and check-out
  photo paths on every non-absent row.
- 15-minute `location_pings` between check-in and check-out
- One daily report per (promoter, location, day) with engagement funnel and
  two `sales_entries` rows per report
- Primary break per shift (+ ~20% chance of a second shorter break), approved
  with actuals
- Full stock ledger: warehouse → supervisor_1 → promoter → consumer, plus
  ~10% promoter returns — all ordered to satisfy the append-only invariant
  trigger
- 2–3 supervisor visits per week per active campaign

## Prerequisites

1. A running Supabase project with all migrations applied (this repo's
   `supabase/migrations/` directory is the source of truth).
2. Dashboard access to create auth users.
3. SQL Editor access to paste and run the seed file.

## Step 1 — Create the demo auth users (one-time)

The seed resolves users by email lookup against `auth.users`. You **must**
create these accounts manually via **Supabase Dashboard → Authentication →
Users → Add user** before running the seed. Use the same password for every
demo account so you can switch between them quickly.

| Role       | Email                    | Password   |
| ---------- | ------------------------ | ---------- |
| client     | `client@almarai.com`     | `Demo@1234` |
| supervisor | `super1@demo.com`        | `Demo@1234` |
| supervisor | `super2@demo.com`        | `Demo@1234` |
| supervisor | `super3@demo.com`        | `Demo@1234` |
| promoter   | `promoter01@demo.com`    | `Demo@1234` |
| promoter   | `promoter02@demo.com`    | `Demo@1234` |
| ...        | ...                      | `Demo@1234` |
| promoter   | `promoter15@demo.com`    | `Demo@1234` |

Create 15 promoters — `promoter01@demo.com` through `promoter15@demo.com`.

`admin@almarai.com` already exists and is **never** touched by the seed.

**Tip:** if you forget one, the seed aborts with a clear error listing the
missing emails. Add them in the dashboard and re-run.

## Step 2 — Run the seed

1. Open **Supabase Dashboard → SQL Editor → New query**.
2. Paste the full contents of `supabase/seeds/demo_seed.sql`.
3. Click **Run**.

You should see `COMMIT` with no errors. The entire script wraps in a single
transaction, so any failure leaves the database unchanged.

> The seed is NOT run via `supabase db push` or `supabase db reset`. Those
> commands replay migrations, not seeds. Seeds live on top of a migrated
> database and are applied by hand.

Running the script a second time is safe: the top of the transaction deletes
all prior demo-tagged rows before re-inserting, so you always end up with
the same final state.

## Step 3 — Log in and explore

Switch between demo roles to see the populated dashboards:

| Route                           | Credential            |
| ------------------------------- | --------------------- |
| `/admin/live`                   | `admin@almarai.com`   |
| `/admin/performance`            | `admin@almarai.com`   |
| `/supervisor/attendance`        | `super1@demo.com`     |
| `/supervisor/live`              | `super2@demo.com`     |
| `/supervisor/visits`            | `super3@demo.com`     |
| `/promoter/attendance`          | `promoter01@demo.com` |
| `/promoter/breaks`              | `promoter02@demo.com` |
| `/client/performance`           | `client@almarai.com`  |
| `/client/exports`               | `client@almarai.com`  |

The supervisor live dashboard, per-campaign performance pages, and client
aggregates all have data out of the box.

## Step 4 — Reset (wipe demo data without re-seeding)

Re-running the seed is the normal reset path. If instead you want to wipe
the demo data and leave the database empty of it:

1. Open **SQL Editor → New query**.
2. Copy the `STAGE 0` + `STAGE 1` blocks from the top of
   `supabase/seeds/demo_seed.sql` (ending at the STAGE 2 heading), wrap
   them in your own `begin; ... commit;`, and run.

Both paths remove only demo-tagged rows. `admin@almarai.com`, any non-demo
client, and any non-demo campaign are left alone.

## Troubleshooting

- **`Demo seed: missing auth.users for [...]`** — create the listed emails in
  the dashboard and re-run.
- **`duplicate key value violates unique constraint`** — you probably edited
  the seed file and re-ran without a prior reset. Run the reset block first.
- **`stock invariant violation: ...`** — only happens if the seed has been
  modified. The script inserts allocations before distributions and
  distributions before usage so the invariant trigger always passes.

## Notes for maintainers

- Decision record: `DECISIONS.md` → **D-043**.
- The seed does not touch migrations — migrations remain the schema source of
  truth.
- Prices (JOD) for the 6 SKUs are documented in the seed file header only;
  there is no `price` column on `skus`.
- Photo paths are placeholders (`demo/checkin_<uuid>.jpg` etc.). Nothing is
  uploaded to Storage; the selfie viewer will 404 for these paths.
