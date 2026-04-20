-- ============================================================================
-- Almarai Demo Seed Data (Feature 6, D-043)
-- ============================================================================
-- Produces a 30-day rolling window of realistic activation data for the
-- Almarai demo tenant: 8 Jordanian locations, 3 campaigns, 6 SKUs, 12 shifts,
-- 3 supervisors, 15 promoters, attendance + pings + sales + stock ledger +
-- breaks + supervisor visits. Re-runnable and idempotent.
--
-- HOW TO RUN (D-043, same posture as all feature migrations):
--   1. Supabase Dashboard -> Auth -> Users -> Add each user below manually.
--      Use password Demo@1234 for every demo account. Do NOT use the CLI.
--   2. Open Supabase Dashboard -> SQL Editor -> paste this entire file -> Run.
--   3. To reset (wipe demo data without re-seeding) use the STANDALONE RESET
--      block at the bottom of this file.
--
-- DO NOT run this file with  supabase db push  or  supabase db reset  -- the
-- project's migrations are the source of truth; seeds are runtime fixtures.
--
-- AUTH USERS REQUIRED (create these first in the Supabase Dashboard):
--   role         email                         password     full_name (AR)
--   ----         -----                         --------     --------------
--   client       client@almarai.com            Demo@1234    علاء الجبور
--   supervisor   super1@demo.com               Demo@1234    سليم أبو غزالة
--   supervisor   super2@demo.com               Demo@1234    وليد القضاة
--   supervisor   super3@demo.com               Demo@1234    هاني النجار
--   promoter     promoter01@demo.com           Demo@1234    أحمد الصمادي
--   promoter     promoter02@demo.com           Demo@1234    محمد الحياري
--   promoter     promoter03@demo.com           Demo@1234    عمر الخطيب
--   promoter     promoter04@demo.com           Demo@1234    يوسف الزعبي
--   promoter     promoter05@demo.com           Demo@1234    خالد العمري
--   promoter     promoter06@demo.com           Demo@1234    ليث المومني
--   promoter     promoter07@demo.com           Demo@1234    عبدالله الرواشدة
--   promoter     promoter08@demo.com           Demo@1234    فارس الحوراني
--   promoter     promoter09@demo.com           Demo@1234    سامي بني هاني
--   promoter     promoter10@demo.com           Demo@1234    طارق الشوبكي
--   promoter     promoter11@demo.com           Demo@1234    نور الدين العزام
--   promoter     promoter12@demo.com           Demo@1234    رامي الفايز
--   promoter     promoter13@demo.com           Demo@1234    مالك الدعجة
--   promoter     promoter14@demo.com           Demo@1234    حسام العبادي
--   promoter     promoter15@demo.com           Demo@1234    زيد النعيمات
--
-- admin@almarai.com already exists and is NEVER touched by this seed.
--
-- PRODUCT PRICES (JOD, for reference; there is no price column on  skus  in
-- the schema -- prices live here only):
--   Laban 1L           1.10 JOD     Mango Juice 1L     1.50 JOD
--   Laban 500ml        0.65 JOD     Orange Juice 1L    1.40 JOD
--   Feta 500g          3.50 JOD     Mozzarella 250g    2.75 JOD
--
-- DEMO TAGGING RULES used by the cleanup block:
--   * clients        -> name = 'Almarai'
--   * campaigns      -> name_i18n->>'en' like 'Almarai %'
--   * regions        -> country_code = 'JO' and name_i18n->>'en' = 'Jordan'
--   * cities         -> name_i18n->>'en' in ('Amman', 'Zarqa', 'Irbid')
--   * locations      -> resolved via demo cities
--   * profiles       -> email in the demo email list (and never admin@...)
-- ============================================================================

begin;

set local statement_timeout = '120s';
set local lock_timeout = '10s';
set local idle_in_transaction_session_timeout = '120s';

-- ============================================================================
-- STAGE 0: Resolve auth.users ids by email. Fail loudly if any are missing.
-- ============================================================================
create temporary table demo_emails (
  slot         text primary key,
  role         text not null,
  email        text not null unique,
  full_name_ar text not null
) on commit drop;

