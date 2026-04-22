-- Fix for 42P17 "infinite recursion detected in policy for relation
-- campaign_locations". The previous phase-2 RLS set up a direct
-- subquery cycle between two tables:
--
--   campaigns_select_assigned         (on public.campaigns)
--     USING ( EXISTS (SELECT 1 FROM public.campaign_locations cl
--                     WHERE cl.campaign_id = campaigns.id
--                       AND cl.location_id = any (public.current_user_locations())) )
--
--   campaign_locations_select_client_tenant  (on public.campaign_locations)
--     USING ( EXISTS (SELECT 1 FROM public.campaigns c
--                     WHERE c.id = campaign_locations.campaign_id
--                       AND c.client_id = public.current_client_id()) )
--
-- Each policy's USING clause references the other table, so Postgres
-- detects an unbounded policy-evaluation cycle at plan time and aborts
-- with 42P17 for any query that touches either table — including admin
-- queries where is_admin() would short-circuit (cycle detection happens
-- before OR-combined policies are evaluated).
--
-- Fix: mirror the pattern of public.current_user_locations() — introduce
-- a SECURITY DEFINER helper that computes the caller's set of visible
-- campaign IDs via the campaign_locations join WITHOUT going through RLS.
-- The definer function bypasses RLS on its internal query, so the policy
-- on campaigns no longer subqueries campaign_locations (transitively or
-- otherwise), breaking the cycle.
--
-- campaign_locations_select_client_tenant still subqueries campaigns,
-- which is fine — after this change, campaigns's policies no longer
-- touch campaign_locations, so the graph is acyclic.
--
-- No data is modified. No RLS is weakened: the set of rows a given role
-- can see is identical to before.

-- ============================================================================
-- 1. SECURITY DEFINER helper — returns the set of campaign IDs the
--    caller can reach through an active location assignment.
-- ============================================================================
create or replace function public.current_user_visible_campaigns()
returns uuid[]
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(array_agg(distinct cl.campaign_id), array[]::uuid[])
  from public.campaign_locations cl
  where cl.location_id = any (public.current_user_locations());
$$;

comment on function public.current_user_visible_campaigns() is
  'Campaign IDs reachable by the caller via an active location '
  'assignment. SECURITY DEFINER so the inner campaign_locations lookup '
  'bypasses RLS — used from campaigns_select_assigned to break the '
  'campaigns ↔ campaign_locations policy cycle that produced 42P17.';

-- Lock down execution like the other helpers: authenticated users only,
-- never the anon role.
revoke all on function public.current_user_visible_campaigns() from public;
grant execute on function public.current_user_visible_campaigns() to authenticated;

-- ============================================================================
-- 2. Replace the cycling policy with one that uses the helper.
-- ============================================================================
drop policy if exists campaigns_select_assigned on public.campaigns;

create policy campaigns_select_assigned
  on public.campaigns for select to authenticated
  using (id = any (public.current_user_visible_campaigns()));
