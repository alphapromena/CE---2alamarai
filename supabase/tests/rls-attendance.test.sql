-- QUAL-01 — pgtap RLS tests for public.attendance.
-- Run with: supabase db test
-- Wraps in a single rolled-back transaction; fixtures don't persist.
--
-- Extends the existing UPDATE-only coverage in feature4.test.sql
-- (supervisor-override path) to the full role × operation matrix:
--   admin / supervisor / promoter / client × SELECT / INSERT / UPDATE / DELETE.
-- The headline boundary tested here is cross-supervisor isolation — sup_X
-- assigned to loc_X must NOT see, INSERT into, UPDATE, or DELETE attendance
-- at loc_Y assigned to sup_Y.

begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;

-- 5 SELECT (admin / promoter-self / sup-at-loc / sup-cross / client) +
-- 2 INSERT (promoter own@assigned / promoter @unassigned reject) +
-- 2 UPDATE (sup own-loc / sup cross-loc no-op) +
-- 1 DELETE (promoter own no-op) = 10.
select plan(10);

-- ============================================================================
-- Fixtures — auth.users → handle_new_user materialises profiles.
-- One admin, two supervisors at distinct locations, two promoters at distinct
-- locations, one client. UUIDs in the 9a** suffix range to avoid collision
-- with rls / phase / feature test fixtures.
-- ============================================================================
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000009a01','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','adminA@test.local','',now(),now(),now(),
   jsonb_build_object('role','admin','full_name','RLS-A Admin')),
  ('00000000-0000-0000-0000-000000009a02','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','supX@test.local','',now(),now(),now(),
   jsonb_build_object('role','supervisor','full_name','RLS-A Supervisor X')),
  ('00000000-0000-0000-0000-000000009a03','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','supY@test.local','',now(),now(),now(),
   jsonb_build_object('role','supervisor','full_name','RLS-A Supervisor Y')),
  ('00000000-0000-0000-0000-000000009a04','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','proX@test.local','',now(),now(),now(),
   jsonb_build_object('role','promoter','full_name','RLS-A Promoter X')),
  ('00000000-0000-0000-0000-000000009a05','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','proY@test.local','',now(),now(),now(),
   jsonb_build_object('role','promoter','full_name','RLS-A Promoter Y')),
  ('00000000-0000-0000-0000-000000009a06','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','cliA@test.local','',now(),now(),now(),
   jsonb_build_object('role','client','full_name','RLS-A Client',
                      'client_id','77777777-7777-7777-7777-777777779a01'));

-- Tenant for the client.
insert into public.clients (id, name, name_i18n) values
  ('77777777-7777-7777-7777-777777779a01','RLS-A Client',
   jsonb_build_object('en','RLS-A Client','ar','عميل اختبار-أ'));

-- Geography.
insert into public.regions (id, name_i18n) values
  ('44444444-4444-4444-4444-444444449a01',
   jsonb_build_object('en','RLS-A Region','ar','منطقة اختبار-أ'));

insert into public.cities (id, region_id, name_i18n) values
  ('33333333-3333-3333-3333-333333339a01',
   '44444444-4444-4444-4444-444444449a01',
   jsonb_build_object('en','RLS-A City','ar','مدينة اختبار-أ'));

-- Two locations — one per supervisor / promoter pair.
insert into public.locations (id, city_id, name_i18n, lat, lng, geofence_radius_m, active)
values
  ('66666666-6666-6666-6666-666666669a01',
   '33333333-3333-3333-3333-333333339a01',
   jsonb_build_object('en','RLS-A Loc X','ar','موقع اختبار-س'),
   31.9530, 35.9100, 150, true),
  ('66666666-6666-6666-6666-666666669a02',
   '33333333-3333-3333-3333-333333339a01',
   jsonb_build_object('en','RLS-A Loc Y','ar','موقع اختبار-ص'),
   31.9600, 35.9200, 150, true);

-- One campaign covers both locations (cross-supervisor isolation must hold
-- even when both promoters work the same campaign).
insert into public.campaigns (id, client_id, name_i18n, status, start_date, end_date)
values
  ('55555555-5555-5555-5555-555555559a01',
   '77777777-7777-7777-7777-777777779a01',
   jsonb_build_object('en','RLS-A Campaign','ar','حملة اختبار-أ'),
   'active',
   current_date - 1,
   current_date + 30);

