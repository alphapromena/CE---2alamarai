-- Phase 4 — activity_photos, sales_entries, kpi_snapshots (Module 5, part 2).
--
-- activity_photos: up to three "kinds" per daily_report (setup, during,
-- end_of_shift). Storage pattern mirrors Phase 3 attendance — private bucket,
-- no direct client I/O; reads via server-signed URLs. Bucket is declared in
-- the next migration (phase4_storage_bucket.sql).
--
-- sales_entries: one row per (daily_report, sku). Both `samples` and `sales`
-- live here; the daily_reports header columns are sums denormalised by the
-- Server Action so the submit flow doesn't need a second round-trip.
--
-- kpi_snapshots: one row per daily_report, written by the compute-kpis Edge
-- Function on submit/approve (D-020 draft). Never trust client math — the
-- Edge Function re-reads the report + entries + campaign kpi_config and
-- writes the ratios. `computation_version` lets us recompute old snapshots
-- if the formula changes.

-- ============================================================================
-- 1. activity_photos
-- ============================================================================
create type public.activity_photo_kind as enum (
  'setup',
  'during',
  'end_of_shift'
);

create table public.activity_photos (
  id                uuid primary key default gen_random_uuid(),
  daily_report_id   uuid not null references public.daily_reports (id) on delete cascade,
  photo_kind        public.activity_photo_kind not null,
  storage_path      text not null check (length(btrim(storage_path)) > 0),
  exif_minimal      jsonb,
  uploaded_by       uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- At most one photo of each kind per report. A re-upload replaces the path
  -- (server action deletes the old storage object + upserts the row).
  constraint activity_photos_one_per_kind
    unique (daily_report_id, photo_kind)
);

create index activity_photos_daily_report_idx on public.activity_photos (daily_report_id);

create trigger activity_photos_set_updated_at
  before update on public.activity_photos
  for each row execute function public.set_updated_at();

alter table public.activity_photos enable row level security;

grant select, insert, update, delete on public.activity_photos to authenticated;

-- RLS: visibility follows the owning daily_report's visibility. We can't
-- subquery RLS policies efficiently across joins, so we duplicate the rules
-- by joining daily_reports inline. Cheap — daily_reports has (promoter,
-- location, date) indexed.
create policy activity_photos_select_admin
  on public.activity_photos for select to authenticated
  using (public.is_admin());

create policy activity_photos_select_self
  on public.activity_photos for select to authenticated
  using (
    exists (
      select 1 from public.daily_reports dr
      where dr.id = activity_photos.daily_report_id
        and dr.promoter_user_id = auth.uid()
    )
  );

create policy activity_photos_select_supervisor
  on public.activity_photos for select to authenticated
  using (
    public.current_role() = 'supervisor'
    and exists (
      select 1 from public.daily_reports dr
      where dr.id = activity_photos.daily_report_id
        and dr.location_id = any (public.current_user_locations())
    )
  );

create policy activity_photos_insert_admin
  on public.activity_photos for insert to authenticated
  with check (public.is_admin());

create policy activity_photos_insert_self_promoter
  on public.activity_photos for insert to authenticated
  with check (
    public.current_role() = 'promoter'
    and exists (
      select 1 from public.daily_reports dr
      where dr.id = activity_photos.daily_report_id
        and dr.promoter_user_id = auth.uid()
        and dr.status in ('draft', 'submitted')
    )
  );

create policy activity_photos_update_admin
  on public.activity_photos for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy activity_photos_update_self_promoter
  on public.activity_photos for update to authenticated
  using (
    public.current_role() = 'promoter'
    and exists (
      select 1 from public.daily_reports dr
      where dr.id = activity_photos.daily_report_id
        and dr.promoter_user_id = auth.uid()
        and dr.status in ('draft', 'submitted')
    )
  )
  with check (
    public.current_role() = 'promoter'
    and exists (
      select 1 from public.daily_reports dr
      where dr.id = activity_photos.daily_report_id
        and dr.promoter_user_id = auth.uid()
        and dr.status in ('draft', 'submitted')
    )
  );

create policy activity_photos_delete_admin
  on public.activity_photos for delete to authenticated
  using (public.is_admin());

create policy activity_photos_delete_self_promoter
  on public.activity_photos for delete to authenticated
  using (
    public.current_role() = 'promoter'
    and exists (
      select 1 from public.daily_reports dr
      where dr.id = activity_photos.daily_report_id
        and dr.promoter_user_id = auth.uid()
        and dr.status in ('draft', 'submitted')
    )
  );

