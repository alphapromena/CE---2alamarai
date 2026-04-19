-- Phase 6 — performance_snapshots: rolled-up KPI metrics per (scope, period).
--
-- Why a NEW table instead of extending kpi_snapshots:
--   - kpi_snapshots is 1:1 with daily_reports (single shift, single promoter,
--     single location, single date).
--   - performance_snapshots is rolled up over a *period* (daily / weekly /
--     campaign-to-date) and a *scope* (promoter / location / campaign), with
--     tier + rank columns derived from configurable thresholds.
--   - Different cardinality, different lifecycle, different indexes — keeping
--     them separate prevents conflating two grains.
--
-- Tier thresholds & metric live on campaigns.kpi_config (D-007 / D-019 /
-- D-027 pattern of soft-added JSONB keys with safe-read defaults). No schema
-- migration needed when admins change them.
--   kpi_config.tier_high      — fraction (0..1), default 0.50 → ≥ this = top
--   kpi_config.tier_medium    — fraction (0..1), default 0.30 → ≥ this = medium, else low
--   kpi_config.tier_metric    — which numeric column drives tiering, default 'conversion_rate'
--
-- Periods are explicit columns (period_start, period_end) rather than an
-- enum so future custom ranges plug in without a migration. The Edge
-- Function rolls up the three MVP grains: 'daily' (one calendar day),
-- 'weekly' (Mon..Sun in the campaign timezone — UTC for v1), and
-- 'campaign_to_date' (campaign.start_date .. min(today, end_date)).
--
-- Writes are SERVICE-ROLE ONLY (Edge Function). No authenticated INSERT /
-- UPDATE / DELETE policies — same posture as kpi_snapshots.

-- ============================================================================
-- 1. period_kind enum + scope_kind enum
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'performance_period_kind') then
    create type public.performance_period_kind as enum ('daily', 'weekly', 'campaign_to_date');
  end if;
  if not exists (select 1 from pg_type where typname = 'performance_scope_kind') then
    create type public.performance_scope_kind as enum ('promoter', 'location', 'campaign');
  end if;
  if not exists (select 1 from pg_type where typname = 'performance_tier') then
    create type public.performance_tier as enum ('top', 'medium', 'low');
  end if;
end$$;

-- ============================================================================
-- 2. performance_snapshots
--   One row per (scope_kind, scope_id, campaign_id, period_kind, period_start).
--   scope_id is:
--     - promoter:  profiles.id (the promoter)
--     - location:  locations.id
--     - campaign:  campaigns.id (and equals campaign_id; redundant by design
--                  so a single composite key works for all three scopes)
--   period_end is included for query convenience but is uniquely determined
--   by (period_kind, period_start, campaign window).
--
--   Funnel totals are stored alongside the ratios so:
--     a) the table is self-describing for ad-hoc admin queries
--     b) re-rollups (e.g., weekly from daily) don't have to re-aggregate
--        kpi_snapshots from scratch
-- ============================================================================
create table public.performance_snapshots (
  id                          uuid primary key default gen_random_uuid(),

  scope_kind                  public.performance_scope_kind not null,
  scope_id                    uuid not null,
  campaign_id                 uuid not null references public.campaigns (id) on delete cascade,

  period_kind                 public.performance_period_kind not null,
  period_start                date not null,
  period_end                  date not null,

  -- Funnel totals over the period
  reports_count               integer not null default 0 check (reports_count >= 0),
  total_traffic               integer check (total_traffic is null or total_traffic >= 0),
  contacts                    integer not null default 0 check (contacts >= 0),
  engaged                     integer not null default 0 check (engaged >= 0),
  samples_total               integer not null default 0 check (samples_total >= 0),
  sales_total                 integer not null default 0 check (sales_total >= 0),

  -- Computed ratios — null when denominator is zero (matches lib/kpis/compute.ts)
  interaction_rate            numeric(6,4) check (interaction_rate is null or (interaction_rate >= 0 and interaction_rate <= 1)),
  engagement_rate             numeric(6,4) check (engagement_rate  is null or (engagement_rate  >= 0 and engagement_rate  <= 1)),
  sampling_rate               numeric(6,4) check (sampling_rate    is null or (sampling_rate    >= 0 and sampling_rate    <= 1)),
  conversion_rate             numeric(6,4) check (conversion_rate  is null or (conversion_rate  >= 0 and conversion_rate  <= 1)),
  sample_to_conversion_rate   numeric(6,4) check (sample_to_conversion_rate is null or (sample_to_conversion_rate >= 0 and sample_to_conversion_rate <= 1)),

  sku_contributions           jsonb not null default '{}'::jsonb
                              check (jsonb_typeof(sku_contributions) = 'object'),

  -- Sampling denominator used for sampling_rate (audit trail for D-007)
  sampling_rate_denominator   text check (sampling_rate_denominator in ('contacts', 'engaged')),

  -- Tier + rank are derived; stored for fast dashboard reads and
  -- to make benchmark queries trivial. Recomputed by the Edge Function
  -- whenever the underlying data shifts.
  tier                        public.performance_tier,
  tier_metric                 text not null default 'conversion_rate',
  tier_metric_value           numeric(6,4),
  tier_high_threshold         numeric(6,4),
  tier_medium_threshold       numeric(6,4),
  rank_in_scope               integer check (rank_in_scope is null or rank_in_scope > 0),
  scope_size                  integer check (scope_size is null or scope_size > 0),

  computation_version         integer not null default 1,
  computed_at                 timestamptz not null default now(),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  -- The table key: a (scope, campaign, period) is unique. UPSERTs from the
  -- Edge Function rely on this constraint via ON CONFLICT.
  unique (scope_kind, scope_id, campaign_id, period_kind, period_start)
);

