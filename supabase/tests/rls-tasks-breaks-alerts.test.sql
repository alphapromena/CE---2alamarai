-- QUAL-01 — pgtap RLS tests for the Tier 2 supervisor/promoter write surface:
-- public.tasks, public.break_requests, public.alerts.
-- Run with: supabase db test
-- Wraps in a single rolled-back transaction; fixtures don't persist.
--
-- Three small tables share the same isolation pattern (admin all; supervisor
-- at assigned location; promoter own row; client none). Bundling them into
-- one file keeps the fixture cost (campaign + locations + assignments)
-- amortized. The headline boundaries:
--   * tasks INSERT — supervisor at own loc only; cross-loc rejected
--   * break_requests UPDATE — supervisor at own loc; cross-sup silent no-op
--   * alerts SELECT — supervisor at own loc only; cross-sup filtered

begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;

-- tasks: 4 (admin all / promoter own assigned / sup INSERT at own loc /
--          sup INSERT at cross loc rejected)
-- break_requests: 3 (promoter creates own / sup UPDATE at own loc /
--                    sup UPDATE at cross loc silent no-op)
-- alerts: 3 (promoter sees own / sup at own loc / sup at cross loc filtered)
-- = 10.
select plan(10);

-- ============================================================================
-- Fixtures. UUID suffix range 9d** to avoid collision with existing tests.
-- ============================================================================
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000009d01','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','adminD@test.local','',now(),now(),now(),
   jsonb_build_object('role','admin','full_name','RLS-D Admin')),
  ('00000000-0000-0000-0000-000000009d02','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','supXD@test.local','',now(),now(),now(),
   jsonb_build_object('role','supervisor','full_name','RLS-D Supervisor X')),
  ('00000000-0000-0000-0000-000000009d03','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','supYD@test.local','',now(),now(),now(),
   jsonb_build_object('role','supervisor','full_name','RLS-D Supervisor Y')),
  ('00000000-0000-0000-0000-000000009d04','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','proXD@test.local','',now(),now(),now(),
   jsonb_build_object('role','promoter','full_name','RLS-D Promoter X')),
  ('00000000-0000-0000-0000-000000009d05','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','proYD@test.local','',now(),now(),now(),
   jsonb_build_object('role','promoter','full_name','RLS-D Promoter Y'));

insert into public.clients (id, name, name_i18n) values
  ('77777777-7777-7777-7777-777777779d01','RLS-D Client',
   jsonb_build_object('en','RLS-D Client','ar','عميل اختبار-د'));

insert into public.regions (id, name_i18n) values
  ('44444444-4444-4444-4444-444444449d01',
   jsonb_build_object('en','RLS-D Region','ar','منطقة اختبار-د'));

insert into public.cities (id, region_id, name_i18n) values
  ('33333333-3333-3333-3333-333333339d01',
   '44444444-4444-4444-4444-444444449d01',
   jsonb_build_object('en','RLS-D City','ar','مدينة اختبار-د'));

insert into public.locations (id, city_id, name_i18n, lat, lng, geofence_radius_m, active)
values
  ('66666666-6666-6666-6666-666666669d01',
   '33333333-3333-3333-3333-333333339d01',
   jsonb_build_object('en','RLS-D Loc X','ar','موقع اختبار-س'),
   31.95, 35.91, 150, true),
  ('66666666-6666-6666-6666-666666669d02',
   '33333333-3333-3333-3333-333333339d01',
   jsonb_build_object('en','RLS-D Loc Y','ar','موقع اختبار-ص'),
   31.96, 35.92, 150, true);

insert into public.campaigns (id, client_id, name_i18n, status, start_date, end_date)
values
  ('55555555-5555-5555-5555-555555559d01',
   '77777777-7777-7777-7777-777777779d01',
   jsonb_build_object('en','RLS-D Campaign','ar','حملة اختبار-د'),
   'active',
   current_date - 1,
   current_date + 30);

insert into public.campaign_locations (campaign_id, location_id) values
  ('55555555-5555-5555-5555-555555559d01','66666666-6666-6666-6666-666666669d01'),
  ('55555555-5555-5555-5555-555555559d01','66666666-6666-6666-6666-666666669d02');

update public.profiles
   set active = true,
       assigned_locations = array['66666666-6666-6666-6666-666666669d01'::uuid]
 where id in ('00000000-0000-0000-0000-000000009d02'::uuid,
              '00000000-0000-0000-0000-000000009d04'::uuid);

