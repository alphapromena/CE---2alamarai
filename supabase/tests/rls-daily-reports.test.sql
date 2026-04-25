-- QUAL-01 — pgtap RLS tests for the daily_reports cluster.
-- Run with: supabase db test
-- Wraps in a single rolled-back transaction; fixtures don't persist.
--
-- Covers daily_reports + sales_entries + activity_photos as a related
-- cluster (the activity / sales children inherit the parent report's
-- visibility via EXISTS-against-daily_reports policies). The headline
-- boundaries:
--   * cross-supervisor isolation — sup_X at loc_X must not see proY's
--     report at loc_Y
--   * cross-promoter isolation — proY must not see proX's sales_entries
--     even though both work the same campaign
--   * lifecycle gate — a promoter cannot UPDATE their own report once it
--     is approved/rejected (frozen)
--   * client has zero access (D-019; aggregates only — Phase 8)

begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;

-- 5 SELECT (admin / promoter-self / sup-at-loc / cross-supervisor / client) +
-- 2 INSERT (promoter own draft / for another promoter rejected) +
-- 1 child SELECT (promoter sees own activity_photos) +
-- 1 child cross-promoter (proY cannot see proX's sales_entries) +
-- 1 lifecycle (promoter UPDATE on approved row is silent no-op) = 10.
select plan(10);

-- ============================================================================
-- Fixtures. UUID suffix range 9b** to avoid collision with existing tests.
-- ============================================================================
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000009b01','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','adminB@test.local','',now(),now(),now(),
   jsonb_build_object('role','admin','full_name','RLS-B Admin')),
  ('00000000-0000-0000-0000-000000009b02','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','supXB@test.local','',now(),now(),now(),
   jsonb_build_object('role','supervisor','full_name','RLS-B Supervisor X')),
  ('00000000-0000-0000-0000-000000009b03','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','supYB@test.local','',now(),now(),now(),
   jsonb_build_object('role','supervisor','full_name','RLS-B Supervisor Y')),
  ('00000000-0000-0000-0000-000000009b04','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','proXB@test.local','',now(),now(),now(),
   jsonb_build_object('role','promoter','full_name','RLS-B Promoter X')),
  ('00000000-0000-0000-0000-000000009b05','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','proYB@test.local','',now(),now(),now(),
   jsonb_build_object('role','promoter','full_name','RLS-B Promoter Y')),
  ('00000000-0000-0000-0000-000000009b06','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','cliB@test.local','',now(),now(),now(),
   jsonb_build_object('role','client','full_name','RLS-B Client',
                      'client_id','77777777-7777-7777-7777-777777779b01'));

insert into public.clients (id, name, name_i18n) values
  ('77777777-7777-7777-7777-777777779b01','RLS-B Client',
   jsonb_build_object('en','RLS-B Client','ar','عميل اختبار-ب'));

insert into public.regions (id, name_i18n) values
  ('44444444-4444-4444-4444-444444449b01',
   jsonb_build_object('en','RLS-B Region','ar','منطقة اختبار-ب'));

insert into public.cities (id, region_id, name_i18n) values
  ('33333333-3333-3333-3333-333333339b01',
   '44444444-4444-4444-4444-444444449b01',
   jsonb_build_object('en','RLS-B City','ar','مدينة اختبار-ب'));

insert into public.locations (id, city_id, name_i18n, lat, lng, geofence_radius_m, active)
values
  ('66666666-6666-6666-6666-666666669b01',
   '33333333-3333-3333-3333-333333339b01',
   jsonb_build_object('en','RLS-B Loc X','ar','موقع اختبار-س'),
   31.95, 35.91, 150, true),
  ('66666666-6666-6666-6666-666666669b02',
   '33333333-3333-3333-3333-333333339b01',
   jsonb_build_object('en','RLS-B Loc Y','ar','موقع اختبار-ص'),
   31.96, 35.92, 150, true);

insert into public.campaigns (id, client_id, name_i18n, status, start_date, end_date)
values
  ('55555555-5555-5555-5555-555555559b01',
   '77777777-7777-7777-7777-777777779b01',
   jsonb_build_object('en','RLS-B Campaign','ar','حملة اختبار-ب'),
   'active',
   current_date - 1,
   current_date + 30);

insert into public.campaign_locations (campaign_id, location_id) values
  ('55555555-5555-5555-5555-555555559b01','66666666-6666-6666-6666-666666669b01'),
  ('55555555-5555-5555-5555-555555559b01','66666666-6666-6666-6666-666666669b02');

