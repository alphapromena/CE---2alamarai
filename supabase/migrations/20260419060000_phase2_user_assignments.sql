-- Phase 2 — user_assignments (D-018: source of truth for who works where).
--
-- Application code MUST write only here. A row trigger keeps
-- profiles.assigned_locations exactly equal to the distinct set of location_ids
-- where (user_id, *) has active = true. The denormalised array is preserved as
-- the read path Phase 3 attendance queries use, served by the existing GIN
-- index on profiles.assigned_locations.

-- ============================================================================
-- 1. user_assignments
--    role_scope: which role this user fills at this assignment. CHECK restricts
--    to promoter|supervisor — admin/client can never appear here.
--    starts_on / ends_on: optional date bounds (planning ahead / soft expiry).
--    A partial unique index prevents two ACTIVE assignments for the same
--    (user, location, shift) combination at once. Inactive history is kept.
-- ============================================================================
create table public.user_assignments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  location_id   uuid not null references public.locations (id) on delete restrict,
  shift_id      uuid references public.shifts (id) on delete set null,
  role_scope    public.user_role not null
                check (role_scope in ('promoter', 'supervisor')),
  starts_on     date,
  ends_on       date,
  active        boolean not null default true,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint user_assignments_date_range_check
    check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

-- Partial unique index: at most one active row per (user, location, shift).
-- COALESCE folds NULL shift_id into the all-zero uuid so it participates in
-- the index's distinctness without a multi-column NULL gotcha.
create unique index user_assignments_unique_active_idx
  on public.user_assignments (user_id, location_id, coalesce(shift_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where active = true;

create index user_assignments_user_idx     on public.user_assignments (user_id);
create index user_assignments_location_idx on public.user_assignments (location_id);
create index user_assignments_shift_idx    on public.user_assignments (shift_id);
create index user_assignments_active_idx   on public.user_assignments (active);

create trigger user_assignments_set_updated_at
  before update on public.user_assignments
  for each row execute function public.set_updated_at();

alter table public.user_assignments enable row level security;

grant select, insert, update, delete on public.user_assignments to authenticated;

-- ============================================================================
-- 2. Sync trigger: keep profiles.assigned_locations equal to the distinct set
--    of active assignment location_ids for the affected user(s).
--
-- Implementation note: the trigger uses SECURITY DEFINER + LOCK on the affected
-- profile row to serialise concurrent writers, since two parallel transactions
-- could otherwise compute stale snapshots.
-- ============================================================================
create or replace function public.sync_assigned_locations(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  new_set uuid[];
begin
  if p_user_id is null then
    return;
  end if;

  -- Lock the affected profile row for the duration of the transaction.
  perform 1 from public.profiles where id = p_user_id for update;

  select coalesce(array_agg(distinct ua.location_id order by ua.location_id), '{}'::uuid[])
    into new_set
  from public.user_assignments ua
  where ua.user_id = p_user_id
    and ua.active = true;

  update public.profiles
     set assigned_locations = new_set
   where id = p_user_id
     and assigned_locations is distinct from new_set;
end;
$$;

create or replace function public.user_assignments_sync_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    perform public.sync_assigned_locations(new.user_id);
    return new;
  elsif tg_op = 'UPDATE' then
    perform public.sync_assigned_locations(new.user_id);
    if old.user_id is distinct from new.user_id then
      perform public.sync_assigned_locations(old.user_id);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    perform public.sync_assigned_locations(old.user_id);
    return old;
  end if;
  return null;
end;
$$;

create trigger user_assignments_sync_trg
  after insert or update or delete on public.user_assignments
  for each row execute function public.user_assignments_sync_trigger();

-- ============================================================================
-- 3. current_user_locations() helper — used by RLS policies in 0009.
--    Returns the calling user's set of currently-assigned location ids.
--    Reads the cached array from profiles (cheap, GIN-indexed) rather than
--    re-aggregating user_assignments on every policy check.
-- ============================================================================
create or replace function public.current_user_locations()
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select coalesce(assigned_locations, '{}'::uuid[])
  from public.profiles
  where id = auth.uid() and active = true;
$$;

grant execute on function public.current_user_locations() to authenticated;
