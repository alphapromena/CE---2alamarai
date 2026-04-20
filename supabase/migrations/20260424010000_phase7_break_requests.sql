-- Phase 7 — break_requests.
--
-- Module 9 flow: a promoter submits a break request (requested start + duration
-- + optional reason), a supervisor for one of their assigned locations reviews
-- it and can approve / reject / modify (override start/duration). The
-- promoter starts + ends the break on-device; actual_start / actual_end are
-- filled in on those transitions.
--
-- Design notes:
--   * status enum: pending | approved | rejected | modified
--     - modified  = supervisor approved with override (approved_* differs from
--                   requested_*); separate status lets the promoter UI show
--                   the adjustment explicitly rather than silently swap values.
--   * idempotency_key per D-009 (client-generated UUID v4, UNIQUE per
--     promoter). Safe retry under flaky mobile networks.
--   * Break duration cap is soft-capped at 480 minutes (8h) at the DB layer;
--     per-campaign tuning sits in kpi_config.break_max_minutes (default 60)
--     and is enforced at the Server Action layer — same soft-add pattern
--     as D-019 / D-027.
--   * location_id / shift_id / attendance_id are nullable for context: the
--     promoter may submit before checking in (pre-planned break) or may have
--     multiple shifts in a day.
--
-- RLS posture (consistent with Phase 3 alerts + Phase 5 stock):
--   admin      — full CRUD
--   promoter   — SELECT + INSERT their own rows; UPDATE only to fill actual_*
--                on an already-approved/modified row of their own
--   supervisor — SELECT + UPDATE rows at their assigned locations (or where
--                the promoter is assigned to one of their locations)
--   client     — no access

-- ============================================================================
-- 1. Status enum
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'break_request_status') then
    create type public.break_request_status as enum ('pending', 'approved', 'rejected', 'modified');
  end if;
end$$;

-- ============================================================================
-- 2. break_requests
-- ============================================================================
create table public.break_requests (
  id                         uuid primary key default gen_random_uuid(),

  promoter_id                uuid not null references public.profiles (id) on delete cascade,
  campaign_id                uuid not null references public.campaigns (id) on delete restrict,
  location_id                uuid references public.locations (id) on delete set null,
  shift_id                   uuid references public.shifts (id) on delete set null,
  attendance_id              uuid references public.attendance (id) on delete set null,

  requested_start            timestamptz not null,
  duration_minutes           integer not null
                             check (duration_minutes > 0 and duration_minutes <= 480),
  reason                     text,

  status                     public.break_request_status not null default 'pending',
  reviewer_id                uuid references public.profiles (id) on delete set null,
  reviewer_reason            text,
  reviewed_at                timestamptz,

  -- When approved/modified, the reviewer may override the promoter's request.
  -- Approved_* fields are null on pending/rejected rows and always populated on
  -- approved/modified rows (see break_requests_review_consistency).
  approved_start             timestamptz,
  approved_duration_minutes  integer check (approved_duration_minutes is null or (approved_duration_minutes > 0 and approved_duration_minutes <= 480)),

  actual_start               timestamptz,
  actual_end                 timestamptz,

  idempotency_key            uuid not null,

  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),

  -- idempotency per promoter (D-009)
  unique (promoter_id, idempotency_key),

  constraint break_requests_review_consistency check (
    status = 'pending'
    or (status = 'rejected'
        and reviewer_id is not null
        and reviewed_at is not null)
    or (status in ('approved', 'modified')
        and reviewer_id is not null
        and reviewed_at is not null
        and approved_start is not null
        and approved_duration_minutes is not null)
  ),

  constraint break_requests_actual_order check (
    actual_end is null
    or (actual_start is not null and actual_end >= actual_start)
  )
);

create index break_requests_promoter_idx
  on public.break_requests (promoter_id, created_at desc);

create index break_requests_status_created_idx
  on public.break_requests (status, created_at desc);

create index break_requests_location_idx
  on public.break_requests (location_id, created_at desc);

create index break_requests_campaign_idx
  on public.break_requests (campaign_id, created_at desc);

create trigger break_requests_set_updated_at
  before update on public.break_requests
  for each row execute function public.set_updated_at();

comment on table public.break_requests is
  'Phase 7: promoter-submitted break requests; supervisor approves/rejects/modifies. Idempotent per (promoter, idempotency_key) per D-009.';

-- ============================================================================
-- 3. RLS
-- ============================================================================
alter table public.break_requests enable row level security;

grant select, insert, update, delete on public.break_requests to authenticated;

-- SELECT — admin full, self, supervisor-by-location, supervisor-by-assignment
create policy break_requests_select_admin
  on public.break_requests for select to authenticated
  using (public.is_admin());

create policy break_requests_select_self
  on public.break_requests for select to authenticated
  using (promoter_id = auth.uid());

create policy break_requests_select_supervisor
  on public.break_requests for select to authenticated
  using (
    public.current_role() = 'supervisor'
    and (
      (location_id is not null and location_id = any (public.current_user_locations()))
      or exists (
        select 1 from public.user_assignments ua
        where ua.user_id = public.break_requests.promoter_id
          and ua.active = true
          and ua.location_id = any (public.current_user_locations())
      )
    )
  );

-- INSERT — promoter creates own row only. Status must start 'pending' and
-- reviewer_* / approved_* / actual_* must be null on insert (enforced by
-- the review_consistency CHECK + explicit WITH CHECK predicate).
create policy break_requests_insert_self
  on public.break_requests for insert to authenticated
  with check (
    promoter_id = auth.uid()
    and status = 'pending'
    and reviewer_id is null
    and reviewed_at is null
    and approved_start is null
    and approved_duration_minutes is null
    and actual_start is null
    and actual_end is null
  );

create policy break_requests_insert_admin
  on public.break_requests for insert to authenticated
  with check (public.is_admin());

-- UPDATE — supervisor may approve/reject/modify for rows at their locations;
-- promoter may update ONLY to fill actual_start / actual_end on their own
-- approved/modified rows. The narrow promoter-update is enforced by the
-- app layer (Server Action) combined with the WITH CHECK here.
create policy break_requests_update_admin
  on public.break_requests for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy break_requests_update_supervisor
  on public.break_requests for update to authenticated
  using (
    public.current_role() = 'supervisor'
    and (
      (location_id is not null and location_id = any (public.current_user_locations()))
      or exists (
        select 1 from public.user_assignments ua
        where ua.user_id = public.break_requests.promoter_id
          and ua.active = true
          and ua.location_id = any (public.current_user_locations())
      )
    )
  )
  with check (
    public.current_role() = 'supervisor'
    and (
      (location_id is not null and location_id = any (public.current_user_locations()))
      or exists (
        select 1 from public.user_assignments ua
        where ua.user_id = public.break_requests.promoter_id
          and ua.active = true
          and ua.location_id = any (public.current_user_locations())
      )
    )
  );

create policy break_requests_update_self_actuals
  on public.break_requests for update to authenticated
  using (promoter_id = auth.uid() and status in ('approved', 'modified'))
  with check (promoter_id = auth.uid() and status in ('approved', 'modified'));

create policy break_requests_delete_admin
  on public.break_requests for delete to authenticated
  using (public.is_admin());
