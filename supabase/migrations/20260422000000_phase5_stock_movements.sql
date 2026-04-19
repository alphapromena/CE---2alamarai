-- Phase 5 — Stock movements (Module 6): append-only ledger.
--
-- Design principles (see DECISIONS.md):
--   D-008 — Compensating entries only. UPDATE/DELETE are REJECTED at the
--           trigger layer. Corrections are new rows with `correction_of` set.
--   D-009 — Idempotency key is a client-generated UUID v4, UNIQUE per row.
--           Server replays return the prior row on duplicate key.
--   D-021 (draft) — `skus.kind` marks sample / giveaway / sale_unit so the
--           same ledger carries all three unit types.
--   D-022 (draft) — `skus.stock_allocated` remains a planning target; the
--           ledger is authoritative. One explicit 'allocation' movement seeds
--           the warehouse → supervisor balance.
--
-- This migration defines the TABLE + IMMUTABILITY only. Invariant-enforcing
-- triggers, the derived `stock_balances` view, `stock_reconciliations`, the
-- alert_type extension, and RLS policies ship in the following migrations
-- (20260422010000 → 20260422040000). Splitting avoids a single huge SQL file
-- and lets each concern be reviewed on its own.

-- ============================================================================
-- 1. skus.kind — distinguish sample/giveaway/sale_unit without a separate SKU
--    table. Operationally all three are "units" on the same ledger.
-- ============================================================================
create type public.sku_kind as enum ('sample', 'giveaway', 'sale_unit');

alter table public.skus
  add column kind public.sku_kind not null default 'sample';

create index skus_kind_idx on public.skus (kind);

-- ============================================================================
-- 2. Enums
-- ============================================================================
create type public.stock_entity_type as enum (
  'warehouse',    -- abstract tenant-wide warehouse; from_entity_id IS NULL
  'supervisor',   -- profiles.id (role = 'supervisor')
  'promoter',     -- profiles.id (role = 'promoter')
  'location',     -- locations.id (used for inter-location reallocation)
  'consumer'      -- abstract end customer; to_entity_id IS NULL
);

create type public.stock_movement_kind as enum (
  'allocation',   -- warehouse → supervisor (admin opens the ledger)
  'distribution', -- supervisor → promoter
  'reallocation', -- supervisor ↔ supervisor OR location ↔ location (two legs)
  'usage',        -- promoter → consumer (logged from daily_reports)
  'return',       -- promoter → supervisor OR supervisor → warehouse
  'correction'    -- reversal of a prior row; correction_of is set
);

