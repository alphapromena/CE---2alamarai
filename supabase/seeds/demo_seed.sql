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
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 2.1 Client (Almarai)
-- ----------------------------------------------------------------------------
insert into public.clients (name, name_i18n, contact_email, contact_phone, active)
values (
  'Almarai',
  jsonb_build_object('en', 'Almarai', 'ar', 'المراعي'),
  'contact@almarai.com',
  '+962-6-500-5000',
  true
);

create temporary table demo_client on commit drop as
  select id from public.clients where name = 'Almarai';

-- Client-role profile (client@almarai.com) is re-linked in Stage 2.7 along
-- with all other demo profile updates, under a disabled self-update guard.

-- ----------------------------------------------------------------------------
-- 2.2 Region (Jordan) + 3 cities
-- ----------------------------------------------------------------------------
insert into public.regions (name_i18n, country_code, active)
values (jsonb_build_object('en', 'Jordan', 'ar', 'الأردن'), 'JO', true);

create temporary table demo_region on commit drop as
  select id from public.regions
  where country_code = 'JO' and name_i18n->>'en' = 'Jordan';

insert into public.cities (region_id, name_i18n, active)
select (select id from demo_region), name_i18n, true
from (values
  (jsonb_build_object('en', 'Amman', 'ar', 'عمان')),
  (jsonb_build_object('en', 'Zarqa', 'ar', 'الزرقاء')),
  (jsonb_build_object('en', 'Irbid', 'ar', 'اربد'))
) as v(name_i18n);

create temporary table demo_cities on commit drop as
  select id, name_i18n->>'en' as city_key
  from public.cities
  where region_id = (select id from demo_region)
    and name_i18n->>'en' in ('Amman', 'Zarqa', 'Irbid');

-- ----------------------------------------------------------------------------
-- 2.3 Locations (8)
-- Real-ish Jordanian coordinates; geofence 100 m; bilingual + Arabic address.
-- ----------------------------------------------------------------------------
create temporary table demo_location_input (
  slot         text primary key,
  city_key     text not null,
  name_en      text not null,
  name_ar      text not null,
  address_ar   text not null,
  lat          double precision not null,
  lng          double precision not null
) on commit drop;

insert into demo_location_input values
  ('loc_amman_carrefour_city', 'Amman', 'Carrefour City Mall',         'كارفور سيتي مول',
   'شارع الملكة رانيا العبدالله، عمان',           31.97420, 35.85690),
  ('loc_amman_safeway_7th',    'Amman', 'Safeway 7th Circle',          'سيفوي الدوار السابع',
   'الدوار السابع، عمان',                          31.94670, 35.87450),
  ('loc_amman_cozmo_abdoun',   'Amman', 'Cozmo Abdoun',                'كوزمو عبدون',
   'شارع عبدون الشمالي، عمان',                    31.93930, 35.87220),
  ('loc_amman_miles_sweifieh', 'Amman', 'Miles Supermarket Sweifieh',  'ميلز سوبرماركت الصويفية',
   'شارع الوكالات، الصويفية، عمان',               31.93390, 35.86890),
  ('loc_zarqa_safeway',        'Zarqa', 'Safeway Zarqa',               'سيفوي الزرقاء',
   'شارع الملك عبدالله الثاني، الزرقاء',          32.07320, 36.08810),
  ('loc_zarqa_miles_newcity',  'Zarqa', 'Miles Zarqa New City',        'ميلز الزرقاء المدينة الجديدة',
   'المدينة الجديدة، الزرقاء',                    32.05870, 36.09530),
  ('loc_irbid_carrefour',      'Irbid', 'Carrefour Irbid',             'كارفور اربد',
   'شارع الحصن، اربد',                            32.55510, 35.84920),
  ('loc_irbid_safeway',        'Irbid', 'Safeway Irbid',               'سيفوي اربد',
   'شارع الملك حسين، اربد',                       32.54210, 35.85380);

insert into public.locations (city_id, name_i18n, address, lat, lng, geofence_radius_m, active)
select
  (select id from demo_cities where city_key = li.city_key),
  jsonb_build_object('en', li.name_en, 'ar', li.name_ar),
  li.address_ar,
  li.lat,
  li.lng,
  100,
  true
from demo_location_input li;

create temporary table demo_locations on commit drop as
select l.id,
       li.slot,
       li.city_key,
       li.lat,
       li.lng
from demo_location_input li
join public.locations l
  on l.city_id = (select id from demo_cities where city_key = li.city_key)
 and l.name_i18n->>'en' = li.name_en;

