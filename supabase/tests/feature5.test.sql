-- Feature 5 — pgtap tests for D-042 location_pings RLS.
-- Run with: supabase db test
-- Rollback at end; fixtures ephemeral.

begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;

-- 6 RLS tests + 1 gc sanity = 7.
select plan(7);

-- ============================================================================
-- Fixtures.
-- ============================================================================
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-0000000005a0','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','adminF5@test.local','',now(),now(),now(),
   jsonb_build_object('role','admin','full_name','F5 Admin')),
  ('00000000-0000-0000-0000-0000000005b0','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','supF5@test.local','',now(),now(),now(),
   jsonb_build_object('role','supervisor','full_name','F5 Supervisor')),
  ('00000000-0000-0000-0000-0000000005c0','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','proA_F5@test.local','',now(),now(),now(),
   jsonb_build_object('role','promoter','full_name','F5 Promoter A')),
  ('00000000-0000-0000-0000-0000000005c1','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','proB_F5@test.local','',now(),now(),now(),
   jsonb_build_object('role','promoter','full_name','F5 Promoter B')),
  ('00000000-0000-0000-0000-0000000005d0','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','cliF5@test.local','',now(),now(),now(),
   jsonb_build_object('role','client','full_name','F5 Client',
                      'client_id','77777777-7777-7777-7777-777777775050'));

insert into public.clients (id, name, name_i18n) values
  ('77777777-7777-7777-7777-777777775050','F5Client',
   jsonb_build_object('en','F5Client','ar','عميل ٥'));

insert into public.campaigns (id, client_id, name_i18n, status, start_date, end_date)
values
  ('55555555-5555-5555-5555-555555555050',
   '77777777-7777-7777-7777-777777775050',
   jsonb_build_object('en','F5 Campaign','ar','حملة ٥'),
   'active',
   current_date - 1,
   current_date + 30);

insert into public.regions (id, name_i18n) values
  ('44444444-4444-4444-4444-444444445050', jsonb_build_object('en','F5 Reg','ar','منطقة ٥'));

insert into public.cities (id, region_id, name_i18n) values
  ('33333333-3333-3333-3333-333333335050',
   '44444444-4444-4444-4444-444444445050',
   jsonb_build_object('en','F5 City','ar','مدينة ٥'));

insert into public.locations (id, city_id, name_i18n, lat, lng, geofence_radius_m, active)
values
  ('66666666-6666-6666-6666-666666665050',
   '33333333-3333-3333-3333-333333335050',
   jsonb_build_object('en','F5 Loc','ar','موقع ٥'),
   31.9530, 35.9100, 150, true);

insert into public.campaign_locations (campaign_id, location_id) values
  ('55555555-5555-5555-5555-555555555050',
   '66666666-6666-6666-6666-666666665050');

-- Supervisor + promoter A assigned to location; promoter B is not.
update public.profiles
   set active = true,
       assigned_locations = array['66666666-6666-6666-6666-666666665050'::uuid]
 where id in ('00000000-0000-0000-0000-0000000005b0'::uuid,
              '00000000-0000-0000-0000-0000000005c0'::uuid);

update public.profiles
   set active = true,
       assigned_locations = array[]::uuid[]
 where id = '00000000-0000-0000-0000-0000000005c1'::uuid;

create or replace function tests_auth_as(p_user_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_user_id::text, 'role','authenticated')::text, true);
end;
$$;

-- Open attendance for promoter A at the supervised location.
insert into public.attendance (
  id, user_id, campaign_id, location_id,
  attendance_date, check_in_time, check_in_lat, check_in_lng,
  check_in_photo_path, status, is_within_geofence,
  idempotency_key_check_in
) values (
  '99999999-9999-9999-9999-999999995051',
  '00000000-0000-0000-0000-0000000005c0',
  '55555555-5555-5555-5555-555555555050',
  '66666666-6666-6666-6666-666666665050',
  current_date, now(), 31.9530, 35.9100,
  null, 'checked_in', true,
  gen_random_uuid()
);

-- Seed one ping for promoter A (owner bypasses RLS).
insert into public.location_pings (
  id, attendance_id, promoter_id, lat, lng, accuracy_m, battery_pct
) values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa5051',
  '99999999-9999-9999-9999-999999995051',
  '00000000-0000-0000-0000-0000000005c0',
  31.9531, 35.9101, 12.5, 80
);

-- ============================================================================
-- 1. Promoter A sees their own ping.
-- ============================================================================
select tests_auth_as('00000000-0000-0000-0000-0000000005c0');
select is(
  (select count(*)::int from public.location_pings),
  1,
  'RLS: promoter sees own pings'
);
reset role;
reset "request.jwt.claims";

-- ============================================================================
-- 2. Uninvolved promoter B sees zero.
-- ============================================================================
select tests_auth_as('00000000-0000-0000-0000-0000000005c1');
select is(
  (select count(*)::int from public.location_pings),
  0,
  'RLS: other promoter sees zero pings'
);
reset role;
reset "request.jwt.claims";

-- ============================================================================
-- 3. Supervisor assigned to the location sees the ping.
-- ============================================================================
select tests_auth_as('00000000-0000-0000-0000-0000000005b0');
select is(
  (select count(*)::int from public.location_pings),
  1,
  'RLS: supervisor at location sees pings of promoters there'
);
reset role;
reset "request.jwt.claims";

-- ============================================================================
-- 4. Client user sees zero (no policy grants client access).
-- ============================================================================
select tests_auth_as('00000000-0000-0000-0000-0000000005d0');
select is(
  (select count(*)::int from public.location_pings),
  0,
  'RLS: client role sees zero pings'
);
reset role;
reset "request.jwt.claims";

-- ============================================================================
-- 5. Promoter cannot insert a ping referencing another promoter's attendance.
-- ============================================================================
select tests_auth_as('00000000-0000-0000-0000-0000000005c1');
select throws_like(
  $$insert into public.location_pings (attendance_id, promoter_id, lat, lng)
    values ('99999999-9999-9999-9999-999999995051',
            '00000000-0000-0000-0000-0000000005c1',
            31.95, 35.91)$$,
  '%row-level security%',
  'RLS: promoter cannot insert ping against another promoter attendance'
);
reset role;
reset "request.jwt.claims";

-- ============================================================================
-- 6. Admin sees everything and the gc function is callable.
-- ============================================================================
select tests_auth_as('00000000-0000-0000-0000-0000000005a0');
select is(
  (select count(*)::int from public.location_pings),
  1,
  'RLS: admin sees all pings'
);
reset role;
reset "request.jwt.claims";

-- gc_location_pings() returns an integer (here 0 since fixture ping is fresh).
select is(
  public.gc_location_pings(),
  0,
  'gc_location_pings: returns integer, deletes nothing when no pings are stale'
);

select * from finish();
rollback;
