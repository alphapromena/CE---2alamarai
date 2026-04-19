// Slim Deno mirror of lib/performance/tiering.ts + lib/performance/rollups.ts.
// Used by the compute-kpis function for the performance_snapshots write step.
// Update BOTH this file and lib/performance/* together when tiering or
// rollup math changes. lib/performance/tiering.test.ts +
// lib/performance/rollups.test.ts are the source-of-truth tests.

import {
  rollupKpis,
  type RollupRow,
  type SamplingDenominator,
} from './kpis.ts';

export type Tier = 'top' | 'medium' | 'low';
export type ScopeKind = 'promoter' | 'location' | 'campaign';
export type PeriodKind = 'daily' | 'weekly' | 'campaign_to_date';

export type TierMetric =
  | 'conversion_rate'
  | 'engagement_rate'
  | 'sampling_rate'
  | 'interaction_rate'
  | 'sample_to_conversion_rate';

export type TierThresholds = {
  tier_high: number;
  tier_medium: number;
  tier_metric: TierMetric;
};

export const DEFAULT_TIER_THRESHOLDS: TierThresholds = {
  tier_high: 0.5,
  tier_medium: 0.3,
  tier_metric: 'conversion_rate',
};

const TIER_METRICS: Set<TierMetric> = new Set([
  'conversion_rate',
  'engagement_rate',
  'sampling_rate',
  'interaction_rate',
  'sample_to_conversion_rate',
]);

function isFiniteFraction(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
}

export function readTierConfig(kpiConfig: unknown): TierThresholds {
  if (!kpiConfig || typeof kpiConfig !== 'object') return DEFAULT_TIER_THRESHOLDS;
  const o = kpiConfig as Record<string, unknown>;
  const high = isFiniteFraction(o.tier_high) ? o.tier_high : DEFAULT_TIER_THRESHOLDS.tier_high;
  const med = isFiniteFraction(o.tier_medium)
    ? o.tier_medium
    : DEFAULT_TIER_THRESHOLDS.tier_medium;
  const validOrder = high >= med;
  const metric =
    typeof o.tier_metric === 'string' && TIER_METRICS.has(o.tier_metric as TierMetric)
      ? (o.tier_metric as TierMetric)
      : DEFAULT_TIER_THRESHOLDS.tier_metric;
  if (!validOrder) return { ...DEFAULT_TIER_THRESHOLDS, tier_metric: metric };
  return { tier_high: high, tier_medium: med, tier_metric: metric };
}

export function assignTier(
  value: number | null,
  thresholds: { tier_high: number; tier_medium: number },
): Tier | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (value >= thresholds.tier_high) return 'top';
  if (value >= thresholds.tier_medium) return 'medium';
  return 'low';
}

export type SourceReport = RollupRow & {
  daily_report_id: string;
  promoter_user_id: string;
  location_id: string;
  campaign_id: string;
  report_date: string;
};

export type PerformanceRollup = {
  scope_kind: ScopeKind;
  scope_id: string;
  campaign_id: string;
  period_kind: PeriodKind;
  period_start: string;
  period_end: string;
  reports_count: number;
  total_traffic: number | null;
  contacts: number;
  engaged: number;
  samples_total: number;
  sales_total: number;
  interaction_rate: number | null;
  engagement_rate: number | null;
  sampling_rate: number | null;
  conversion_rate: number | null;
  sample_to_conversion_rate: number | null;
  sku_contributions: Record<string, number>;
  sampling_rate_denominator: SamplingDenominator;
  tier: Tier | null;
  tier_metric: TierMetric;
  tier_metric_value: number | null;
  tier_high_threshold: number;
  tier_medium_threshold: number;
  rank_in_scope: number | null;
  scope_size: number | null;
};

function scopeIdFor(scope: ScopeKind, row: SourceReport): string {
  if (scope === 'promoter') return row.promoter_user_id;
  if (scope === 'location') return row.location_id;
  return row.campaign_id;
}

