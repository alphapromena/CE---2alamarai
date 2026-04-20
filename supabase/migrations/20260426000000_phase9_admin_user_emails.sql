-- Phase 9 — Admin user emails helper
-- Fixes the "/admin/users" page which failed with
--   `listUsers failed: Database error finding users`
-- from the GoTrue Admin REST endpoint, and additionally replaces an N+1
-- pagination loop over `auth.admin.listUsers` that read all users on every
-- page load.
--
-- Approach: expose a SECURITY DEFINER function that reads `auth.users`
-- directly and returns only (id, email) tuples, optionally filtered by a
-- passed-in set of ids. Only callable by service_role (revoke from others).

create or replace function public.admin_get_user_emails(p_user_ids uuid[] default null)
returns table(id uuid, email text)
language sql
stable
security definer
set search_path = public, pg_catalog, auth
as $$
  select u.id, u.email::text
  from auth.users u
  where p_user_ids is null or u.id = any(p_user_ids);
$$;

revoke all on function public.admin_get_user_emails(uuid[]) from public;
revoke all on function public.admin_get_user_emails(uuid[]) from authenticated;
revoke all on function public.admin_get_user_emails(uuid[]) from anon;
grant execute on function public.admin_get_user_emails(uuid[]) to service_role;

comment on function public.admin_get_user_emails(uuid[]) is
  'Phase 9: returns (id, email) rows from auth.users for the given ids ' ||
  '(or all users if null). service_role only. Replaces the GoTrue ' ||
  'admin.listUsers REST call which was failing with a database error.';
