-- Phase 9 — Extend notification_kind enum with 'export_ready'
--
-- The email-delivery path (D-034) inserts an in-app notifications row
-- alongside each sent email so the bell reflects the event regardless of
-- email provider status. That row uses kind = 'export_ready'; add the
-- enum value before the first insert.
--
-- ALTER TYPE ... ADD VALUE is append-only and forward-only — you cannot
-- remove a value from an enum in Postgres without rebuilding the type.
-- Idempotent via IF NOT EXISTS.

alter type public.notification_kind add value if not exists 'export_ready';
