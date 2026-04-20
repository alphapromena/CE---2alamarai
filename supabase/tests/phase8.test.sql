-- Phase 8 — pgtap tests for consumer_feedback, competitor_mentions, and
-- export_jobs.
--
-- Covers:
--   A. consumer_feedback body / brand / category CHECKs.
--   B. consumer_feedback RLS:
--        - admin sees all
--        - promoter sees own rows only
--        - supervisor sees rows at assigned locations
--        - client has NO access (aggregates only via builders — D-019 / D-033)
--        - a second client sees zero rows (cross-tenant isolation)
--   C. competitor_mentions inherit parent visibility.
--   D. export_jobs RLS + INSERT policy:
--        - admin sees all
--        - requester sees own
--        - client INSERT succeeds when client_id = own client_id
--        - client INSERT with a DIFFERENT client_id is rejected
--        - cross-tenant client sees 0 jobs

begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;

select plan(14);

-- ============================================================================
-- Fixtures
-- ============================================================================
insert into public.clients (id, name, active) values
  ('10000000-0000-0000-0000-000000000001', 'Almarai',   true),
  ('10000000-0000-0000-0000-000000000002', 'Other Co.', true);

insert into public.campaigns (
  id, client_id, name_i18n, start_date, end_date, status, kpi_config
) values (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  jsonb_build_object('en', 'Almarai Spring', 'ar', 'الربيع'),
  '2026-04-01', '2026-04-30', 'active',
  '{}'::jsonb
);

insert into public.regions (id, name_i18n) values
  ('30000000-0000-0000-0000-000000000001', jsonb_build_object('en', 'Amman', 'ar', 'عمّان'));
insert into public.cities (id, region_id, name_i18n) values
  ('40000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001',
   jsonb_build_object('en', 'Amman', 'ar', 'عمّان'));
insert into public.locations (id, city_id, name_i18n, lat, lng, geofence_radius_m) values
  ('50000000-0000-0000-0000-000000000001',
   '40000000-0000-0000-0000-000000000001',
   jsonb_build_object('en', 'Safeway'), 31.99, 35.83, 100);

insert into public.campaign_locations (campaign_id, location_id) values
  ('20000000-0000-0000-0000-000000000001',
   '50000000-0000-0000-0000-000000000001');

insert into public.profiles (id, role, full_name, active) values
  ('a0000000-0000-0000-0000-000000000001', 'admin',      'Admin Adi',      true),
  ('b0000000-0000-0000-0000-000000000001', 'supervisor', 'Sup Sami',       true),
  ('c0000000-0000-0000-0000-000000000001', 'promoter',   'Promoter Pina',  true),
  ('c0000000-0000-0000-0000-000000000002', 'promoter',   'Promoter Other', true);

insert into public.profiles (id, role, full_name, active, client_id) values
  ('e0000000-0000-0000-0000-000000000001', 'client', 'Client Cara',  true,
   '10000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-000000000002', 'client', 'Client Other', true,
   '10000000-0000-0000-0000-000000000002');

insert into public.user_assignments (user_id, location_id, role, active) values
  ('b0000000-0000-0000-0000-000000000001',
   '50000000-0000-0000-0000-000000000001', 'supervisor', true),
  ('c0000000-0000-0000-0000-000000000001',
   '50000000-0000-0000-0000-000000000001', 'promoter', true);

-- ============================================================================
-- A. consumer_feedback CHECK constraints
-- ============================================================================
select throws_ok(
  $$insert into public.consumer_feedback
      (campaign_id, location_id, promoter_user_id, category, body, idempotency_key)
    values ('20000000-0000-0000-0000-000000000001',
            '50000000-0000-0000-0000-000000000001',
            'c0000000-0000-0000-0000-000000000001',
            'product', '', gen_random_uuid())$$,
  null,
  'rejects empty feedback body'
);

