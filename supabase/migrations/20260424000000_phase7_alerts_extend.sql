-- Phase 7 — Extend alert_type enum with live-monitoring flags.
--
-- Phase 3 shipped six types (late/absent/early/missing/geofence/override).
-- Phase 5 added four stock types (low_stock/over_consumption/
-- reconciliation_mismatch/no_usage). Phase 7 adds two more:
--
--   low_performance — a promoter/location is running materially below the
--                     campaign's configured tier metric threshold. Emitted by
--                     the detect-live-issues sweep after compute-kpis writes
--                     performance_snapshots.
--   no_activity     — a promoter has checked in but recorded no daily_report
--                     activity (no submitted contacts / engaged / samples /
--                     sales) for > kpi_config.no_activity_hours. Emitted by
--                     the same sweep. Distinct from stock's 'no_usage', which
--                     focuses on the sample ledger rather than the
--                     engagement funnel.
--
-- ALTER TYPE ... ADD VALUE must run outside a transaction that uses the new
-- value. This file adds values only; consumers live in Edge Functions and
-- Server Actions that execute after all migrations are applied.

alter type public.alert_type add value if not exists 'low_performance';
alter type public.alert_type add value if not exists 'no_activity';
