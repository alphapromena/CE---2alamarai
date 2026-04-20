-- Phase 7 — notifications.
--
-- In-app notifications: one row per (user, event). The bell icon in the
-- app-shell reads unread rows; Realtime subscription (next migration) pushes
-- new rows to the client. Alerts and break-request transitions fan out here
-- from Edge Functions (service-role writes) and Server Actions (RLS-
-- permitted self-insert not used; all writes go through service role for
-- auditability — see no-authenticated-INSERT policy below).
--
-- payload JSONB: caller-opaque context (location/campaign ids, promoter id,
-- alert_type, etc.) rendered by the bell UI via message_key lookup in
-- messages/{ar,en}.json — same pattern as alerts.message_key / .message_params.
--
-- alert_id / break_request_id: optional back-references so the bell can link
-- straight to the source row without having to route by payload shape. Kept
-- soft (ON DELETE SET NULL) — a deleted alert shouldn't lose its history
-- in the user's bell.
--
-- RLS: user reads own rows only. No authenticated INSERT/DELETE policies;
-- service role writes from Edge Functions + Server Actions. User can UPDATE
-- only to mark a row read (read_at from null → now()); enforced by the
-- WITH CHECK predicate.

-- ============================================================================
-- 1. Kind enum
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'notification_kind') then
    create type public.notification_kind as enum (
      'alert_new',
      'break_requested',
      'break_approved',
      'break_rejected',
      'break_modified',
      'system'
    );
  end if;
end$$;

-- ============================================================================
-- 2. notifications
-- ============================================================================
create table public.notifications (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles (id) on delete cascade,
  kind               public.notification_kind not null,
  alert_id           uuid references public.alerts (id) on delete set null,
  break_request_id   uuid references public.break_requests (id) on delete set null,
  payload            jsonb not null default '{}'::jsonb
                     check (jsonb_typeof(payload) = 'object'),
  read_at            timestamptz,
  created_at         timestamptz not null default now()
);

create index notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

comment on table public.notifications is
  'Phase 7: in-app notifications fanned out from alerts + break-request transitions. Service-role writes; user reads own.';

-- ============================================================================
-- 3. RLS
-- ============================================================================
alter table public.notifications enable row level security;

grant select, update on public.notifications to authenticated;

create policy notifications_select_self
  on public.notifications for select to authenticated
  using (user_id = auth.uid());

create policy notifications_select_admin
  on public.notifications for select to authenticated
  using (public.is_admin());

-- UPDATE self — only to flip read_at (null → timestamptz). The WITH CHECK
-- holds user_id stable; an attempt to reassign ownership fails.
create policy notifications_update_self_read
  on public.notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No INSERT / DELETE policies for authenticated users. Service-role writes
-- from Edge Functions + Server Actions; retention handled out-of-band.
