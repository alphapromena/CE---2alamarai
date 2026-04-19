-- Phase 6 — pgtap tests for performance_snapshots.
--
-- Covers:
--   A. Table-level CHECK constraints (ratios in [0,1]; counts >= 0).
--   B. (scope_kind, scope_id, campaign_id, period_kind, period_start) UNIQUE
--      enforcement (UPSERT relies on it).
--   C. RLS policies:
--        - admin sees all
--        - client sees campaign-scope rows for their tenant only
--        - client does NOT see promoter or location scope rows
--        - promoter sees only their own promoter-scope row
--        - supervisor sees rows scoped to their assigned locations
--   D. performance_latest view returns the most recent row per
--      (scope_kind, scope_id, campaign_id, period_kind).
--
-- Run with: supabase db test
-- Wraps in a single rollback transaction; fixtures don't persist.

begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;

select plan(11);

-- ============================================================================
-- Fixtures: minimal client / campaign / location / users.
-- ============================================================================
insert into public.clients (id, name, active) values
  ('11111111-1111-1111-1111-111111111111', 'Almarai', true);

insert into public.campaigns (
  id, client_id, name_i18n, start_date, end_date, status, kpi_config
) values (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  jsonb_build_object('en', 'Almarai Spring', 'ar', 'الربيع'),
  '2026-04-01', '2026-04-30', 'active',
  jsonb_build_object('tier_high', 0.5, 'tier_medium', 0.3, 'tier_metric', 'conversion_rate')
);

insert into public.regions (id, name_i18n) values
  ('33333333-3333-3333-3333-333333333333', jsonb_build_object('en', 'Amman', 'ar', 'عمّان'));
insert into public.cities (id, region_id, name_i18n) values
  ('44444444-4444-4444-4444-444444444444',
   '33333333-3333-3333-3333-333333333333',
   jsonb_build_object('en', 'Amman', 'ar', 'عمّان'));
insert into public.locations (id, city_id, name_i18n, lat, lng, geofence_radius_m) values
  ('55555555-5555-5555-5555-555555555555',
   '44444444-4444-4444-4444-444444444444',
   jsonb_build_object('en', 'Safeway Khalda'), 31.99, 35.83, 100);

insert into public.campaign_locations (campaign_id, location_id) values
  ('22222222-2222-2222-2222-222222222222',
   '55555555-5555-5555-5555-555555555555');

-- Synthetic profiles (no auth.users — RLS helpers tolerate that)
insert into public.profiles (id, role, full_name, active) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin',      'Admin Adi',      true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'supervisor', 'Sup Sami',       true),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'promoter',   'Promoter Pina',  true),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'promoter',   'Promoter Other', true);

insert into public.profiles (id, role, full_name, active, client_id) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'client', 'Client Cara', true,
   '11111111-1111-1111-1111-111111111111');

insert into public.user_assignments (user_id, location_id, role, active) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '55555555-5555-5555-5555-555555555555', 'supervisor', true),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc',
   '55555555-5555-5555-5555-555555555555', 'promoter', true);

-- ============================================================================
-- A. CHECK constraints
-- ============================================================================

select throws_ok(
  $$insert into public.performance_snapshots
      (scope_kind, scope_id, campaign_id, period_kind, period_start, period_end,
       conversion_rate)
    values ('promoter', 'cccccccc-cccc-cccc-cccc-cccccccccccc',
            '22222222-2222-2222-2222-222222222222', 'daily',
            '2026-04-19', '2026-04-19', 1.5)$$,
  null,
  'rejects conversion_rate > 1'
);

select throws_ok(
  $$insert into public.performance_snapshots
      (scope_kind, scope_id, campaign_id, period_kind, period_start, period_end,
       contacts)
    values ('promoter', 'cccccccc-cccc-cccc-cccc-cccccccccccc',
            '22222222-2222-2222-2222-222222222222', 'daily',
            '2026-04-19', '2026-04-19', -5)$$,
  null,
  'rejects negative contacts'
);

