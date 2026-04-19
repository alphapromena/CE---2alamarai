-- Phase 5 — Extend alert_type enum with stock-related flags.
--
-- Phase 3 shipped six alert types (late/absent/early/missing/geofence/override).
-- Phase 5 adds four:
--   low_stock               — an entity's (campaign, sku) balance fell under
--                             a configured threshold.
--   over_consumption        — a promoter-usage attempt exceeded received stock.
--                             (Also hard-rejected at DB layer; the alert is
--                             raised by the stock-reconcile sweep when it sees
--                             a reported daily_report usage > received on a
--                             reconciliation pass.)
--   reconciliation_mismatch — end-of-day reconciliation identity failed
--                             (received ≠ distributed + remaining + returned).
--   no_usage                — a promoter has received stock but reported zero
--                             usage for > kpi_config.no_usage_hours.
--
-- ALTER TYPE ... ADD VALUE must run outside a transaction that uses the new
-- value. This file adds values only; consumers live in Edge Functions and
-- Server Actions that execute after all migrations are applied.

alter type public.alert_type add value if not exists 'low_stock';
alter type public.alert_type add value if not exists 'over_consumption';
alter type public.alert_type add value if not exists 'reconciliation_mismatch';
alter type public.alert_type add value if not exists 'no_usage';
