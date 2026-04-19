-- Phase 5 — RPCs for multi-row stock operations.
--
-- Two operations cannot be safely expressed as a single INSERT:
--
--   1. reallocate_stock — supervisor↔supervisor / location↔location transfer.
--      A reallocation is a single ledger row (from→to captures both sides of
--      the transfer; the stock_balances view credits both entities from the
--      one row). The RPC exists so it can be wrapped as a single SECURITY
--      DEFINER transaction alongside an advisory lock on BOTH the from and
--      the to entity, which the BEFORE INSERT trigger only acquires on the
--      from side. Reallocations between supervisors are the one place a peer
--      could observe a stale balance on the RECEIVER during a concurrent
--      distribution; locking both ends closes that hole.
--
--   2. correct_stock_movement — D-008 compensating entry.
--      A correction inserts TWO rows atomically:
--        a. Reversal — swaps from↔to of the original, same quantity.
--        b. Corrected restatement — same direction as the original, new
--           quantity (or same quantity with a different attribute, encoded
--           via the reason field).
--      Both rows carry `movement_kind = 'correction'` and
--      `correction_of = <original.id>`. If either fails, neither commits.
--
-- Authorisation is enforced INSIDE each function body before inserting,
-- because SECURITY DEFINER bypasses the RLS policies on stock_movements.
-- The INSERTs still go through the BEFORE INSERT invariant trigger — that
-- is a separate SECURITY DEFINER function that reads the ledger via SUM(),
-- so it sees the true balance irrespective of RLS.
--
-- Idempotency (D-009):
--   - reallocate: single row → the caller's idempotency_key maps 1:1 onto
--     stock_movements.idempotency_key. A duplicate call finds the prior row
--     via the UNIQUE index and returns its id.
--   - correct: two rows with the same client-supplied key would violate the
--     UNIQUE index. The reversal row uses the caller's key directly; the
--     corrected row uses `uuid_generate_v5(caller_key, 'corrected')`, which
--     is deterministic, so replays resolve cleanly.

-- ============================================================================
-- Helper: derive a deterministic secondary idempotency key.
--   Postgres ships with gen_random_uuid() but not uuid_generate_v5() unless
--   the uuid-ossp extension is loaded. Phase 1 already installs uuid-ossp;
--   we double-check with a create extension if not exists to stay safe.
-- ============================================================================
create extension if not exists "uuid-ossp";

-- ============================================================================
-- 1. reallocate_stock
-- ============================================================================
create or replace function public.reallocate_stock(
  p_campaign_id        uuid,
  p_sku_id             uuid,
  p_from_entity_type   public.stock_entity_type,
  p_from_entity_id     uuid,
  p_to_entity_type     public.stock_entity_type,
  p_to_entity_id       uuid,
  p_quantity           integer,
  p_user_id            uuid,
  p_location_id        uuid,
  p_reason             text,
  p_idempotency_key    uuid
) returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor_role   public.user_role;
  v_actor_active boolean;
  v_locations    uuid[];
  v_group_id     uuid;
  v_movement_id  uuid;
  v_to_lock_key  bigint;
