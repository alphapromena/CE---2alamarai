-- Phase 2 — pgtap tests for cross-tenant isolation + assigned_locations sync.
-- Run with: supabase db test
-- Wraps in a single rollback transaction; fixtures don't persist.

begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;

-- 4 cross-tenant + 2 tenant CHECK + 7 sync trigger + 1 role_scope CHECK = 14.
select plan(14);

-- ============================================================================
-- Fixtures
-- ============================================================================

-- Two clients (tenants).
insert into public.clients (id, name, name_i18n) values
  ('11111111-1111-1111-1111-111111110000', 'TenantA',
   jsonb_build_object('en','TenantA','ar','المستأجر أ')),
  ('22222222-2222-2222-2222-222222220000', 'TenantB',
   jsonb_build_object('en','TenantB','ar','المستأجر ب'));

-- Auth users: admin, clientA-user, clientB-user, promoter.
-- handle_new_user trigger materialises the profiles row from raw_user_meta_data.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','admin@p2.test','',now(),now(),now(),
   jsonb_build_object('role','admin','full_name','P2 Admin')),
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','clientA@p2.test','',now(),now(),now(),
   jsonb_build_object('role','client','full_name','Tenant A User',
                      'client_id','11111111-1111-1111-1111-111111110000')),
  ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','clientB@p2.test','',now(),now(),now(),
   jsonb_build_object('role','client','full_name','Tenant B User',
                      'client_id','22222222-2222-2222-2222-222222220000')),
  ('00000000-0000-0000-0000-0000000000p1','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','promoter@p2.test','',now(),now(),now(),
   jsonb_build_object('role','promoter','full_name','P2 Promoter')),
  ('00000000-0000-0000-0000-0000000000p2','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','promoter2@p2.test','',now(),now(),now(),
   jsonb_build_object('role','promoter','full_name','P2 Promoter Two'));

-- Geo: 1 region, 1 city, 3 locations. (loc_x is for clientA's campaign; loc_y
-- for clientB; loc_z is unassigned and used for negative tests.)
insert into public.regions (id, name_i18n, country_code) values
  ('33333333-3333-3333-3333-333333330000',
   jsonb_build_object('en','TestRegion','ar','منطقة اختبار'),
   'JO');
insert into public.cities (id, region_id, name_i18n) values
  ('44444444-4444-4444-4444-444444440000',
   '33333333-3333-3333-3333-333333330000',
   jsonb_build_object('en','TestCity','ar','مدينة اختبار'));
insert into public.locations (id, city_id, name_i18n, lat, lng) values
  ('55555555-5555-5555-5555-555555550000','44444444-4444-4444-4444-444444440000',
   jsonb_build_object('en','LocX','ar','الموقع س'), 31.95, 35.93),
  ('66666666-6666-6666-6666-666666660000','44444444-4444-4444-4444-444444440000',
   jsonb_build_object('en','LocY','ar','الموقع ص'), 31.96, 35.94),
  ('77777777-7777-7777-7777-777777770000','44444444-4444-4444-4444-444444440000',
   jsonb_build_object('en','LocZ','ar','الموقع ز'), 31.97, 35.95);

-- Two campaigns, one per tenant.
insert into public.campaigns (id, client_id, name_i18n, start_date, end_date) values
  ('88888888-8888-8888-8888-888888880000','11111111-1111-1111-1111-111111110000',
   jsonb_build_object('en','CampA','ar','حملة أ'),
   current_date, current_date + interval '30 days'),
  ('99999999-9999-9999-9999-999999990000','22222222-2222-2222-2222-222222220000',
   jsonb_build_object('en','CampB','ar','حملة ب'),
   current_date, current_date + interval '30 days');

-- Wire each campaign to its corresponding location.
insert into public.campaign_locations (campaign_id, location_id) values
  ('88888888-8888-8888-8888-888888880000','55555555-5555-5555-5555-555555550000'),
  ('99999999-9999-9999-9999-999999990000','66666666-6666-6666-6666-666666660000');

-- One SKU per campaign.
insert into public.skus (id, campaign_id, name_i18n, unit_i18n) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001','88888888-8888-8888-8888-888888880000',
   jsonb_build_object('en','SkuA','ar','سكو أ'),
   jsonb_build_object('en','units','ar','وحدات')),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002','99999999-9999-9999-9999-999999990000',
   jsonb_build_object('en','SkuB','ar','سكو ب'),
   jsonb_build_object('en','units','ar','وحدات'));

-- Helper to impersonate an authenticated user via JWT-style claims.
create or replace function tests_auth_as(p_user_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_user_id::text, 'role','authenticated')::text, true);
end;
$$;

-- ============================================================================
-- Cross-tenant isolation (4 tests)
-- D-016: profiles.client_id + RLS enforces it.
-- ============================================================================
select tests_auth_as('00000000-0000-0000-0000-0000000000c1');
select is(
  (select count(*)::int from public.campaigns),
  1,
  'campaigns RLS: tenant A client sees exactly 1 campaign (their own)'
);
select is(
  (select count(*)::int from public.campaigns
   where id = '99999999-9999-9999-9999-999999990000'),
  0,
  'campaigns RLS: tenant A client cannot see tenant B campaign'
);
select is(
  (select count(*)::int from public.skus
   where campaign_id = '99999999-9999-9999-9999-999999990000'),
  0,
  'skus RLS: tenant A client cannot see tenant B SKUs'
);
reset role;
reset "request.jwt.claims";

