-- Phase 5 — pgtap tests for the stock ledger.
--
-- Covers:
--   A. Append-only triggers on stock_movements + stock_reconciliations.
--   B. Table-level CHECK constraints (quantity, self-loop, entity shape,
--      kind-pair, correction shape, reallocation group).
--   C. BEFORE INSERT invariant trigger (warehouse exempt;
--      over-consumption + insufficient-balance rejected).
--   D. Idempotency-key UNIQUE index.
--   E. stock_balances view correctness.
--   F. RLS policies on stock_movements (promoter, supervisor, cross-sup).
--
-- Run with: supabase db test
-- Wraps in a single rollback transaction; fixtures don't persist.

begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;

select plan(17);

-- ============================================================================
-- Fixtures
-- ============================================================================

-- One client / campaign.
insert into public.clients (id, name, name_i18n) values
  ('b0000000-0000-0000-0000-000000000001', 'Almarai-Test',
   jsonb_build_object('en','Almarai-Test','ar','المراعي-اختبار'));

insert into public.regions (id, name_i18n, country_code) values
  ('b0000000-0000-0000-0000-000000000002',
   jsonb_build_object('en','R5','ar','م5'),'JO');

insert into public.cities (id, region_id, name_i18n) values
  ('b0000000-0000-0000-0000-000000000003',
   'b0000000-0000-0000-0000-000000000002',
   jsonb_build_object('en','C5','ar','م5'));

-- Two locations: L1 (supervisor A's turf), L2 (supervisor B's turf).
insert into public.locations (id, city_id, name_i18n, lat, lng) values
  ('b0000000-0000-0000-0000-000000000011',
   'b0000000-0000-0000-0000-000000000003',
   jsonb_build_object('en','L1','ar','ل1'), 31.95, 35.93),
  ('b0000000-0000-0000-0000-000000000012',
   'b0000000-0000-0000-0000-000000000003',
   jsonb_build_object('en','L2','ar','ل2'), 31.96, 35.94);

insert into public.campaigns (id, client_id, name_i18n, start_date, end_date) values
  ('b0000000-0000-0000-0000-000000000021',
   'b0000000-0000-0000-0000-000000000001',
   jsonb_build_object('en','Camp5','ar','حملة5'),
   current_date, current_date + interval '30 days');

insert into public.campaign_locations (campaign_id, location_id) values
  ('b0000000-0000-0000-0000-000000000021','b0000000-0000-0000-0000-000000000011'),
  ('b0000000-0000-0000-0000-000000000021','b0000000-0000-0000-0000-000000000012');

insert into public.skus (id, campaign_id, name_i18n, unit_i18n) values
  ('b0000000-0000-0000-0000-000000000031',
   'b0000000-0000-0000-0000-000000000021',
   jsonb_build_object('en','Cups','ar','أكواب'),
   jsonb_build_object('en','units','ar','وحدات'));

-- Users. handle_new_user materialises the profiles row from raw_user_meta_data.
-- admin, supervisorA, supervisorB, promoterJ (at L1), promoterC (at L2).
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at, raw_user_meta_data)
values
  ('b0000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','admin5@p5.test','',now(),now(),now(),
   jsonb_build_object('role','admin','full_name','P5 Admin')),
  ('b0000000-0000-0000-0000-0000000000s1','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','supA@p5.test','',now(),now(),now(),
   jsonb_build_object('role','supervisor','full_name','P5 Sup A')),
  ('b0000000-0000-0000-0000-0000000000s2','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','supB@p5.test','',now(),now(),now(),
   jsonb_build_object('role','supervisor','full_name','P5 Sup B')),
  ('b0000000-0000-0000-0000-0000000000j1','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','proJ@p5.test','',now(),now(),now(),
   jsonb_build_object('role','promoter','full_name','P5 Pro J')),
  ('b0000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','proC@p5.test','',now(),now(),now(),
   jsonb_build_object('role','promoter','full_name','P5 Pro C'));