begin
  -- ------------------------------------------------------------------
  -- Authorization: admin always allowed; supervisor allowed when the
  -- from-side is themselves (supervisor↔supervisor) or an assigned
  -- location (location↔location).
  -- ------------------------------------------------------------------
  select p.role, p.active, coalesce(p.assigned_locations, '{}'::uuid[])
    into v_actor_role, v_actor_active, v_locations
  from public.profiles p
  where p.id = p_user_id;

  if v_actor_role is null or v_actor_active is not true then
    raise exception 'reallocate_stock: unknown or inactive user %', p_user_id
      using errcode = '42501';
  end if;

  if v_actor_role not in ('admin', 'supervisor') then
    raise exception 'reallocate_stock: role % is not permitted', v_actor_role
      using errcode = '42501';
  end if;

  if v_actor_role = 'supervisor' then
    if p_from_entity_type = 'supervisor' then
      if p_from_entity_id <> p_user_id then
        raise exception 'reallocate_stock: supervisor may only reallocate from themselves'
          using errcode = '42501';
      end if;
    elsif p_from_entity_type = 'location' then
      if not (p_from_entity_id = any (v_locations)) then
        raise exception 'reallocate_stock: supervisor is not assigned to from-location %', p_from_entity_id
          using errcode = '42501';
      end if;
      if p_to_entity_type = 'location' and not (p_to_entity_id = any (v_locations)) then
        raise exception 'reallocate_stock: supervisor is not assigned to to-location %', p_to_entity_id
          using errcode = '42501';
      end if;
    else
      raise exception 'reallocate_stock: from_entity_type % is not reallocatable', p_from_entity_type
        using errcode = '22023';
    end if;
  end if;

  -- ------------------------------------------------------------------
  -- Idempotency read-through BEFORE any lock — a replay returns fast.
  -- ------------------------------------------------------------------
  select id into v_movement_id
  from public.stock_movements
  where idempotency_key = p_idempotency_key;
  if found then
    return v_movement_id;
  end if;

  -- ------------------------------------------------------------------
  -- Extra lock on the TO side.  The BEFORE INSERT trigger locks the FROM
  -- side; reallocations are the one kind where the TO side also sees
  -- balance-affecting writes serialised through a concurrent distribution,
  -- so we lock it here to keep peer observations consistent.
  -- ------------------------------------------------------------------
  v_to_lock_key := hashtextextended(
    p_campaign_id::text
      || '|' || p_sku_id::text
      || '|' || p_to_entity_type::text
      || '|' || coalesce(p_to_entity_id::text, '00000000-0000-0000-0000-000000000000'),
    0
  );
  perform pg_advisory_xact_lock(v_to_lock_key);

  -- ------------------------------------------------------------------
  -- Insert the single reallocation row. Shape checks, kind-pair check,
  -- and the balance invariant are all enforced by table constraints and
  -- the BEFORE INSERT trigger. A failure there propagates out and rolls
  -- back the transaction.
  -- ------------------------------------------------------------------
  v_group_id := gen_random_uuid();

  insert into public.stock_movements (
    campaign_id, sku_id,
    from_entity_type, from_entity_id,
    to_entity_type,   to_entity_id,
    quantity, movement_kind,
    user_id, location_id,
    reason, idempotency_key,
    reallocation_group_id
  ) values (
    p_campaign_id, p_sku_id,
    p_from_entity_type, p_from_entity_id,
    p_to_entity_type,   p_to_entity_id,
    p_quantity, 'reallocation',
    p_user_id, p_location_id,
    p_reason, p_idempotency_key,
    v_group_id
  )
  returning id into v_movement_id;

  return v_movement_id;
exception
  when unique_violation then
    -- A concurrent retry landed the idempotency row first.  Resolve by
    -- reading the peer's id and returning it.
    select id into v_movement_id
    from public.stock_movements
    where idempotency_key = p_idempotency_key;
    if found then
      return v_movement_id;
    end if;
    raise;
end;
$$;

comment on function public.reallocate_stock(
  uuid, uuid, public.stock_entity_type, uuid, public.stock_entity_type, uuid,
  integer, uuid, uuid, text, uuid
) is
  'Atomic single-row reallocation (supervisor↔supervisor or location↔location). '
  'SECURITY DEFINER: enforces role + location authz in-body, delegates invariants '
  'to the stock_movements BEFORE INSERT trigger. D-009 idempotency applied.';

revoke all on function public.reallocate_stock(
  uuid, uuid, public.stock_entity_type, uuid, public.stock_entity_type, uuid,
  integer, uuid, uuid, text, uuid
) from public, anon;
grant execute on function public.reallocate_stock(
  uuid, uuid, public.stock_entity_type, uuid, public.stock_entity_type, uuid,
  integer, uuid, uuid, text, uuid
) to authenticated;

-- ============================================================================
-- 2. correct_stock_movement  (D-008)
--
-- Inserts two rows in the same transaction:
--   a. Reversal:        from = original.to, to = original.from, qty = original.qty
--   b. Corrected repost: from = original.from, to = original.to, qty = p_new_quantity
--
-- Both rows carry movement_kind='correction' and correction_of=p_original_movement_id.
-- Kind-pair constraints on stock_movements are intentionally OPEN for
-- 'correction', so arbitrary entity shapes mirror the original row.
--
-- Authorization: admin only.  Corrections touch the ledger's history
-- (they leave a new row but visibly alter running totals for all prior
-- queries), so the scope of who can do this is deliberately narrow —
-- D-008 and the platform audit posture both assume an admin-initiated
-- review workflow, not self-service.
--
-- Idempotency: p_idempotency_key is used on the reversal row. The
-- corrected row derives its key as uuid_generate_v5(p_idempotency_key,
-- 'corrected') — deterministic across retries; the UNIQUE-index replay
-- path resolves both rows to the prior committed pair.
-- ============================================================================
create or replace function public.correct_stock_movement(
  p_original_movement_id  uuid,
  p_new_quantity          integer,
  p_user_id               uuid,
  p_reason                text,
  p_idempotency_key       uuid
) returns uuid[]  -- [reversal_id, corrected_id]
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor_role      public.user_role;
  v_actor_active    boolean;
  v_original        public.stock_movements%rowtype;
  v_corrected_key   uuid;
  v_reversal_id     uuid;
  v_corrected_id    uuid;
