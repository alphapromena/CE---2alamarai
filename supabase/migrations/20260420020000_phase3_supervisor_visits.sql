-- Phase 3 — Supervisor site visits.
--
-- Independent validation record: a supervisor drops in on a location, takes a
-- photo + geotag, and logs what they found. Distinct from `attendance` (which
-- is the promoter's shift session) so the two concerns don't conflate inside
-- one table's RLS, constraints, or detection queries.
--
-- is_within_geofence is kept as a flag — supervisors may deliberately stand
-- outside the fence (car park, adjacent aisle) and that's OK; the flag lets
-- reviewers see it, but does not reject the insert.

-- ============================================================================
-- 1. Outcome enum
-- ============================================================================
create type public.supervisor_visit_outcome as enum (
  'ok',
  'issue_found',
  'coaching',
  'other'
);

-- ============================================================================
-- 2. supervisor_visits
-- ============================================================================
create table public.supervisor_visits (
  id                  uuid primary key default gen_random_uuid(),
  supervisor_id       uuid not null references public.profiles (id) on delete restrict,
  campaign_id         uuid not null references public.campaigns (id) on delete restrict,
  location_id         uuid not null references public.locations (id) on delete restrict,
  visited_at          timestamptz not null default now(),

  lat                 double precision not null check (lat between -90 and 90),
  lng                 double precision not null check (lng between -180 and 180),
  distance_m          integer not null check (distance_m >= 0),
  is_within_geofence  boolean not null,

  photo_path          text not null,
  exif_minimal        jsonb,

  outcome             public.supervisor_visit_outcome not null default 'ok',
  notes               text,

  idempotency_key     uuid not null,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- (campaign, location) pair must be valid.
  constraint supervisor_visits_campaign_location_fk
    foreign key (campaign_id, location_id)
    references public.campaign_locations (campaign_id, location_id)
    on delete restrict
);

-- D-009 idempotency: unique per supervisor.
create unique index supervisor_visits_idempotency_idx
  on public.supervisor_visits (supervisor_id, idempotency_key);

create index supervisor_visits_location_date_idx
  on public.supervisor_visits (location_id, visited_at desc);
create index supervisor_visits_campaign_date_idx
  on public.supervisor_visits (campaign_id, visited_at desc);
create index supervisor_visits_supervisor_date_idx
  on public.supervisor_visits (supervisor_id, visited_at desc);
create index supervisor_visits_outcome_idx
  on public.supervisor_visits (outcome);

create trigger supervisor_visits_set_updated_at
  before update on public.supervisor_visits
  for each row execute function public.set_updated_at();

alter table public.supervisor_visits enable row level security;

grant select, insert, update, delete on public.supervisor_visits to authenticated;

-- ============================================================================
-- 3. RLS policies
--    admin      — full CRUD
--    supervisor — SELECT own visits + visits at assigned locations;
--                 INSERT only as self at an assigned location;
--                 UPDATE own notes/outcome.
--    promoter   — no access (visits are supervisor-to-location audit records).
--    client     — no access in Phase 3.
-- ============================================================================
create policy supervisor_visits_select_admin
  on public.supervisor_visits for select to authenticated
  using (public.is_admin());

create policy supervisor_visits_select_self
  on public.supervisor_visits for select to authenticated
  using (supervisor_id = auth.uid());

create policy supervisor_visits_select_by_location
  on public.supervisor_visits for select to authenticated
  using (
    public.current_role() = 'supervisor'
    and location_id = any (public.current_user_locations())
  );

create policy supervisor_visits_insert_admin
  on public.supervisor_visits for insert to authenticated
  with check (public.is_admin());

create policy supervisor_visits_insert_self
  on public.supervisor_visits for insert to authenticated
  with check (
    supervisor_id = auth.uid()
    and public.current_role() = 'supervisor'
    and location_id = any (public.current_user_locations())
  );

create policy supervisor_visits_update_admin
  on public.supervisor_visits for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy supervisor_visits_update_self
  on public.supervisor_visits for update to authenticated
  using (supervisor_id = auth.uid())
  with check (supervisor_id = auth.uid());

create policy supervisor_visits_delete_admin
  on public.supervisor_visits for delete to authenticated
  using (public.is_admin());