select throws_ok(
  $$insert into public.competitor_mentions (feedback_id, brand)
    values (gen_random_uuid(), '')$$,
  null,
  'rejects empty competitor brand'
);

-- ============================================================================
-- Seed rows: promoter Pina posts 2 feedback rows at the Safeway location;
-- promoter Other posts 1 feedback row at a DIFFERENT location for a DIFFERENT
-- campaign so cross-tenant isolation can be asserted.
-- ============================================================================
insert into public.locations (id, city_id, name_i18n, lat, lng, geofence_radius_m) values
  ('50000000-0000-0000-0000-000000000002',
   '40000000-0000-0000-0000-000000000001',
   jsonb_build_object('en', 'Other POS'), 31.90, 35.80, 100);

insert into public.campaigns (
  id, client_id, name_i18n, start_date, end_date, status, kpi_config
) values (
  '20000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000002',
  jsonb_build_object('en', 'Other Brand Spring', 'ar', 'الربيع'),
  '2026-04-01', '2026-04-30', 'active',
  '{}'::jsonb
);

insert into public.campaign_locations (campaign_id, location_id) values
  ('20000000-0000-0000-0000-000000000002',
   '50000000-0000-0000-0000-000000000002');

insert into public.consumer_feedback
  (id, campaign_id, location_id, promoter_user_id, category, sentiment, body, idempotency_key)
values
  ('f0000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001',
   '50000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000001',
   'product', 'positive', 'Consumer liked the yogurt.', gen_random_uuid()),
  ('f0000000-0000-0000-0000-000000000002',
   '20000000-0000-0000-0000-000000000001',
   '50000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000001',
   'complaint', 'negative', 'Too cold to sample.', gen_random_uuid()),
  ('f0000000-0000-0000-0000-000000000003',
   '20000000-0000-0000-0000-000000000002',
   '50000000-0000-0000-0000-000000000002',
   'c0000000-0000-0000-0000-000000000002',
   'service', null, 'Tasting setup delayed.', gen_random_uuid());

insert into public.competitor_mentions (feedback_id, brand)
  values ('f0000000-0000-0000-0000-000000000001', 'Nadec');

-- ============================================================================
-- B. consumer_feedback RLS
-- ============================================================================
set local role authenticated;

-- Admin sees all 3
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'a0000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true);
select is(
  (select count(*)::int from public.consumer_feedback),
  3,
  'admin sees all 3 consumer_feedback rows'
);

-- Promoter Pina sees own 2
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'c0000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true);
select is(
  (select count(*)::int from public.consumer_feedback),
  2,
  'promoter sees own feedback rows only'
);

-- Supervisor sees 2 (the Safeway rows; not the Other POS row)
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'b0000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true);
select is(
  (select count(*)::int from public.consumer_feedback),
  2,
  'supervisor sees rows at assigned location only'
);

-- Client (Almarai) has ZERO access — D-019 / D-033 aggregates only
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'e0000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true);
select is(
  (select count(*)::int from public.consumer_feedback),
  0,
  'client role cannot read raw consumer_feedback (D-033)'
);

-- Other client sees zero too (cross-tenant isolation)
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'e0000000-0000-0000-0000-000000000002', 'role', 'authenticated')::text,
  true);
select is(
  (select count(*)::int from public.consumer_feedback),
  0,
  'other client is blocked from all raw feedback (cross-tenant)'
);

-- ============================================================================
-- C. competitor_mentions inherit parent visibility
-- ============================================================================
-- Admin — sees the one mention row
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'a0000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true);
select is(
  (select count(*)::int from public.competitor_mentions),
  1,
  'admin sees all competitor_mentions'
);

-- Client — zero (parent is blocked → child is blocked)
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'e0000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true);
select is(
  (select count(*)::int from public.competitor_mentions),
  0,
  'client cannot read competitor_mentions (parent blocked)'
);

-- ============================================================================
-- D. export_jobs RLS + client-scope INSERT enforcement
-- ============================================================================
-- Seed: admin queues an export (service-role-style via postgres), plus
-- client Cara queues one.
set local role postgres;