update public.profiles
   set active = true,
       assigned_locations = array['66666666-6666-6666-6666-666666669d02'::uuid]
 where id in ('00000000-0000-0000-0000-000000009d03'::uuid,
              '00000000-0000-0000-0000-000000009d05'::uuid);

create or replace function tests_auth_as(p_user_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_user_id::text, 'role','authenticated')::text, true);
end;
$$;

-- Pre-seed one task at each location, one break_request per promoter, and
-- one alert per location (as table owner; bypasses RLS).
insert into public.tasks (
  id, campaign_id, location_id, assigned_to_user_id,
  title_i18n, status, idempotency_key, created_by
) values
  ('dddddddd-dddd-dddd-dddd-dddddddd9d01',
   '55555555-5555-5555-5555-555555559d01',
   '66666666-6666-6666-6666-666666669d01',
   '00000000-0000-0000-0000-000000009d04',
   jsonb_build_object('en','Restock cooler','ar','إعادة تعبئة الثلاجة'),
   'open', gen_random_uuid(),
   '00000000-0000-0000-0000-000000009d02'),
  ('dddddddd-dddd-dddd-dddd-dddddddd9d02',
   '55555555-5555-5555-5555-555555559d01',
   '66666666-6666-6666-6666-666666669d02',
   '00000000-0000-0000-0000-000000009d05',
   jsonb_build_object('en','Wipe demo table','ar','تنظيف طاولة العرض'),
   'open', gen_random_uuid(),
   '00000000-0000-0000-0000-000000009d03');

insert into public.break_requests (
  id, promoter_id, campaign_id, location_id,
  requested_start, duration_minutes, status, idempotency_key
) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee9d01',
   '00000000-0000-0000-0000-000000009d04',
   '55555555-5555-5555-5555-555555559d01',
   '66666666-6666-6666-6666-666666669d01',
   now() + interval '2 hours', 30, 'pending', gen_random_uuid()),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee9d02',
   '00000000-0000-0000-0000-000000009d05',
   '55555555-5555-5555-5555-555555559d01',
   '66666666-6666-6666-6666-666666669d02',
   now() + interval '2 hours', 30, 'pending', gen_random_uuid());

insert into public.alerts (
  id, alert_type, severity, status,
  user_id, campaign_id, location_id, message_key
) values
  ('ffffffff-ffff-ffff-ffff-ffffffff9d01',
   'late_check_in', 'warning', 'open',
   '00000000-0000-0000-0000-000000009d04',
   '55555555-5555-5555-5555-555555559d01',
   '66666666-6666-6666-6666-666666669d01',
   'alerts.late_check_in'),
  ('ffffffff-ffff-ffff-ffff-ffffffff9d02',
   'late_check_in', 'warning', 'open',
   '00000000-0000-0000-0000-000000009d05',
   '55555555-5555-5555-5555-555555559d01',
   '66666666-6666-6666-6666-666666669d02',
   'alerts.late_check_in');

-- ============================================================================
-- tasks — 4 assertions
-- ============================================================================

-- 1. Admin sees both tasks.
select tests_auth_as('00000000-0000-0000-0000-000000009d01');
select is(
  (select count(*)::int from public.tasks),
  2,
  'tasks SELECT: admin sees all tasks'
);
reset role;
reset "request.jwt.claims";

-- 2. Promoter X sees own assigned task only.
select tests_auth_as('00000000-0000-0000-0000-000000009d04');
select is(
  (select id from public.tasks),
  'dddddddd-dddd-dddd-dddd-dddddddd9d01'::uuid,
  'tasks SELECT: promoter sees own assigned task only'
);
reset role;
reset "request.jwt.claims";

-- 3. Supervisor X can INSERT a new task at their assigned location.
select tests_auth_as('00000000-0000-0000-0000-000000009d02');
insert into public.tasks (
  id, campaign_id, location_id, assigned_to_user_id,
  title_i18n, status, idempotency_key, created_by
) values (
  'dddddddd-dddd-dddd-dddd-dddddddd9d03',
  '55555555-5555-5555-5555-555555559d01',
  '66666666-6666-6666-6666-666666669d01',
  '00000000-0000-0000-0000-000000009d04',
  jsonb_build_object('en','Replenish samples','ar','تجديد العينات'),
  'open', gen_random_uuid(),
  '00000000-0000-0000-0000-000000009d02'
);
select pass('tasks INSERT: supervisor can create task at assigned location');
reset role;
reset "request.jwt.claims";