-- ============================================================================
-- 2. sales_entries
-- ============================================================================
create table public.sales_entries (
  id                uuid primary key default gen_random_uuid(),
  daily_report_id   uuid not null references public.daily_reports (id) on delete cascade,
  sku_id            uuid not null references public.skus (id) on delete restrict,
  samples           integer not null default 0 check (samples >= 0),
  sales             integer not null default 0 check (sales >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint sales_entries_unique_report_sku
    unique (daily_report_id, sku_id)
);

create index sales_entries_daily_report_idx on public.sales_entries (daily_report_id);
create index sales_entries_sku_idx          on public.sales_entries (sku_id);

create trigger sales_entries_set_updated_at
  before update on public.sales_entries
  for each row execute function public.set_updated_at();

alter table public.sales_entries enable row level security;

grant select, insert, update, delete on public.sales_entries to authenticated;

create policy sales_entries_select_admin
  on public.sales_entries for select to authenticated
  using (public.is_admin());

create policy sales_entries_select_self
  on public.sales_entries for select to authenticated
  using (
    exists (
      select 1 from public.daily_reports dr
      where dr.id = sales_entries.daily_report_id
        and dr.promoter_user_id = auth.uid()
    )
  );

create policy sales_entries_select_supervisor
  on public.sales_entries for select to authenticated
  using (
    public.current_role() = 'supervisor'
    and exists (
      select 1 from public.daily_reports dr
      where dr.id = sales_entries.daily_report_id
        and dr.location_id = any (public.current_user_locations())
    )
  );

create policy sales_entries_insert_admin
  on public.sales_entries for insert to authenticated
  with check (public.is_admin());

create policy sales_entries_insert_self_promoter
  on public.sales_entries for insert to authenticated
  with check (
    public.current_role() = 'promoter'
    and exists (
      select 1 from public.daily_reports dr
      where dr.id = sales_entries.daily_report_id
        and dr.promoter_user_id = auth.uid()
        and dr.status in ('draft', 'submitted')
    )
  );

create policy sales_entries_update_admin
  on public.sales_entries for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy sales_entries_update_self_promoter
  on public.sales_entries for update to authenticated
  using (
    public.current_role() = 'promoter'
    and exists (
      select 1 from public.daily_reports dr
      where dr.id = sales_entries.daily_report_id
        and dr.promoter_user_id = auth.uid()
        and dr.status in ('draft', 'submitted')
    )
  )
  with check (
    public.current_role() = 'promoter'
    and exists (
      select 1 from public.daily_reports dr
      where dr.id = sales_entries.daily_report_id
        and dr.promoter_user_id = auth.uid()
        and dr.status in ('draft', 'submitted')
    )
  );

create policy sales_entries_delete_admin
  on public.sales_entries for delete to authenticated
  using (public.is_admin());

create policy sales_entries_delete_self_promoter
  on public.sales_entries for delete to authenticated
  using (
    public.current_role() = 'promoter'
    and exists (
      select 1 from public.daily_reports dr
      where dr.id = sales_entries.daily_report_id
        and dr.promoter_user_id = auth.uid()
        and dr.status in ('draft', 'submitted')
    )
  );

-- ============================================================================
-- 3. kpi_snapshots
--   One-to-one with daily_reports. Numeric ratios are stored as numeric(6,4)
--   (four decimals, e.g. 0.4666 for 46.66%). sku_contributions is a JSONB
--   object keyed by sku_id → numeric ratio.
-- ============================================================================
create table public.kpi_snapshots (
  id                         uuid primary key default gen_random_uuid(),
  daily_report_id            uuid not null unique references public.daily_reports (id) on delete cascade,

  interaction_rate           numeric(6,4) check (interaction_rate is null or (interaction_rate >= 0 and interaction_rate <= 1)),
  engagement_rate            numeric(6,4) check (engagement_rate  is null or (engagement_rate  >= 0 and engagement_rate  <= 1)),
  sampling_rate              numeric(6,4) check (sampling_rate    is null or (sampling_rate    >= 0 and sampling_rate    <= 1)),
  conversion_rate            numeric(6,4) check (conversion_rate  is null or (conversion_rate  >= 0 and conversion_rate  <= 1)),
  sample_to_conversion_rate  numeric(6,4) check (sample_to_conversion_rate is null or (sample_to_conversion_rate >= 0 and sample_to_conversion_rate <= 1)),

  -- { "<sku_uuid>": 0.5714, ... } — contribution of each SKU's sales to
  -- total sales. Sums to ~1.0 when sales exist. Rounding drift tolerated.
  sku_contributions          jsonb not null default '{}'::jsonb
                             check (jsonb_typeof(sku_contributions) = 'object'),

  -- Which denominator was used for sampling_rate — auditability for D-007.
  sampling_rate_denominator  text check (sampling_rate_denominator in ('contacts', 'engaged')),

  computation_version        integer not null default 1,
  computed_at                timestamptz not null default now(),
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create index kpi_snapshots_computed_at_idx on public.kpi_snapshots (computed_at desc);

create trigger kpi_snapshots_set_updated_at
  before update on public.kpi_snapshots
  for each row execute function public.set_updated_at();

alter table public.kpi_snapshots enable row level security;

grant select, insert, update, delete on public.kpi_snapshots to authenticated;

-- RLS: read-only to promoters (own) + supervisors (assigned locations);
-- admin full CRUD. Writes happen via service role in the compute-kpis Edge
-- Function, which bypasses RLS entirely. No authenticated INSERT/UPDATE
-- policy by design.
create policy kpi_snapshots_select_admin
  on public.kpi_snapshots for select to authenticated
  using (public.is_admin());

create policy kpi_snapshots_select_self
  on public.kpi_snapshots for select to authenticated
  using (
    exists (
      select 1 from public.daily_reports dr
      where dr.id = kpi_snapshots.daily_report_id
        and dr.promoter_user_id = auth.uid()
    )
  );

create policy kpi_snapshots_select_supervisor
  on public.kpi_snapshots for select to authenticated
  using (
    public.current_role() = 'supervisor'
    and exists (
      select 1 from public.daily_reports dr
      where dr.id = kpi_snapshots.daily_report_id
        and dr.location_id = any (public.current_user_locations())
    )
  );

create policy kpi_snapshots_insert_admin
  on public.kpi_snapshots for insert to authenticated
  with check (public.is_admin());

create policy kpi_snapshots_update_admin
  on public.kpi_snapshots for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy kpi_snapshots_delete_admin
  on public.kpi_snapshots for delete to authenticated
  using (public.is_admin());
