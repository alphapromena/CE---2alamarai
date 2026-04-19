-- Phase 2 — Campaigns + campaign_locations (M:N).
-- A campaign belongs to exactly one client tenant; locations are assigned
-- through the join table so the same Safeway can host multiple campaigns.
--
-- kpi_config default {sampling_rate_denominator: "contacts"} per D-007.
-- status enum is fixed; new values would be a breaking change.

-- ============================================================================
-- 1. Status enum
-- ============================================================================
create type public.campaign_status as enum ('planned', 'active', 'completed', 'cancelled');

-- ============================================================================
-- 2. campaigns
-- ============================================================================
create table public.campaigns (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients (id) on delete restrict,
  name_i18n     jsonb not null
                check (
                  jsonb_typeof(name_i18n) = 'object'
                  and length(btrim(coalesce(name_i18n->>'en', ''))) > 0
                  and length(btrim(coalesce(name_i18n->>'ar', ''))) > 0
                ),
  start_date    date not null,
  end_date      date not null,
  objectives    text,
  -- D-007: configurable per campaign. Default denominator is "contacts".
  kpi_config    jsonb not null default jsonb_build_object('sampling_rate_denominator', 'contacts')
                check (
                  jsonb_typeof(kpi_config) = 'object'
                  and (kpi_config->>'sampling_rate_denominator') in ('contacts', 'engaged')
                ),
  status        public.campaign_status not null default 'planned',
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint campaigns_date_range_check check (end_date >= start_date)
);

create unique index campaigns_client_name_unique_idx
  on public.campaigns (client_id, lower(name_i18n->>'en'));
create index campaigns_client_id_idx on public.campaigns (client_id);
create index campaigns_status_idx on public.campaigns (status);
create index campaigns_dates_idx on public.campaigns (start_date, end_date);

create trigger campaigns_set_updated_at
  before update on public.campaigns
  for each row execute function public.set_updated_at();

alter table public.campaigns enable row level security;

grant select, insert, update, delete on public.campaigns to authenticated;

-- ============================================================================
-- 3. campaign_locations — M:N join.
--    Composite PK keeps it small and prevents duplicates.
-- ============================================================================
create table public.campaign_locations (
  campaign_id  uuid not null references public.campaigns (id) on delete cascade,
  location_id  uuid not null references public.locations (id) on delete restrict,
  created_at   timestamptz not null default now(),
  primary key (campaign_id, location_id)
);

create index campaign_locations_location_idx on public.campaign_locations (location_id);

alter table public.campaign_locations enable row level security;

grant select, insert, update, delete on public.campaign_locations to authenticated;
