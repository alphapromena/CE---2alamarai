-- Phase 10 — Bulk CSV Import (admin feature)
--
-- Adds:
--   1. profiles.must_change_password — forces temp-password users to rotate on next login.
--   2. import_audit — per-run log of admin bulk imports (counts only, no row payloads).
--
-- Both guarded with IF NOT EXISTS so the migration is safe to re-apply in envs that
-- already ran an earlier iteration. RLS is enabled on import_audit with an
-- admin-only read policy; service-role writes bypass RLS as usual.

-- ============================================================================
-- 1. profiles.must_change_password
-- ============================================================================
alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

comment on column public.profiles.must_change_password is
  'Phase 10: true when the admin created this user via bulk CSV import with a temp password. ' ||
  'Middleware redirects these users to /set-password until cleared.';

-- ============================================================================
-- 2. import_audit
-- ============================================================================
create table if not exists public.import_audit (
  id             uuid primary key default gen_random_uuid(),
  admin_id       uuid references public.profiles(id) on delete set null,
  target         text not null check (target in ('products', 'promoters', 'locations')),
  success_count  integer not null default 0 check (success_count >= 0),
  fail_count     integer not null default 0 check (fail_count >= 0),
  created_at     timestamptz not null default now()
);

create index if not exists import_audit_admin_idx on public.import_audit (admin_id, created_at desc);
create index if not exists import_audit_target_idx on public.import_audit (target, created_at desc);

alter table public.import_audit enable row level security;

-- Admin-only SELECT. Writes are performed from the server action with the
-- service-role key (bypasses RLS); no insert/update/delete policy needed.
drop policy if exists import_audit_select_admin on public.import_audit;
create policy import_audit_select_admin
  on public.import_audit for select
  to authenticated
  using (public.is_admin());

grant select on public.import_audit to authenticated;

comment on table public.import_audit is
  'Phase 10: one row per admin bulk-import run. Stores aggregate counts; ' ||
  'row-level failures are surfaced in the UI but not persisted.';
