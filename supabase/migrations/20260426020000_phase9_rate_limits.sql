-- Phase 9 — DB-backed rate limiting (D-035)
--
-- Fixed-window counter per (key) — cheap, good enough for anti-abuse on
-- login / password reset / feedback / export. For throughput-critical paths
-- we'd reach for Upstash/Redis; for these bursty boundary paths the DB is
-- plenty and keeps the zero-new-deps posture (D-032).
--
-- Keys are caller-chosen strings (typically "action:<name>:<subject>" where
-- subject is the user id for authed callers, or the peer IP for anon).
-- The function is SECURITY DEFINER so service_role + authenticated can both
-- call it from Server Actions without needing direct table perms.
--
-- Concurrency: the UPSERT + conditional reset happens in one statement,
-- which Postgres serialises on the row's xmin — no explicit lock needed.

create table public.rate_limits (
  key           text primary key,
  window_start  timestamptz not null default now(),
  count         integer not null default 0,
  updated_at    timestamptz not null default now()
);

comment on table public.rate_limits is
  'Phase 9 D-035: fixed-window rate-limit counters keyed by action + subject.';

alter table public.rate_limits enable row level security;
-- No policies = no authenticated / anon access. All I/O goes through the
-- SECURITY DEFINER function below.

-- ---------------------------------------------------------------------------
-- check_rate_limit — atomic test-and-increment.
-- Returns (allowed, count, reset_at).
-- ---------------------------------------------------------------------------
create or replace function public.check_rate_limit(
  p_key             text,
  p_window_seconds  integer,
  p_max_requests    integer
)
returns table(allowed boolean, count integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_now          timestamptz := now();
  v_window_start timestamptz;
  v_count        integer;
begin
  if p_window_seconds <= 0 then
    raise exception 'p_window_seconds must be positive';
  end if;
  if p_max_requests <= 0 then
    raise exception 'p_max_requests must be positive';
  end if;

  insert into public.rate_limits (key, window_start, count, updated_at)
  values (p_key, v_now, 1, v_now)
  on conflict (key) do update
    set
      -- Reset the window if it's elapsed; otherwise increment.
      window_start = case
        when public.rate_limits.window_start + make_interval(secs => p_window_seconds) <= v_now
          then v_now
        else public.rate_limits.window_start
      end,
      count = case
        when public.rate_limits.window_start + make_interval(secs => p_window_seconds) <= v_now
          then 1
        else public.rate_limits.count + 1
      end,
      updated_at = v_now
  returning
    public.rate_limits.window_start,
    public.rate_limits.count
  into v_window_start, v_count;

  return query
    select
      (v_count <= p_max_requests)           as allowed,
      v_count                                as count,
      v_window_start + make_interval(secs => p_window_seconds) as reset_at;
end;
$$;

revoke all on function public.check_rate_limit(text, integer, integer) from public;
grant execute on function public.check_rate_limit(text, integer, integer) to authenticated, anon, service_role;

comment on function public.check_rate_limit(text, integer, integer) is
  'Phase 9 D-035: atomic fixed-window rate-limit counter. ' ||
  'Returns (allowed, count, reset_at). Always increments exactly once per call.';

-- ---------------------------------------------------------------------------
-- Garbage collection — drop stale rows so the table doesn't grow forever.
-- Keep for 24 h after last activity; anything older than that will produce
-- a fresh window on next check anyway, so deleting is safe.
-- Call from the existing cron surface (pg_cron or a scheduled function).
-- ---------------------------------------------------------------------------
create or replace function public.gc_rate_limits()
returns integer
language sql
security definer
set search_path = public, pg_catalog
as $$
  with deleted as (
    delete from public.rate_limits
    where updated_at < now() - interval '24 hours'
    returning 1
  )
  select count(*)::integer from deleted;
$$;

revoke all on function public.gc_rate_limits() from public;
grant execute on function public.gc_rate_limits() to service_role;
