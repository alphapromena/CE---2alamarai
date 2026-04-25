-- QUAL-01 — pgtap RLS tests for public.notifications.
-- Run with: supabase db test
-- Wraps in a single rolled-back transaction; fixtures don't persist.
--
-- Notifications are per-user delivery records. Authenticated users SELECT +
-- UPDATE their own (UPDATE is the "mark read" path); INSERTs and DELETEs
-- are service-role only (no GRANT to authenticated, by design — Edge
-- Functions and Server Actions create rows). The headline boundaries:
--   * cross-user isolation — user B must not see user A's notifications
--   * write surface — authenticated users cannot INSERT, even for themselves

begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;

-- 3 SELECT (admin / user-self / cross-user) +
-- 2 UPDATE (self mark-read OK / cross-user silent no-op) +
-- 1 INSERT (authenticated rejected — no GRANT) = 6.
select plan(6);

-- ============================================================================
-- Fixtures. UUID suffix range 9c** to avoid collision with existing tests.
-- Two regular promoter users (A, B) plus one admin. No client needed —
-- notifications cross all roles uniformly.
-- ============================================================================
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000009c01','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','adminC@test.local','',now(),now(),now(),
   jsonb_build_object('role','admin','full_name','RLS-C Admin')),
  ('00000000-0000-0000-0000-000000009c02','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','userA@test.local','',now(),now(),now(),
   jsonb_build_object('role','promoter','full_name','RLS-C User A')),
  ('00000000-0000-0000-0000-000000009c03','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','userB@test.local','',now(),now(),now(),
   jsonb_build_object('role','promoter','full_name','RLS-C User B'));

update public.profiles
   set active = true
 where id in ('00000000-0000-0000-0000-000000009c02'::uuid,
              '00000000-0000-0000-0000-000000009c03'::uuid);

create or replace function tests_auth_as(p_user_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_user_id::text, 'role','authenticated')::text, true);
end;
$$;

-- Pre-seed one notification for each user (as table owner; bypasses RLS).
insert into public.notifications (id, user_id, kind, payload) values
  ('cccccccc-cccc-cccc-cccc-cccccccc9c01',
   '00000000-0000-0000-0000-000000009c02',
   'system',
   jsonb_build_object('message_key', 'system.welcome')),
  ('cccccccc-cccc-cccc-cccc-cccccccc9c02',
   '00000000-0000-0000-0000-000000009c03',
   'system',
   jsonb_build_object('message_key', 'system.welcome'));

-- ============================================================================
-- SELECT — 3 assertions
-- ============================================================================

-- 1. Admin sees both rows.
select tests_auth_as('00000000-0000-0000-0000-000000009c01');
select is(
  (select count(*)::int from public.notifications),
  2,
  'notifications SELECT: admin sees all rows'
);
reset role;
reset "request.jwt.claims";

-- 2. User A sees own notification only.
select tests_auth_as('00000000-0000-0000-0000-000000009c02');
select is(
  (select id from public.notifications),
  'cccccccc-cccc-cccc-cccc-cccccccc9c01'::uuid,
  'notifications SELECT: user sees only own notification'
);
reset role;
reset "request.jwt.claims";

-- 3. Cross-user isolation — user B sees only their own row, NOT user A's.
select tests_auth_as('00000000-0000-0000-0000-000000009c03');
select is(
  (select count(*)::int from public.notifications
    where id = 'cccccccc-cccc-cccc-cccc-cccccccc9c01'),
  0,
  'notifications SELECT: cross-user isolation — user B cannot see user A''s row'
);
reset role;
reset "request.jwt.claims";

-- ============================================================================
-- UPDATE — 2 assertions
-- ============================================================================

-- 4. User A can UPDATE own notification (mark read).
select tests_auth_as('00000000-0000-0000-0000-000000009c02');
update public.notifications
   set read_at = now()
 where id = 'cccccccc-cccc-cccc-cccc-cccccccc9c01';
select isnt(
  (select read_at from public.notifications
    where id = 'cccccccc-cccc-cccc-cccc-cccccccc9c01'),
  null,
  'notifications UPDATE: user can mark own notification read'
);
reset role;
reset "request.jwt.claims";

-- 5. User A's UPDATE on user B's row is a silent no-op (USING filter).
select tests_auth_as('00000000-0000-0000-0000-000000009c02');
update public.notifications
   set read_at = now()
 where id = 'cccccccc-cccc-cccc-cccc-cccccccc9c02';
reset role;
reset "request.jwt.claims";
-- Re-query as admin: user B's row should still have read_at = NULL.
select tests_auth_as('00000000-0000-0000-0000-000000009c01');
select is(
  (select read_at from public.notifications
    where id = 'cccccccc-cccc-cccc-cccc-cccccccc9c02'),
  null,
  'notifications UPDATE: cross-user UPDATE is a silent no-op'
);
reset role;
reset "request.jwt.claims";

-- ============================================================================
-- INSERT — 1 assertion
-- ============================================================================

-- 6. Authenticated INSERT is rejected — no INSERT GRANT to authenticated.
--    Notifications are written by service-role-only paths (Edge Functions
--    + Server Actions). Even a self-INSERT must fail. Postgres responds
--    with "permission denied for table notifications" rather than an
--    RLS-policy error because the GRANT is missing entirely.
select tests_auth_as('00000000-0000-0000-0000-000000009c02');
select throws_like(
  $$insert into public.notifications (user_id, kind, payload)
    values ('00000000-0000-0000-0000-000000009c02', 'system',
            jsonb_build_object('message_key', 'system.test'))$$,
  '%permission denied%',
  'notifications INSERT: authenticated user is denied (service-role-only writes)'
);
reset role;
reset "request.jwt.claims";

select * from finish();
rollback;
