-- Phase 3 — Attendance.
--
-- One row per (promoter, date, campaign, location). Check-in writes the row;
-- check-out updates the same row. System-detected 'absent' rows may also be
-- inserted by a scheduled Edge Function with all check-in fields NULL.
--
-- Geofence: lat/lng captured on both legs for auditability. Server-side
-- haversine distance stored in check_in_distance_m / check_out_distance_m so
-- reviewers can see HOW far off the fence was, not just a boolean.
--
-- D-006: exif_minimal JSONB holds { DateTimeOriginal, GPSLatitude, GPSLongitude }
--        extracted server-side; the stored photo has all other EXIF stripped.
--
-- D-009: idempotency_key_check_in / _check_out are client-generated UUIDs,
--        UNIQUE per user, for safe retry under flaky mobile networks. System-
--        created 'absent' rows have no client key (check constraint permits NULL
--        only when check_in_time IS NULL).

-- ============================================================================
-- 1. Status enum
-- ============================================================================
create type public.attendance_status as enum (
  'checked_in',
  'checked_out',
  'late',
  'absent',
  'early_leave',
  'missing_checkout'
);

-- ============================================================================
-- 2. attendance
-- ============================================================================
create table public.attendance (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references public.profiles (id) on delete restrict,
  campaign_id               uuid not null references public.campaigns (id) on delete restrict,
  location_id               uuid not null references public.locations (id) on delete restrict,
  shift_id                  uuid references public.shifts (id) on delete set null,
  attendance_date           date not null default current_date,

  check_in_time             timestamptz,
  check_in_lat              double precision check (check_in_lat is null or check_in_lat between -90 and 90),
  check_in_lng              double precision check (check_in_lng is null or check_in_lng between -180 and 180),
  check_in_photo_path       text,
  check_in_distance_m       integer check (check_in_distance_m is null or check_in_distance_m >= 0),
  check_in_exif_minimal     jsonb,

  check_out_time            timestamptz,
  check_out_lat             double precision check (check_out_lat is null or check_out_lat between -90 and 90),
  check_out_lng             double precision check (check_out_lng is null or check_out_lng between -180 and 180),
  check_out_photo_path      text,
  check_out_distance_m      integer check (check_out_distance_m is null or check_out_distance_m >= 0),
  check_out_exif_minimal    jsonb,

  status                    public.attendance_status not null default 'checked_in',
  is_within_geofence        boolean not null default true,

  supervisor_override       boolean not null default false,
  override_reason           text,
  override_by               uuid references public.profiles (id) on delete set null,
  override_at               timestamptz,

  notes                     text,

  idempotency_key_check_in  uuid,
  idempotency_key_check_out uuid,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  -- (campaign, location) pair must be valid.
  constraint attendance_campaign_location_fk
    foreign key (campaign_id, location_id)
    references public.campaign_locations (campaign_id, location_id)
    on delete restrict,

  -- Coordinate completeness: lat and lng both set or both null.
  constraint attendance_check_in_coords_complete check (
    (check_in_lat is null) = (check_in_lng is null)
  ),
  constraint attendance_check_out_coords_complete check (
    (check_out_lat is null) = (check_out_lng is null)
  ),

  -- check-out must be after check-in when both present.
  constraint attendance_check_out_after_in check (
    check_out_time is null or check_in_time is null or check_out_time >= check_in_time
  ),

  -- Status vs check-in fields:
  --   absent: all check_in_* must be NULL
  --   anything else: check_in_time, lat, lng, photo all required
  constraint attendance_status_check_in_consistency check (
    (status = 'absent'
      and check_in_time is null
      and check_in_lat is null
      and check_in_photo_path is null)
    or (status <> 'absent'
      and check_in_time is not null
      and check_in_lat is not null
      and check_in_lng is not null
      and check_in_photo_path is not null)
  ),

  -- Status vs check-out fields:
  --   checked_out | early_leave: check_out_time + lat + lng + photo required
  --   missing_checkout: row was past shift end with no check_out_time; enforce NULL
  --   anything else: check_out_time must be NULL
  constraint attendance_status_check_out_consistency check (
    (status in ('checked_out', 'early_leave')
      and check_out_time is not null
      and check_out_lat is not null
      and check_out_lng is not null
      and check_out_photo_path is not null)
    or (status in ('checked_in', 'late', 'absent', 'missing_checkout')
      and check_out_time is null
      and check_out_lat is null
      and check_out_lng is null
      and check_out_photo_path is null)
  ),

  -- Override fields are all-or-nothing.
  constraint attendance_override_fields_consistency check (
    (supervisor_override = false
      and override_reason is null
      and override_by is null
      and override_at is null)
    or (supervisor_override = true
      and override_reason is not null
      and length(btrim(override_reason)) > 0
      and override_by is not null
      and override_at is not null)
  ),

  -- Client-initiated rows must carry an idempotency key.
  constraint attendance_idempotency_check_in_required check (
    check_in_time is null or idempotency_key_check_in is not null
  ),
  constraint attendance_idempotency_check_out_required check (
    check_out_time is null or idempotency_key_check_out is not null
  )
);

