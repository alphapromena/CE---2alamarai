/**
 * Live-monitoring alert detection — pure functions (Phase 7).
 *
 * Two detectors added in Phase 7:
 *   - detectLowPerformance(snapshot, thresholds)
 *       Flags a rolled-up performance row whose tier metric is below the
 *       campaign-configured low-performance threshold. Designed to run on
 *       rows produced by Phase 6's compute-kpis (performance_snapshots).
 *
 *   - detectNoActivity(rows, thresholds, now)
 *       Flags a promoter who has checked in today but has reported zero
 *       funnel activity (contacts + engaged + samples + sales == 0, or no
 *       daily_report at all) for more than the configured no_activity_hours.
 *
 * No I/O, no now() reads, no DB access: `now: Date` is passed in so tests
 * are deterministic. Mirrored byte-for-byte at
 * `supabase/functions/_shared/live-detect.ts` so the detect-live-issues
 * Edge Function (Deno) runs the same code; vitest exercises this file and
 * that's the source of truth for both.
 *
 * Threshold reads follow the soft-add pattern from D-007 / D-019 / D-027 /
 * D-028: unknown / non-numeric / out-of-range values fall back to defaults,
 * so admins can add keys to kpi_config without a schema migration.
 */

import { type Tier, type TierMetric, assignTier, pickTierMetricValue } from '../performance/tiering';

// ============================================================================
// Thresholds
// ============================================================================

export type LiveThresholds = {
  /** Fraction (0..1): tier metric strictly below this → low_performance. */
  low_performance_threshold: number;
  /** Hours: (now - check_in) > this with no activity → no_activity. */
  no_activity_hours: number;
};

export const DEFAULT_LIVE_THRESHOLDS: LiveThresholds = {
  low_performance_threshold: 0.3,
  no_activity_hours: 3,
};

function isFiniteFraction(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
}

function isPositiveNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

/**
 * Read kpi_config.low_performance_threshold (fraction in [0,1]). Falls back
 * to DEFAULT_LIVE_THRESHOLDS.low_performance_threshold on unknown / invalid
 * values.
 */
export function readLowPerformanceThreshold(kpiConfig: unknown): number {
  if (kpiConfig && typeof kpiConfig === 'object') {
    const raw = (kpiConfig as Record<string, unknown>).low_performance_threshold;
    if (isFiniteFraction(raw)) return raw;
  }
  return DEFAULT_LIVE_THRESHOLDS.low_performance_threshold;
}

/**
 * Read kpi_config.no_activity_hours (positive number). Falls back to
 * DEFAULT_LIVE_THRESHOLDS.no_activity_hours on unknown / invalid values.
 */
export function readNoActivityHours(kpiConfig: unknown): number {
  if (kpiConfig && typeof kpiConfig === 'object') {
    const raw = (kpiConfig as Record<string, unknown>).no_activity_hours;
    if (isPositiveNumber(raw)) return raw;
  }
  return DEFAULT_LIVE_THRESHOLDS.no_activity_hours;
}

/**
 * Read kpi_config.break_max_minutes (positive integer minutes). Used by the
 * break-request Server Actions in Phase 7 to cap approved duration. Default
 * 60. Lives here to keep all Phase-7 kpi_config readers in one module.
 */
export const DEFAULT_BREAK_MAX_MINUTES = 60;
export function readBreakMaxMinutes(kpiConfig: unknown): number {
  if (kpiConfig && typeof kpiConfig === 'object') {
    const raw = (kpiConfig as Record<string, unknown>).break_max_minutes;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0 && raw <= 480) {
      return Math.floor(raw);
    }
  }
  return DEFAULT_BREAK_MAX_MINUTES;
}

// ============================================================================
// Types
// ============================================================================

/** Subset of a performance_snapshots row needed to decide low_performance. */
export type PerformanceSnapshotRow = Partial<Record<TierMetric, number | null>> & {
  scope_kind: 'promoter' | 'location' | 'campaign';
  scope_id: string;
  campaign_id: string;
  period_kind: 'daily' | 'weekly' | 'campaign_to_date';
  period_start: string; // ISO date
  reports_count?: number;
};

export type LowPerformanceFlag = {
  kind: 'low_performance';
  campaign_id: string;
  scope_kind: 'promoter' | 'location' | 'campaign';
  scope_id: string;
  period_kind: 'daily' | 'weekly' | 'campaign_to_date';
  period_start: string;
  tier_metric: TierMetric;
  metric_value: number;
  threshold: number;
  tier: Tier | null;
};

