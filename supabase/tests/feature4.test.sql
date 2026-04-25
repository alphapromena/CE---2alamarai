-- Feature 4 — pgtap tests for D-041.
-- Run with: supabase db test
-- Rollback at end; fixtures ephemeral.

begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;

-- 2 photo-optional + 3 visit RLS = 5. Bumped to 6 with enum value check.
select plan(6);

-- ============================================================================
-- Fixtures.
-- ============================================================================
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at, raw_user_meta_data)
values
  -- admin
  ('00000000-0000-0000-0000-0000000004a0','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','adminF4@test.local','',now(),now(),now(),
   jsonb_build_object('role','admin','full_name','F4 Admin')),
  -- supervisor
  ('00000000-0000-0000-0000-0000000004b0','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','supF4@test.local','',now(),now(),now(),
   jsonb_build_object('role','supervisor','full_name','F4 Supervisor')),
  -- promoter A (visited promoter)
  ('00000000-0000-0000-0000-0000000004c0','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','proA_F4@test.local','',now(),now(),now(),
   jsonb_build_object('role','promoter','full_name','F4 Promoter A')),
  -- promoter B (uninvolved)
  ('00000000-0000-0000-0000-0000000004c1','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','proB_F4@test.local','',now(),now(),now(),
   jsonb_build_object('role','promoter','full_name','F4 Promoter B')),
  -- client user
  ('00000000-0000-0000-0000-0000000004d0','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','cliF4@test.local','',now(),now(),now(),
   jsonb_build_object('role','client','full_name','F4 Client',
                      'client_id','77777777-7777-7777-7777-777777774040'));

-- Tenant for the client.
insert into public.clients (id, name, name_i18n) values
  ('77777777-7777-7777-7777-777777774040','F4Client',
   jsonb_build_object('en','F4Client','ar','عميل ٤'));

-- Core campaign + location + link for the attendance/visit inserts.
insert into public.campaigns (id, client_id, name_i18n, status, start_date, end_date)
values
  ('55555555-5555-5555-5555-555555554040',
   '77777777-7777-7777-7777-777777774040',
   jsonb_build_object('en','F4 Campaign','ar','حملة ٤'),
   'active',
   current_date - 1,
   current_date + 30);

insert into public.regions (id, name_i18n) values
  ('44444444-4444-4444-4444-444444444040', jsonb_build_object('en','F4 Reg','ar','منطقة ٤'));

insert into public.cities (id, region_id, name_i18n) values
  ('33333333-3333-3333-3333-333333334040',
   '44444444-4444-4444-4444-444444444040',
   jsonb_build_object('en','F4 City','ar','مدينة ٤'));

insert into public.locations (id, city_id, name_i18n, lat, lng, geofence_radius_m, active)
values
  ('66666666-6666-6666-6666-666666664040',
   '33333333-3333-3333-3333-333333334040',
   jsonb_build_object('en','F4 Loc','ar','موقع ٤'),
   31.9530, 35.9100, 150, true);

insert into public.campaign_locations (campaign_id, location_id) values
  ('55555555-5555-5555-5555-555555554040',
   '66666666-6666-6666-6666-666666664040');

-- Assign promoter A + supervisor to the location.
update public.profiles
   set active = true,
       assigned_locations = array['66666666-6666-6666-6666-666666664040'::uuid]
 where id in ('00000000-0000-0000-0000-0000000004b0'::uuid,
              '00000000-0000-0000-0000-0000000004c0'::uuid,
              '00000000-0000-0000-0000-0000000004c1'::uuid);

create or replace function tests_auth_as(p_user_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_user_id::text, 'role','authenticated')::text, true);
end;
$$;

-- ============================================================================
-- 1. Attendance insert with NULL photo succeeds (Feature 4 / D-041).
--    Pre-Feature-4 this would fail the attendance_status_check_in_consistency
--    CHECK constraint with status='checked_in'.
-- ============================================================================
insert into public.attendance (
  id, user_id, campaign_id, location_id,
  attendance_date, check_in_time, check_in_lat, check_in_lng,
  check_in_photo_path, status, is_within_geofence,
  idempotency_key_check_in
) values (
  '99999999-9999-9999-9999-999999990001',
  '00000000-0000-0000-0000-0000000004c0',
  '55555555-5555-5555-5555-555555554040',
  '66666666-6666-6666-6666-666666664040',
  current_date, now(), 31.9530, 35.9100,
  null, 'checked_in', true,
  gen_random_uuid()
);

select is(
  (select check_in_photo_path
     from public.attendance
    where id = '99999999-9999-9999-9999-999999990001'),
  null,
  'photo optional (1/2): attendance row with NULL check_in_photo_path inserted'
);

-- Check-out leg with NULL photo too.
update public.attendance
   set check_out_time = now() + interval '4 hours',
       check_out_lat = 31.9530, check_out_lng = 35.9100,
       check_out_photo_path = null,
       status = 'checked_out',
       idempotency_key_check_out = gen_random_uuid()
 where id = '99999999-9999-9999-9999-999999990001';

select is(
  (select status from public.attendance
    where id = '99999999-9999-9999-9999-999999990001'),
  'checked_out'::public.attendance_status,
  'photo optional (2/2): check_out with NULL photo_path transitions to checked_out'
);

-- ============================================================================
-- 2. supervisor_visits promoter_id + promoter-self SELECT policy.
-- ============================================================================

-- Insert a visit for promoter A by the supervisor (bypass RLS as owner).
insert into public.supervisor_visits (
  id, supervisor_id, campaign_id, location_id, promoter_id,
  visited_at, lat, lng, distance_m, is_within_geofence,
  photo_path, outcome, idempotency_key
) values (
  '88888888-8888-8888-8888-888888884041',
  '00000000-0000-0000-0000-0000000004b0',
  '55555555-5555-5555-5555-555555554040',
  '66666666-6666-6666-6666-666666664040',
  '00000000-0000-0000-0000-0000000004c0',
  now(), 31.9530, 35.9100, 10, true,
  'visits/sup/test.jpg', 'ok', gen_random_uuid()
);

-- Promoter A (the visited one) can SELECT their row via the new policy.
select tests_auth_as('00000000-0000-0000-0000-0000000004c0');
select is(
  (select count(*)::int from public.supervisor_visits
    where id = '88888888-8888-8888-8888-888888884041'),
  1,
  'RLS (1/3): visited promoter sees the visit where promoter_id = self'
);
reset role;
reset "request.jwt.claims";

-- Promoter B (uninvolved) sees ZERO rows — no RLS policy grants access.
select tests_auth_as('00000000-0000-0000-0000-0000000004c1');
select is(
  (select count(*)::int from public.supervisor_visits),
  0,
  'RLS (2/3): uninvolved promoter sees zero supervisor_visits rows'
);
reset role;
reset "request.jwt.claims";

-- Client user (different tenant) sees ZERO rows.
select tests_auth_as('00000000-0000-0000-0000-0000000004d0');
select is(
  (select count(*)::int from public.supervisor_visits),
  0,
  'RLS (3/3): client role sees zero supervisor_visits rows'
);
reset role;
reset "request.jwt.claims";

-- ============================================================================
-- 3. notification_kind enum includes 'supervisor_visit'.
-- ============================================================================
select ok(
  exists(
    select 1 from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'notification_kind'
       and e.enumlabel = 'supervisor_visit'
  ),
  'notification_kind enum includes supervisor_visit (Migration C)'
);

select * from finish();
rollback;
