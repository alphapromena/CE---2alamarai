-- Phase 8 — Storage bucket for generated export artifacts.
--
-- Same posture as Phase 3 `attendance-photos` (D-019) + Phase 4
-- `activity-photos` (D-020 item 2): private bucket, no storage.objects
-- policies for authenticated/anon → all direct client I/O denied. Reads
-- happen via short-TTL signed URLs minted by a Server Action that first
-- verifies the caller owns (or admins) the underlying export_jobs row.
-- Writes happen only via service-role (Server Action / Edge Function) after
-- generation.
--
-- Path layout: `<client_id_or_internal>/<export_jobs.id>/<filename>`.
--   internal   — when client_id on the export_jobs row is null
--   <filename> — `<slug>-<iso>.<xlsx|zip>` for human download

insert into storage.buckets (id, name, public)
values ('exports', 'exports', false)
on conflict (id) do nothing;

-- Intentionally: no policies on storage.objects for bucket 'exports'.
-- Supabase storage.objects has RLS enabled platform-wide; absence of
-- policies means all direct I/O for authenticated + anon is denied.
-- Service-role operations sign URLs + write artifacts.