export type NoActivityInput = {
  attendance_id: string;
  campaign_id: string;
  location_id: string;
  promoter_id: string;
  /** ISO timestamp of check-in (the row's check_in_time). */
  check_in_at: string;
  /**
   * Sum of funnel counters observed since check-in across all daily_reports
   * authored by this promoter for this (location, date). Zero if no report
   * has been drafted/submitted; null is treated as zero.
   */
  activity_units?: number | null;
};

export type NoActivityFlag = {
  kind: 'no_activity';
  attendance_id: string;
  campaign_id: string;
  location_id: string;
  promoter_id: string;
  check_in_at: string;
  hours_since_check_in: number;
  threshold_hours: number;
};

// ============================================================================
// Detectors
// ============================================================================

/**
 * Low-performance detector.
 *
 * Fires when the tier-metric value on a performance_snapshots row is
 * strictly below the campaign-configured low_performance_threshold.
 *
 * - null / missing metric → does not fire (we cannot classify).
 * - reports_count === 0   → does not fire (no data yet; compute-kpis may not
 *                           have rolled anything up). Callers typically pass
 *                           only rows with reports_count > 0 but we guard
 *                           here too.
 * - threshold === 0       → detector disabled (opt-out).
 *
 * Returns null (not a flag) on non-firing inputs, matching the
 * one-flag-or-null convention in the task description. Callers that handle
 * batches of snapshots should map + filter.
 */
export function detectLowPerformance(
  snapshot: PerformanceSnapshotRow,
  thresholds: Pick<LiveThresholds, 'low_performance_threshold'> & {
    tier_metric: TierMetric;
    /** Optional tier high/medium so the returned flag can carry a tier too. */
    tier_high?: number;
    tier_medium?: number;
  },
): LowPerformanceFlag | null {
  if (thresholds.low_performance_threshold <= 0) return null;
  if ((snapshot.reports_count ?? 0) <= 0) return null;

  const value = pickTierMetricValue(snapshot, thresholds.tier_metric);
  if (value === null) return null;
  if (value >= thresholds.low_performance_threshold) return null;

  const tier =
    typeof thresholds.tier_high === 'number' && typeof thresholds.tier_medium === 'number'
      ? assignTier(value, {
          tier_high: thresholds.tier_high,
          tier_medium: thresholds.tier_medium,
        })
      : null;

  return {
    kind: 'low_performance',
    campaign_id: snapshot.campaign_id,
    scope_kind: snapshot.scope_kind,
    scope_id: snapshot.scope_id,
    period_kind: snapshot.period_kind,
    period_start: snapshot.period_start,
    tier_metric: thresholds.tier_metric,
    metric_value: value,
    threshold: thresholds.low_performance_threshold,
    tier,
  };
}

/**
 * No-activity detector.
 *
 * For each checked-in promoter row, fires if:
 *   - (now - check_in_at) > no_activity_hours, AND
 *   - activity_units is null or 0.
 *
 * An invalid / unparseable check_in_at is skipped (the row shouldn't exist;
 * defense-in-depth).
 */
export function detectNoActivity(
  inputs: ReadonlyArray<NoActivityInput>,
  thresholds: Pick<LiveThresholds, 'no_activity_hours'>,
  now: Date,
): NoActivityFlag[] {
  if (thresholds.no_activity_hours <= 0) return [];
  const thresholdMs = thresholds.no_activity_hours * 60 * 60 * 1000;
  const out: NoActivityFlag[] = [];
  for (const row of inputs) {
    const units = row.activity_units ?? 0;
    if (units > 0) continue;
    const parsed = Date.parse(row.check_in_at);
    if (!Number.isFinite(parsed)) continue;
    const diffMs = now.getTime() - parsed;
    if (diffMs <= thresholdMs) continue;
    out.push({
      kind: 'no_activity',
      attendance_id: row.attendance_id,
      campaign_id: row.campaign_id,
      location_id: row.location_id,
      promoter_id: row.promoter_id,
      check_in_at: row.check_in_at,
      hours_since_check_in: diffMs / (60 * 60 * 1000),
      threshold_hours: thresholds.no_activity_hours,
    });
  }
  return out;
}
