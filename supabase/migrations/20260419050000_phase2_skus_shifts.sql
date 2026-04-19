-- Phase 2 — SKUs + shifts.
-- SKUs are scoped to a campaign (each activation defines its own SKU set).
-- Shifts attach to a campaign_location, so a campaign that runs in multiple
-- stores can have a different schedule per store.

-- ============================================================================
-- 1. skus — per-campaign sample/sale unit definitions.
--    target & stock_allocated are non-negative integers; reconciliation in
--    Phase 5 enforces stock invariants.
-- ============================================================================
create table public.skus (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null references public.campaigns (id) on delete cascade,
  name_i18n         jsonb not null
                    check (
                      jsonb_typeof(name_i18n) = 'object'
                      and length(btrim(coalesce(name_i18n->>'en', ''))) > 0
                      and length(btrim(coalesce(name_i18n->>'ar', ''))) > 0
                    ),
  unit_i18n         jsonb not null
                    check (
                      jsonb_typeof(unit_i18n) = 'object'
                      and length(btrim(coalesce(unit_i18n->>'en', ''))) > 0
                      and length(btrim(coalesce(unit_i18n->>'ar', ''))) > 0
                    ),
  target            integer not null default 0 check (target >= 0),
  stock_allocated   integer not null default 0 check (stock_allocated >= 0),
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index skus_campaign_name_unique_idx
  on public.skus (campaign_id, lower(name_i18n->>'en'));
create index skus_campaign_id_idx on public.skus (campaign_id);
create index skus_active_idx on public.skus (active);

create trigger skus_set_updated_at
  before update on public.skus
  for each row execute function public.set_updated_at();

alter table public.skus enable row level security;

grant select, insert, update, delete on public.skus to authenticated;

-- ============================================================================
-- 2. shifts — per (campaign, location) recurring schedule.
--    days_of_week: smallint[] with Sunday=0..Saturday=6 (matches JS Date#getDay).
--    Single time range per row; multiple shifts/day are separate rows.
-- ============================================================================
create table public.shifts (
  id                     uuid primary key default gen_random_uuid(),
  campaign_id            uuid not null references public.campaigns (id) on delete cascade,
  location_id            uuid not null references public.locations (id) on delete restrict,
  start_time             time without time zone not null,
  end_time               time without time zone not null,
  days_of_week           smallint[] not null default '{}',
  active                 boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  -- Time range must be a positive duration on the same day. Cross-midnight
  -- shifts are split into two rows by Phase 4 onboarding rather than allowed
  -- here (keeps attendance windowing simple).
  constraint shifts_time_range_check check (end_time > start_time),
  -- Days_of_week must be non-empty and contain only 0..6 with no duplicates.
  constraint shifts_days_of_week_nonempty
    check (array_length(days_of_week, 1) is not null),
  constraint shifts_days_of_week_range
    check (not exists (
      select 1 from unnest(days_of_week) d where d < 0 or d > 6
    )),
  constraint shifts_days_of_week_unique
    check (
      array_length(days_of_week, 1)
      = (select count(distinct d) from unnest(days_of_week) d)
    ),
  -- The (campaign, location) pair must already exist in campaign_locations.
  constraint shifts_campaign_location_fk
    foreign key (campaign_id, location_id)
    references public.campaign_locations (campaign_id, location_id)
    on delete cascade
);

create index shifts_campaign_idx on public.shifts (campaign_id);
create index shifts_location_idx on public.shifts (location_id);
create index shifts_active_idx on public.shifts (active);
create index shifts_days_of_week_gin on public.shifts using gin (days_of_week);

create trigger shifts_set_updated_at
  before update on public.shifts
  for each row execute function public.set_updated_at();

alter table public.shifts enable row level security;

grant select, insert, update, delete on public.shifts to authenticated;
