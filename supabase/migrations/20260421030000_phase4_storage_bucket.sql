-- Phase 4 — Storage bucket for activity photos (setup / during / end_of_shift).
--
-- Same security posture as the Phase 3 attendance-photos bucket (D-019):
--   - Bucket is private (public=false).
--   - No storage.objects policies for authenticated or anon → all direct
--     client I/O is denied by RLS.
--   - Reads happen through Route Handlers that re-check row-level access on
--     the owning daily_report, then issue a short-TTL signed GET URL.
--   - Writes happen either through a server-signed PUT URL issued by a
--     Route Handler, or via service-role uploads inside an Edge Function.
--
-- Separate from attendance-photos so retention, lifecycle, and audit can
-- diverge later without coupling the two domains.

insert into storage.buckets (id, name, public)
values ('activity-photos', 'activity-photos', false)
on conflict (id) do nothing;

-- No policies created on storage.objects for bucket 'activity-photos'.
-- RLS on storage.objects is enabled platform-wide; absence of policies means
-- all authenticated + anon I/O is denied. Service-role operations bypass.