insert into demo_emails (slot, role, email, full_name_ar) values
  ('client_1',     'client',     'client@almarai.com',   'علاء الجبور'),
  ('supervisor_1', 'supervisor', 'super1@demo.com',      'سليم أبو غزالة'),
  ('supervisor_2', 'supervisor', 'super2@demo.com',      'وليد القضاة'),
  ('supervisor_3', 'supervisor', 'super3@demo.com',      'هاني النجار'),
  ('promoter_01',  'promoter',   'promoter01@demo.com',  'أحمد الصمادي'),
  ('promoter_02',  'promoter',   'promoter02@demo.com',  'محمد الحياري'),
  ('promoter_03',  'promoter',   'promoter03@demo.com',  'عمر الخطيب'),
  ('promoter_04',  'promoter',   'promoter04@demo.com',  'يوسف الزعبي'),
  ('promoter_05',  'promoter',   'promoter05@demo.com',  'خالد العمري'),
  ('promoter_06',  'promoter',   'promoter06@demo.com',  'ليث المومني'),
  ('promoter_07',  'promoter',   'promoter07@demo.com',  'عبدالله الرواشدة'),
  ('promoter_08',  'promoter',   'promoter08@demo.com',  'فارس الحوراني'),
  ('promoter_09',  'promoter',   'promoter09@demo.com',  'سامي بني هاني'),
  ('promoter_10',  'promoter',   'promoter10@demo.com',  'طارق الشوبكي'),
  ('promoter_11',  'promoter',   'promoter11@demo.com',  'نور الدين العزام'),
  ('promoter_12',  'promoter',   'promoter12@demo.com',  'رامي الفايز'),
  ('promoter_13',  'promoter',   'promoter13@demo.com',  'مالك الدعجة'),
  ('promoter_14',  'promoter',   'promoter14@demo.com',  'حسام العبادي'),
  ('promoter_15',  'promoter',   'promoter15@demo.com',  'زيد النعيمات');

create temporary table demo_users on commit drop as
select de.slot, de.role, de.email, de.full_name_ar, u.id as user_id
from demo_emails de
join auth.users u on lower(u.email) = lower(de.email);

do $$
declare
  missing text;
begin
  select string_agg(de.email, ', ' order by de.email)
    into missing
    from demo_emails de
    where not exists (select 1 from demo_users du where du.slot = de.slot);
  if missing is not null then
    raise exception
      'Demo seed: missing auth.users for [%]. Create these in Supabase Dashboard -> Auth -> Users with password Demo@1234, then re-run.',
      missing;
  end if;
end$$;

-- ============================================================================
-- STAGE 1: Cleanup of prior demo data (tagged-only, FK-safe order).
--           Safe to run standalone via the RESET block at the bottom.
-- ============================================================================
-- stock_movements is append-only at the trigger layer; disable the deny
-- trigger temporarily so the cleanup can reset the demo ledger.
alter table public.stock_movements disable trigger stock_movements_no_delete;

-- 1.1 location_pings (also cascades from attendance, but explicit is safer)
delete from public.location_pings lp
  using public.attendance a, public.campaigns c
  where lp.attendance_id = a.id
    and a.campaign_id = c.id
    and c.name_i18n->>'en' like 'Almarai %';

-- 1.2 supervisor_visits
delete from public.supervisor_visits sv
  using public.campaigns c
  where sv.campaign_id = c.id
    and c.name_i18n->>'en' like 'Almarai %';

-- 1.3 break_requests
delete from public.break_requests br
  using public.campaigns c
  where br.campaign_id = c.id
    and c.name_i18n->>'en' like 'Almarai %';

-- 1.4 sales_entries (cascades from daily_reports but explicit for clarity)
delete from public.sales_entries se
  using public.daily_reports dr, public.campaigns c
  where se.daily_report_id = dr.id
    and dr.campaign_id = c.id
    and c.name_i18n->>'en' like 'Almarai %';

-- 1.5 daily_reports
delete from public.daily_reports dr
  using public.campaigns c
  where dr.campaign_id = c.id
    and c.name_i18n->>'en' like 'Almarai %';