insert into public.user_assignments (user_id, location_id, role_scope) values
  ('b0000000-0000-0000-0000-0000000000s1','b0000000-0000-0000-0000-000000000011','supervisor'),
  ('b0000000-0000-0000-0000-0000000000s2','b0000000-0000-0000-0000-000000000012','supervisor'),
  ('b0000000-0000-0000-0000-0000000000j1','b0000000-0000-0000-0000-000000000011','promoter'),
  ('b0000000-0000-0000-0000-0000000000c1','b0000000-0000-0000-0000-000000000012','promoter');

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
-- Seed a valid movement we can reference later (admin executes).
-- W → SupA: 1000. Inserted as postgres so RLS and the invariant trigger both
-- run against a clean slate.
-- ============================================================================
insert into public.stock_movements (
  id, campaign_id, sku_id,
  from_entity_type, from_entity_id, to_entity_type, to_entity_id,
  quantity, movement_kind, user_id, location_id, idempotency_key
) values (
  'b0000000-0000-0000-0000-0000000000f1',
  'b0000000-0000-0000-0000-000000000021',
  'b0000000-0000-0000-0000-000000000031',
  'warehouse', null, 'supervisor', 'b0000000-0000-0000-0000-0000000000s1',
  1000, 'allocation',
  'b0000000-0000-0000-0000-0000000000a1',
  'b0000000-0000-0000-0000-000000000011',
  'b0000000-0000-0000-0000-0000000000e1'
);

-- Distribute 300 from supA to promoter J.
insert into public.stock_movements (
  id, campaign_id, sku_id,
  from_entity_type, from_entity_id, to_entity_type, to_entity_id,
  quantity, movement_kind, user_id, location_id, idempotency_key
) values (
  'b0000000-0000-0000-0000-0000000000f2',
  'b0000000-0000-0000-0000-000000000021',
  'b0000000-0000-0000-0000-000000000031',
  'supervisor', 'b0000000-0000-0000-0000-0000000000s1',
  'promoter',   'b0000000-0000-0000-0000-0000000000j1',
  300, 'distribution',
  'b0000000-0000-0000-0000-0000000000s1',
  'b0000000-0000-0000-0000-000000000011',
  'b0000000-0000-0000-0000-0000000000e2'
);

-- ============================================================================
-- A. Append-only triggers — stock_movements (2 tests)
-- ============================================================================
select throws_like(
  $$update public.stock_movements set quantity = 500
      where id = 'b0000000-0000-0000-0000-0000000000f1'$$,
  '%append-only%',
  '(1/17) stock_movements UPDATE is rejected by the immutability trigger'
);

select throws_like(
  $$delete from public.stock_movements
      where id = 'b0000000-0000-0000-0000-0000000000f1'$$,
  '%append-only%',
  '(2/17) stock_movements DELETE is rejected by the immutability trigger'
);

-- ============================================================================
-- B. Table-level CHECK constraints (5 tests)
-- ============================================================================
select throws_like(
  $$insert into public.stock_movements (
      campaign_id, sku_id, from_entity_type, from_entity_id,
      to_entity_type, to_entity_id, quantity, movement_kind,
      user_id, idempotency_key)
    values (
      'b0000000-0000-0000-0000-000000000021',
      'b0000000-0000-0000-0000-000000000031',
      'warehouse', null, 'supervisor','b0000000-0000-0000-0000-0000000000s1',
      0, 'allocation',
      'b0000000-0000-0000-0000-0000000000a1',
      'b0000000-0000-0000-0000-0000000000e9')$$,
  '%stock_movements_quantity_check%',
  '(3/17) quantity = 0 rejected by CHECK'
);

select throws_like(
  $$insert into public.stock_movements (
      campaign_id, sku_id, from_entity_type, from_entity_id,
      to_entity_type, to_entity_id, quantity, movement_kind,
      user_id, idempotency_key, reallocation_group_id)
    values (
      'b0000000-0000-0000-0000-000000000021',
      'b0000000-0000-0000-0000-000000000031',
      'supervisor','b0000000-0000-0000-0000-0000000000s1',
      'supervisor','b0000000-0000-0000-0000-0000000000s1',
      10, 'reallocation',
      'b0000000-0000-0000-0000-0000000000a1',
      'b0000000-0000-0000-0000-0000000000e10',
      'b0000000-0000-0000-0000-0000000000e11')$$,
  '%stock_movements_no_self_loop%',
  '(4/17) self-loop (from == to) rejected by CHECK'
);

