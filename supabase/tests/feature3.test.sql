-- Feature 3 — pgtap tests for per-client promoter visibility toggles (D-040).
-- Run with: supabase db test
-- Wraps in a single rollback transaction so fixtures are ephemeral.

begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;

-- 4 default + 2 admin update + 2 client self-read + 3 cross-tenant = 11.
select plan(11);

-- ============================================================================
-- Fixtures — two tenants, one admin, one client user per tenant.
-- ============================================================================
insert into public.clients (id, name, name_i18n) values
  ('11111111-1111-1111-1111-111111110040', 'F3TenantA',
   jsonb_build_object('en','F3TenantA','ar','المستأجر أ')),
  ('22222222-2222-2222-2222-222222220040', 'F3TenantB',
   jsonb_build_object('en','F3TenantB','ar','المستأجر ب'));

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-0000000000f0','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','adminF3@test.local','',now(),now(),now(),
   jsonb_build_object('role','admin','full_name','F3 Admin')),
  ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','clientAF3@test.local','',now(),now(),now(),
   jsonb_build_object('role','client','full_name','F3 Tenant A User',
                      'client_id','11111111-1111-1111-1111-111111110040')),
  ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','clientBF3@test.local','',now(),now(),now(),
   jsonb_build_object('role','client','full_name','F3 Tenant B User',
                      'client_id','22222222-2222-2222-2222-222222220040'));

create or replace function tests_auth_as(p_user_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_user_id::text, 'role','authenticated')::text, true);
end;
$$;

-- ============================================================================
-- 1. Defaults: every new client row starts with all four toggles FALSE.
--    Confirms D-019 privacy-first default is preserved.
-- ============================================================================
select is(
  (select show_promoter_names from public.clients
    where id = '11111111-1111-1111-1111-111111110040'),
  false,
  'default (1/4): show_promoter_names is false on new client row'
);
select is(
  (select show_promoter_photos from public.clients
    where id = '11111111-1111-1111-1111-111111110040'),
  false,
  'default (2/4): show_promoter_photos is false on new client row'
);
select is(
  (select show_promoter_alerts from public.clients
    where id = '11111111-1111-1111-1111-111111110040'),
  false,
  'default (3/4): show_promoter_alerts is false on new client row'
);
select is(
  (select show_promoter_full_profile from public.clients
    where id = '11111111-1111-1111-1111-111111110040'),
  false,
  'default (4/4): show_promoter_full_profile is false on new client row'
);

-- ============================================================================
-- 2. Admin can update the toggles (clients_update_admin policy).
-- ============================================================================
select tests_auth_as('00000000-0000-0000-0000-0000000000f0');

update public.clients
   set show_promoter_names = true,
       show_promoter_full_profile = true
 where id = '11111111-1111-1111-1111-111111110040';

select is(
  (select show_promoter_names from public.clients
    where id = '11111111-1111-1111-1111-111111110040'),
  true,
  'admin update: show_promoter_names flips to true'
);
select is(
  (select show_promoter_full_profile from public.clients
    where id = '11111111-1111-1111-1111-111111110040'),
  true,
  'admin update: show_promoter_full_profile flips to true'
);

reset role;
reset "request.jwt.claims";

-- ============================================================================
-- 3. Owning client can read their own toggles via clients_select_self_tenant.
-- ============================================================================
select tests_auth_as('00000000-0000-0000-0000-0000000000f1');

select is(
  (select show_promoter_names from public.clients
    where id = '11111111-1111-1111-1111-111111110040'),
  true,
  'client self-read (1/2): sees show_promoter_names=true on own row'
);
select is(
  (select show_promoter_full_profile from public.clients
    where id = '11111111-1111-1111-1111-111111110040'),
  true,
  'client self-read (2/2): sees show_promoter_full_profile=true on own row'
);

reset role;
reset "request.jwt.claims";

-- ============================================================================
-- 4. Cross-tenant denial — client A cannot see client B's row even when
--    client A has all flags true. RLS isolation is independent of toggles.
-- ============================================================================
select tests_auth_as('00000000-0000-0000-0000-0000000000f1');

select is(
  (select count(*)::int from public.clients
    where id = '22222222-2222-2222-2222-222222220040'),
  0,
  'cross-tenant (1/3): client A cannot SELECT client B clients row'
);

select is(
  (select count(*)::int from public.clients
    where show_promoter_names = false),
  0,
  'cross-tenant (2/3): client A can only see their own row (not B defaults)'
);

reset role;
reset "request.jwt.claims";

-- Client B cannot read client A's (flipped) toggles either.
select tests_auth_as('00000000-0000-0000-0000-0000000000f2');

select is(
  (select count(*)::int from public.clients
    where id = '11111111-1111-1111-1111-111111110040'),
  0,
  'cross-tenant (3/3): client B cannot SELECT client A clients row regardless of toggles'
);

reset role;
reset "request.jwt.claims";

select * from finish();
rollback;