-- 1.6 stock_movements (deny trigger disabled above)
delete from public.stock_movements sm
  using public.campaigns c
  where sm.campaign_id = c.id
    and c.name_i18n->>'en' like 'Almarai %';

alter table public.stock_movements enable trigger stock_movements_no_delete;

-- 1.7 attendance
delete from public.attendance a
  using public.campaigns c
  where a.campaign_id = c.id
    and c.name_i18n->>'en' like 'Almarai %';

-- 1.8 user_assignments for demo locations
delete from public.user_assignments ua
  using public.locations l, public.cities ci
  where ua.location_id = l.id
    and l.city_id = ci.id
    and ci.name_i18n->>'en' in ('Amman', 'Zarqa', 'Irbid');

-- 1.9 shifts
delete from public.shifts s
  using public.campaigns c
  where s.campaign_id = c.id
    and c.name_i18n->>'en' like 'Almarai %';

-- 1.10 campaign_locations
delete from public.campaign_locations cl
  using public.campaigns c
  where cl.campaign_id = c.id
    and c.name_i18n->>'en' like 'Almarai %';

-- 1.11 skus (FK cascade from campaigns will handle this, but explicit here
--       keeps the order obvious when reading the cleanup block alone)
delete from public.skus sk
  using public.campaigns c
  where sk.campaign_id = c.id
    and c.name_i18n->>'en' like 'Almarai %';

-- 1.12 campaigns
delete from public.campaigns
  where name_i18n->>'en' like 'Almarai %';

-- 1.13 locations in demo cities
delete from public.locations l
  using public.cities ci
  where l.city_id = ci.id
    and ci.name_i18n->>'en' in ('Amman', 'Zarqa', 'Irbid');

-- 1.14 cities (only the demo ones)
delete from public.cities
  where name_i18n->>'en' in ('Amman', 'Zarqa', 'Irbid');

-- 1.15 regions (only the Jordan demo region)
delete from public.regions
  where country_code = 'JO'
    and name_i18n->>'en' = 'Jordan';

-- 1.16 clients (only the Almarai demo tenant). Because  profiles.client_id
--       has ON DELETE RESTRICT, we first null out the client-role profile's
--       client_id. The profile row itself is kept so we don't have to
--       recreate the auth.users linkage.
update public.profiles p
  set client_id = null
  where p.client_id in (select id from public.clients where name = 'Almarai');

delete from public.clients where name = 'Almarai';

-- 1.17 Reset demo profiles (names, language, role, assigned_locations) so the
--       seed re-stamps them cleanly. admin@almarai.com is NEVER touched.
update public.profiles p
  set full_name           = 'Demo User',
      preferred_language  = 'en',
      assigned_locations  = '{}'::uuid[]
  where p.id in (
    select du.user_id from demo_users du
    where du.email <> 'admin@almarai.com'
  );

-- ============================================================================
-- STAGE 2: Insert demo data. Order matters for FK + invariant triggers.
-- (Added in subsequent commits -- see the commit history for this file.)
-- ============================================================================

-- STAGE 2.1 client
-- STAGE 2.2 regions + cities
-- STAGE 2.3 locations
-- STAGE 2.4 campaigns + campaign_locations
-- STAGE 2.5 skus
-- STAGE 2.6 shifts
-- STAGE 2.7 profile updates + user_assignments
-- STAGE 2.8 attendance (30-day rolling)
-- STAGE 2.9 location_pings
-- STAGE 2.10 daily_reports + sales_entries
-- STAGE 2.11 break_requests
-- STAGE 2.12 stock_movements (allocation -> distribution -> usage -> return)
-- STAGE 2.13 supervisor_visits

commit;

-- ============================================================================
-- STANDALONE RESET BLOCK (optional)
-- ============================================================================
-- To wipe the demo data without re-seeding, copy the STAGE 0 + STAGE 1 blocks
-- above into the SQL Editor on their own (they are a no-op on a clean
-- database). The full STAGE 1 is a self-contained cleanup keyed by the demo
-- tags above, so running the seed file again OR running STAGE 0 + STAGE 1
-- alone both produce a clean slate.
-- ============================================================================
