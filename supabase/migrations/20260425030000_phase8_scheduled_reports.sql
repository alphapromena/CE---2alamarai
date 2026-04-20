-- Phase 8 — scheduled_reports (Module 11, cron-driven half).
--
-- Admin-configured export schedules. A row represents "run export of SCOPE in
-- FORMAT on CADENCE". The cron-scheduled-reports Edge Function sweeps this
-- table, enqueues a new export_jobs row per due schedule, and invokes
-- generate-report to process it.
--
-- cadence is a small enum (daily | weekly | end_of_campaign) rather than a
-- raw cron expression:
--   * daily            — runs every day at the configured hour_utc (default 0)
--   * weekly           — runs every day_of_week_utc (0 = Sunday) at hour_utc
--   * end_of_campaign  — runs once when campaign.status transitions to
--                        'completed'. For v1 this is also polled by the
--                        cron sweep (checks campaign end_date + status).
--
-- No full cron expressions on purpose: the admin UI (if/when added) is a
-- simple cadence picker; arbitrary cron lets admins accidentally create
-- minute-frequency runs that hammer the exports bucket. Phase 9 polish may
-- expand.
--
-- last_run_at + last_job_id let the UI show recent activity without joining
-- to export_jobs on every render.
--
-- RLS: admin-only. Clients cannot schedule; supervisors cannot schedule.
-- If a client asks for recurring exports, an admin sets it up for them.

-- ============================================================================
-- 1. Enum
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'scheduled_report_cadence') then
    create type public.scheduled_report_cadence as enum (
      'daily',
      'weekly',
      'end_of_campaign'
    );
  end if;
end$$;

-- ============================================================================
-- 2. scheduled_reports
-- ============================================================================
create table public.scheduled_reports (
  id                 uuid primary key default gen_random_uuid(),

  name               text not null check (char_length(name) between 1 and 120),
  description        text check (description is null or char_length(description) <= 500),

  client_id          uuid references public.clients (id) on delete cascade,

  scope              jsonb not null
                     check (jsonb_typeof(scope) = 'object'),
  format             public.export_format not null,

  cadence            public.scheduled_report_cadence not null,
  hour_utc           smallint not null default 0
                     check (hour_utc between 0 and 23),
  day_of_week_utc    smallint
                     check (day_of_week_utc is null or day_of_week_utc between 0 and 6),

  active             boolean not null default true,

  last_run_at        timestamptz,
  last_job_id        uuid references public.export_jobs (id) on delete set null,

  created_by         uuid not null references public.profiles (id) on delete restrict,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint scheduled_reports_weekly_needs_dow check (
    cadence <> 'weekly' or day_of_week_utc is not null
  )
);

create index scheduled_reports_active_idx
  on public.scheduled_reports (active, cadence)
  where active = true;

create index scheduled_reports_client_idx
  on public.scheduled_reports (client_id)
  where client_id is not null;

create trigger scheduled_reports_set_updated_at
  before update on public.scheduled_reports
  for each row execute function public.set_updated_at();

comment on table public.scheduled_reports is
  'Phase 8: admin-configured recurring export schedules. Swept by cron-scheduled-reports Edge Function; enqueues export_jobs rows.';

-- ============================================================================
-- 3. RLS — admin only (service role bypasses for cron sweep)
-- ============================================================================
alter table public.scheduled_reports enable row level security;

grant select, insert, update, delete on public.scheduled_reports to authenticated;

create policy scheduled_reports_admin_all
  on public.scheduled_reports for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
