-- Phase 4 — Tasks (Module 4, part 1).
--
-- Assignable to-do items a supervisor (or admin) creates for a specific
-- promoter at a campaign/location. Distinct from `daily_reports`: a task is a
-- planned action ("rebuild the cooler display at 10am"); a report is the
-- record of what actually happened during a shift.
--
-- Status lifecycle (D-020 planning):
--   open → in_progress → done
--   open | in_progress → cancelled     (supervisor/admin only)
--   done → in_progress                 (supervisor re-open if unsatisfactory)
-- A promoter can self-mark a task done; there is no separate approval gate.
-- The supervisor can re-open by flipping status back to in_progress.
--
-- D-009: idempotency_key on INSERT only. Status transitions from the promoter
-- are idempotent at the UI layer via optimistic retries; we don't version keys
-- per transition because there's no stock/money to double-count.
--
-- D-005: title_i18n + description_i18n are { "ar": "...", "en": "..." } with
-- the same shape checks used elsewhere in the schema.

-- ============================================================================
-- 1. Status enum
-- ============================================================================
create type public.task_status as enum (
  'open',
  'in_progress',
  'done',
  'cancelled'
);

-- ============================================================================
-- 2. tasks
-- ============================================================================
create table public.tasks (
  id                 uuid primary key default gen_random_uuid(),
  campaign_id        uuid not null references public.campaigns (id) on delete restrict,
  location_id        uuid not null references public.locations (id) on delete restrict,
  assigned_to_user_id uuid not null references public.profiles (id) on delete restrict,

  title_i18n         jsonb not null
                     check (
                       jsonb_typeof(title_i18n) = 'object'
                       and length(btrim(coalesce(title_i18n->>'en', ''))) > 0
                       and length(btrim(coalesce(title_i18n->>'ar', ''))) > 0
                     ),
  description_i18n   jsonb
                     check (
                       description_i18n is null
                       or (
                         jsonb_typeof(description_i18n) = 'object'
                         and (description_i18n ? 'en' or description_i18n ? 'ar')
                       )
                     ),

  status             public.task_status not null default 'open',
  due_date           date,

  created_by         uuid references public.profiles (id) on delete set null,

  completed_at       timestamptz,
  cancelled_at       timestamptz,
  cancelled_reason   text,

  idempotency_key    uuid not null,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- (campaign, location) pair must be a valid campaign_location assignment.
  constraint tasks_campaign_location_fk
    foreign key (campaign_id, location_id)
    references public.campaign_locations (campaign_id, location_id)
    on delete restrict,

  -- Status/audit-field consistency.
  constraint tasks_done_has_completed_at check (
    (status = 'done'      and completed_at is not null) or
    (status <> 'done'     and completed_at is null)
  ),
  constraint tasks_cancelled_has_fields check (
    (status = 'cancelled' and cancelled_at is not null
                          and cancelled_reason is not null
                          and length(btrim(cancelled_reason)) > 0) or
    (status <> 'cancelled' and cancelled_at is null
                             and cancelled_reason is null)
  )
);

-- D-009: idempotency is scoped to the creating user (matches attendance).
create unique index tasks_idempotency_unique_idx
  on public.tasks (created_by, idempotency_key);

create index tasks_assigned_user_idx   on public.tasks (assigned_to_user_id, status, due_date);
create index tasks_campaign_idx        on public.tasks (campaign_id, due_date);
create index tasks_location_idx        on public.tasks (location_id, due_date);
create index tasks_status_idx          on public.tasks (status);

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

alter table public.tasks enable row level security;

grant select, insert, update, delete on public.tasks to authenticated;

-- ============================================================================
-- 3. RLS
--   admin       — full CRUD
--   promoter    — SELECT own tasks; UPDATE own tasks only (to progress status
--                  open → in_progress → done). Cannot INSERT or DELETE.
--   supervisor  — SELECT + INSERT + UPDATE tasks at assigned locations.
--                  Cannot DELETE (use status='cancelled' for soft delete).
--   client      — no access (D-019).
-- ============================================================================
create policy tasks_select_admin
  on public.tasks for select to authenticated
  using (public.is_admin());

create policy tasks_select_self
  on public.tasks for select to authenticated
  using (assigned_to_user_id = auth.uid());

create policy tasks_select_supervisor
  on public.tasks for select to authenticated
  using (
    public.current_role() = 'supervisor'
    and location_id = any (public.current_user_locations())
  );

create policy tasks_insert_admin
  on public.tasks for insert to authenticated
  with check (public.is_admin());

create policy tasks_insert_supervisor
  on public.tasks for insert to authenticated
  with check (
    public.current_role() = 'supervisor'
    and location_id = any (public.current_user_locations())
  );

create policy tasks_update_admin
  on public.tasks for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Promoters can touch their own rows while in a non-terminal state. The
-- server action is responsible for policing which specific columns change;
-- RLS only guarantees cross-row isolation.
create policy tasks_update_self_promoter
  on public.tasks for update to authenticated
  using (
    assigned_to_user_id = auth.uid()
    and public.current_role() = 'promoter'
    and status in ('open', 'in_progress', 'done')
  )
  with check (
    assigned_to_user_id = auth.uid()
    and public.current_role() = 'promoter'
    and status in ('open', 'in_progress', 'done')
  );

create policy tasks_update_supervisor
  on public.tasks for update to authenticated
  using (
    public.current_role() = 'supervisor'
    and location_id = any (public.current_user_locations())
  )
  with check (
    public.current_role() = 'supervisor'
    and location_id = any (public.current_user_locations())
  );

create policy tasks_delete_admin
  on public.tasks for delete to authenticated
  using (public.is_admin());
