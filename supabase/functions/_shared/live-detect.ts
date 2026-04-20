// Deno mirror of lib/alerts/detect.ts.
// Used by the detect-live-issues Edge Function. Update BOTH files together.
// lib/alerts/detect.test.ts is the source-of-truth test suite.

import { assignTier, pickTierMetricValue, type Tier, type TierMetric } from './performance.ts';

// ============================================================================
// Thresholds
// ============================================================================

export type LiveThresholds = {
  low_performance_threshold: number;
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

export function readLowPerformanceThreshold(kpiConfig: unknown): number {
  if (kpiConfig && typeof kpiConfig === 'object') {
    const raw = (kpiConfig as Record<string, unknown>).low_performance_threshold;
    if (isFiniteFraction(raw)) return raw;
  }
  return DEFAULT_LIVE_THRESHOLDS.low_performance_threshold;
}

export function readNoActivityHours(kpiConfig: unknown): number {
  if (kpiConfig && typeof kpiConfig === 'object') {
    const raw = (kpiConfig as Record<string, unknown>).no_activity_hours;
    if (isPositiveNumber(raw)) return raw;
  }
  return DEFAULT_LIVE_THRESHOLDS.no_activity_hours;
}

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

export type PerformanceSnapshotRow = Partial<Record<TierMetric, number | null>> & {
  scope_kind: 'promoter' | 'location' | 'campaign';
  scope_id: string;
  campaign_id: string;
  period_kind: 'daily' | 'weekly' | 'campaign_to_date';
  period_start: string;
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
  check_in_at: string;
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

export function detectLowPerformance(
  snapshot: PerformanceSnapshotRow,
  thresholds: Pick<LiveThresholds, 'low_performance_threshold'> & {
    tier_metric: TierMetric;
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
