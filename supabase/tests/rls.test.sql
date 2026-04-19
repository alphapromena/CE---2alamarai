-- Phase 1 — pgtap RLS tests for profiles + audit_log
-- Run with: supabase db test
-- The whole file runs in a single rolled-back transaction so fixtures are
-- ephemeral and don't pollute the database.

begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;

select plan(26);

-- ============================================================================
-- Fixtures — bypass RLS by staying as the migration-owner (postgres) role.
-- ============================================================================
-- Seed four users covering each role. We insert into auth.users first; the
-- handle_new_user trigger will materialise the profiles rows, which we then
-- fix up with the correct role/full_name/active state.

-- Allow our test inserts to succeed even though auth.users has the handle_new_user trigger
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@test.local',     '', now(), now(), now(), jsonb_build_object('role','admin','full_name','Test Admin')),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'supervisor@test.local','', now(), now(), now(), jsonb_build_object('role','supervisor','full_name','Test Supervisor')),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'promoter@test.local',  '', now(), now(), now(), jsonb_build_object('role','promoter','full_name','Test Promoter')),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'client@test.local',    '', now(), now(), now(), jsonb_build_object('role','client','full_name','Test Client'));

-- ============================================================================
-- handle_new_user trigger verification (4 tests)
-- ============================================================================
select is(
  (select role from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
  'admin'::public.user_role,
  'handle_new_user: admin profile created with role=admin'
);
select is(
  (select role from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'),
  'supervisor'::public.user_role,
  'handle_new_user: supervisor profile created with role=supervisor'
);
select is(
  (select role from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'),
  'promoter'::public.user_role,
  'handle_new_user: promoter profile created with role=promoter'
);
select is(
  (select full_name from public.profiles where id = '00000000-0000-0000-0000-0000000000d1'),
  'Test Client',
  'handle_new_user: full_name copied from metadata'
);

-- ============================================================================
-- Helper: impersonate a given auth user inside an RLS-bearing session.
-- ============================================================================
create or replace function tests_auth_as(p_user_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user_id::text,
    'role', 'authenticated'
  )::text, true);
end;
$$;

-- ============================================================================
-- profiles SELECT policies (4 tests)
-- ============================================================================

-- As admin: can see all four rows
select tests_auth_as('00000000-0000-0000-0000-0000000000a1');
select is(
  (select count(*)::int from public.profiles),
  4,
  'profiles SELECT: admin sees all four rows'
);

reset role;
reset "request.jwt.claims";

-- As promoter: sees only own row
select tests_auth_as('00000000-0000-0000-0000-0000000000c1');
select is(
  (select count(*)::int from public.profiles),
  1,
  'profiles SELECT: non-admin sees only own row'
);
select is(
  (select id from public.profiles),
  '00000000-0000-0000-0000-0000000000c1'::uuid,
  'profiles SELECT: non-admin sees exactly their own id'
);

reset role;
reset "request.jwt.claims";

-- As anon (no JWT): sees nothing
set local role anon;
select is(
  (select count(*)::int from public.profiles),
  0,
  'profiles SELECT: anonymous sees zero rows'
);
reset role;

-- ============================================================================
-- profiles UPDATE — self can update benign fields (2 tests)
-- ============================================================================
select tests_auth_as('00000000-0000-0000-0000-0000000000c1');

update public.profiles set full_name = 'Renamed Promoter' where id = '00000000-0000-0000-0000-0000000000c1';
select is(
  (select full_name from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'),
  'Renamed Promoter',
  'profiles UPDATE: self can change full_name'
);

update public.profiles set phone = '+962700000000' where id = '00000000-0000-0000-0000-0000000000c1';
select is(
  (select phone from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'),
  '+962700000000',
  'profiles UPDATE: self can change phone'
);

reset role;
reset "request.jwt.claims";

-- ============================================================================
-- profiles UPDATE — self-update guard blocks sensitive columns (4 tests)
-- ============================================================================
select tests_auth_as('00000000-0000-0000-0000-0000000000c1');

select throws_like(
  $$update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000c1'$$,
  '%only admins may change role%',
  'profiles UPDATE: self cannot escalate own role'
);

select throws_like(
  $$update public.profiles set active = false where id = '00000000-0000-0000-0000-0000000000c1'$$,
  '%only admins may change active%',
  'profiles UPDATE: self cannot change own active'
);

select throws_like(
  $$update public.profiles set assigned_locations = array['00000000-0000-0000-0000-00000000aaaa'::uuid] where id = '00000000-0000-0000-0000-0000000000c1'$$,
  '%only admins may change assigned_locations%',
  'profiles UPDATE: self cannot change own assigned_locations'
);

select throws_like(
  $$update public.profiles set created_by = '00000000-0000-0000-0000-0000000000a1' where id = '00000000-0000-0000-0000-0000000000c1'$$,
  '%created_by is immutable%',
  'profiles UPDATE: self cannot change created_by'
);

reset role;
reset "request.jwt.claims";

-- ============================================================================
-- profiles UPDATE — admin can change sensitive columns (2 tests)
-- ============================================================================
select tests_auth_as('00000000-0000-0000-0000-0000000000a1');

update public.profiles set role = 'supervisor' where id = '00000000-0000-0000-0000-0000000000c1';
select is(
  (select role from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'),
  'supervisor'::public.user_role,
  'profiles UPDATE: admin can change another user role'
);

update public.profiles set active = false where id = '00000000-0000-0000-0000-0000000000c1';
select is(
  (select active from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'),
  false,
  'profiles UPDATE: admin can deactivate a user'
);
-- Restore
update public.profiles set active = true, role = 'promoter' where id = '00000000-0000-0000-0000-0000000000c1';

reset role;
reset "request.jwt.claims";

-- ============================================================================
-- profiles INSERT — non-admin blocked, admin allowed (2 tests)
-- ============================================================================
-- Seed an extra auth.users row with no metadata so handle_new_user creates a default promoter profile.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data)
values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'extra@test.local', '', now(), now(), now(), '{}'::jsonb);
-- handle_new_user already inserted a profile row for this id; remove it so we can test bare INSERT.
delete from public.profiles where id = '00000000-0000-0000-0000-0000000000e1';

select tests_auth_as('00000000-0000-0000-0000-0000000000c1');
select throws_like(
  $$insert into public.profiles (id, full_name) values ('00000000-0000-0000-0000-0000000000e1', 'Should Fail')$$,
  '%row-level security%',
  'profiles INSERT: non-admin rejected by RLS'
);
reset role;
reset "request.jwt.claims";

select tests_auth_as('00000000-0000-0000-0000-0000000000a1');
insert into public.profiles (id, full_name) values ('00000000-0000-0000-0000-0000000000e1', 'Extra User');
select is(
  (select full_name from public.profiles where id = '00000000-0000-0000-0000-0000000000e1'),
  'Extra User',
  'profiles INSERT: admin succeeds'
);
reset role;
reset "request.jwt.claims";

-- ============================================================================
-- profiles DELETE — non-admin blocked (1 test)
-- ============================================================================
select tests_auth_as('00000000-0000-0000-0000-0000000000c1');
delete from public.profiles where id = '00000000-0000-0000-0000-0000000000c1';
-- RLS silently filters out DELETE candidates; the row must still exist.
reset role;
reset "request.jwt.claims";
select tests_auth_as('00000000-0000-0000-0000-0000000000a1');
select is(
  (select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'),
  1,
  'profiles DELETE: non-admin attempt was a no-op (row still present)'
);
reset role;
reset "request.jwt.claims";

-- ============================================================================
-- audit_log SELECT — admin allowed, non-admin blocked (2 tests)
-- ============================================================================
-- Seed an entry (as superuser bypasses RLS).
insert into public.audit_log (actor_id, action, entity, entity_id)
values ('00000000-0000-0000-0000-0000000000a1', 'test.seed', 'test', 'one');

select tests_auth_as('00000000-0000-0000-0000-0000000000a1');
select isnt(
  (select count(*)::int from public.audit_log),
  0,
  'audit_log SELECT: admin sees rows'
);
reset role;
reset "request.jwt.claims";

select tests_auth_as('00000000-0000-0000-0000-0000000000c1');
select is(
  (select count(*)::int from public.audit_log),
  0,
  'audit_log SELECT: non-admin sees zero rows'
);
reset role;
reset "request.jwt.claims";

-- ============================================================================
-- audit_log INSERT — self allowed, other-user blocked for non-admin (2 tests)
-- ============================================================================
select tests_auth_as('00000000-0000-0000-0000-0000000000c1');

-- Self-INSERT allowed
insert into public.audit_log (actor_id, action, entity)
values ('00000000-0000-0000-0000-0000000000c1', 'auth.login_success', 'auth');
select pass('audit_log INSERT: non-admin can log own event');

-- Other-user INSERT blocked
select throws_like(
  $$insert into public.audit_log (actor_id, action, entity)
    values ('00000000-0000-0000-0000-0000000000a1', 'auth.impersonate', 'auth')$$,
  '%row-level security%',
  'audit_log INSERT: non-admin cannot log another user event'
);
reset role;
reset "request.jwt.claims";

-- ============================================================================
-- audit_log UPDATE/DELETE — append-only trigger fires even for admin (2 tests)
-- ============================================================================
select tests_auth_as('00000000-0000-0000-0000-0000000000a1');

select throws_like(
  $$update public.audit_log set action = 'tampered' where id = (select id from public.audit_log order by id limit 1)$$,
  '%audit_log is append-only%',
  'audit_log UPDATE: admin blocked by trigger'
);

select throws_like(
  $$delete from public.audit_log where id = (select id from public.audit_log order by id limit 1)$$,
  '%audit_log is append-only%',
  'audit_log DELETE: admin blocked by trigger'
);

reset role;
reset "request.jwt.claims";

-- ============================================================================
-- is_admin / current_role / is_active helpers — behave correctly (1 test)
-- ============================================================================
select tests_auth_as('00000000-0000-0000-0000-0000000000a1');
select ok(public.is_admin(), 'is_admin(): true for admin user');
reset role;
reset "request.jwt.claims";

select * from finish();

rollback;