-- ----------------------------------------------------------------------------
-- 2.4 Campaigns (3) + campaign_locations
-- ----------------------------------------------------------------------------
create temporary table demo_campaign_input (
  slot         text primary key,
  name_en      text not null,
  name_ar      text not null,
  start_offset int  not null,  -- days relative to today; negative = past
  end_offset   int  not null,
  status       public.campaign_status not null,
  objectives   text
) on commit drop;

insert into demo_campaign_input values
  ('camp_laban',   'Almarai Laban Ramadan 2026', 'المراعي لبن رمضان 2026',
   -30, 45, 'active',
   'Sampling + sales push for Laban 1L and 500ml ahead of Ramadan; target 2000 samples per SKU.'),
  ('camp_juice',   'Almarai Juice Summer',       'المراعي عصائر الصيف',
   -21, 60, 'active',
   'Mango and orange juice sampling across the four Amman locations for the summer peak.'),
  ('camp_cheese',  'Almarai Cheese Promo',       'المراعي عرض الأجبان',
   -45, -2, 'completed',
   'Feta and mozzarella promotion at the Zarqa and Irbid stores (completed).');

insert into public.campaigns (client_id, name_i18n, start_date, end_date, objectives, status, kpi_config)
select (select id from demo_client),
       jsonb_build_object('en', ci.name_en, 'ar', ci.name_ar),
       (current_date + ci.start_offset)::date,
       (current_date + ci.end_offset)::date,
       ci.objectives,
       ci.status,
       jsonb_build_object('sampling_rate_denominator', 'contacts')
from demo_campaign_input ci;

create temporary table demo_campaigns on commit drop as
select c.id, ci.slot
from demo_campaign_input ci
join public.campaigns c
  on c.client_id = (select id from demo_client)
 and c.name_i18n->>'en' = ci.name_en;

-- campaign_locations mapping
--   Laban  -> all 8 locations
--   Juice  -> the 4 Amman locations
--   Cheese -> the 2 Zarqa + 2 Irbid locations (completed)
create temporary table demo_campaign_locations (
  campaign_slot text not null,
  location_slot text not null
) on commit drop;

insert into demo_campaign_locations values
  ('camp_laban',  'loc_amman_carrefour_city'),
  ('camp_laban',  'loc_amman_safeway_7th'),
  ('camp_laban',  'loc_amman_cozmo_abdoun'),
  ('camp_laban',  'loc_amman_miles_sweifieh'),
  ('camp_laban',  'loc_zarqa_safeway'),
  ('camp_laban',  'loc_zarqa_miles_newcity'),
  ('camp_laban',  'loc_irbid_carrefour'),
  ('camp_laban',  'loc_irbid_safeway'),
  ('camp_juice',  'loc_amman_carrefour_city'),
  ('camp_juice',  'loc_amman_safeway_7th'),
  ('camp_juice',  'loc_amman_cozmo_abdoun'),
  ('camp_juice',  'loc_amman_miles_sweifieh'),
  ('camp_cheese', 'loc_zarqa_safeway'),
  ('camp_cheese', 'loc_zarqa_miles_newcity'),
  ('camp_cheese', 'loc_irbid_carrefour'),
  ('camp_cheese', 'loc_irbid_safeway');

insert into public.campaign_locations (campaign_id, location_id)
select (select id from demo_campaigns where slot = dcl.campaign_slot),
       (select id from demo_locations where slot = dcl.location_slot)
from demo_campaign_locations dcl;

-- ----------------------------------------------------------------------------
-- 2.5 SKUs (6; two per campaign)
-- Unit is 'pieces' / 'قطع'. See header for JOD prices (no price column).
-- ----------------------------------------------------------------------------
create temporary table demo_sku_input (
  slot           text primary key,
  campaign_slot  text not null,
  name_en        text not null,
  name_ar        text not null,
  target         int  not null,
  stock_allocated int not null
) on commit drop;

insert into demo_sku_input values
  ('sku_laban_1l',     'camp_laban',  'Laban 1L',          'لبن 1 لتر',         2000, 3000),
  ('sku_laban_500ml',  'camp_laban',  'Laban 500ml',       'لبن 500 مل',        2000, 3000),
  ('sku_juice_mango',  'camp_juice',  'Mango Juice 1L',    'عصير مانجو 1 لتر',  2000, 3000),
  ('sku_juice_orange', 'camp_juice',  'Orange Juice 1L',   'عصير برتقال 1 لتر', 2000, 3000),
  ('sku_cheese_feta',  'camp_cheese', 'Feta 500g',         'جبنة فيتا 500 غ',   1500, 2000),
  ('sku_cheese_mozz',  'camp_cheese', 'Mozzarella 250g',   'موزاريلا 250 غ',    1500, 2000);

