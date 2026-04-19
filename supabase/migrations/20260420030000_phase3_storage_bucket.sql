-- Phase 3 — Storage bucket for attendance + supervisor-visit photos.
--
-- D-019: storage-level policies deny all direct client access. Reads happen
-- only through server-signed URLs (short TTL) issued by Server Actions that
-- re-check row-level access before signing. Writes happen only through server-
-- signed upload URLs or via the geo-validate-checkin Edge Function (service
-- role, which bypasses RLS by definition).
--
-- Result:
--   - Bucket is private (not public).
--   - storage.objects has RLS enabled platform-wide; no INSERT/SELECT/UPDATE/
--     DELETE policy for authenticated or anon → all direct client I/O denied.
--   - Server-side (service role) bypasses RLS to sign upload/download URLs.
--
-- If we ever want to let the client PUT directly against storage without a
-- pre-signed URL, we revisit this and add a path-scoped INSERT policy.

insert into storage.buckets (id, name, public)
values ('attendance-photos', 'attendance-photos', false)
on conflict (id) do nothing;

-- Explicit: no policies created for bucket 'attendance-photos' on
-- storage.objects. Supabase defaults storage.objects RLS to enabled, so the
-- absence of policies means all direct I/O for authenticated + anon is denied.
-- Service-role operations (Server Actions using the admin client, Edge
-- Functions) are the only path to read/write.
