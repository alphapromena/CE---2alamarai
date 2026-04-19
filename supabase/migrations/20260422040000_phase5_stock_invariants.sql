-- Phase 5 — Invariant enforcement on stock_movements.
--
-- Runs BEFORE INSERT on each row. Two responsibilities:
--   1. Acquire a per-(campaign, sku, from_entity) advisory lock held for the
--      current transaction. This serialises concurrent writes that would
--      otherwise double-spend the same from-entity balance — see draft D-026.
--   2. Validate that the from-entity has enough balance to cover `quantity`.
--      Warehouse is the only exception (infinite source; planning value in
--      `skus.stock_allocated` is informational per draft D-022).
--
-- Why BEFORE INSERT, not AFTER INSERT:
--   MVCC lets two concurrent AFTER-INSERT triggers each observe a pre-commit
--   balance that EXCLUDES the other's pending row. BEFORE INSERT combined
--   with the advisory lock serialises both transactions through a single
--   read-validate-insert critical section. The lock persists to commit, so
--   a peer transaction blocks until the first either commits or rolls back.
--
-- SECURITY DEFINER: the validation SELECT must see every movement touching
-- the from-entity regardless of the caller's RLS. Migrations run as the
-- superuser `postgres`, which has BYPASSRLS, so the internal SELECT reads
-- all rows and produces the true balance. Callers still cannot escalate
-- privileges because the function's only side-effect is RAISE/RETURN.

-- ============================================================================
-- Validator function
-- ============================================================================
create or replace function public.stock_movements_validate_invariants()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  from_balance bigint;
  lock_key     bigint;
begin
  -- Step 1 — advisory lock on (campaign, sku, from_entity_type, from_entity_id).
  -- NULL (warehouse/consumer) is mapped to a stable sentinel string so the
  -- hash is deterministic.
  lock_key := hashtextextended(
    new.campaign_id::text
      || '|' || new.sku_id::text
      || '|' || new.from_entity_type::text
      || '|' || coalesce(new.from_entity_id::text, '00000000-0000-0000-0000-000000000000'),
    0
  );
  perform pg_advisory_xact_lock(lock_key);

  -- Step 2 — warehouse is infinite; no from-balance check.
  if new.from_entity_type = 'warehouse' then
    return new;
  end if;

  -- Step 3 — compute from-entity's balance from already-committed movements.
  -- Inflow rows add, outflow rows subtract; the mutually-exclusive CASE is
  -- safe because the self-loop CHECK on stock_movements forbids from == to
  -- within a single row.
  select coalesce(sum(
      case
        when sm.to_entity_type = new.from_entity_type
         and sm.to_entity_id is not distinct from new.from_entity_id
         then  sm.quantity
        when sm.from_entity_type = new.from_entity_type
         and sm.from_entity_id is not distinct from new.from_entity_id
         then -sm.quantity
        else 0
      end
    ), 0)
    into from_balance
  from public.stock_movements sm
  where sm.campaign_id = new.campaign_id
    and sm.sku_id = new.sku_id
    and (
      (sm.to_entity_type   = new.from_entity_type
         and sm.to_entity_id   is not distinct from new.from_entity_id)
      or (sm.from_entity_type = new.from_entity_type
         and sm.from_entity_id is not distinct from new.from_entity_id)
    );

  if from_balance < new.quantity then
    raise exception
      'stock invariant violation: %/% has balance % but attempted to transfer % (movement_kind=%, campaign=%, sku=%)',
      new.from_entity_type, coalesce(new.from_entity_id::text, '(null)'),
      from_balance, new.quantity,
      new.movement_kind, new.campaign_id, new.sku_id
      using errcode = '23514';  -- check_violation
  end if;

  return new;
end;
$$;

-- ============================================================================
-- Trigger registration
-- ============================================================================
create trigger stock_movements_validate_invariants_trg
  before insert on public.stock_movements
  for each row execute function public.stock_movements_validate_invariants();
