-- Phase 2 — Patch profiles_self_update_guard for the user_assignments sync trigger.
--
-- Problem: the sync trigger added in migration 0008 calls UPDATE on
-- public.profiles to maintain the assigned_locations cache. That UPDATE
-- re-fires the Phase 1 self-update guard. When the change originates from a
-- service-role server action, auth.uid() is NULL, is_admin() is false, and
-- the guard rejects the change.
--
-- Fix: allow assigned_locations to change when (and only when) the update is
-- happening inside a nested trigger (pg_trigger_depth() > 1) AND no other
-- column has been touched in the same row update. Direct admin updates still
-- pass via the existing is_admin() early-return.
--
-- This keeps the original invariant for non-admin direct updates intact: a
-- promoter cannot still self-update assigned_locations from the application —
-- the only path that bypasses this branch is a trigger-driven sync.

create or replace function public.profiles_self_update_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  is_trigger_sync boolean;
begin
  if public.is_admin() then
    return new;
  end if;

  -- Detect a trigger-driven assigned_locations sync: nested trigger call where
  -- only assigned_locations differs from the prior row.
  is_trigger_sync := (
    pg_trigger_depth() > 1
    and new.assigned_locations is distinct from old.assigned_locations
    and new.id = old.id
    and new.role = old.role
    and new.active = old.active
    and new.full_name = old.full_name
    and new.preferred_language = old.preferred_language
    and new.phone is not distinct from old.phone
    and new.client_id is not distinct from old.client_id
    and new.created_by is not distinct from old.created_by
  );

  if is_trigger_sync then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'profiles: only admins may change role';
  end if;
  if new.active is distinct from old.active then
    raise exception 'profiles: only admins may change active';
  end if;
  if new.assigned_locations is distinct from old.assigned_locations then
    raise exception 'profiles: only admins may change assigned_locations';
  end if;
  if new.client_id is distinct from old.client_id then
    raise exception 'profiles: only admins may change client_id';
  end if;
  if new.created_by is distinct from old.created_by then
    raise exception 'profiles: created_by is immutable';
  end if;
  if new.id is distinct from old.id then
    raise exception 'profiles: id is immutable';
  end if;

  return new;
end;
$$;