insert into public.skus (campaign_id, name_i18n, unit_i18n, target, stock_allocated, kind, active)
select (select id from demo_campaigns where slot = si.campaign_slot),
       jsonb_build_object('en', si.name_en, 'ar', si.name_ar),
       jsonb_build_object('en', 'pieces', 'ar', 'قطع'),
       si.target,
       si.stock_allocated,
       'sample'::public.sku_kind,
       true
from demo_sku_input si;

create temporary table demo_skus on commit drop as
select s.id, si.slot, si.campaign_slot
from demo_sku_input si
join demo_campaigns dc on dc.slot = si.campaign_slot
join public.skus s
  on s.campaign_id = dc.id
 and s.name_i18n->>'en' = si.name_en;

-- ----------------------------------------------------------------------------
-- 2.6 Shifts (12; one per active campaign-location pair)
-- Laban active -> 8 shifts. Juice active -> 4 shifts. Cheese completed -> 0.
-- 09:00-17:00, Sunday (dow=0) through Thursday (dow=4).
-- ----------------------------------------------------------------------------
insert into public.shifts (campaign_id, location_id, start_time, end_time, days_of_week, active)
select c.id,
       l.id,
       time '09:00',
       time '17:00',
       array[0, 1, 2, 3, 4]::smallint[],
       true
from demo_campaign_locations dcl
join demo_campaigns c     on c.slot = dcl.campaign_slot
join demo_locations  l    on l.slot = dcl.location_slot
join demo_campaign_input ci on ci.slot = dcl.campaign_slot
where ci.status = 'active';

create temporary table demo_shifts on commit drop as
select s.id          as shift_id,
       dc.slot       as campaign_slot,
       dl.slot       as location_slot,
       s.campaign_id,
       s.location_id,
       s.start_time,
       s.end_time,
       s.days_of_week
from public.shifts s
join demo_campaigns dc on dc.id = s.campaign_id
join demo_locations dl on dl.id = s.location_id;

-- ----------------------------------------------------------------------------
-- 2.7 Profile updates + user_assignments
--
-- The profiles_self_update_guard_trg enforces that only admins may change
-- role / active / client_id. In SQL Editor auth.uid() is NULL, so is_admin()
-- returns false and the guard would reject the role flip. We disable it for
-- the duration of stage 2.7 and re-enable before moving on. The
-- user_assignments sync trigger (which updates profiles.assigned_locations)
-- is allowed by the guard anyway (nested trigger path); we still disable the
-- guard uniformly to keep the stage self-contained.
-- ----------------------------------------------------------------------------
alter table public.profiles disable trigger profiles_self_update_guard_trg;

update public.profiles p
  set role               = du.role::public.user_role,
      full_name          = du.full_name_ar,
      preferred_language = 'ar',
      client_id          = case when du.role = 'client'
                                then (select id from demo_client)
                                else null
                           end,
      active             = true
  from demo_users du
  where p.id = du.user_id
    and du.email <> 'admin@almarai.com';

alter table public.profiles enable trigger profiles_self_update_guard_trg;

-- Promoter assignments: 12 singles + 3 multi-cover = 18 assignment rows.
create temporary table demo_promoter_assignment_input (
  promoter_slot  text not null,
  campaign_slot  text not null,
  location_slot  text not null
) on commit drop;

insert into demo_promoter_assignment_input values
  ('promoter_01', 'camp_laban',  'loc_amman_carrefour_city'),
  ('promoter_02', 'camp_laban',  'loc_amman_safeway_7th'),
  ('promoter_03', 'camp_laban',  'loc_amman_cozmo_abdoun'),
  ('promoter_04', 'camp_laban',  'loc_amman_miles_sweifieh'),
  ('promoter_05', 'camp_laban',  'loc_zarqa_safeway'),
  ('promoter_06', 'camp_laban',  'loc_zarqa_miles_newcity'),
  ('promoter_07', 'camp_laban',  'loc_irbid_carrefour'),
  ('promoter_08', 'camp_laban',  'loc_irbid_safeway'),
  ('promoter_09', 'camp_juice',  'loc_amman_carrefour_city'),
  ('promoter_10', 'camp_juice',  'loc_amman_safeway_7th'),
  ('promoter_11', 'camp_juice',  'loc_amman_cozmo_abdoun'),
  ('promoter_12', 'camp_juice',  'loc_amman_miles_sweifieh'),
  -- Multi-cover:
  ('promoter_13', 'camp_laban',  'loc_zarqa_safeway'),
  ('promoter_13', 'camp_laban',  'loc_irbid_carrefour'),
  ('promoter_14', 'camp_laban',  'loc_amman_carrefour_city'),
  ('promoter_14', 'camp_juice',  'loc_amman_carrefour_city'),
  ('promoter_15', 'camp_laban',  'loc_amman_safeway_7th'),
  ('promoter_15', 'camp_juice',  'loc_amman_safeway_7th');