-- One SKU under the campaign so we can seed sales_entries.
insert into public.skus (id, campaign_id, name_i18n, unit_i18n)
values
  ('11111111-1111-1111-1111-111111119b01',
   '55555555-5555-5555-5555-555555559b01',
   jsonb_build_object('en','RLS-B SKU','ar','منتج اختبار-ب'),
   jsonb_build_object('en','box','ar','صندوق'));

-- Wire assigned_locations cache (read by current_user_locations()).
update public.profiles
   set active = true,
       assigned_locations = array['66666666-6666-6666-6666-666666669b01'::uuid]
 where id in ('00000000-0000-0000-0000-000000009b02'::uuid,
              '00000000-0000-0000-0000-000000009b04'::uuid);

update public.profiles
   set active = true,
       assigned_locations = array['66666666-6666-6666-6666-666666669b02'::uuid]
 where id in ('00000000-0000-0000-0000-000000009b03'::uuid,
              '00000000-0000-0000-0000-000000009b05'::uuid);

create or replace function tests_auth_as(p_user_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_user_id::text, 'role','authenticated')::text, true);
end;
$$;

-- Pre-seed two daily_reports (proX@locX, proY@locY) plus one approved
-- report for proX (used for the lifecycle test).
insert into public.daily_reports (
  id, campaign_id, location_id, promoter_user_id,
  report_date, contacts, engaged, status, idempotency_key
) values
  ('99999999-9999-9999-9999-999999909b01',
   '55555555-5555-5555-5555-555555559b01',
   '66666666-6666-6666-6666-666666669b01',
   '00000000-0000-0000-0000-000000009b04',
   current_date, 10, 4, 'draft', gen_random_uuid()),
  ('99999999-9999-9999-9999-999999909b02',
   '55555555-5555-5555-5555-555555559b01',
   '66666666-6666-6666-6666-666666669b02',
   '00000000-0000-0000-0000-000000009b05',
   current_date, 8, 3, 'draft', gen_random_uuid());

-- Approved report for proX yesterday — used to test the lifecycle gate.
insert into public.daily_reports (
  id, campaign_id, location_id, promoter_user_id,
  report_date, contacts, engaged, status,
  submitted_at, reviewed_at, reviewed_by, idempotency_key
) values
  ('99999999-9999-9999-9999-999999909b03',
   '55555555-5555-5555-5555-555555559b01',
   '66666666-6666-6666-6666-666666669b01',
   '00000000-0000-0000-0000-000000009b04',
   current_date - 1, 12, 5, 'approved',
   now() - interval '8 hours', now() - interval '4 hours',
   '00000000-0000-0000-0000-000000009b02', gen_random_uuid());

-- One sales_entry on proX's draft report.
insert into public.sales_entries (
  id, daily_report_id, sku_id, samples, sales
) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa9b01',
   '99999999-9999-9999-9999-999999909b01',
   '11111111-1111-1111-1111-111111119b01',
   2, 1);

-- One activity_photo on proX's draft report.
insert into public.activity_photos (
  id, daily_report_id, photo_kind, storage_path
) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb9b01',
   '99999999-9999-9999-9999-999999909b01',
   'setup',
   'activity/' || '00000000-0000-0000-0000-000000009b04' || '/setup.jpg');

-- ============================================================================
-- daily_reports SELECT — 5 assertions (incl. cross-supervisor)
-- ============================================================================

-- 1. Admin sees all three rows.
select tests_auth_as('00000000-0000-0000-0000-000000009b01');
select is(
  (select count(*)::int from public.daily_reports),
  3,
  'daily_reports SELECT: admin sees all reports'
);
reset role;
reset "request.jwt.claims";

-- 2. Promoter X sees own reports only (today's draft + yesterday's approved = 2).
select tests_auth_as('00000000-0000-0000-0000-000000009b04');
select is(
  (select count(*)::int from public.daily_reports),
  2,
  'daily_reports SELECT: promoter sees own reports only'
);
reset role;
reset "request.jwt.claims";

-- 3. Supervisor X sees rows at assigned location (loc_X) — proX's two reports.
select tests_auth_as('00000000-0000-0000-0000-000000009b02');
select is(
  (select count(*)::int from public.daily_reports),
  2,
  'daily_reports SELECT: supervisor sees rows at assigned location only'
);
reset role;
reset "request.jwt.claims";