insert into public.export_jobs
  (id, requested_by, client_id, scope, format, status, idempotency_key)
values
  ('e1000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001',
   null,
   jsonb_build_object(
     'campaign_ids', '[]'::jsonb, 'location_ids', '[]'::jsonb, 'sku_ids', '[]'::jsonb,
     'from_date', '2026-04-01', 'to_date', '2026-04-30',
     'domains', to_jsonb(array['activity'])),
   'xlsx', 'queued', gen_random_uuid()),
  ('e1000000-0000-0000-0000-000000000002',
   'e0000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   jsonb_build_object(
     'campaign_ids', to_jsonb(array['20000000-0000-0000-0000-000000000001']),
     'location_ids', '[]'::jsonb, 'sku_ids', '[]'::jsonb,
     'from_date', '2026-04-01', 'to_date', '2026-04-30',
     'domains', to_jsonb(array['activity'])),
   'xlsx', 'queued', gen_random_uuid());

-- Admin sees both
set local role authenticated;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'a0000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true);
select is(
  (select count(*)::int from public.export_jobs),
  2,
  'admin sees both export_jobs rows'
);

-- Almarai client sees only her own job
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'e0000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true);
select is(
  (select count(*)::int from public.export_jobs),
  1,
  'client sees own export_jobs only'
);

-- Other client (cross-tenant) sees zero
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'e0000000-0000-0000-0000-000000000002', 'role', 'authenticated')::text,
  true);
select is(
  (select count(*)::int from public.export_jobs),
  0,
  'cross-tenant client sees zero export_jobs'
);

-- Client INSERT with matching client_id succeeds
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'e0000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true);
select lives_ok(
  $$insert into public.export_jobs
     (requested_by, client_id, scope, format, status, idempotency_key)
   values (
     'e0000000-0000-0000-0000-000000000001',
     '10000000-0000-0000-0000-000000000001',
     jsonb_build_object(
       'campaign_ids', to_jsonb(array['20000000-0000-0000-0000-000000000001']),
       'location_ids', '[]'::jsonb, 'sku_ids', '[]'::jsonb,
       'from_date', '2026-04-01', 'to_date', '2026-04-30',
       'domains', to_jsonb(array['activity'])),
     'csv_zip', 'queued', gen_random_uuid())$$,
  'client can INSERT export_jobs with matching client_id'
);

-- Client INSERT with DIFFERENT client_id is rejected (RLS WITH CHECK)
select throws_ok(
  $$insert into public.export_jobs
     (requested_by, client_id, scope, format, status, idempotency_key)
   values (
     'e0000000-0000-0000-0000-000000000001',
     '10000000-0000-0000-0000-000000000002',
     jsonb_build_object(
       'campaign_ids', '[]'::jsonb, 'location_ids', '[]'::jsonb, 'sku_ids', '[]'::jsonb,
       'from_date', '2026-04-01', 'to_date', '2026-04-30',
       'domains', to_jsonb(array['activity'])),
     'xlsx', 'queued', gen_random_uuid())$$,
  null,
  'client INSERT with mismatched client_id is rejected by RLS'
);

-- ============================================================================
-- E. export_jobs done_has_result CHECK
-- ============================================================================
set local role postgres;
select throws_ok(
  $$insert into public.export_jobs
     (requested_by, client_id, scope, format, status, idempotency_key)
   values (
     'a0000000-0000-0000-0000-000000000001', null,
     jsonb_build_object(
       'campaign_ids', '[]'::jsonb, 'location_ids', '[]'::jsonb, 'sku_ids', '[]'::jsonb,
       'from_date', '2026-04-01', 'to_date', '2026-04-30',
       'domains', to_jsonb(array['activity'])),
     'xlsx', 'done', gen_random_uuid())$$,
  null,
  'status=done with no result_path is rejected by CHECK'
);

select * from finish();
rollback;
