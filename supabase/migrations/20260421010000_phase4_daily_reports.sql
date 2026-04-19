-- Phase 4 — daily_reports (Module 5, part 1).
--
-- One row per (promoter, location, report_date). A promoter who works two
-- stores in a day has two reports (one per location) per D-020 planning.
--
-- Status lifecycle:
--   draft → submitted → approved
--   draft → submitted → rejected → draft   (promoter re-edits after rejection)
-- Timestamps mirror lifecycle: submitted_at set on first submit; reviewed_at
-- + reviewed_by set on approve/reject; review_reason required only on reject.
--
-- Header-level counters (contacts, engaged, samples_total, sales_total) are
-- denormalised values written by the submit/approve Server Action from the
-- sum of `sales_entries` (samples_total + sales_total) and direct form input
-- (traffic, contacts, engaged). KPIs are NOT computed here — that's the job
-- of `kpi_snapshots` populated by the compute-kpis Edge Function (D-020).
--
-- D-009: idempotency_key scoped per user, enforced via unique index below.

-- ============================================================================
-- 1. Status enum
-- ============================================================================
create type public.daily_report_status as enum (
  'draft',
  'submitted',
  'approved',
  'rejected'
);

-- ============================================================================
-- 2. daily_reports
-- ============================================================================
create table public.daily_reports (
  id                 uuid primary key default gen_random_uuid(),
  campaign_id        uuid not null references public.campaigns (id) on delete restrict,
  location_id        uuid not null references public.locations (id) on delete restrict,
  promoter_user_id   uuid not null references public.profiles (id) on delete restrict,
  report_date        date not null default current_date,

  -- Raw inputs (whole numbers, non-negative). Ordering invariant:
  -- engaged ≤ contacts ≤ total_traffic when total_traffic is set.
  total_traffic      integer check (total_traffic is null or total_traffic >= 0),
  contacts           integer not null default 0 check (contacts >= 0),
  engaged            integer not null default 0 check (engaged >= 0),
  samples_total      integer not null default 0 check (samples_total >= 0),
  sales_total        integer not null default 0 check (sales_total >= 0),

  notes              text,

  status             public.daily_report_status not null default 'draft',

  submitted_at       timestamptz,
  reviewed_at        timestamptz,
  reviewed_by        uuid references public.profiles (id) on delete set null,
  review_reason      text,

  idempotency_key    uuid not null,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- (campaign, location) pair must be a valid campaign assignment.
  constraint daily_reports_campaign_location_fk
    foreign key (campaign_id, location_id)
    references public.campaign_locations (campaign_id, location_id)
    on delete restrict,

  -- Funnel ordering: engaged ≤ contacts; contacts ≤ total_traffic when set.
  constraint daily_reports_funnel_order check (
    engaged <= contacts
    and (total_traffic is null or contacts <= total_traffic)
  ),

  -- Status/timestamp consistency.
  --   draft:     submitted_at NULL, reviewed_* NULL
  --   submitted: submitted_at NOT NULL, reviewed_* NULL
  --   approved:  submitted_at NOT NULL, reviewed_at + reviewed_by NOT NULL
  --   rejected:  submitted_at NOT NULL, reviewed_at + reviewed_by NOT NULL,
  --              review_reason NOT NULL and non-blank
  constraint daily_reports_status_timestamps check (
    (status = 'draft'
      and submitted_at is null
      and reviewed_at is null
      and reviewed_by is null
      and review_reason is null)
    or (status = 'submitted'
      and submitted_at is not null
      and reviewed_at is null
      and reviewed_by is null
      and review_reason is null)
    or (status = 'approved'
      and submitted_at is not null
      and reviewed_at is not null
      and reviewed_by is not null
      and review_reason is null)
    or (status = 'rejected'
      and submitted_at is not null
      and reviewed_at is not null
      and reviewed_by is not null
      and review_reason is not null
      and length(btrim(review_reason)) > 0)
  )
);

-- One report per promoter per location per day.
create unique index daily_reports_unique_promoter_location_day_idx
  on public.daily_reports (promoter_user_id, location_id, report_date);

-- D-009 idempotency — scoped per user.
create unique index daily_reports_idempotency_unique_idx
  on public.daily_reports (promoter_user_id, idempotency_key);

create index daily_reports_campaign_date_idx  on public.daily_reports (campaign_id, report_date desc);
create index daily_reports_location_date_idx  on public.daily_reports (location_id, report_date desc);
create index daily_reports_promoter_date_idx  on public.daily_reports (promoter_user_id, report_date desc);
create index daily_reports_status_idx         on public.daily_reports (status);

create trigger daily_reports_set_updated_at
  before update on public.daily_reports
  for each row execute function public.set_updated_at();

alter table public.daily_reports enable row level security;

grant select, insert, update, delete on public.daily_reports to authenticated;

-- ============================================================================
-- 3. RLS
--   admin       — full CRUD
--   promoter    — SELECT own reports; INSERT own draft at an assigned
--                  location; UPDATE own while status ∈ (draft, submitted).
--                  Once approved/rejected, the row is frozen to the promoter
--                  (supervisor may re-open by flipping status → draft).
--   supervisor  — SELECT + UPDATE at assigned locations (review flow).
--   client      — no access in Phase 4 (D-019; aggregates arrive Phase 8).
-- ============================================================================
create policy daily_reports_select_admin
  on public.daily_reports for select to authenticated
  using (public.is_admin());

create policy daily_reports_select_self
  on public.daily_reports for select to authenticated
  using (promoter_user_id = auth.uid());

create policy daily_reports_select_supervisor
  on public.daily_reports for select to authenticated
  using (
    public.current_role() = 'supervisor'
    and location_id = any (public.current_user_locations())
  );

create policy daily_reports_insert_admin
  on public.daily_reports for insert to authenticated
  with check (public.is_admin());

create policy daily_reports_insert_self_promoter
  on public.daily_reports for insert to authenticated
  with check (
    promoter_user_id = auth.uid()
    and public.current_role() = 'promoter'
    and location_id = any (public.current_user_locations())
    and status = 'draft'
  );

create policy daily_reports_update_admin
  on public.daily_reports for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy daily_reports_update_self_promoter
  on public.daily_reports for update to authenticated
  using (
    promoter_user_id = auth.uid()
    and public.current_role() = 'promoter'
    and status in ('draft', 'submitted')
  )
  with check (
    promoter_user_id = auth.uid()
    and public.current_role() = 'promoter'
    and status in ('draft', 'submitted')
  );

create policy daily_reports_update_supervisor
  on public.daily_reports for update to authenticated
  using (
    public.current_role() = 'supervisor'
    and location_id = any (public.current_user_locations())
  )
  with check (
    public.current_role() = 'supervisor'
    and location_id = any (public.current_user_locations())
  );

create policy daily_reports_delete_admin
  on public.daily_reports for delete to authenticated
  using (public.is_admin());