insert into public.user_assignments (user_id, location_id, shift_id, role_scope, active)
select du.user_id,
       ds.location_id,
       ds.shift_id,
       'promoter'::public.user_role,
       true
from demo_promoter_assignment_input pai
join demo_users du  on du.slot = pai.promoter_slot
join demo_shifts ds on ds.campaign_slot = pai.campaign_slot
                   and ds.location_slot = pai.location_slot;

-- Supervisor assignments. role_scope='supervisor', shift_id NULL.
create temporary table demo_supervisor_assignment_input (
  supervisor_slot text not null,
  location_slot   text not null
) on commit drop;

insert into demo_supervisor_assignment_input values
  -- Supervisor 1 covers the 4 Amman locations
  ('supervisor_1', 'loc_amman_carrefour_city'),
  ('supervisor_1', 'loc_amman_safeway_7th'),
  ('supervisor_1', 'loc_amman_cozmo_abdoun'),
  ('supervisor_1', 'loc_amman_miles_sweifieh'),
  -- Supervisor 2 covers the 2 Zarqa + 2 Irbid locations
  ('supervisor_2', 'loc_zarqa_safeway'),
  ('supervisor_2', 'loc_zarqa_miles_newcity'),
  ('supervisor_2', 'loc_irbid_carrefour'),
  ('supervisor_2', 'loc_irbid_safeway'),
  -- Supervisor 3 covers one from each city for cross-coverage
  ('supervisor_3', 'loc_amman_cozmo_abdoun'),
  ('supervisor_3', 'loc_zarqa_safeway'),
  ('supervisor_3', 'loc_irbid_carrefour');

insert into public.user_assignments (user_id, location_id, shift_id, role_scope, active)
select du.user_id,
       dl.id,
       null,
       'supervisor'::public.user_role,
       true
from demo_supervisor_assignment_input sai
join demo_users du     on du.slot = sai.supervisor_slot
join demo_locations dl on dl.slot = sai.location_slot;