function pickMetric(
  kpi: { [K in TierMetric]: number | null },
  metric: TierMetric,
): number | null {
  const v = kpi[metric];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function denseRankDesc(values: Array<{ id: string; v: number | null }>) {
  const withV = values.filter((x) => x.v !== null) as Array<{ id: string; v: number }>;
  withV.sort((a, b) => b.v - a.v);
  const rank = new Map<string, { rank: number; size: number }>();
  let lastV: number | null = null;
  let lastRank = 0;
  withV.forEach((x, i) => {
    const r = x.v === lastV ? lastRank : i + 1;
    lastV = x.v;
    lastRank = r;
    rank.set(x.id, { rank: r, size: withV.length });
  });
  for (const x of values) {
    if (!rank.has(x.id)) rank.set(x.id, { rank: 0, size: withV.length }); // 0 stands in for null below
  }
  return rank;
}

export function rollupByScope(args: {
  scope_kind: ScopeKind;
  campaign_id: string;
  period_kind: PeriodKind;
  period_start: string;
  period_end: string;
  reports: ReadonlyArray<SourceReport>;
  sampling_denominator: SamplingDenominator;
  tier: TierThresholds;
}): PerformanceRollup[] {
  const groups = new Map<string, SourceReport[]>();
  for (const r of args.reports) {
    if (r.campaign_id !== args.campaign_id) continue;
    const id = scopeIdFor(args.scope_kind, r);
    const bucket = groups.get(id);
    if (bucket) bucket.push(r);
    else groups.set(id, [r]);
  }

  const interim: Array<PerformanceRollup & { _v: number | null }> = [];
  for (const [scope_id, rows] of groups) {
    let trafficMissing = false;
    let traffic = 0;
    let contacts = 0;
    let engaged = 0;
    let samples = 0;
    let sales = 0;
    for (const r of rows) {
      if (r.total_traffic === null) trafficMissing = true;
      else traffic += r.total_traffic;
      contacts += r.contacts;
      engaged += r.engaged;
      samples += r.samples_total;
      sales += r.sales_total;
    }
    const kpi = rollupKpis(rows, args.sampling_denominator);
    const metricVal = pickMetric(kpi, args.tier.tier_metric);
    const tier = assignTier(metricVal, args.tier);
    interim.push({
      scope_kind: args.scope_kind,
      scope_id,
      campaign_id: args.campaign_id,
      period_kind: args.period_kind,
      period_start: args.period_start,
      period_end: args.period_end,
      reports_count: rows.length,
      total_traffic: trafficMissing ? null : traffic,
      contacts,
      engaged,
      samples_total: samples,
      sales_total: sales,
      interaction_rate: kpi.interaction_rate,
      engagement_rate: kpi.engagement_rate,
      sampling_rate: kpi.sampling_rate,
      conversion_rate: kpi.conversion_rate,
      sample_to_conversion_rate: kpi.sample_to_conversion_rate,
      sku_contributions: kpi.sku_contributions,
      sampling_rate_denominator: kpi.sampling_rate_denominator,
      tier,
      tier_metric: args.tier.tier_metric,
      tier_metric_value: metricVal,
      tier_high_threshold: args.tier.tier_high,
      tier_medium_threshold: args.tier.tier_medium,
      rank_in_scope: null,
      scope_size: null,
      _v: metricVal,
    });
  }

  const ranks = denseRankDesc(interim.map((r) => ({ id: r.scope_id, v: r._v })));
  return interim.map(({ _v, ...row }) => {
    void _v;
    const r = ranks.get(row.scope_id);
    return {
      ...row,
      rank_in_scope: r && r.rank > 0 ? r.rank : null,
      scope_size: r ? r.size : null,
    };
  });
}

export function dailyPeriod(date: string) {
  return { period_start: date, period_end: date };
}

export function weeklyPeriod(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = d.getUTCDay();
  const offsetToMonday = (dow + 6) % 7;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - offsetToMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    period_start: monday.toISOString().slice(0, 10),
    period_end: sunday.toISOString().slice(0, 10),
  };
}

export function campaignToDatePeriod(
  campaign_start: string,
  today: string,
  campaign_end: string | null,
) {
  const end = campaign_end && campaign_end < today ? campaign_end : today;
  return { period_start: campaign_start, period_end: end };
}