create index performance_snapshots_campaign_period_idx
  on public.performance_snapshots (campaign_id, period_kind, period_start desc);

create index performance_snapshots_scope_idx
  on public.performance_snapshots (scope_kind, scope_id, period_kind, period_start desc);

create index performance_snapshots_tier_idx
  on public.performance_snapshots (campaign_id, period_kind, period_start, tier);

create trigger performance_snapshots_set_updated_at
  before update on public.performance_snapshots
  for each row execute function public.set_updated_at();

comment on table public.performance_snapshots is
  'Phase 6: rolled-up KPI metrics per (scope, period). Written by compute-kpis Edge Function only; service-role bypass. Read by admin/supervisor/client dashboards via RLS below.';

-- ============================================================================
-- 3. RLS — read-only to authenticated, scoped per role
--   - admin: all rows
--   - supervisor: rows for their assigned locations + the campaigns those
--     locations belong to + the promoters assigned to those locations
--   - promoter: their own promoter-scope rows only (no location/campaign rows)
--   - client: aggregates only — campaign-scope rows for their campaigns
--             (D-019 item 3: aggregates only, no individual rows)
-- ============================================================================
alter table public.performance_snapshots enable row level security;

grant select, insert, update, delete on public.performance_snapshots to authenticated;

create policy performance_snapshots_select_admin
  on public.performance_snapshots for select to authenticated
  using (public.is_admin());

create policy performance_snapshots_select_supervisor
  on public.performance_snapshots for select to authenticated
  using (
    public.current_role() = 'supervisor'
    and (
      -- location-scope: must be one of supervisor's assigned locations
      (scope_kind = 'location' and scope_id = any (public.current_user_locations()))
      -- promoter-scope: promoter must be assigned to one of supervisor's locations
      or (
        scope_kind = 'promoter'
        and exists (
          select 1 from public.user_assignments ua
          where ua.user_id = public.performance_snapshots.scope_id
            and ua.active = true
            and ua.location_id = any (public.current_user_locations())
        )
      )
      -- campaign-scope: at least one of supervisor's locations is in the campaign
      or (
        scope_kind = 'campaign'
        and exists (
          select 1 from public.campaign_locations cl
          where cl.campaign_id = public.performance_snapshots.campaign_id
            and cl.location_id = any (public.current_user_locations())
        )
      )
    )
  );

create policy performance_snapshots_select_promoter
  on public.performance_snapshots for select to authenticated
  using (
    public.current_role() = 'promoter'
    and scope_kind = 'promoter'
    and scope_id = auth.uid()
  );

-- Client visibility (D-019 item 3, refined for Phase 6): campaign-scope ONLY.
-- Per-promoter and per-location rows are NOT visible to clients in Phase 6.
-- Phase 8 reporting may expand this when location-level rollups are agreed.
create policy performance_snapshots_select_client
  on public.performance_snapshots for select to authenticated
  using (
    public.current_role() = 'client'
    and scope_kind = 'campaign'
    and exists (
      select 1 from public.campaigns c
      where c.id = public.performance_snapshots.campaign_id
        and c.client_id = public.current_client_id()
    )
  );

-- No INSERT / UPDATE / DELETE policies for authenticated users by design.
-- The compute-kpis Edge Function uses the service role to write rows.
-- This mirrors the kpi_snapshots posture from Phase 4.

-- ============================================================================
-- 4. performance_latest view — convenience for dashboards.
--   For each (scope_kind, scope_id, campaign_id, period_kind), returns the
--   most recent period_start row. Used by the admin/supervisor index pages
--   to render "current snapshot" without an N+1 in app code.
--
--   security_invoker = on so RLS on the underlying table applies (D-023
--   pattern). The DISTINCT ON is index-friendly given the
--   performance_snapshots_scope_idx ordering.
-- ============================================================================
create or replace view public.performance_latest
with (security_invoker = on)
as
select distinct on (scope_kind, scope_id, campaign_id, period_kind)
  *
from public.performance_snapshots
order by scope_kind, scope_id, campaign_id, period_kind, period_start desc;

comment on view public.performance_latest is
  'Most recent performance_snapshots row per (scope, campaign, period_kind). Plain view; RLS via security_invoker.';

grant select on public.performance_latest to authenticated;