insert into public.campaign_locations (campaign_id, location_id) values
  ('55555555-5555-5555-5555-555555559a01','66666666-6666-6666-6666-666666669a01'),
  ('55555555-5555-5555-5555-555555559a01','66666666-6666-6666-6666-666666669a02');

-- Wire the assigned_locations cache that current_user_locations() reads.
-- supervisor X + promoter X → loc X only; supervisor Y + promoter Y → loc Y only.
update public.profiles
   set active = true,
       assigned_locations = array['66666666-6666-6666-6666-666666669a01'::uuid]
 where id in ('00000000-0000-0000-0000-000000009a02'::uuid,
              '00000000-0000-0000-0000-000000009a04'::uuid);

update public.profiles
   set active = true,
       assigned_locations = array['66666666-6666-6666-6666-666666669a02'::uuid]
 where id in ('00000000-0000-0000-0000-000000009a03'::uuid,
              '00000000-0000-0000-0000-000000009a05'::uuid);

-- Impersonation helper. Duplicated verbatim across the suite (per
-- _helpers.sql extraction deferred to a follow-up PR — see audit/rls-pgtap-plan.md).
create or replace function tests_auth_as(p_user_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_user_id::text, 'role','authenticated')::text, true);
end;
$$;

-- Pre-seed two attendance rows: one for proX@locX, one for proY@locY.
-- Inserted as the table owner (postgres) so RLS doesn't gate fixture setup.
insert into public.attendance (
  id, user_id, campaign_id, location_id,
  attendance_date, check_in_time, check_in_lat, check_in_lng,
  check_in_photo_path, status, is_within_geofence,
  idempotency_key_check_in
) values
  ('99999999-9999-9999-9999-999999909a01',
   '00000000-0000-0000-0000-000000009a04',
   '55555555-5555-5555-5555-555555559a01',
   '66666666-6666-6666-6666-666666669a01',
   current_date, now(), 31.9530, 35.9100,
   null, 'checked_in', true,
   gen_random_uuid()),
  ('99999999-9999-9999-9999-999999909a02',
   '00000000-0000-0000-0000-000000009a05',
   '55555555-5555-5555-5555-555555559a01',
   '66666666-6666-6666-6666-666666669a02',
   current_date, now(), 31.9600, 35.9200,
   null, 'checked_in', true,
   gen_random_uuid());

-- ============================================================================
-- SELECT — 5 assertions covering the cross-supervisor isolation boundary
-- ============================================================================

-- 1. Admin sees both rows.
select tests_auth_as('00000000-0000-0000-0000-000000009a01');
select is(
  (select count(*)::int from public.attendance),
  2,
  'attendance SELECT: admin sees both attendance rows'
);
reset role;
reset "request.jwt.claims";

-- 2. Promoter X sees only their own row (1 row, with their user_id).
select tests_auth_as('00000000-0000-0000-0000-000000009a04');
select is(
  (select count(*)::int from public.attendance),
  1,
  'attendance SELECT: promoter sees only their own attendance row'
);
reset role;
reset "request.jwt.claims";

-- 3. Supervisor X sees only the row at their assigned location (proX@locX).
select tests_auth_as('00000000-0000-0000-0000-000000009a02');
select is(
  (select id from public.attendance),
  '99999999-9999-9999-9999-999999909a01'::uuid,
  'attendance SELECT: supervisor sees rows at assigned location only'
);
reset role;
reset "request.jwt.claims";

-- 4. Cross-supervisor isolation — sup X must NOT see the row at loc Y.
--    Re-uses the assertion above's contract (sup X gets exactly 1 row);
--    here we pin that the row they DO see is NOT proY's row.
select tests_auth_as('00000000-0000-0000-0000-000000009a02');
select is(
  (select count(*)::int from public.attendance
    where id = '99999999-9999-9999-9999-999999909a02'),
  0,
  'attendance SELECT: cross-supervisor isolation — sup X cannot see loc Y row'
);
reset role;
reset "request.jwt.claims";

-- 5. Client sees zero — no policy grants client SELECT on attendance
--    (D-019 / Phase 3: client gets aggregates only).
select tests_auth_as('00000000-0000-0000-0000-000000009a06');
select is(
  (select count(*)::int from public.attendance),
  0,
  'attendance SELECT: client role sees zero rows'
);
reset role;
reset "request.jwt.claims";

