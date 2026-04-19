-- Phase 1 — Auth & User Management
-- Creates: user_role enum, profiles, audit_log, helper functions, RLS, triggers.
-- RLS is enabled on every new table. No USING (true) policies anywhere.

-- ============================================================================
-- 1. Role enum
-- ============================================================================
create type public.user_role as enum ('admin', 'supervisor', 'promoter', 'client');

-- ============================================================================
-- 2. profiles table
-- ============================================================================
create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  role                public.user_role not null default 'promoter',
  full_name           text not null check (length(btrim(full_name)) > 0),
  phone               text,
  preferred_language  text not null default 'en' check (preferred_language in ('ar', 'en')),
  assigned_locations  uuid[] not null default '{}',
  active              boolean not null default true,
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role);
create index profiles_active_idx on public.profiles (active);
create index profiles_assigned_locations_gin_idx on public.profiles using gin (assigned_locations);

-- updated_at maintenance
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 3. Authorization helpers (SECURITY DEFINER, bypass RLS to read profiles)
--    search_path locked to prevent function-hijacking attacks.
-- ============================================================================
create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select role
  from public.profiles
  where id = auth.uid() and active = true;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active = true
  );
$$;

create or replace function public.is_active()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active = true
  );
$$;

-- ============================================================================
-- 4. profiles RLS
-- ============================================================================
alter table public.profiles enable row level security;

-- SELECT: self OR admin
create policy profiles_select_self
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy profiles_select_admin
  on public.profiles for select
  to authenticated
  using (public.is_admin());

-- UPDATE: self (guarded by trigger below) OR admin
create policy profiles_update_self
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_update_admin
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- INSERT: admin only (trigger handle_new_user runs as SECURITY DEFINER and bypasses RLS)
create policy profiles_insert_admin
  on public.profiles for insert
  to authenticated
  with check (public.is_admin());

-- DELETE: admin only (cascade from auth.users handles user deletion)
create policy profiles_delete_admin
  on public.profiles for delete
  to authenticated
  using (public.is_admin());

-- Self-update guard: a non-admin self-updating cannot change sensitive columns.
create or replace function public.profiles_self_update_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  -- Admins bypass this guard
  if public.is_admin() then
    return new;
  end if;

  -- Self-edit only: protect sensitive fields
  if new.role is distinct from old.role then
    raise exception 'profiles: only admins may change role';
  end if;
  if new.active is distinct from old.active then
    raise exception 'profiles: only admins may change active';
  end if;
  if new.assigned_locations is distinct from old.assigned_locations then
    raise exception 'profiles: only admins may change assigned_locations';
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

create trigger profiles_self_update_guard_trg
  before update on public.profiles
  for each row execute function public.profiles_self_update_guard();

-- ============================================================================
-- 5. audit_log table — append-only
-- ============================================================================
create table public.audit_log (
  id           bigint generated always as identity primary key,
  actor_id     uuid references auth.users (id) on delete set null,
  action       text not null check (length(btrim(action)) > 0),
  entity       text not null check (length(btrim(entity)) > 0),
  entity_id    text,
  before_json  jsonb,
  after_json   jsonb,
  ip           inet,
  user_agent   text,
  ts           timestamptz not null default now()
);

create index audit_log_actor_ts_idx on public.audit_log (actor_id, ts desc);
create index audit_log_entity_idx   on public.audit_log (entity, entity_id);
create index audit_log_ts_idx       on public.audit_log (ts desc);

alter table public.audit_log enable row level security;

-- SELECT: admin only
create policy audit_log_select_admin
  on public.audit_log for select
  to authenticated
  using (public.is_admin());

-- INSERT: authenticated user can log their own events; admin can log anything.
-- (Server-side code calling via the service role key bypasses RLS entirely.)
create policy audit_log_insert_self_or_admin
  on public.audit_log for insert
  to authenticated
  with check (actor_id = auth.uid() or public.is_admin());

-- No UPDATE or DELETE policies => implicit deny.
-- Trigger enforces append-only even for the table owner and service role.
create or replace function public.audit_log_deny_modification()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log is append-only: % is not allowed', tg_op;
end;
$$;

create trigger audit_log_no_update
  before update on public.audit_log
  for each row execute function public.audit_log_deny_modification();

create trigger audit_log_no_delete
  before delete on public.audit_log
  for each row execute function public.audit_log_deny_modification();

revoke update, delete on public.audit_log from public, anon, authenticated;

-- ============================================================================
-- 6. handle_new_user: materialise profiles row when auth.users row is inserted.
--    Invite flow (admin.inviteUserByEmail) stamps full_name/role/preferred_language
--    into raw_user_meta_data. This trigger promotes them into the profiles row.
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  meta_role text;
  resolved_role public.user_role;
begin
  meta_role := nullif(new.raw_user_meta_data->>'role', '');

  if meta_role is null then
    resolved_role := 'promoter';
  elsif meta_role not in ('admin', 'supervisor', 'promoter', 'client') then
    -- Defensive: unknown role in metadata falls back to the safest default.
    resolved_role := 'promoter';
  else
    resolved_role := meta_role::public.user_role;
  end if;

  insert into public.profiles (
    id,
    role,
    full_name,
    preferred_language,
    created_by
  )
  values (
    new.id,
    resolved_role,
    coalesce(
      nullif(new.raw_user_meta_data->>'full_name', ''),
      split_part(coalesce(new.email, ''), '@', 1),
      'User'
    ),
    case
      when nullif(new.raw_user_meta_data->>'preferred_language', '') in ('ar', 'en')
        then new.raw_user_meta_data->>'preferred_language'
      else 'en'
    end,
    nullif(new.raw_user_meta_data->>'invited_by', '')::uuid
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- 7. Grants — authenticated role needs table access; RLS policies still apply.
-- ============================================================================
grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert on public.audit_log to authenticated;

grant execute on function public.current_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active() to authenticated;