-- 4. Cross-supervisor isolation — sup_X must NOT see proY's report at loc_Y.
select tests_auth_as('00000000-0000-0000-0000-000000009b02');
select is(
  (select count(*)::int from public.daily_reports
    where id = '99999999-9999-9999-9999-999999909b02'),
  0,
  'daily_reports SELECT: cross-supervisor isolation — sup X cannot see loc Y row'
);
reset role;
reset "request.jwt.claims";

-- 5. Client sees zero (D-019 — no client policy on daily_reports).
select tests_auth_as('00000000-0000-0000-0000-000000009b06');
select is(
  (select count(*)::int from public.daily_reports),
  0,
  'daily_reports SELECT: client role sees zero rows'
);
reset role;
reset "request.jwt.claims";

-- ============================================================================
-- daily_reports INSERT — 2 assertions
-- ============================================================================

-- 6. Promoter X can INSERT own draft at assigned location.
select tests_auth_as('00000000-0000-0000-0000-000000009b04');
insert into public.daily_reports (
  id, campaign_id, location_id, promoter_user_id,
  report_date, contacts, engaged, status, idempotency_key
) values (
  '99999999-9999-9999-9999-999999909b04',
  '55555555-5555-5555-5555-555555559b01',
  '66666666-6666-6666-6666-666666669b01',
  '00000000-0000-0000-0000-000000009b04',
  current_date - 2, 5, 2, 'draft', gen_random_uuid()
);
select pass('daily_reports INSERT: promoter can insert own draft at assigned location');
reset role;
reset "request.jwt.claims";

-- 7. Promoter X CANNOT INSERT a report for promoter Y (different promoter_user_id).
select tests_auth_as('00000000-0000-0000-0000-000000009b04');
select throws_like(
  $$insert into public.daily_reports (
      id, campaign_id, location_id, promoter_user_id,
      report_date, contacts, engaged, status, idempotency_key
    ) values (
      '99999999-9999-9999-9999-999999909b05',
      '55555555-5555-5555-5555-555555559b01',
      '66666666-6666-6666-6666-666666669b01',
      '00000000-0000-0000-0000-000000009b05',
      current_date - 3, 5, 2, 'draft', gen_random_uuid()
    )$$,
  '%row-level security%',
  'daily_reports INSERT: promoter cannot insert a report owned by another promoter'
);
reset role;
reset "request.jwt.claims";

-- ============================================================================
-- Child tables — visibility inherits from daily_reports via EXISTS join
-- ============================================================================

-- 8. Promoter X sees their own activity_photo (via daily_reports parent).
select tests_auth_as('00000000-0000-0000-0000-000000009b04');
select is(
  (select count(*)::int from public.activity_photos
    where daily_report_id = '99999999-9999-9999-9999-999999909b01'),
  1,
  'activity_photos SELECT: promoter sees photos on their own report'
);
reset role;
reset "request.jwt.claims";

-- 9. Cross-promoter isolation — promoter Y cannot see promoter X's sales_entries.
select tests_auth_as('00000000-0000-0000-0000-000000009b05');
select is(
  (select count(*)::int from public.sales_entries
    where daily_report_id = '99999999-9999-9999-9999-999999909b01'),
  0,
  'sales_entries SELECT: cross-promoter isolation — proY cannot see proX entries'
);
reset role;
reset "request.jwt.claims";

-- ============================================================================
-- Lifecycle gate — promoter cannot UPDATE their own approved report
-- ============================================================================

-- 10. The USING-side filter on daily_reports_update_self_promoter is
--     `status in ('draft','submitted')`. An UPDATE attempt on an approved
--     row by the owning promoter is silent no-op (zero rows affected).
--     Verify by re-querying as admin.
select tests_auth_as('00000000-0000-0000-0000-000000009b04');
update public.daily_reports
   set notes = 'promoter tampering with approved report'
 where id = '99999999-9999-9999-9999-999999909b03';
reset role;
reset "request.jwt.claims";
select tests_auth_as('00000000-0000-0000-0000-000000009b01');
select is(
  (select notes from public.daily_reports
    where id = '99999999-9999-9999-9999-999999909b03'),
  null,
  'daily_reports UPDATE: promoter cannot mutate own report once approved (lifecycle gate)'
);
reset role;
reset "request.jwt.claims";

select * from finish();
rollback;
