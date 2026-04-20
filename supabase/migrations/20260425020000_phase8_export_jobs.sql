-- Phase 8 — export_jobs (Module 11).
--
-- One row per on-demand or scheduled export request. Lifecycle:
--   queued  — row inserted, nothing generated yet
--   running — worker (Server Action or generate-report Edge Function) picked it up
--   done    — artifact uploaded to the private `exports` Storage bucket;
--             result_path stores the object path (no signed URL persisted —
--             those are minted on-demand via a Server Action so TTL stays short)
--   failed  — error_message populated; the job may be retried by re-queueing
--             a new row (old row kept as audit trail)
--
-- scope JSONB shape (validated in zod at the Server Action layer):
--   {
--     "campaign_ids":  uuid[],    // empty = all accessible to caller
--     "location_ids":  uuid[],    // empty = all
--     "sku_ids":       uuid[],    // empty = all
--     "from_date":     "YYYY-MM-DD",
--     "to_date":       "YYYY-MM-DD",
--     "domains":       ("attendance" | "activity" | "stock" |
--                       "performance" | "supervisor_actions" | "feedback")[]
--   }
--
-- D-030: on-demand exports run synchronously in the requesting Server Action
-- using the service-role client (no async queue). Scheduled exports flow
-- through generate-report Edge Function invoked by cron-scheduled-reports.
-- Both paths write identical artifacts + update the same row.
--
-- D-031: email delivery of the signed URL is deferred to Phase 9. For Phase
-- 8, the requester downloads from the in-app Exports page — a Server Action
-- mints a short-TTL signed URL from result_path.
--
-- D-033: client exports are scope-constrained by RLS:
--   - client user: client_id must equal profiles.client_id; enforced by
--     WITH CHECK. The builders additionally ensure the artifact contains
--     aggregate-only rows (no promoter names, no raw attendance rows).
--   - admin / supervisor: client_id NULL unless scoped to one.
--
-- RLS posture:
--   admin      — full CRUD
--   requester  — SELECT own rows
--   client     — SELECT own rows; INSERT own rows where client_id = self
--   others     — SELECT own rows only

-- ============================================================================
-- 1. Enums
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'export_format') then
    create type public.export_format as enum ('csv_zip', 'xlsx');
  end if;

  if not exists (select 1 from pg_type where typname = 'export_status') then
    create type public.export_status as enum ('queued', 'running', 'done', 'failed');
  end if;
end$$;

-- ============================================================================
-- 2. export_jobs
-- ============================================================================
create table public.export_jobs (
  id                  uuid primary key default gen_random_uuid(),

  requested_by        uuid not null references public.profiles (id) on delete cascade,
  client_id           uuid references public.clients (id) on delete restrict,

  scope               jsonb not null
                      check (jsonb_typeof(scope) = 'object'),
  format              public.export_format not null,
  status              public.export_status not null default 'queued',

  result_path         text,
  result_size_bytes   integer check (result_size_bytes is null or result_size_bytes >= 0),
  error_message       text,

  idempotency_key     uuid not null,

  created_at          timestamptz not null default now(),
  started_at          timestamptz,
  completed_at        timestamptz,

  unique (requested_by, idempotency_key),

  constraint export_jobs_done_has_result check (
    (status <> 'done')
    or (result_path is not null and completed_at is not null)
  ),
  constraint export_jobs_failed_has_error check (
    (status <> 'failed')
    or (error_message is not null)
  )
);

create index export_jobs_requested_by_idx
  on public.export_jobs (requested_by, created_at desc);

create index export_jobs_status_idx
  on public.export_jobs (status, created_at desc);

create index export_jobs_client_idx
  on public.export_jobs (client_id, created_at desc)
  where client_id is not null;

create index export_jobs_queued_idx
  on public.export_jobs (created_at asc)
  where status = 'queued';

comment on table public.export_jobs is
  'Phase 8: on-demand + scheduled export requests. D-030 synchronous on-demand path; D-031 email deferred; D-033 client scope enforced via client_id + builders.';

-- ============================================================================
-- 3. RLS
-- ============================================================================
alter table public.export_jobs enable row level security;

grant select, insert on public.export_jobs to authenticated;

-- SELECT
create policy export_jobs_select_admin
  on public.export_jobs for select to authenticated
  using (public.is_admin());

create policy export_jobs_select_own
  on public.export_jobs for select to authenticated
  using (requested_by = auth.uid());

-- INSERT — the requester is always the caller.
-- Client role: client_id must equal caller's own client_id (D-033 scope).
-- Other roles: free-form on client_id (may be null or any id).
-- Status must start 'queued' with no result/error populated.
create policy export_jobs_insert_own
  on public.export_jobs for insert to authenticated
  with check (
    requested_by = auth.uid()
    and status = 'queued'
    and result_path is null
    and result_size_bytes is null
    and error_message is null
    and started_at is null
    and completed_at is null
    and (
      public.current_role() <> 'client'
      or client_id = public.current_client_id()
    )
  );

-- UPDATE + DELETE — service role only. No authenticated UPDATE/DELETE policy
-- is created, so all such operations from user sessions are denied. The
-- generate-report Edge Function and the run-export Server Action run
-- with the service-role key and bypass RLS for status transitions.

comment on column public.export_jobs.client_id is
  'Tenant scope. For client role INSERTs this must equal profiles.client_id (D-033). For admin/supervisor, may be null (all clients) or set to scope a single tenant.';