select throws_like(
  $$insert into public.stock_movements (
      campaign_id, sku_id, from_entity_type, from_entity_id,
      to_entity_type, to_entity_id, quantity, movement_kind,
      user_id, idempotency_key)
    values (
      'b0000000-0000-0000-0000-000000000021',
      'b0000000-0000-0000-0000-000000000031',
      'warehouse','b0000000-0000-0000-0000-0000000000s1',
      'supervisor','b0000000-0000-0000-0000-0000000000s1',
      10, 'allocation',
      'b0000000-0000-0000-0000-0000000000a1',
      'b0000000-0000-0000-0000-0000000000e12')$$,
  '%stock_movements_from_entity_shape%',
  '(5/17) warehouse with a non-null from_entity_id rejected'
);

select throws_like(
  $$insert into public.stock_movements (
      campaign_id, sku_id, from_entity_type, from_entity_id,
      to_entity_type, to_entity_id, quantity, movement_kind,
      user_id, idempotency_key)
    values (
      'b0000000-0000-0000-0000-000000000021',
      'b0000000-0000-0000-0000-000000000031',
      'supervisor','b0000000-0000-0000-0000-0000000000s1',
      'warehouse', null,
      10, 'distribution',
      'b0000000-0000-0000-0000-0000000000a1',
      'b0000000-0000-0000-0000-0000000000e13')$$,
  '%stock_movements_kind_pair_check%',
  '(6/17) kind=distribution to warehouse rejected by kind-pair CHECK'
);

select throws_like(
  $$insert into public.stock_movements (
      campaign_id, sku_id, from_entity_type, from_entity_id,
      to_entity_type, to_entity_id, quantity, movement_kind,
      user_id, idempotency_key)
    values (
      'b0000000-0000-0000-0000-000000000021',
      'b0000000-0000-0000-0000-000000000031',
      'supervisor','b0000000-0000-0000-0000-0000000000s1',
      'promoter',  'b0000000-0000-0000-0000-0000000000j1',
      10, 'correction',
      'b0000000-0000-0000-0000-0000000000a1',
      'b0000000-0000-0000-0000-0000000000e14')$$,
  '%stock_movements_correction_shape%',
  '(7/17) movement_kind=correction without correction_of rejected'
);

-- ============================================================================
-- C. BEFORE INSERT invariant trigger (3 tests)
-- ============================================================================

-- A second warehouse allocation succeeds (warehouse is infinite by design).
select lives_ok(
  $$insert into public.stock_movements (
      campaign_id, sku_id, from_entity_type, from_entity_id,
      to_entity_type, to_entity_id, quantity, movement_kind,
      user_id, idempotency_key)
    values (
      'b0000000-0000-0000-0000-000000000021',
      'b0000000-0000-0000-0000-000000000031',
      'warehouse', null,
      'supervisor','b0000000-0000-0000-0000-0000000000s2',
      500, 'allocation',
      'b0000000-0000-0000-0000-0000000000a1',
      'b0000000-0000-0000-0000-0000000000e20')$$,
  '(8/17) warehouse → supervisor allocation succeeds (warehouse is infinite)'
);

-- Distribution from a supervisor who has no balance (supervisor B got 500 above).
select throws_like(
  $$insert into public.stock_movements (
      campaign_id, sku_id, from_entity_type, from_entity_id,
      to_entity_type, to_entity_id, quantity, movement_kind,
      user_id, idempotency_key)
    values (
      'b0000000-0000-0000-0000-000000000021',
      'b0000000-0000-0000-0000-000000000031',
      'supervisor','b0000000-0000-0000-0000-0000000000s2',
      'promoter',  'b0000000-0000-0000-0000-0000000000c1',
      600, 'distribution',
      'b0000000-0000-0000-0000-0000000000s2',
      'b0000000-0000-0000-0000-0000000000e21')$$,
  '%stock invariant violation%',
  '(9/17) distribution > supervisor balance rejected by invariant trigger'
);

-- Promoter J has 300 received; attempt to consume 420 is REJECTED. Exit criterion.
select throws_like(
  $$insert into public.stock_movements (
      campaign_id, sku_id, from_entity_type, from_entity_id,
      to_entity_type, to_entity_id, quantity, movement_kind,
      user_id, idempotency_key)
    values (
      'b0000000-0000-0000-0000-000000000021',
      'b0000000-0000-0000-0000-000000000031',
      'promoter','b0000000-0000-0000-0000-0000000000j1',
      'consumer', null,
      420, 'usage',
      'b0000000-0000-0000-0000-0000000000j1',
      'b0000000-0000-0000-0000-0000000000e22')$$,
  '%stock invariant violation%',
  '(10/17) over-consumption (usage > promoter balance) hard-rejected'
);

