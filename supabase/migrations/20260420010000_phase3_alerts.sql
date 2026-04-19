-- Phase 3 — Alerts.
--
-- Operational pattern: system detects issue → alert row created → supervisor
-- acts → action logged → shift continues. Alerts are *records*, not
-- notifications; push/in-app delivery is Phase 7's job (Module 8).
--
-- message_key + message_params: keep copy in messages/{ar,en}.json rather than
-- storing localised strings here. Avoids schema migrations for copy changes.

-- ============================================================================
-- 1. Enums
-- ============================================================================
create type public.alert_type as enum (
  'late_check_in',
  'absent',
  'early_leave',
  'missing_check_out',
  'geofence_violation',
  'geofence_override_requested'
);

create type public.alert_severity as enum ('info', 'warning', 'critical');
create type public.alert_status   as enum ('open', 'acknowledged', 'resolved', 'dismissed');

-- ============================================================================
-- 2. alerts
-- ============================================================================
create table public.alerts (
  id                uuid primary key default gen_random_uuid(),
  alert_type        public.alert_type not null,
  severity          public.alert_severity not null default 'warning',
  status            public.alert_status not null default 'open',

  -- Context. All nullable so system alerts can point at whichever dimensions
  -- are known. Live dashboard filters on these.
  user_id           uuid references public.profiles (id) on delete set null,
  attendance_id     uuid references public.attendance (id) on delete cascade,
  campaign_id       uuid references public.campaigns (id) on delete set null,
  location_id       uuid references public.locations (id) on delete set null,

  -- Localisation-friendly payload: message_key maps to a next-intl key;
  -- message_params is interpolated at render time.
  message_key       text not null,
  message_params    jsonb not null default '{}'::jsonb
                    check (jsonb_typeof(message_params) = 'object'),

  acknowledged_by   uuid references public.profiles (id) on delete set null,
  acknowledged_at   timestamptz,
  resolved_by       uuid references public.profiles (id) on delete set null,
  resolved_at       timestamptz,
  resolution_note   text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Status field consistency: acknowledged/resolved statuses must have the
  -- corresponding audit fields set.
  constraint alerts_ack_fields_consistency check (
    status in ('open', 'dismissed')
    or (status = 'acknowledged' and acknowledged_by is not null and acknowledged_at is not null)
    or (status = 'resolved'     and resolved_by is not null and resolved_at is not null)
  )
);

create index alerts_status_created_idx     on public.alerts (status, created_at desc);
create index alerts_user_created_idx       on public.alerts (user_id, created_at desc);
create index alerts_location_created_idx   on public.alerts (location_id, created_at desc);
create index alerts_campaign_created_idx   on public.alerts (campaign_id, created_at desc);
create index alerts_attendance_idx         on public.alerts (attendance_id);
create index alerts_type_idx               on public.alerts (alert_type);

create trigger alerts_set_updated_at
  before update on public.alerts
  for each row execute function public.set_updated_at();

alter table public.alerts enable row level security;

grant select, insert, update, delete on public.alerts to authenticated;

-- ============================================================================
-- 3. RLS policies
--   admin      — full CRUD
--   promoter   — SELECT own alerts (user_id = auth.uid())
--   supervisor — SELECT + UPDATE alerts at their assigned locations
--                (null location_id is NOT visible to supervisors — those are
--                 either global/system alerts or insufficiently tagged)
--   client     — no access in Phase 3
-- ============================================================================
create policy alerts_select_admin
  on public.alerts for select to authenticated
  using (public.is_admin());

create policy alerts_select_self
  on public.alerts for select to authenticated
  using (user_id = auth.uid());

create policy alerts_select_supervisor
  on public.alerts for select to authenticated
  using (
    public.current_role() = 'supervisor'
    and location_id is not null
    and location_id = any (public.current_user_locations())
  );

create policy alerts_insert_admin
  on public.alerts for insert to authenticated
  with check (public.is_admin());

-- System inserts alerts via service role (Edge Functions), which bypasses RLS.
-- No authenticated INSERT policy for promoters/supervisors: users don't hand-
-- author alerts. Phase 7 may add a supervisor-initiated alert if needed.

create policy alerts_update_admin
  on public.alerts for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy alerts_update_supervisor
  on public.alerts for update to authenticated
  using (
    public.current_role() = 'supervisor'
    and location_id is not null
    and location_id = any (public.current_user_locations())
  )
  with check (
    public.current_role() = 'supervisor'
    and location_id is not null
    and location_id = any (public.current_user_locations())
  );

create policy alerts_delete_admin
  on public.alerts for delete to authenticated
  using (public.is_admin());
