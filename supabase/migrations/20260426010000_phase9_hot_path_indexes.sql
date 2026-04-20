-- Phase 9 — Hot-path composite indexes
--
-- Additive-only: no schema changes, no invariant changes, no RLS changes.
-- Each index closes a filter+sort pattern the list pages actually issue,
-- cross-referenced against lib/queries/* by the Phase 9 audit.
--
-- All use `if not exists` so re-applying is safe.
--
-- Rationale notes inline with each index.

-- ---------------------------------------------------------------------------
-- alerts: supervisor/admin dashboards commonly filter to a specific
-- alert_type (e.g. low_stock), gated by status in ('pending', 'acknowledged'),
-- sorted newest-first. The existing (status, created_at desc) +
-- (alert_type) indexes each serve half the predicate; a composite gives
-- a single index scan for the combined case.
-- ---------------------------------------------------------------------------
create index if not exists alerts_type_status_created_idx
  on public.alerts (alert_type, status, created_at desc);

-- ---------------------------------------------------------------------------
-- attendance: /admin/live and /supervisor/live drill into
-- (campaign_id, location_id) as-of today. Existing indexes are
-- (campaign_id, attendance_date) and (location_id, attendance_date) —
-- neither covers the combined filter without a bitmap AND + extra I/O.
-- ---------------------------------------------------------------------------
create index if not exists attendance_campaign_location_date_idx
  on public.attendance (campaign_id, location_id, attendance_date desc);

-- ---------------------------------------------------------------------------
-- consumer_feedback: the feedback queue filters by campaign + location +
-- orders by created_at desc. Existing indexes are single-column only.
-- ---------------------------------------------------------------------------
create index if not exists consumer_feedback_campaign_location_created_idx
  on public.consumer_feedback (campaign_id, location_id, created_at desc);

-- ---------------------------------------------------------------------------
-- stock_movements: audit trail pages filter by campaign + movement_kind
-- ('allocation'|'distribution'|'usage'|'return'|'correction') and sort by
-- recency. Existing (campaign_id, created_at desc) doesn't narrow on kind.
-- ---------------------------------------------------------------------------
create index if not exists stock_movements_campaign_kind_created_idx
  on public.stock_movements (campaign_id, movement_kind, created_at desc);

-- ---------------------------------------------------------------------------
-- break_requests: supervisor queue filters by status + location +
-- sorts by created_at. Existing indexes cover (status, created_at) and
-- (location_id) separately; the composite removes the bitmap merge.
-- ---------------------------------------------------------------------------
create index if not exists break_requests_location_status_created_idx
  on public.break_requests (location_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- audit_log: the "recent events for an entity" admin pattern
-- (action=X, entity=Y, sorted by ts). Existing (entity, entity_id) +
-- (ts desc) don't combine well on a hot entity.
-- ---------------------------------------------------------------------------
create index if not exists audit_log_entity_action_ts_idx
  on public.audit_log (entity, action, ts desc);

-- ---------------------------------------------------------------------------
-- performance_snapshots: the campaign-scope dashboards filter by
-- (scope_kind, campaign_id, period_kind) and pull period_start desc.
-- Existing (scope_kind, scope_id, period_kind, period_start desc) is
-- perfect for drill-into-scope queries but doesn't pivot on campaign_id
-- without scope_id. Add the campaign-anchored variant for
-- "show me all scopes' latest rollup for campaign X".
-- ---------------------------------------------------------------------------
create index if not exists performance_snapshots_campaign_scope_period_idx
  on public.performance_snapshots (campaign_id, scope_kind, period_kind, period_start desc);