-- ----------------------------------------------------------------------------
-- 2.8 Attendance (30-day rolling window)
--
-- For every (promoter assignment, day in past 30) where the day's DOW matches
-- the shift's days_of_week, produce one attendance row. Distribution:
--   * ~5% absent (all check-in/out fields NULL)
--   * ~10% late (check_in 10-40 min after shift start)
--   * ~85% on-time (check_in 0-10 min before shift start)
--   * ~3% outside geofence (is_within_geofence = false, distance 150-300 m)
--   * ~3% early leave on past days (checked_out at end_time - 10..40 min)
-- days_ago = 0 rows have no check_out (still mid-shift in demo terms).
-- ----------------------------------------------------------------------------
with base as (
  select ua.user_id,
         s.campaign_id,
         s.location_id,
         s.id as shift_id,
         s.start_time,
         s.end_time,
         s.days_of_week,
         dl.lat as loc_lat,
         dl.lng as loc_lng,
         gs.n as days_ago,
         (current_date - gs.n)::date as attendance_date
  from public.user_assignments ua
  join public.shifts s
    on s.id = ua.shift_id
   and s.active = true
  join demo_locations dl on dl.id = ua.location_id
  cross join generate_series(0, 29) as gs(n)
  where ua.role_scope = 'promoter'
    and ua.active = true
    and ua.location_id in (select id from demo_locations)
    and extract(dow from (current_date - gs.n)::date)::smallint = any (s.days_of_week)
),
rolled as (
  select b.*,
         random() as r_absent,
         random() as r_late,
         random() as r_geo,
         random() as r_early,
         random() as r_ci_jit,
         random() as r_co_jit,
         random() as r_lat_jit,
         random() as r_lng_jit
  from base b
),
decided as (
  select r.*,
         (r.r_absent < 0.05)                          as is_absent,
         (r.r_late   < 0.10 and r.r_absent >= 0.05)   as is_late,
         (r.r_geo    < 0.03 and r.r_absent >= 0.05)   as is_out_of_geofence,
         (r.days_ago > 0 and r.r_early < 0.03 and r.r_absent >= 0.05)
                                                      as is_early_leave
  from rolled r
),
composed as (
  select d.*,
         -- check_in offset: late -> +10..+40 min, else -10..0 min
         case
           when d.is_late then (10 + floor(d.r_ci_jit * 30))::int
           else            (-floor(d.r_ci_jit * 10))::int
         end as ci_offset_min,
         -- check_out offset: early_leave -> -40..-10 min, else -5..+15 min
         case
           when d.is_early_leave then -(10 + floor(d.r_co_jit * 30))::int
           else                        (-5 + floor(d.r_co_jit * 20))::int
         end as co_offset_min,
         -- geofence jitter radius in degrees (~0.0005 deg ≈ 50 m within;
         -- ~0.0025 deg ≈ 275 m outside)
         case when d.is_out_of_geofence then 0.00250 else 0.00045 end as jitter_deg,
         -- recorded haversine distance in metres
         case when d.is_out_of_geofence
              then (150 + floor(d.r_geo * 150))::int
              else ( 10 + floor(d.r_geo *  80))::int
         end as distance_m
  from decided d
)
insert into public.attendance (
  user_id, campaign_id, location_id, shift_id, attendance_date,
  check_in_time, check_in_lat, check_in_lng, check_in_photo_path, check_in_distance_m,
  check_out_time, check_out_lat, check_out_lng, check_out_photo_path, check_out_distance_m,
  status, is_within_geofence,
  idempotency_key_check_in, idempotency_key_check_out,
  created_at
)
select
  c.user_id,
  c.campaign_id,
  c.location_id,
  c.shift_id,
  c.attendance_date,
  case when c.is_absent then null
       else (c.attendance_date::timestamp + c.start_time) at time zone 'Asia/Amman'
          + (c.ci_offset_min * interval '1 minute')
  end,
  case when c.is_absent then null
       else c.loc_lat + (c.r_lat_jit * 2 - 1) * c.jitter_deg
  end,
  case when c.is_absent then null
       else c.loc_lng + (c.r_lng_jit * 2 - 1) * c.jitter_deg
  end,
  case when c.is_absent then null
       else 'demo/checkin_' || gen_random_uuid()::text || '.jpg'
  end,
  case when c.is_absent then null else c.distance_m end,
  case when c.is_absent or c.days_ago = 0 then null
       else (c.attendance_date::timestamp + c.end_time) at time zone 'Asia/Amman'
          + (c.co_offset_min * interval '1 minute')
  end,
  case when c.is_absent or c.days_ago = 0 then null
       else c.loc_lat + (c.r_lat_jit * 2 - 1) * c.jitter_deg * 0.6
  end,
  case when c.is_absent or c.days_ago = 0 then null
       else c.loc_lng + (c.r_lng_jit * 2 - 1) * c.jitter_deg * 0.6
  end,
  case when c.is_absent or c.days_ago = 0 then null
       else 'demo/checkout_' || gen_random_uuid()::text || '.jpg'
  end,
  case when c.is_absent or c.days_ago = 0 then null
       else (10 + floor(random() * 80))::int
  end,
  case
    when c.is_absent        then 'absent'::public.attendance_status
    when c.days_ago = 0 and c.is_late then 'late'::public.attendance_status
    when c.days_ago = 0     then 'checked_in'::public.attendance_status
    when c.is_early_leave   then 'early_leave'::public.attendance_status
    else                         'checked_out'::public.attendance_status
  end,
  not c.is_out_of_geofence,
  case when c.is_absent then null else gen_random_uuid() end,
  case when c.is_absent or c.days_ago = 0 then null else gen_random_uuid() end,
  -- Stamp created_at to the real attendance day so Phase 6 daily rollups bucket
  -- the rows into their correct historical buckets.
  (c.attendance_date::timestamp + c.start_time) at time zone 'Asia/Amman'
from composed c
on conflict (user_id, attendance_date, campaign_id, location_id) do nothing;

-- ----------------------------------------------------------------------------
-- 2.9 location_pings every 15 min between check-in and check-out.
-- Only for attendance rows that actually checked out (i.e. not absent, not
-- still open). Coordinates drift within ~40 m of the location.
-- ----------------------------------------------------------------------------
insert into public.location_pings (
  attendance_id, promoter_id, lat, lng, accuracy_m, battery_pct, captured_at, created_at
)
select
  a.id,
  a.user_id,
  dl.lat + (random() * 2 - 1) * 0.00035,
  dl.lng + (random() * 2 - 1) * 0.00035,
  (5 + floor(random() * 16))::double precision,
  (85 + floor(random() * 16))::int,
  ping_ts,
  ping_ts
from public.attendance a
join demo_locations dl on dl.id = a.location_id
cross join lateral (
  select gs.ts as ping_ts
  from generate_series(
    a.check_in_time + interval '5 minutes',
    a.check_out_time - interval '5 minutes',
    interval '15 minutes'
  ) as gs(ts)
) pings
where a.check_in_time is not null
  and a.check_out_time is not null
  and a.campaign_id in (select id from demo_campaigns);

