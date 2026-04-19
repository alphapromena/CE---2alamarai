-- Phase 2 — Geographic hierarchy: regions → cities.
-- Locations join in migration 0005; campaign assignment joins via locations.
-- RLS enabled; policies added in migration 0009.
--
-- name_i18n shape (D-005): { "ar": "...", "en": "..." }
-- Both languages required for any user-facing entity. CHECK enforces it.

-- ============================================================================
-- 1. regions — top of the geo hierarchy. Country code is ISO-3166 alpha-2.
-- ============================================================================
create table public.regions (
  id            uuid primary key default gen_random_uuid(),
  name_i18n     jsonb not null
                check (
                  jsonb_typeof(name_i18n) = 'object'
                  and length(btrim(coalesce(name_i18n->>'en', ''))) > 0
                  and length(btrim(coalesce(name_i18n->>'ar', ''))) > 0
                ),
  country_code  text not null check (country_code ~ '^[A-Z]{2}$'),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Region names should be unique within a country; case-insensitive on the
-- English variant since that's the canonical admin-facing label.
create unique index regions_country_name_unique_idx
  on public.regions (country_code, lower(name_i18n->>'en'));
create index regions_active_idx on public.regions (active);
create index regions_country_idx on public.regions (country_code);

create trigger regions_set_updated_at
  before update on public.regions
  for each row execute function public.set_updated_at();

alter table public.regions enable row level security;

-- ============================================================================
-- 2. cities — child of region.
-- ============================================================================
create table public.cities (
  id          uuid primary key default gen_random_uuid(),
  region_id   uuid not null references public.regions (id) on delete restrict,
  name_i18n   jsonb not null
              check (
                jsonb_typeof(name_i18n) = 'object'
                and length(btrim(coalesce(name_i18n->>'en', ''))) > 0
                and length(btrim(coalesce(name_i18n->>'ar', ''))) > 0
              ),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index cities_region_name_unique_idx
  on public.cities (region_id, lower(name_i18n->>'en'));
create index cities_region_id_idx on public.cities (region_id);
create index cities_active_idx on public.cities (active);

create trigger cities_set_updated_at
  before update on public.cities
  for each row execute function public.set_updated_at();

alter table public.cities enable row level security;

grant select, insert, update, delete on public.regions to authenticated;
grant select, insert, update, delete on public.cities  to authenticated;
