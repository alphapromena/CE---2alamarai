-- Phase 2 — Locations + element-level FK trigger for profiles.assigned_locations
-- Locations are the unit of attendance + sales; geo data is captured for the
-- Phase 3 geofence validation Edge Function.
--
-- D-015 follow-up: Phase 1 shipped profiles.assigned_locations uuid[] with no
-- per-element FK. This migration adds the trigger that validates each element
-- against locations.id on INSERT and UPDATE — Postgres lacks per-element array
-- foreign keys, so a trigger is the only option.

-- ============================================================================
-- 1. locations
--    name_i18n: bilingual display name (ar+en required)
--    lat/lng:   WGS84 decimal degrees (CHECK keeps them in valid ranges)
--    geofence_radius_m: in metres; default 100m matches indoor retail tolerance
-- ============================================================================
create table public.locations (
  id                  uuid primary key default gen_random_uuid(),
  city_id             uuid not null references public.cities (id) on delete restrict,
  name_i18n           jsonb not null
                      check (
                        jsonb_typeof(name_i18n) = 'object'
                        and length(btrim(coalesce(name_i18n->>'en', ''))) > 0
                        and length(btrim(coalesce(name_i18n->>'ar', ''))) > 0
                      ),
  address             text,
  lat                 double precision not null check (lat between -90 and 90),
  lng                 double precision not null check (lng between -180 and 180),
  geofence_radius_m   integer not null default 100 check (geofence_radius_m between 10 and 5000),
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index locations_city_name_unique_idx
  on public.locations (city_id, lower(name_i18n->>'en'));
create index locations_city_id_idx on public.locations (city_id);
create index locations_active_idx on public.locations (active);

create trigger locations_set_updated_at
  before update on public.locations
  for each row execute function public.set_updated_at();

alter table public.locations enable row level security;

grant select, insert, update, delete on public.locations to authenticated;

-- ============================================================================
-- 2. profiles.assigned_locations element-FK trigger (D-015 promise kept)
--
-- Validates that every uuid in the assigned_locations array points to an
-- existing locations.id. Runs only when the column actually changes, so
-- unrelated profile updates don't pay the lookup cost.
--
-- Phase 2 commit 7 will wire user_assignments to be the WRITE source of truth;
-- this trigger remains the safety net regardless of write path.
-- ============================================================================
create or replace function public.profiles_validate_assigned_locations()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  bad_id uuid;
begin
  if tg_op = 'UPDATE'
     and new.assigned_locations is not distinct from old.assigned_locations then
    return new;
  end if;

  if new.assigned_locations is null or array_length(new.assigned_locations, 1) is null then
    return new;
  end if;

  -- Find first array element with no matching locations.id; raise if any.
  select elem
    into bad_id
  from unnest(new.assigned_locations) as t(elem)
  where not exists (select 1 from public.locations l where l.id = t.elem)
  limit 1;

  if bad_id is not null then
    raise exception 'profiles.assigned_locations: location % does not exist', bad_id
      using errcode = '23503'; -- foreign_key_violation
  end if;

  return new;
end;
$$;

create trigger profiles_validate_assigned_locations_trg
  before insert or update on public.profiles
  for each row execute function public.profiles_validate_assigned_locations();

-- Defence in depth: if a location is deleted later, the trigger will start
-- rejecting any subsequent profile update that still references it. We don't
-- cascade-clean here because user_assignments (commit 7) is the proper place
-- to manage that lifecycle.