-- ============================================================================
-- INSERT — 2 assertions: promoter at assigned loc OK; at unassigned loc rejected
-- ============================================================================

-- 6. Promoter X can INSERT a self attendance row at their assigned loc X.
select tests_auth_as('00000000-0000-0000-0000-000000009a04');
insert into public.attendance (
  id, user_id, campaign_id, location_id,
  attendance_date, check_in_time, check_in_lat, check_in_lng,
  check_in_photo_path, status, is_within_geofence,
  idempotency_key_check_in
) values (
  '99999999-9999-9999-9999-999999909a03',
  '00000000-0000-0000-0000-000000009a04',
  '55555555-5555-5555-5555-555555559a01',
  '66666666-6666-6666-6666-666666669a01',
  current_date, now() + interval '1 second', 31.9530, 35.9100,
  null, 'checked_in', true,
  gen_random_uuid()
);
select pass('attendance INSERT: promoter can insert own row at assigned location');
reset role;
reset "request.jwt.claims";

-- 7. Promoter X CANNOT INSERT at loc Y (not in their assigned_locations).
select tests_auth_as('00000000-0000-0000-0000-000000009a04');
select throws_like(
  $$insert into public.attendance (
      id, user_id, campaign_id, location_id,
      attendance_date, check_in_time, check_in_lat, check_in_lng,
      check_in_photo_path, status, is_within_geofence,
      idempotency_key_check_in
    ) values (
      '99999999-9999-9999-9999-999999909a04',
      '00000000-0000-0000-0000-000000009a04',
      '55555555-5555-5555-5555-555555559a01',
      '66666666-6666-6666-6666-666666669a02',
      current_date, now(), 31.9600, 35.9200,
      null, 'checked_in', true,
      gen_random_uuid()
    )$$,
  '%row-level security%',
  'attendance INSERT: promoter rejected at unassigned location'
);
reset role;
reset "request.jwt.claims";

-- ============================================================================
-- UPDATE — 2 assertions: supervisor at own loc OK; cross-loc silent no-op
-- ============================================================================

-- 8. Supervisor X can UPDATE the attendance row at loc X (notes field).
select tests_auth_as('00000000-0000-0000-0000-000000009a02');
update public.attendance
   set notes = 'sup X note'
 where id = '99999999-9999-9999-9999-999999909a01';
select is(
  (select notes from public.attendance
    where id = '99999999-9999-9999-9999-999999909a01'),
  'sup X note',
  'attendance UPDATE: supervisor can update notes on row at assigned location'
);
reset role;
reset "request.jwt.claims";

-- 9. Supervisor X cannot UPDATE the row at loc Y. The USING-side filter
--    excludes the row, so the UPDATE is a silent no-op (zero rows
--    affected, no error). Verify by re-querying after attempting.
select tests_auth_as('00000000-0000-0000-0000-000000009a02');
update public.attendance
   set notes = 'sup X tampering'
 where id = '99999999-9999-9999-9999-999999909a02';
reset role;
reset "request.jwt.claims";
-- Re-query as admin to read the actual stored value.
select tests_auth_as('00000000-0000-0000-0000-000000009a01');
select is(
  (select notes from public.attendance
    where id = '99999999-9999-9999-9999-999999909a02'),
  null,
  'attendance UPDATE: cross-supervisor UPDATE is a silent no-op'
);
reset role;
reset "request.jwt.claims";

-- ============================================================================
-- DELETE — 1 assertion: promoter cannot DELETE own row (admin-only)
-- ============================================================================

-- 10. Promoter X attempts to DELETE their own attendance row. No DELETE
--     policy grants the promoter role; the row is RLS-filtered out and
--     the DELETE silently affects zero rows. Re-query and assert the row
--     still exists.
select tests_auth_as('00000000-0000-0000-0000-000000009a04');
delete from public.attendance
 where id = '99999999-9999-9999-9999-999999909a01';
reset role;
reset "request.jwt.claims";
select tests_auth_as('00000000-0000-0000-0000-000000009a01');
select is(
  (select count(*)::int from public.attendance
    where id = '99999999-9999-9999-9999-999999909a01'),
  1,
  'attendance DELETE: promoter cannot delete own row (silent no-op, admin-only policy)'
);
reset role;
reset "request.jwt.claims";

select * from finish();
rollback;
