-- Feature 4 — Extend notification_kind with 'supervisor_visit' (D-041).
--
-- supervisor-visit-create edge function inserts an in-app notifications row
-- for the visited promoter so their bell reflects the event. That row uses
-- kind = 'supervisor_visit'; append the enum value before the first insert.
-- Idempotent via IF NOT EXISTS.

alter type public.notification_kind add value if not exists 'supervisor_visit';
