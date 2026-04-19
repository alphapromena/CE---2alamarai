/**
 * Performance rollups — pure aggregation over kpi_snapshots /
 * daily_reports rows into per-(scope, period) rollup rows.
 *
 * Re-uses Phase 4 `rollupKpis` for the actual KPI math (D-020). Tiering
 * comes from `lib/performance/tiering.ts`. This module knows ONLY how to
 * group + project; it does no I/O.
 *
 * Mirrored at supabase/functions/_shared/performance.ts so the
 * compute-kpis Edge Function uses the same logic.
 */

import {
  rollupKpis,
  type KpiResult,
  type RollupRow,
  type SamplingDenominator,
} from '@/lib/kpis/compute';
import {
  assignTier,
  pickTierMetricValue,
  rankWithinScope,
  type Tier,
  type TierThresholds,
} from './tiering';

export type ScopeKind = 'promoter' | 'location' | 'campaign';
export type PeriodKind = 'daily' | 'weekly' | 'campaign_to_date';

/**
 * Source row for rollup. One of these per daily_report; the caller is
 * responsible for filtering to the correct period before passing in.
 */
export type SourceReport = RollupRow & {
  daily_report_id: string;
  promoter_user_id: string;
  location_id: string;
  campaign_id: string;
  report_date: string; // ISO yyyy-mm-dd
};

export type ScopeKey = {
  scope_kind: ScopeKind;
  scope_id: string;
  campaign_id: string;
};

export type PerformanceRollup = ScopeKey &
  KpiResult & {
    period_kind: PeriodKind;
    period_start: string;
    period_end: string;
    reports_count: number;
    total_traffic: number | null;
    contacts: number;
    engaged: number;
    samples_total: number;
    sales_total: number;
    tier: Tier | null;
    tier_metric: TierThresholds['tier_metric'];
    tier_metric_value: number | null;
    tier_high_threshold: number;
    tier_medium_threshold: number;
    rank_in_scope: number | null;
    scope_size: number | null;
  };

function scopeIdFor(scope: ScopeKind, row: SourceReport): string {
  switch (scope) {
    case 'promoter':
      return row.promoter_user_id;
    case 'location':
      return row.location_id;
    case 'campaign':
      return row.campaign_id;
  }
}

function aggregateOne(
  rows: ReadonlyArray<SourceReport>,
  samplingDenominator: SamplingDenominator,
) {
  const kpi = rollupKpis(rows, samplingDenominator);

  let anyTrafficMissing = false;
  let trafficSum = 0;
  let contacts = 0;
  let engaged = 0;
  let samples = 0;
  let sales = 0;
  for (const r of rows) {
    if (r.total_traffic === null) anyTrafficMissing = true;
    else trafficSum += r.total_traffic;
    contacts += r.contacts;
    engaged += r.engaged;
    samples += r.samples_total;
    sales += r.sales_total;
  }

  return {
    kpi,
    reports_count: rows.length,
    total_traffic: anyTrafficMissing ? null : trafficSum,
    contacts,
    engaged,
    samples_total: samples,
    sales_total: sales,
  };
}

/**
 * Group source reports by scope_id and aggregate. Ranks + tiers are applied
 * across the resulting set. Use one call per (scope_kind, period).
 *
 * Caller must:
 *   - have already filtered `reports` to the target period window
 *   - pass the correct scope_kind for the desired grain
 *   - pass the campaign's KPI config (sampling denominator + tier thresholds)
 */
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
  const { scope_kind, campaign_id, period_kind, period_start, period_end } = args;

  const groups = new Map<string, SourceReport[]>();
  for (const r of args.reports) {
    if (r.campaign_id !== campaign_id) continue;
    const id = scopeIdFor(scope_kind, r);
    const bucket = groups.get(id);
    if (bucket) bucket.push(r);
    else groups.set(id, [r]);
  }

  // For 'campaign' scope, all reports share scope_id = campaign_id, so
  // there is exactly one group; rank/scope_size still computed (1 of 1).
  const interim: Array<PerformanceRollup & { _metric: number | null }> = [];

  for (const [scope_id, rows] of groups) {
    const agg = aggregateOne(rows, args.sampling_denominator);
    const metricValue = pickTierMetricValue(agg.kpi, args.tier.tier_metric);
    const tier = assignTier(metricValue, args.tier);

    interim.push({
      scope_kind,
      scope_id,
      campaign_id,
      period_kind,
      period_start,
      period_end,
      reports_count: agg.reports_count,
      total_traffic: agg.total_traffic,
      contacts: agg.contacts,
      engaged: agg.engaged,
      samples_total: agg.samples_total,
      sales_total: agg.sales_total,
      ...agg.kpi,
      tier,
      tier_metric: args.tier.tier_metric,
      tier_metric_value: metricValue,
      tier_high_threshold: args.tier.tier_high,
      tier_medium_threshold: args.tier.tier_medium,
      rank_in_scope: null, // filled below
      scope_size: null,
      _metric: metricValue,
    });
  }

  const ranked = rankWithinScope(
    interim.map((r) => ({ id: r.scope_id, conversion_rate: r._metric })),
    'conversion_rate',
  );

  const rankBy = new Map(ranked.map((r) => [r.id, r]));
  return interim.map(({ _metric, ...row }) => {
    const rk = rankBy.get(row.scope_id);
    void _metric;
    return {
      ...row,
      rank_in_scope: rk?.rank_in_scope ?? null,
      scope_size: rk?.scope_size ?? null,
    };
  });
}

/**
 * Convenience helpers — same call but pinned to a single scope. Returned
 * arrays let callers compose with the campaign-scope rollup uniformly.
 */
export const rollupPromoter = (
  args: Omit<Parameters<typeof rollupByScope>[0], 'scope_kind'>,
) => rollupByScope({ ...args, scope_kind: 'promoter' });

export const rollupLocation = (
  args: Omit<Parameters<typeof rollupByScope>[0], 'scope_kind'>,
) => rollupByScope({ ...args, scope_kind: 'location' });

export const rollupCampaign = (
  args: Omit<Parameters<typeof rollupByScope>[0], 'scope_kind'>,
) => rollupByScope({ ...args, scope_kind: 'campaign' });

/**
 * Period helpers — pure date math, UTC, ISO yyyy-mm-dd strings.
 *
 * 'weekly' is Mon..Sun (ISO 8601). 'campaign_to_date' starts at the
 * campaign start_date and ends at min(today, end_date).
 */
export function dailyPeriod(date: string): { period_start: string; period_end: string } {
  return { period_start: date, period_end: date };
}

export function weeklyPeriod(date: string): { period_start: string; period_end: string } {
  const d = new Date(`${date}T00:00:00Z`);
  // ISO week: Monday = 1, Sunday = 7. JS getUTCDay: Sun=0..Sat=6.
  const dow = d.getUTCDay();
  const offsetToMonday = (dow + 6) % 7; // Mon→0, Tue→1, ..., Sun→6
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
): { period_start: string; period_end: string } {
  const end = campaign_end && campaign_end < today ? campaign_end : today;
  return { period_start: campaign_start, period_end: end };
}
