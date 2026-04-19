-- Phase 2 — Clients (tenant root) + profiles.client_id + tenant CHECK
-- Implements D-016: a single-FK tenant model with CHECK enforcing
--   client_id IS NOT NULL  iff  role = 'client'.
-- RLS is enabled on clients with policies added in migration 0009.

-- ============================================================================
-- 1. clients table
--    name        – internal English/admin label, plain text (always present)
--    name_i18n   – {ar, en} JSONB displayed to client users (optional override)
-- ============================================================================
create table public.clients (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(btrim(name)) > 0),
  name_i18n       jsonb not null default '{}'::jsonb
                  check (jsonb_typeof(name_i18n) = 'object'),
  contact_email   text check (contact_email is null or contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  contact_phone   text,
  active          boolean not null default true,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index clients_name_unique_idx on public.clients (lower(name));
create index clients_active_idx on public.clients (active);

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

alter table public.clients enable row level security;

-- ============================================================================
-- 2. profiles.client_id + tenant CHECK
-- ============================================================================
alter table public.profiles
  add column client_id uuid references public.clients (id) on delete restrict;

-- A client user MUST belong to a tenant; an internal user MUST NOT.
alter table public.profiles
  add constraint profiles_client_id_role_check
  check (
    (role = 'client' and client_id is not null)
    or (role <> 'client' and client_id is null)
  );

create index profiles_client_id_idx on public.profiles (client_id) where client_id is not null;

-- ============================================================================
-- 3. handle_new_user must set client_id when role='client' is invited
--    The invite flow packs client_id into raw_user_meta_data; the trigger
--    promotes it. CHECK above ensures we never end up with a tenant-less
--    client row.
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  meta_role         text;
  resolved_role     public.user_role;
  meta_client_id    uuid;
  resolved_client   uuid;
begin
  meta_role := nullif(new.raw_user_meta_data->>'role', '');

  if meta_role is null then
    resolved_role := 'promoter';
  elsif meta_role not in ('admin', 'supervisor', 'promoter', 'client') then
    resolved_role := 'promoter';
  else
    resolved_role := meta_role::public.user_role;
  end if;

  meta_client_id := nullif(new.raw_user_meta_data->>'client_id', '')::uuid;
  if resolved_role = 'client' then
    resolved_client := meta_client_id;  -- CHECK will reject NULL below
  else
    resolved_client := null;            -- CHECK rejects non-null for non-clients
  end if;

  insert into public.profiles (
    id,
    role,
    full_name,
    preferred_language,
    client_id,
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
    resolved_client,
    nullif(new.raw_user_meta_data->>'invited_by', '')::uuid
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ============================================================================
-- 4. Self-update guard: client_id is admin-only (extends Phase 1 guard)
-- ============================================================================
create or replace function public.profiles_self_update_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if public.is_admin() then
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

-- ============================================================================
-- 5. current_client_id() helper — returns the calling user's tenant.
--    Returns NULL for internal users (admin/supervisor/promoter); RLS policies
--    treat that as "match no rows" via standard NULL-comparison semantics.
-- ============================================================================
create or replace function public.current_client_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select client_id
  from public.profiles
  where id = auth.uid() and active = true;
$$;

grant execute on function public.current_client_id() to authenticated;
grant select, insert, update, delete on public.clients to authenticated;
