-- Feature 5 — Live GPS tracking while checked-in (D-042).
--
-- Writes one row per ping (~every 15 minutes) for the duration of an open
-- attendance row. Check-in and check-out stay on the attendance table; this
-- table only captures the "is the promoter still near their location" signal
-- in between. Retention is 30 days (operational, not historical) via
-- gc_location_pings() called from cron.
--
-- Visibility: promoters can see their own pings (for the transparency view),
-- supervisors can see pings for promoters at locations they supervise, admins
-- see everything. Clients have no row-level access — pings are internal
-- operational data, not reporting data.

create table if not exists public.location_pings (
  id             uuid primary key default gen_random_uuid(),
  attendance_id  uuid not null references public.attendance(id) on delete cascade,
  promoter_id    uuid not null references public.profiles(id) on delete cascade,
  lat            double precision not null check (lat between -90 and 90),
  lng            double precision not null check (lng between -180 and 180),
  accuracy_m     double precision null check (accuracy_m is null or accuracy_m >= 0),
  battery_pct    integer null check (battery_pct is null or (battery_pct between 0 and 100)),
  captured_at    timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

comment on table public.location_pings is
  'Feature 5 D-042: per-device GPS pings captured while a promoter is checked-in. 30-day retention.';

comment on column public.location_pings.attendance_id is
  'The open attendance row this ping belongs to; cascades on delete.';

comment on column public.location_pings.accuracy_m is
  'GPS-reported accuracy radius in metres; nullable because some devices omit it.';

comment on column public.location_pings.battery_pct is
  'Battery level 0-100 at capture time; nullable because iOS does not expose it.';

create index if not exists idx_location_pings_attendance_captured
  on public.location_pings (attendance_id, captured_at);

create index if not exists idx_location_pings_promoter_captured_desc
  on public.location_pings (promoter_id, captured_at desc);

alter table public.location_pings enable row level security;

grant select, insert on public.location_pings to authenticated;

-- ============================================================================
-- RLS policies
--   admin       — full access
--   promoter    — INSERT + SELECT own pings, only for an open attendance
--   supervisor  — SELECT pings for promoters at one of their locations
--   client      — no access (pings are internal operational data)
-- ============================================================================
create policy location_pings_select_admin
  on public.location_pings for select to authenticated
  using (public.is_admin());

create policy location_pings_select_self_promoter
  on public.location_pings for select to authenticated
  using (promoter_id = auth.uid());

create policy location_pings_select_supervisor
  on public.location_pings for select to authenticated
  using (
    public.current_role() = 'supervisor'
    and exists (
      select 1 from public.attendance a
      where a.id = location_pings.attendance_id
        and a.location_id = any (public.current_user_locations())
    )
  );

create policy location_pings_insert_self_promoter
  on public.location_pings for insert to authenticated
  with check (
    promoter_id = auth.uid()
    and public.current_role() = 'promoter'
    and exists (
      select 1 from public.attendance a
      where a.id = location_pings.attendance_id
        and a.user_id = auth.uid()
        and a.check_out_time is null
    )
  );

create policy location_pings_insert_admin
  on public.location_pings for insert to authenticated
  with check (public.is_admin());

create policy location_pings_delete_admin
  on public.location_pings for delete to authenticated
  using (public.is_admin());

-- ============================================================================
-- Retention GC — delete pings older than 30 days.
-- Schedule daily at 03:15 UTC via pg_cron (see supabase/functions/README).
-- ============================================================================
create or replace function public.gc_location_pings()
returns integer
language sql
security definer
set search_path = public, pg_catalog
as $$
  with deleted as (
    delete from public.location_pings
    where captured_at < now() - interval '30 days'
    returning 1
  )
  select count(*)::integer from deleted;
$$;

revoke all on function public.gc_location_pings() from public;
grant execute on function public.gc_location_pings() to service_role;

comment on function public.gc_location_pings() is
  'Feature 5 D-042: delete location_pings older than 30 days. Schedule daily from cron.';
