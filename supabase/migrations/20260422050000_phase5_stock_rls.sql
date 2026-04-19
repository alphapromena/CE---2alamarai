-- Phase 5 — RLS policies for stock_movements + stock_reconciliations.
--
-- Visibility model:
--   admin       — full read/write on both tables
--   supervisor  — reads movements touching themselves, their assigned
--                 locations, or their assigned promoters (via the
--                 current_supervisor_visible_promoter_ids helper). Writes
--                 movements where they are the executing user and the from
--                 side is themselves or one of their locations.
--   promoter    — reads movements where they are the from or to entity.
--                 Writes only movements with from = self (returns + usage).
--   client      — no access (aggregate rollups come in Phase 8, D-019 #3).
--
-- A supervisor needs to see every movement affecting a promoter under them
-- so the `stock_balances` view produces correct per-promoter figures. That's
-- the purpose of current_supervisor_visible_promoter_ids.

-- ============================================================================
-- 1. Helper — promoters at the caller's assigned locations.
-- ============================================================================
create or replace function public.current_supervisor_visible_promoter_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select coalesce(array_agg(distinct p.id), '{}'::uuid[])
  from public.profiles p
  join public.user_assignments ua on ua.user_id = p.id
  where p.role = 'promoter'
    and p.active = true
    and ua.active = true
    and ua.location_id = any (public.current_user_locations());
$$;

grant execute on function public.current_supervisor_visible_promoter_ids() to authenticated;

-- ============================================================================
-- 2. stock_movements policies
-- ============================================================================

-- ---------- SELECT ----------
create policy stock_movements_select_admin
  on public.stock_movements for select to authenticated
  using (public.is_admin());

create policy stock_movements_select_self_involved
  on public.stock_movements for select to authenticated
  using (
    from_entity_id = auth.uid()
    or to_entity_id = auth.uid()
    or user_id = auth.uid()
  );

create policy stock_movements_select_supervisor_scope
  on public.stock_movements for select to authenticated
  using (
    public.current_role() = 'supervisor'
    and (
      (location_id is not null and location_id = any (public.current_user_locations()))
      or (from_entity_type = 'promoter'
            and from_entity_id = any (public.current_supervisor_visible_promoter_ids()))
      or (to_entity_type = 'promoter'
            and to_entity_id = any (public.current_supervisor_visible_promoter_ids()))
      or (from_entity_type = 'location'
            and from_entity_id = any (public.current_user_locations()))
      or (to_entity_type = 'location'
            and to_entity_id = any (public.current_user_locations()))
    )
  );

-- ---------- INSERT ----------
-- Admin can insert any kind (allocations, corrections, admin-triggered
-- reconciling returns, etc).
create policy stock_movements_insert_admin
  on public.stock_movements for insert to authenticated
  with check (public.is_admin());

-- Supervisor inserts distributions, reallocations, and returns-to-warehouse
-- that they themselves are executing. The from-side must be them personally
-- or one of their assigned locations. Business rules (e.g. D-025 inter-
-- supervisor reallocation approval) are enforced in the Server Action layer
-- on top of this RLS gate.
create policy stock_movements_insert_supervisor
  on public.stock_movements for insert to authenticated
  with check (
    public.current_role() = 'supervisor'
    and user_id = auth.uid()
    and (
      (from_entity_type = 'supervisor' and from_entity_id = auth.uid())
      or (from_entity_type = 'location'
            and from_entity_id = any (public.current_user_locations()))
    )
  );

-- Promoter inserts returns-to-supervisor. Usage movements land here too if a
-- Server Action invokes INSERT under the promoter's JWT; the daily-report
-- auto-logger (draft D-024) may instead call a SECURITY DEFINER RPC — either
-- way this policy admits only from=self rows.
create policy stock_movements_insert_promoter
  on public.stock_movements for insert to authenticated
  with check (
    public.current_role() = 'promoter'
    and user_id = auth.uid()
    and from_entity_type = 'promoter'
    and from_entity_id = auth.uid()
  );

-- No UPDATE or DELETE policies — the immutability triggers reject those
-- operations at the row level for every role (incl. service role).

-- ============================================================================
-- 3. stock_reconciliations policies
-- ============================================================================

-- ---------- SELECT ----------
create policy stock_reconciliations_select_admin
  on public.stock_reconciliations for select to authenticated
  using (public.is_admin());

create policy stock_reconciliations_select_supervisor
  on public.stock_reconciliations for select to authenticated
  using (
    public.current_role() = 'supervisor'
    and (
      (scope = 'supervisor' and entity_id = auth.uid())
      or (scope = 'location' and entity_id = any (public.current_user_locations()))
    )
  );

-- ---------- INSERT ----------
create policy stock_reconciliations_insert_admin
  on public.stock_reconciliations for insert to authenticated
  with check (public.is_admin() and reconciled_by = auth.uid());

create policy stock_reconciliations_insert_supervisor
  on public.stock_reconciliations for insert to authenticated
  with check (
    public.current_role() = 'supervisor'
    and reconciled_by = auth.uid()
    and (
      (scope = 'supervisor' and entity_id = auth.uid())
      or (scope = 'location' and entity_id = any (public.current_user_locations()))
    )
  );

-- No UPDATE/DELETE policies — append-only triggers reject for every role.