-- ----------------------------------------------------------------------------
-- 2.10 Daily reports + sales_entries
--
-- One daily_report per (promoter, checked-out attendance day). Funnel:
--   * contacts          50-120
--   * engaged           ~35-60% of contacts
--   * samples_total     4-16 (total samples across the campaign's 2 SKUs)
--   * sales_total       1-6  (conversions)
-- Status:
--   * 80% approved (reviewed_by = supervisor_1, reviewed_at ~ +1h after
--     check_out_time)
--   * 20% submitted (awaiting review)
-- sales_entries: 2 rows per daily_report (one per SKU of the campaign), with
-- samples + sales split randomly in an 40/60..60/40 ratio.
-- ----------------------------------------------------------------------------
-- One input row per (promoter, location, day) — daily_reports is unique on
-- that triple, so for multi-cover promoters we pick the attendance row with
-- the smallest campaign uuid for that day and that location.
create temporary table demo_daily_inputs on commit drop as
select distinct on (a.user_id, a.location_id, a.attendance_date)
  a.id                          as attendance_id,
  a.user_id                     as promoter_user_id,
  a.campaign_id,
  a.location_id,
  a.attendance_date,
  a.check_in_time,
  a.check_out_time,
  (50  + floor(random() * 71))::int   as contacts,
  -- engage_rate 0.35..0.60
  (0.35 + random() * 0.25)            as engage_rate,
  (4   + floor(random() * 13))::int   as samples_total,
  (1   + floor(random() *  6))::int   as sales_total,
  -- SKU split ratio: 0.40..0.60 goes to sku #1, remainder to sku #2
  (0.40 + random() * 0.20)            as sku_split,
  -- approved vs submitted
  (random() < 0.80)                   as is_approved,
  gen_random_uuid()                   as report_id_seed
from public.attendance a
where a.status in ('checked_out', 'early_leave')
  and a.campaign_id in (select id from demo_campaigns)
order by a.user_id, a.location_id, a.attendance_date, a.campaign_id;

insert into public.daily_reports (
  id, campaign_id, location_id, promoter_user_id, report_date,
  contacts, engaged, samples_total, sales_total,
  notes, status,
  submitted_at, reviewed_at, reviewed_by, review_reason,
  idempotency_key,
  created_at, updated_at
)
select
  di.report_id_seed,
  di.campaign_id,
  di.location_id,
  di.promoter_user_id,
  di.attendance_date,
  di.contacts,
  least(di.contacts, floor(di.contacts * di.engage_rate)::int),
  di.samples_total,
  di.sales_total,
  'Demo generated daily report.',
  case when di.is_approved then 'approved'::public.daily_report_status
       else 'submitted'::public.daily_report_status
  end,
  di.check_out_time + interval '5 minutes',
  case when di.is_approved then di.check_out_time + interval '1 hour' end,
  case when di.is_approved then (select user_id from demo_users where slot = 'supervisor_1') end,
  null,
  gen_random_uuid(),
  di.check_out_time + interval '5 minutes',
  di.check_out_time + interval '5 minutes'
from demo_daily_inputs di;

-- One sales_entries row per (daily_report, sku) for the campaign's two SKUs.
-- samples and sales are split by sku_split and 1 - sku_split.
insert into public.sales_entries (daily_report_id, sku_id, samples, sales, created_at, updated_at)
select
  di.report_id_seed,
  sk.id,
  case when sk.rn = 1
       then floor(di.samples_total * di.sku_split)::int
       else di.samples_total - floor(di.samples_total * di.sku_split)::int
  end,
  case when sk.rn = 1
       then floor(di.sales_total   * di.sku_split)::int
       else di.sales_total   - floor(di.sales_total   * di.sku_split)::int
  end,
  di.check_out_time + interval '5 minutes',
  di.check_out_time + interval '5 minutes'
from demo_daily_inputs di
cross join lateral (
  select s.id,
         row_number() over (order by s.id) as rn
  from public.skus s
  where s.campaign_id = di.campaign_id
    and s.active = true
) sk;

-- ----------------------------------------------------------------------------
-- 2.11 break_requests — 1 break per daily report, approved, with actuals.
-- For variety, ~20% of daily reports get a second (shorter) break.
-- ----------------------------------------------------------------------------
with base as (
  select a.id as attendance_id,
         a.user_id as promoter_id,
         a.campaign_id,
         a.location_id,
         a.shift_id,
         a.check_in_time,
         a.check_out_time,
         random() as r_second_break
  from public.attendance a
  where a.status in ('checked_out', 'early_leave')
    and a.campaign_id in (select id from demo_campaigns)
),
breaks as (
  -- Primary break: every daily report
  select b.*,
         1 as break_no,
         b.check_in_time + interval '3 hours' as requested_start,
         (20 + floor(random() * 11))::int  as duration_minutes
  from base b
  union all
  -- Secondary break for ~20% of reports
  select b.*,
         2 as break_no,
         b.check_in_time + interval '5 hours 30 minutes' as requested_start,
         (10 + floor(random() * 6))::int   as duration_minutes
  from base b
  where b.r_second_break < 0.20
)
insert into public.break_requests (
  promoter_id, campaign_id, location_id, shift_id, attendance_id,
  requested_start, duration_minutes, reason,
  status, reviewer_id, reviewed_at,
  approved_start, approved_duration_minutes,
  actual_start, actual_end,
  idempotency_key, created_at, updated_at
)
select
  br.promoter_id,
  br.campaign_id,
  br.location_id,
  br.shift_id,
  br.attendance_id,
  br.requested_start,
  br.duration_minutes,
  'Demo break.',
  'approved'::public.break_request_status,
  (select user_id from demo_users where slot = 'supervisor_1'),
  br.requested_start - interval '15 minutes',
  br.requested_start,
  br.duration_minutes,
  br.requested_start + interval '1 minute',
  br.requested_start + interval '1 minute' + (br.duration_minutes * interval '1 minute'),
  gen_random_uuid(),
  br.requested_start - interval '2 hours',
  br.requested_start + (br.duration_minutes * interval '1 minute')
from breaks br;

-- ----------------------------------------------------------------------------
-- 2.12 stock_movements (warehouse -> supervisor_1 -> promoters -> consumer)
--
-- The stock_movements_validate_invariants BEFORE INSERT trigger uses an
-- advisory lock + per-(campaign, sku, from_entity) balance check. It reads
-- from stock_movements within the current transaction, so the only thing
-- that matters is the order of INSERT statements, not timestamps. We insert
-- in strict order: allocations first, then distributions, then returns
-- (small fixed amounts), then usage (many rows from daily_reports).
--
-- Flow:
--   1. warehouse  -> supervisor_1      10000 per (active SKU)  at day -30
--   2. supervisor_1 -> promoter_X         500 per (promoter, SKU)  at day -28
--   3. ~10% of promoters return           20 of one SKU          at day  -5
--   4. promoter  -> consumer              per daily_report samples
--
-- Cheese campaign (completed) has no promoter assignments and no daily
-- reports, so its stock ledger is intentionally empty.
-- ----------------------------------------------------------------------------

-- 2.12.1 Allocations: warehouse -> supervisor_1 for every active-campaign SKU.
insert into public.stock_movements (
  campaign_id, sku_id,
  from_entity_type, from_entity_id,
  to_entity_type,   to_entity_id,
  quantity, movement_kind,
  user_id, location_id, reason,
  idempotency_key, created_at
)
select
  sk.campaign_id,
  sk.id,
  'warehouse', null,
  'supervisor', (select user_id from demo_users where slot = 'supervisor_1'),
  10000,
  'allocation'::public.stock_movement_kind,
  (select user_id from demo_users where slot = 'supervisor_1'),
  null,
  'Demo opening allocation.',
  gen_random_uuid(),
  (now() - interval '30 days')
from public.skus sk
join demo_campaigns dc on dc.id = sk.campaign_id
join demo_campaign_input dci on dci.slot = dc.slot
where dci.status = 'active';

-- 2.12.2 Distributions: supervisor_1 -> each assigned promoter for each SKU
-- of their campaign.
insert into public.stock_movements (
  campaign_id, sku_id,
  from_entity_type, from_entity_id,
  to_entity_type,   to_entity_id,
  quantity, movement_kind,
  user_id, location_id, reason,
  idempotency_key, created_at
)
select
  sk.campaign_id,
  sk.id,
  'supervisor', (select user_id from demo_users where slot = 'supervisor_1'),
  'promoter',   ua.user_id,
  500,
  'distribution'::public.stock_movement_kind,
  (select user_id from demo_users where slot = 'supervisor_1'),
  ua.location_id,
  'Demo distribution to promoter.',
  gen_random_uuid(),
  (now() - interval '28 days')
from public.user_assignments ua
join public.shifts s      on s.id = ua.shift_id
join public.skus   sk     on sk.campaign_id = s.campaign_id and sk.active = true
join demo_campaigns dc    on dc.id = sk.campaign_id
join demo_campaign_input dci on dci.slot = dc.slot
where ua.role_scope = 'promoter'
  and ua.active = true
  and dci.status = 'active';

-- 2.12.3 Returns: ~10% of (promoter, sku) pairs return 20 units at day -5.
insert into public.stock_movements (
  campaign_id, sku_id,
  from_entity_type, from_entity_id,
  to_entity_type,   to_entity_id,
  quantity, movement_kind,
  user_id, location_id, reason,
  idempotency_key, created_at
)
select
  sk.campaign_id,
  sk.id,
  'promoter',    ua.user_id,
  'supervisor',  (select user_id from demo_users where slot = 'supervisor_1'),
  20,
  'return'::public.stock_movement_kind,
  ua.user_id,
  ua.location_id,
  'Demo promoter return of unused stock.',
  gen_random_uuid(),
  (now() - interval '5 days')
from public.user_assignments ua
join public.shifts s      on s.id = ua.shift_id
join public.skus   sk     on sk.campaign_id = s.campaign_id and sk.active = true
join demo_campaigns dc    on dc.id = sk.campaign_id
join demo_campaign_input dci on dci.slot = dc.slot
where ua.role_scope = 'promoter'
  and ua.active = true
  and dci.status = 'active'
  and (hashtextextended(ua.user_id::text || sk.id::text, 0) % 10) = 0;

-- 2.12.4 Usage: promoter -> consumer, one row per (daily_report, sku) where
-- samples > 0. This runs last so from-balance (promoter) has distribution -
-- returns already reflected.
insert into public.stock_movements (
  campaign_id, sku_id,
  from_entity_type, from_entity_id,
  to_entity_type,   to_entity_id,
  quantity, movement_kind,
  user_id, location_id, reason,
  idempotency_key, created_at
)
select
  dr.campaign_id,
  se.sku_id,
  'promoter', dr.promoter_user_id,
  'consumer', null,
  se.samples,
  'usage'::public.stock_movement_kind,
  dr.promoter_user_id,
  dr.location_id,
  'Demo sampling usage.',
  gen_random_uuid(),
  -- schedule each usage on its report day around mid-shift
  ((dr.report_date::timestamp + time '13:00') at time zone 'Asia/Amman')
from public.sales_entries se
join public.daily_reports dr on dr.id = se.daily_report_id
join demo_campaigns dc       on dc.id = dr.campaign_id
where se.samples > 0
order by dr.report_date, dr.promoter_user_id, se.sku_id;

-- ----------------------------------------------------------------------------
-- 2.13 supervisor_visits — 2-3 per week per active campaign = ~15-20 total.
-- Random supervisor from the pool assigned to that location; ~85% outcome=ok,
-- ~10% issue_found, ~5% coaching.
-- ----------------------------------------------------------------------------
with week_offsets as (
  select gs.n as week_no from generate_series(0, 3) as gs(n)
),
visits_per_week as (
  select dcl.campaign_slot,
         dcl.location_slot,
         wo.week_no,
         random() as r_pick,
         random() as r_outcome,
         random() as r_day
  from demo_campaign_locations dcl
  join demo_campaign_input dci on dci.slot = dcl.campaign_slot
  cross join week_offsets wo
  where dci.status = 'active'
),
picked as (
  -- ~25% of (campaign-location, week) tuples get a visit
  select * from visits_per_week where r_pick < 0.25
)
insert into public.supervisor_visits (
  supervisor_id, campaign_id, location_id, visited_at,
  lat, lng, distance_m, is_within_geofence,
  photo_path, outcome, notes,
  idempotency_key, created_at, updated_at
)
select
  -- pick whichever demo supervisor has this location assigned; fallback sup 1
  coalesce(
    (select du.user_id
       from demo_supervisor_assignment_input sai
       join demo_users du on du.slot = sai.supervisor_slot
      where sai.location_slot = p.location_slot
      order by md5(du.user_id::text || p.location_slot || p.week_no::text)
      limit 1),
    (select user_id from demo_users where slot = 'supervisor_1')
  ),
  dc.id,
  dl.id,
  (now() - (p.week_no * interval '7 days') - (floor(p.r_day * 5) * interval '1 day') - interval '4 hours'),
  dl.lat + (random() * 2 - 1) * 0.00050,
  dl.lng + (random() * 2 - 1) * 0.00050,
  (15 + floor(random() * 80))::int,
  true,
  'demo/visit_' || gen_random_uuid()::text || '.jpg',
  (case
     when p.r_outcome < 0.10 then 'issue_found'
     when p.r_outcome < 0.15 then 'coaching'
     else                         'ok'
   end)::public.supervisor_visit_outcome,
  'Demo supervisor site visit.',
  gen_random_uuid(),
  now() - (p.week_no * interval '7 days'),
  now() - (p.week_no * interval '7 days')
from picked p
join demo_campaigns dc on dc.slot = p.campaign_slot
join demo_locations dl on dl.slot = p.location_slot;

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