begin
  -- ------------------------------------------------------------------
  -- Authorization: admin only.
  -- ------------------------------------------------------------------
  select p.role, p.active
    into v_actor_role, v_actor_active
  from public.profiles p
  where p.id = p_user_id;

  if v_actor_role is null or v_actor_active is not true then
    raise exception 'correct_stock_movement: unknown or inactive user %', p_user_id
      using errcode = '42501';
  end if;
  if v_actor_role <> 'admin' then
    raise exception 'correct_stock_movement: role % is not permitted (admin only)', v_actor_role
      using errcode = '42501';
  end if;

  if p_new_quantity is null or p_new_quantity <= 0 then
    raise exception 'correct_stock_movement: p_new_quantity must be > 0, got %', p_new_quantity
      using errcode = '22023';
  end if;

  -- ------------------------------------------------------------------
  -- Idempotency read-through.  Because a correction inserts two rows we
  -- need to find the PAIR, not just one.  The reversal carries the
  -- caller's key directly.
  -- ------------------------------------------------------------------
  v_corrected_key := uuid_generate_v5(p_idempotency_key, 'corrected');

  select id into v_reversal_id
  from public.stock_movements
  where idempotency_key = p_idempotency_key;

  if found then
    select id into v_corrected_id
    from public.stock_movements
    where idempotency_key = v_corrected_key;
    if not found then
      raise exception 'correct_stock_movement: idempotency partial row detected (reversal=% but no corrected row)', v_reversal_id
        using errcode = '40002';
    end if;
    return array[v_reversal_id, v_corrected_id];
  end if;

  -- ------------------------------------------------------------------
  -- Load the original.
  -- ------------------------------------------------------------------
  select * into v_original
  from public.stock_movements
  where id = p_original_movement_id;
  if not found then
    raise exception 'correct_stock_movement: original movement % not found', p_original_movement_id
      using errcode = '23503';
  end if;
  if v_original.movement_kind = 'correction' then
    raise exception 'correct_stock_movement: cannot correct a correction row (original=%); correct the underlying movement instead', p_original_movement_id
      using errcode = '22023';
  end if;

  -- ------------------------------------------------------------------
  -- Row 1 — reversal. Swap from↔to; copy the original quantity.
  -- The invariant trigger will verify the reversal's from-side has
  -- enough balance to cover; if the corrected amount was already spent
  -- downstream, the reversal is blocked and the admin must first unwind
  -- downstream movements (the D-008 escape hatch).
  -- ------------------------------------------------------------------
  insert into public.stock_movements (
    campaign_id, sku_id,
    from_entity_type, from_entity_id,
    to_entity_type,   to_entity_id,
    quantity, movement_kind,
    user_id, location_id,
    reason, idempotency_key,
    correction_of
  ) values (
    v_original.campaign_id, v_original.sku_id,
    v_original.to_entity_type,   v_original.to_entity_id,
    v_original.from_entity_type, v_original.from_entity_id,
    v_original.quantity, 'correction',
    p_user_id, v_original.location_id,
    coalesce(p_reason, 'reversal of ' || p_original_movement_id::text),
    p_idempotency_key,
    p_original_movement_id
  )
  returning id into v_reversal_id;

  -- ------------------------------------------------------------------
  -- Row 2 — corrected restatement. Same direction as the original, new
  -- quantity. Invariant trigger re-verifies the from-side balance on the
  -- post-reversal state, so a corrected qty that exceeds available stock
  -- will be blocked exactly as the original would have been.
  -- ------------------------------------------------------------------
  insert into public.stock_movements (
    campaign_id, sku_id,
    from_entity_type, from_entity_id,
    to_entity_type,   to_entity_id,
    quantity, movement_kind,
    user_id, location_id,
    reason, idempotency_key,
    correction_of
  ) values (
    v_original.campaign_id, v_original.sku_id,
    v_original.from_entity_type, v_original.from_entity_id,
    v_original.to_entity_type,   v_original.to_entity_id,
    p_new_quantity, 'correction',
    p_user_id, v_original.location_id,
    coalesce(p_reason, 'corrected restatement of ' || p_original_movement_id::text),
    v_corrected_key,
    p_original_movement_id
  )
  returning id into v_corrected_id;

  return array[v_reversal_id, v_corrected_id];
exception
  when unique_violation then
    -- Concurrent retry race on either key.  Re-read the pair and return.
    select id into v_reversal_id
    from public.stock_movements where idempotency_key = p_idempotency_key;
    select id into v_corrected_id
    from public.stock_movements where idempotency_key = v_corrected_key;
    if v_reversal_id is not null and v_corrected_id is not null then
      return array[v_reversal_id, v_corrected_id];
    end if;
    raise;
end;
$$;

comment on function public.correct_stock_movement(uuid, integer, uuid, text, uuid) is
  'Atomic two-row correction (D-008): reversal + corrected restatement '
  'inserted in one transaction, both pointing at the original via '
  'correction_of. Admin-only (SECURITY DEFINER).';

revoke all on function public.correct_stock_movement(uuid, integer, uuid, text, uuid)
  from public, anon;
grant execute on function public.correct_stock_movement(uuid, integer, uuid, text, uuid)
  to authenticated;