-- ============================================================================
-- D. Idempotency UNIQUE (1 test)
-- ============================================================================
select throws_like(
  $$insert into public.stock_movements (
      campaign_id, sku_id, from_entity_type, from_entity_id,
      to_entity_type, to_entity_id, quantity, movement_kind,
      user_id, idempotency_key)
    values (
      'b0000000-0000-0000-0000-000000000021',
      'b0000000-0000-0000-0000-000000000031',
      'warehouse', null,
      'supervisor','b0000000-0000-0000-0000-0000000000s1',
      1, 'allocation',
      'b0000000-0000-0000-0000-0000000000a1',
      'b0000000-0000-0000-0000-0000000000e1')$$,     -- reused from seed row f1
  '%stock_movements_idempotency_key%',
  '(11/17) duplicate idempotency_key rejected by UNIQUE index'
);

-- ============================================================================
-- E. stock_balances view (1 test) — run as postgres so RLS doesn't filter.
-- ============================================================================
-- Before this check: W→SupA 1000, SupA→ProJ 300, W→SupB 500.
-- So SupA has 700 remaining; ProJ has 300; SupB has 500.
select is(
  (select balance
     from public.stock_balances
    where campaign_id = 'b0000000-0000-0000-0000-000000000021'
      and sku_id = 'b0000000-0000-0000-0000-000000000031'
      and entity_type = 'supervisor'
      and entity_id = 'b0000000-0000-0000-0000-0000000000s1'),
  700::bigint,
  '(12/17) stock_balances view: supervisorA cup balance = 700 after 1000 in − 300 out'
);

-- ============================================================================
-- F. stock_reconciliations immutability (2 tests)
-- ============================================================================
insert into public.stock_reconciliations (
  id, campaign_id, scope, entity_id, reconciled_by, status, details
) values (
  'b0000000-0000-0000-0000-0000000000r1',
  'b0000000-0000-0000-0000-000000000021',
  'supervisor',
  'b0000000-0000-0000-0000-0000000000s1',
  'b0000000-0000-0000-0000-0000000000s1',
  'matched',
  '[]'::jsonb
);

select throws_like(
  $$update public.stock_reconciliations set status = 'mismatched'
      where id = 'b0000000-0000-0000-0000-0000000000r1'$$,
  '%append-only%',
  '(13/17) stock_reconciliations UPDATE rejected by immutability trigger'
);

select throws_like(
  $$delete from public.stock_reconciliations
      where id = 'b0000000-0000-0000-0000-0000000000r1'$$,
  '%append-only%',
  '(14/17) stock_reconciliations DELETE rejected by immutability trigger'
);

-- ============================================================================
-- G. RLS — stock_movements (3 tests)
-- ============================================================================

-- Promoter J sees movements touching themselves (received 300 from SupA).
-- Expected count: 1 (the SupA→ProJ distribution).
select tests_auth_as('b0000000-0000-0000-0000-0000000000j1');
select is(
  (select count(*)::int from public.stock_movements
    where sku_id = 'b0000000-0000-0000-0000-000000000031'),
  1,
  '(15/17) RLS: promoter J sees 1 movement (the distribution to them)'
);
reset role;
reset "request.jwt.claims";

-- Supervisor A sees: W→SupA (to=self), SupA→ProJ (from=self + touches own promoter).
-- Expected count: 2. Should NOT see W→SupB (500).
select tests_auth_as('b0000000-0000-0000-0000-0000000000s1');
select is(
  (select count(*)::int from public.stock_movements
    where sku_id = 'b0000000-0000-0000-0000-000000000031'),
  2,
  '(16/17) RLS: supervisorA sees 2 movements (own allocation + own distribution)'
);
reset role;
reset "request.jwt.claims";

-- Supervisor B sees only their own W→SupB allocation (500). Cannot see SupA rows.
select tests_auth_as('b0000000-0000-0000-0000-0000000000s2');
select is(
  (select count(*)::int from public.stock_movements
    where sku_id = 'b0000000-0000-0000-0000-000000000031'
      and from_entity_id = 'b0000000-0000-0000-0000-0000000000s1'),
  0,
  '(17/17) RLS: supervisorB cannot see supervisorA''s outflow movements'
);
reset role;
reset "request.jwt.claims";

select * from finish();
rollback;