-- ============================================================================
-- 3. stock_movements — immutable ledger.
--    Direction is encoded in (from_entity_type, to_entity_type, *_entity_id);
--    quantity is always positive. A "reversal" is a new row with swapped
--    from/to and `correction_of` pointing at the original.
--
--    Entity-id FK is intentionally NOT declared: entity_id references
--    `profiles.id` for supervisor/promoter, `locations.id` for location, and
--    NULL for warehouse/consumer. Postgres does not support FKs conditional
--    on a sibling column's value. Existence is enforced at the Server Action
--    layer (zod + authz re-check) and by the invariant trigger in the next
--    migration, which reads the aggregate via `stock_balances` and therefore
--    implicitly tolerates the weak FK.
-- ============================================================================
create table public.stock_movements (
  id                        uuid primary key default gen_random_uuid(),
  campaign_id               uuid not null references public.campaigns (id) on delete restrict,
  sku_id                    uuid not null references public.skus (id) on delete restrict,

  from_entity_type          public.stock_entity_type not null,
  from_entity_id            uuid,
  to_entity_type            public.stock_entity_type not null,
  to_entity_id              uuid,

  quantity                  integer not null check (quantity > 0),
  movement_kind             public.stock_movement_kind not null,

  user_id                   uuid not null references public.profiles (id) on delete restrict,
  location_id               uuid references public.locations (id) on delete set null,

  reason                    text,

  -- Compensating entries (D-008): the new row that reverses a prior mistake
  -- points at the original via correction_of. Movements of kind='correction'
  -- MUST set this; other kinds MUST NOT.
  correction_of             uuid references public.stock_movements (id) on delete restrict,

  -- Two-leg reallocation (supervisor↔supervisor / location↔location) inserts
  -- two rows in one transaction sharing the same group id. Other kinds leave
  -- this NULL.
  reallocation_group_id     uuid,

  -- D-009: client-generated UUID v4, UNIQUE. Server replays return the prior
  -- row on duplicate key.
  idempotency_key           uuid not null,

  created_at                timestamptz not null default now(),

  -- ------------------------------------------------------------------------
  -- Entity shape: warehouse and consumer are abstract (entity_id IS NULL);
  -- all other types carry a concrete uuid.
  -- ------------------------------------------------------------------------
  constraint stock_movements_from_entity_shape check (
    (from_entity_type in ('warehouse', 'consumer') and from_entity_id is null)
    or (from_entity_type in ('supervisor', 'promoter', 'location') and from_entity_id is not null)
  ),
  constraint stock_movements_to_entity_shape check (
    (to_entity_type in ('warehouse', 'consumer') and to_entity_id is null)
    or (to_entity_type in ('supervisor', 'promoter', 'location') and to_entity_id is not null)
  ),

  -- ------------------------------------------------------------------------
  -- Kind ↔ (from_type, to_type) consistency. Each movement_kind has a fixed
  -- set of legal entity-type pairs. 'correction' is intentionally open: a
  -- reversal mirrors whatever shape the original had, so the check here only
  -- enforces that correction_of is set iff kind = 'correction'.
  -- ------------------------------------------------------------------------
  constraint stock_movements_kind_pair_check check (
    (movement_kind = 'allocation'
      and from_entity_type = 'warehouse'
      and to_entity_type = 'supervisor')
    or (movement_kind = 'distribution'
      and from_entity_type = 'supervisor'
      and to_entity_type = 'promoter')
    or (movement_kind = 'reallocation'
      and ((from_entity_type = 'supervisor' and to_entity_type = 'supervisor')
           or (from_entity_type = 'location' and to_entity_type = 'location')))
    or (movement_kind = 'usage'
      and from_entity_type = 'promoter'
      and to_entity_type = 'consumer')
    or (movement_kind = 'return'
      and ((from_entity_type = 'promoter' and to_entity_type = 'supervisor')
           or (from_entity_type = 'supervisor' and to_entity_type = 'warehouse')))
    or (movement_kind = 'correction')
  ),

  constraint stock_movements_correction_shape check (
    (movement_kind = 'correction' and correction_of is not null)
    or (movement_kind <> 'correction' and correction_of is null)
  ),

  -- Reallocations travel in pairs, linked by reallocation_group_id.
  constraint stock_movements_reallocation_group_shape check (
    (movement_kind = 'reallocation' and reallocation_group_id is not null)
    or (movement_kind <> 'reallocation' and reallocation_group_id is null)
  ),

  -- Self-loop guard: a single row can't transfer from an entity to itself.
  -- (A reallocation between the same supervisor is meaningless; between two
  -- promoters goes through return→distribute, not a direct movement.)
  constraint stock_movements_no_self_loop check (
    from_entity_type <> to_entity_type
    or from_entity_id is distinct from to_entity_id
  )
);

-- D-009: global uniqueness of the idempotency key. A duplicate INSERT raises
-- 23505 (unique_violation); Server Actions catch that and read-through the
-- existing row.
create unique index stock_movements_idempotency_key_unique_idx
  on public.stock_movements (idempotency_key);

-- Read patterns (Phase 7 dashboards + reconcile sweep):
--   "what flowed INTO entity X for (campaign, sku)" — to_entity side
--   "what flowed OUT of entity Y for (campaign, sku)" — from_entity side
--   audit trail — chronological, by campaign
create index stock_movements_to_idx
  on public.stock_movements (campaign_id, sku_id, to_entity_type, to_entity_id);
create index stock_movements_from_idx
  on public.stock_movements (campaign_id, sku_id, from_entity_type, from_entity_id);
create index stock_movements_created_at_idx
  on public.stock_movements (created_at desc);
create index stock_movements_campaign_created_idx
  on public.stock_movements (campaign_id, created_at desc);
create index stock_movements_correction_of_idx
  on public.stock_movements (correction_of)
  where correction_of is not null;
create index stock_movements_reallocation_group_idx
  on public.stock_movements (reallocation_group_id)
  where reallocation_group_id is not null;

-- ============================================================================
-- 4. Append-only enforcement.
--    Even the service role hits these triggers. Corrections go through a NEW
--    INSERT with correction_of set, never an UPDATE.
-- ============================================================================
create or replace function public.stock_movements_deny_modification()
returns trigger
language plpgsql
as $$
begin
  raise exception 'stock_movements is append-only (D-008): % is not allowed. Insert a correction row instead.', tg_op
    using errcode = '42501';
end;
$$;

create trigger stock_movements_no_update
  before update on public.stock_movements
  for each row execute function public.stock_movements_deny_modification();

create trigger stock_movements_no_delete
  before delete on public.stock_movements
  for each row execute function public.stock_movements_deny_modification();

-- ============================================================================
-- 5. Grants + RLS enable.
--    authenticated gets SELECT + INSERT only. UPDATE/DELETE are revoked at the
--    grant layer in addition to the trigger, so even a misconfigured RLS
--    policy cannot open the door. Policies are added in the stock_rls migration.
-- ============================================================================
alter table public.stock_movements enable row level security;

grant select, insert on public.stock_movements to authenticated;
revoke update, delete on public.stock_movements from public, anon, authenticated;
