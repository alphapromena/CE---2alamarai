-- Phase 7 — enable Supabase Realtime on live-monitoring tables.
--
-- Supabase ships a pre-created publication named `supabase_realtime`. Adding a
-- table to it is what makes `supabase.channel(...).on('postgres_changes', ...)`
-- deliver INSERT / UPDATE / DELETE events for that table.
--
-- RLS still applies to Realtime payloads (Supabase filters per-subscriber
-- using the same policies the SELECT path uses). No additional auth surface
-- is introduced here — clients only see rows they could SELECT anyway.
--
-- Tables enabled (per PLAN §6 Phase 7):
--   attendance        — live presence + status changes
--   alerts            — live alert feed (new rows + status changes)
--   break_requests    — supervisor inbox + promoter status updates
--   notifications     — bell icon push (D-019 migration to Realtime per PLAN)
--   kpi_snapshots     — live sales / sampling tallies as daily_reports post
--   stock_movements   — live stock ledger updates
--
-- Idempotent: each ADD TABLE wrapped in a DO block that checks
-- pg_publication_tables first, so re-running the migration is safe. Supabase
-- Realtime also rejects a duplicate ADD, so the guard is belt-and-braces.

do $$
declare
  t text;
  tables text[] := array[
    'attendance',
    'alerts',
    'break_requests',
    'notifications',
    'kpi_snapshots',
    'stock_movements'
  ];
begin
  -- Bail silently if the supabase_realtime publication doesn't exist
  -- (pure-local dev environments without Realtime). Migration is idempotent.
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime publication not present; skipping Realtime enablement';
    return;
  end if;

  foreach t in array tables loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end$$;
