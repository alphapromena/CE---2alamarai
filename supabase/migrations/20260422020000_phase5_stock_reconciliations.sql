-- Phase 5 — stock_reconciliations: snapshot of a reconciliation event.
--
-- A reconciliation is a supervisor-initiated (or system-initiated) comparison
-- of expected vs actual balances for a (campaign, supervisor) or (campaign,
-- location) scope on a given date. The outcome is captured as a JSONB document
-- that lists per-SKU totals and any mismatch rows. Resolutions (compensating
-- entries, returns, corrections) are linked via the ledger rather than
-- UPDATEd into this row.
--
-- The row itself is append-only for the same reasons stock_movements is —
-- once a reconciliation is recorded, the historical snapshot stays. If a
-- later reconciliation supersedes it, a new row is inserted.

-- ============================================================================
-- 1. Enum for scope + status
-- ============================================================================
create type public.stock_reconciliation_scope as enum (
  'supervisor',   -- per-supervisor, all their SKUs for a campaign
  'location',     -- per-location, all SKUs at that location for a campaign
  'campaign'      -- campaign-wide (admin sweep)
);

create type public.stock_reconciliation_status as enum (
  'matched',       -- all invariants held, no mismatches
  'mismatched',    -- one or more SKUs failed the identity check
  'resolved'       -- a prior mismatch was closed by a follow-up reconciliation
);

-- ============================================================================
-- 2. Table
-- ============================================================================
create table public.stock_reconciliations (
  id                  uuid primary key default gen_random_uuid(),
  campaign_id         uuid not null references public.campaigns (id) on delete restrict,

  scope               public.stock_reconciliation_scope not null,
  -- entity_id meaning depends on scope:
  --   supervisor — profiles.id of the supervisor
  --   location   — locations.id
  --   campaign   — NULL (entire campaign)
  entity_id           uuid,

  reconciled_by       uuid not null references public.profiles (id) on delete restrict,
  reconciled_at       timestamptz not null default now(),

  status              public.stock_reconciliation_status not null,

  -- per-SKU breakdown: [{ sku_id, expected, actual, diff }, ...]
  -- Structure validated by the stock-reconcile Edge Function, not here —
  -- CHECK would require jsonb_path queries and bloat the migration.
  details             jsonb not null default '[]'::jsonb
                      check (jsonb_typeof(details) = 'array'),

  -- Free-text note recorded by the actor.
  note                text,

  -- If this reconciliation resolves a prior mismatched one, link it here.
  supersedes          uuid references public.stock_reconciliations (id) on delete restrict,

  created_at          timestamptz not null default now(),

  constraint stock_reconciliations_scope_entity_shape check (
    (scope = 'campaign' and entity_id is null)
    or (scope in ('supervisor', 'location') and entity_id is not null)
  )
);

create index stock_reconciliations_campaign_idx
  on public.stock_reconciliations (campaign_id, reconciled_at desc);
create index stock_reconciliations_entity_idx
  on public.stock_reconciliations (scope, entity_id, reconciled_at desc);
create index stock_reconciliations_status_idx
  on public.stock_reconciliations (status);
create index stock_reconciliations_supersedes_idx
  on public.stock_reconciliations (supersedes)
  where supersedes is not null;

-- ============================================================================
-- 3. Append-only enforcement (D-008 pattern applied to reconciliations).
-- ============================================================================
create or replace function public.stock_reconciliations_deny_modification()
returns trigger
language plpgsql
as $$
begin
  raise exception 'stock_reconciliations is append-only: % is not allowed. Insert a new reconciliation that supersedes the prior one.', tg_op
    using errcode = '42501';
end;
$$;

create trigger stock_reconciliations_no_update
  before update on public.stock_reconciliations
  for each row execute function public.stock_reconciliations_deny_modification();

create trigger stock_reconciliations_no_delete
  before delete on public.stock_reconciliations
  for each row execute function public.stock_reconciliations_deny_modification();

alter table public.stock_reconciliations enable row level security;

grant select, insert on public.stock_reconciliations to authenticated;
revoke update, delete on public.stock_reconciliations from public, anon, authenticated;