select tests_auth_as('00000000-0000-0000-0000-0000000000c2');
select is(
  (select count(*)::int from public.campaigns
   where id = '88888888-8888-8888-8888-888888880000'),
  0,
  'campaigns RLS: tenant B client cannot see tenant A campaign'
);
reset role;
reset "request.jwt.claims";

-- ============================================================================
-- profiles.client_id CHECK constraint (2 tests)
-- ============================================================================
select throws_like(
  $$insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_user_meta_data)
    values ('00000000-0000-0000-0000-0000000000ce',
      '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
      'badclient@p2.test','',now(),now(),now(),
      jsonb_build_object('role','client','full_name','Tenant-less Client'))$$,
  '%profiles_client_id_role_check%',
  'profiles CHECK: client role without client_id is rejected'
);

select throws_like(
  $$update public.profiles set client_id = '11111111-1111-1111-1111-111111110000'
      where id = '00000000-0000-0000-0000-0000000000a1'$$,
  '%profiles_client_id_role_check%',
  'profiles CHECK: non-client role with client_id is rejected'
);

-- ============================================================================
-- assigned_locations sync trigger — 7 cases (D-018)
-- ============================================================================

-- Case 1 — INSERT: a new assignment inserts into the cached array.
insert into public.user_assignments (user_id, location_id, role_scope)
values ('00000000-0000-0000-0000-0000000000p1',
        '55555555-5555-5555-5555-555555550000','promoter');

select is(
  (select assigned_locations from public.profiles
    where id = '00000000-0000-0000-0000-0000000000p1'),
  array['55555555-5555-5555-5555-555555550000']::uuid[],
  'sync (1/7) INSERT: profile.assigned_locations contains the new location'
);

-- Case 2 — UPDATE (location change): reflects new set.
update public.user_assignments
   set location_id = '66666666-6666-6666-6666-666666660000'
 where user_id = '00000000-0000-0000-0000-0000000000p1'
   and location_id = '55555555-5555-5555-5555-555555550000';

select is(
  (select assigned_locations from public.profiles
    where id = '00000000-0000-0000-0000-0000000000p1'),
  array['66666666-6666-6666-6666-666666660000']::uuid[],
  'sync (2/7) UPDATE: profile.assigned_locations follows the location change'
);

-- Case 3 — Active filter: marking inactive removes from the cached array.
update public.user_assignments
   set active = false
 where user_id = '00000000-0000-0000-0000-0000000000p1';

select is(
  (select assigned_locations from public.profiles
    where id = '00000000-0000-0000-0000-0000000000p1'),
  array[]::uuid[],
  'sync (3/7) Active filter: inactive assignment removed from cache'
);

-- Case 4 — DELETE: removing the last active assignment leaves the array empty.
-- (Re-activate first so we have something to delete that contributes to the array.)
update public.user_assignments
   set active = true,
       location_id = '55555555-5555-5555-5555-555555550000'
 where user_id = '00000000-0000-0000-0000-0000000000p1';

delete from public.user_assignments
 where user_id = '00000000-0000-0000-0000-0000000000p1';

select is(
  (select assigned_locations from public.profiles
    where id = '00000000-0000-0000-0000-0000000000p1'),
  array[]::uuid[],
  'sync (4/7) DELETE: cache cleared after last assignment removed'
);

-- Case 5 — Concurrent / multi-row writes inside one transaction:
-- two inserts produce a deduplicated, sorted set.
insert into public.user_assignments (user_id, location_id, role_scope) values
  ('00000000-0000-0000-0000-0000000000p1','55555555-5555-5555-5555-555555550000','promoter'),
  ('00000000-0000-0000-0000-0000000000p1','66666666-6666-6666-6666-666666660000','supervisor');

select is(
  (select assigned_locations from public.profiles
    where id = '00000000-0000-0000-0000-0000000000p1'),
  array['55555555-5555-5555-5555-555555550000','66666666-6666-6666-6666-666666660000']::uuid[],
  'sync (5/7) Multi-row writes: cache is the deduplicated, sorted union of active assignments'
);

-- Case 6 — Cross-user isolation: a write for promoter1 doesn't touch promoter2.
insert into public.user_assignments (user_id, location_id, role_scope)
values ('00000000-0000-0000-0000-0000000000p2',
        '77777777-7777-7777-7777-777777770000','promoter');

select is(
  (select assigned_locations from public.profiles
    where id = '00000000-0000-0000-0000-0000000000p1'),
  array['55555555-5555-5555-5555-555555550000','66666666-6666-6666-6666-666666660000']::uuid[],
  'sync (6/7) Cross-user no-op: promoter2 insert leaves promoter1 cache intact'
);

-- Case 7 — D-015 element-FK trigger: invalid uuid in assigned_locations rejected.
-- Impersonate admin so the self-update guard exits early; the validation
-- trigger then runs and rejects the bogus uuid.
select tests_auth_as('00000000-0000-0000-0000-0000000000a1');
select throws_like(
  $$update public.profiles set assigned_locations =
      array['ffffffff-ffff-ffff-ffff-ffffffffffff']::uuid[]
      where id = '00000000-0000-0000-0000-0000000000a1'$$,
  '%does not exist%',
  'sync (7/7) D-015 element-FK: unknown location id rejected by trigger'
);
reset role;
reset "request.jwt.claims";

-- ============================================================================
-- user_assignments role_scope CHECK (1 test)
-- ============================================================================
select throws_like(
  $$insert into public.user_assignments (user_id, location_id, role_scope)
    values ('00000000-0000-0000-0000-0000000000p2',
            '55555555-5555-5555-5555-555555550000','admin')$$,
  '%check constraint%',
  'user_assignments CHECK: role_scope cannot be admin (or client)'
);

select * from finish();
rollback;