-- 4. Supervisor X CANNOT INSERT a task at loc Y (sup_Y's location).
select tests_auth_as('00000000-0000-0000-0000-000000009d02');
select throws_like(
  $$insert into public.tasks (
      id, campaign_id, location_id, assigned_to_user_id,
      title_i18n, status, idempotency_key, created_by
    ) values (
      'dddddddd-dddd-dddd-dddd-dddddddd9d04',
      '55555555-5555-5555-5555-555555559d01',
      '66666666-6666-6666-6666-666666669d02',
      '00000000-0000-0000-0000-000000009d05',
      jsonb_build_object('en','Cross-sup tampering','ar','تجاوز المشرف'),
      'open', gen_random_uuid(),
      '00000000-0000-0000-0000-000000009d02'
    )$$,
  '%row-level security%',
  'tasks INSERT: cross-supervisor — sup X cannot create task at loc Y'
);
reset role;
reset "request.jwt.claims";

-- ============================================================================
-- break_requests — 3 assertions
-- ============================================================================

-- 5. Promoter X can INSERT own break request (status='pending').
select tests_auth_as('00000000-0000-0000-0000-000000009d04');
insert into public.break_requests (
  id, promoter_id, campaign_id, location_id,
  requested_start, duration_minutes, status, idempotency_key
) values (
  'eeeeeeee-eeee-eeee-eeee-eeeeeeee9d03',
  '00000000-0000-0000-0000-000000009d04',
  '55555555-5555-5555-5555-555555559d01',
  '66666666-6666-6666-6666-666666669d01',
  now() + interval '3 hours', 20, 'pending', gen_random_uuid()
);
select pass('break_requests INSERT: promoter can create own break request');
reset role;
reset "request.jwt.claims";

-- 6. Supervisor X can UPDATE (approve) a break request at their assigned loc.
select tests_auth_as('00000000-0000-0000-0000-000000009d02');
update public.break_requests
   set status = 'approved',
       reviewer_id = '00000000-0000-0000-0000-000000009d02',
       reviewed_at = now(),
       approved_start = now() + interval '2 hours',
       approved_duration_minutes = 30
 where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeee9d01';
select is(
  (select status from public.break_requests
    where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeee9d01'),
  'approved'::public.break_request_status,
  'break_requests UPDATE: supervisor can approve at assigned location'
);
reset role;
reset "request.jwt.claims";

-- 7. Supervisor X cannot UPDATE break request at loc Y (sup_Y's location).
--    USING-side filter excludes the row → silent no-op. Verify via re-query.
select tests_auth_as('00000000-0000-0000-0000-000000009d02');
update public.break_requests
   set status = 'rejected',
       reviewer_id = '00000000-0000-0000-0000-000000009d02',
       reviewed_at = now()
 where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeee9d02';
reset role;
reset "request.jwt.claims";
select tests_auth_as('00000000-0000-0000-0000-000000009d01');
select is(
  (select status from public.break_requests
    where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeee9d02'),
  'pending'::public.break_request_status,
  'break_requests UPDATE: cross-supervisor UPDATE is a silent no-op'
);
reset role;
reset "request.jwt.claims";

-- ============================================================================
-- alerts — 3 assertions
-- ============================================================================

-- 8. Promoter X sees their own alert (user_id = auth.uid()).
select tests_auth_as('00000000-0000-0000-0000-000000009d04');
select is(
  (select id from public.alerts),
  'ffffffff-ffff-ffff-ffff-ffffffff9d01'::uuid,
  'alerts SELECT: promoter sees own alert (user_id self)'
);
reset role;
reset "request.jwt.claims";

-- 9. Supervisor X sees alert at their assigned location.
select tests_auth_as('00000000-0000-0000-0000-000000009d02');
select is(
  (select count(*)::int from public.alerts
    where id = 'ffffffff-ffff-ffff-ffff-ffffffff9d01'),
  1,
  'alerts SELECT: supervisor sees alert at assigned location'
);
reset role;
reset "request.jwt.claims";

-- 10. Supervisor X CANNOT see alert at loc Y (cross-supervisor).
select tests_auth_as('00000000-0000-0000-0000-000000009d02');
select is(
  (select count(*)::int from public.alerts
    where id = 'ffffffff-ffff-ffff-ffff-ffffffff9d02'),
  0,
  'alerts SELECT: cross-supervisor — sup X cannot see alert at loc Y'
);
reset role;
reset "request.jwt.claims";

select * from finish();
rollback;