-- ============================================================================
-- B. UNIQUE (scope_kind, scope_id, campaign_id, period_kind, period_start)
-- ============================================================================

insert into public.performance_snapshots
  (scope_kind, scope_id, campaign_id, period_kind, period_start, period_end,
   contacts, sales_total, conversion_rate, tier)
values
  ('promoter', 'cccccccc-cccc-cccc-cccc-cccccccccccc',
   '22222222-2222-2222-2222-222222222222', 'daily',
   '2026-04-19', '2026-04-19', 100, 65, 0.65, 'top'),
  ('promoter', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
   '22222222-2222-2222-2222-222222222222', 'daily',
   '2026-04-19', '2026-04-19', 100, 20, 0.20, 'low'),
  ('location', '55555555-5555-5555-5555-555555555555',
   '22222222-2222-2222-2222-222222222222', 'daily',
   '2026-04-19', '2026-04-19', 100, 65, 0.65, 'top'),
  ('campaign', '22222222-2222-2222-2222-222222222222',
   '22222222-2222-2222-2222-222222222222', 'daily',
   '2026-04-19', '2026-04-19', 200, 85, 0.4250, 'medium');

select throws_ok(
  $$insert into public.performance_snapshots
      (scope_kind, scope_id, campaign_id, period_kind, period_start, period_end)
    values ('promoter', 'cccccccc-cccc-cccc-cccc-cccccccccccc',
            '22222222-2222-2222-2222-222222222222', 'daily',
            '2026-04-19', '2026-04-19')$$,
  '23505',
  'duplicate (scope, campaign, period_start) is rejected'
);

-- ============================================================================
-- C. RLS — set role to authenticated and impersonate each user via JWT claim.
-- ============================================================================

set local role authenticated;

-- Admin sees all 4 rows
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated')::text,
  true);
select is(
  (select count(*)::int from public.performance_snapshots),
  4,
  'admin sees all 4 rows'
);

-- Promoter Pina sees only her own promoter-scope row
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'role', 'authenticated')::text,
  true);
select is(
  (select count(*)::int from public.performance_snapshots),
  1,
  'promoter sees only her own promoter-scope row'
);
select is(
  (select scope_id::text from public.performance_snapshots limit 1),
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'promoter row identity is her own user id'
);

-- Supervisor sees rows for assigned location, the promoter at it, and the campaign
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'role', 'authenticated')::text,
  true);
select cmp_ok(
  (select count(*)::int from public.performance_snapshots),
  '>=',
  3,
  'supervisor sees >= 3 rows (location + promoter at assigned loc + campaign)'
);

-- Client sees campaign-scope ONLY (per D-019)
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'role', 'authenticated')::text,
  true);
select is(
  (select count(*)::int from public.performance_snapshots),
  1,
  'client sees exactly 1 row (campaign-scope only)'
);
select is(
  (select scope_kind::text from public.performance_snapshots limit 1),
  'campaign',
  'client row is campaign-scoped'
);

-- ============================================================================
-- D. performance_latest view returns most recent period_start per scope/period
-- ============================================================================

set local role postgres;

insert into public.performance_snapshots
  (scope_kind, scope_id, campaign_id, period_kind, period_start, period_end,
   conversion_rate, tier)
values
  ('promoter', 'cccccccc-cccc-cccc-cccc-cccccccccccc',
   '22222222-2222-2222-2222-222222222222', 'daily',
   '2026-04-20', '2026-04-20', 0.70, 'top');

select is(
  (select period_start::text
     from public.performance_latest
     where scope_kind = 'promoter'
       and scope_id   = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
       and campaign_id = '22222222-2222-2222-2222-222222222222'
       and period_kind = 'daily'),
  '2026-04-20',
  'performance_latest picks the newest period_start row'
);

select is(
  (select conversion_rate::text
     from public.performance_latest
     where scope_kind = 'promoter'
       and scope_id   = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
       and campaign_id = '22222222-2222-2222-2222-222222222222'
       and period_kind = 'daily'),
  '0.7000',
  'performance_latest carries the matching row''s conversion_rate'
);

select * from finish();
rollback;