-- One attendance row per (user, date, campaign, location). A promoter working
-- two separate shifts on the same day at the same location at the same campaign
-- is not a Phase 3 requirement; shift_id is recorded but not part of the
-- uniqueness key. Revisit if double-shifts are needed.
create unique index attendance_unique_user_day_idx
  on public.attendance (user_id, attendance_date, campaign_id, location_id);

-- D-009 idempotency: unique per user per leg.
create unique index attendance_idempotency_check_in_unique_idx
  on public.attendance (user_id, idempotency_key_check_in)
  where idempotency_key_check_in is not null;
create unique index attendance_idempotency_check_out_unique_idx
  on public.attendance (user_id, idempotency_key_check_out)
  where idempotency_key_check_out is not null;

create index attendance_user_date_idx on public.attendance (user_id, attendance_date desc);
create index attendance_campaign_date_idx on public.attendance (campaign_id, attendance_date desc);
create index attendance_location_date_idx on public.attendance (location_id, attendance_date desc);
create index attendance_status_idx on public.attendance (status);

create trigger attendance_set_updated_at
  before update on public.attendance
  for each row execute function public.set_updated_at();

alter table public.attendance enable row level security;

grant select, insert, update, delete on public.attendance to authenticated;

-- ============================================================================
-- 3. RLS policies
--    admin       — full CRUD
--    promoter    — SELECT own rows; INSERT own row at an assigned location;
--                  UPDATE own row (for check-out).
--    supervisor  — SELECT + UPDATE rows at assigned locations (overrides, notes).
--    client      — no raw-row access in Phase 3 (aggregates via later view).
-- ============================================================================
create policy attendance_select_admin
  on public.attendance for select to authenticated
  using (public.is_admin());

create policy attendance_select_self
  on public.attendance for select to authenticated
  using (user_id = auth.uid());

create policy attendance_select_supervisor
  on public.attendance for select to authenticated
  using (
    public.current_role() = 'supervisor'
    and location_id = any (public.current_user_locations())
  );

create policy attendance_insert_admin
  on public.attendance for insert to authenticated
  with check (public.is_admin());

create policy attendance_insert_self_promoter
  on public.attendance for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.current_role() = 'promoter'
    and location_id = any (public.current_user_locations())
  );

create policy attendance_update_admin
  on public.attendance for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy attendance_update_self_promoter
  on public.attendance for update to authenticated
  using (
    user_id = auth.uid()
    and public.current_role() = 'promoter'
  )
  with check (
    user_id = auth.uid()
    and public.current_role() = 'promoter'
  );

create policy attendance_update_supervisor
  on public.attendance for update to authenticated
  using (
    public.current_role() = 'supervisor'
    and location_id = any (public.current_user_locations())
  )
  with check (
    public.current_role() = 'supervisor'
    and location_id = any (public.current_user_locations())
  );

create policy attendance_delete_admin
  on public.attendance for delete to authenticated
  using (public.is_admin());
