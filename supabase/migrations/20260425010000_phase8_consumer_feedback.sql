-- Phase 8 — consumer_feedback + competitor_mentions (Module 10).
--
-- Promoters capture free-text consumer feedback + structured competitor
-- mentions during a shift. A feedback row can be standalone (captured via
-- the promoter feedback form) or linked to a daily_report or supervisor_visit
-- for drill-down from those contexts.
--
-- Design notes:
--   * category enum is curated (service | product | complaint | suggestion |
--     other). UI translates via messages files — the value stays English.
--   * sentiment enum is optional (null = not rated) with values positive |
--     neutral | negative. Phase 9 may add a machine-classification pass;
--     v1 is promoter-self-rated.
--   * competitor_mentions is a child table so a feedback entry can mention
--     multiple competitor brands in one go. brand is free-text for v1 — we
--     may promote to a competitors table later.
--   * idempotency_key per D-009 (client-generated UUID v4, UNIQUE per
--     promoter). Safe retry under flaky mobile networks.
--   * Client role has no direct access to either table — aggregates only via
--     Phase 8 exports / reporting surface (D-019 item 3 / D-033). Raw text
--     can carry PII; aggregates are per-campaign category + sentiment counts.
--
-- RLS posture:
--   admin      — full CRUD
--   promoter   — SELECT + INSERT their own rows
--   supervisor — SELECT rows at their assigned locations
--   client     — no access (aggregates via export builders)

-- ============================================================================
-- 1. Enums
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'feedback_category') then
    create type public.feedback_category as enum (
      'service',
      'product',
      'complaint',
      'suggestion',
      'other'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'feedback_sentiment') then
    create type public.feedback_sentiment as enum (
      'positive',
      'neutral',
      'negative'
    );
  end if;
end$$;

-- ============================================================================
-- 2. consumer_feedback
-- ============================================================================
create table public.consumer_feedback (
  id                    uuid primary key default gen_random_uuid(),

  campaign_id           uuid not null references public.campaigns (id) on delete cascade,
  location_id           uuid not null references public.locations (id) on delete restrict,
  promoter_user_id      uuid not null references public.profiles (id) on delete cascade,

  daily_report_id       uuid references public.daily_reports (id) on delete set null,
  supervisor_visit_id   uuid references public.supervisor_visits (id) on delete set null,

  category              public.feedback_category not null,
  sentiment             public.feedback_sentiment,
  body                  text not null check (char_length(body) between 1 and 2000),

  idempotency_key       uuid not null,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  unique (promoter_user_id, idempotency_key)
);

create index consumer_feedback_campaign_idx
  on public.consumer_feedback (campaign_id, created_at desc);

create index consumer_feedback_location_idx
  on public.consumer_feedback (location_id, created_at desc);

create index consumer_feedback_promoter_idx
  on public.consumer_feedback (promoter_user_id, created_at desc);

create index consumer_feedback_category_idx
  on public.consumer_feedback (category);

create trigger consumer_feedback_set_updated_at
  before update on public.consumer_feedback
  for each row execute function public.set_updated_at();

comment on table public.consumer_feedback is
  'Phase 8: consumer feedback captured by promoters. Idempotent per (promoter, idempotency_key) per D-009. Client role blocked — aggregates only via exports per D-019/D-033.';

-- ============================================================================
-- 3. competitor_mentions
-- ============================================================================
create table public.competitor_mentions (
  id              uuid primary key default gen_random_uuid(),
  feedback_id     uuid not null references public.consumer_feedback (id) on delete cascade,
  brand           text not null check (char_length(brand) between 1 and 120),
  context         text check (context is null or char_length(context) <= 500),
  sentiment       public.feedback_sentiment,
  created_at      timestamptz not null default now()
);

create index competitor_mentions_feedback_idx
  on public.competitor_mentions (feedback_id);

create index competitor_mentions_brand_idx
  on public.competitor_mentions (brand);

comment on table public.competitor_mentions is
  'Phase 8: competitor brand mentions attached to a consumer_feedback row. Many-to-one with consumer_feedback.';

-- ============================================================================
-- 4. RLS — consumer_feedback
-- ============================================================================
alter table public.consumer_feedback enable row level security;

grant select, insert, update, delete on public.consumer_feedback to authenticated;

create policy consumer_feedback_select_admin
  on public.consumer_feedback for select to authenticated
  using (public.is_admin());

create policy consumer_feedback_select_self
  on public.consumer_feedback for select to authenticated
  using (promoter_user_id = auth.uid());

create policy consumer_feedback_select_supervisor
  on public.consumer_feedback for select to authenticated
  using (
    public.current_role() = 'supervisor'
    and location_id = any (public.current_user_locations())
  );

create policy consumer_feedback_insert_self
  on public.consumer_feedback for insert to authenticated
  with check (promoter_user_id = auth.uid());

create policy consumer_feedback_insert_admin
  on public.consumer_feedback for insert to authenticated
  with check (public.is_admin());

create policy consumer_feedback_update_admin
  on public.consumer_feedback for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy consumer_feedback_delete_admin
  on public.consumer_feedback for delete to authenticated
  using (public.is_admin());

-- ============================================================================
-- 5. RLS — competitor_mentions
-- ============================================================================
alter table public.competitor_mentions enable row level security;

grant select, insert, update, delete on public.competitor_mentions to authenticated;

-- SELECT / INSERT mirror the parent feedback row's visibility: if the caller
-- can see the parent, they can see the child.
create policy competitor_mentions_select_admin
  on public.competitor_mentions for select to authenticated
  using (public.is_admin());

create policy competitor_mentions_select_parent
  on public.competitor_mentions for select to authenticated
  using (
    exists (
      select 1 from public.consumer_feedback f
      where f.id = public.competitor_mentions.feedback_id
    )
  );

create policy competitor_mentions_insert_parent
  on public.competitor_mentions for insert to authenticated
  with check (
    exists (
      select 1 from public.consumer_feedback f
      where f.id = public.competitor_mentions.feedback_id
        and (public.is_admin() or f.promoter_user_id = auth.uid())
    )
  );

create policy competitor_mentions_delete_admin
  on public.competitor_mentions for delete to authenticated
  using (public.is_admin());
