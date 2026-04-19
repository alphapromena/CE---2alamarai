/**
 * Tiering & ranking — pure functions.
 *
 * Phase 6 single source of truth for:
 *   - assignTier(value, thresholds): Top / Medium / Low classification
 *   - rankWithinScope(rows, metric): dense rank by descending metric, nulls last
 *   - readTierConfig(kpiConfig): safe-read defaults from campaigns.kpi_config
 *
 * Mirrored byte-for-byte at supabase/functions/_shared/tiering.ts so the
 * compute-kpis Edge Function and the dashboards classify identically.
 *
 * No I/O, no time, no randomness.
 *
 * Spec exit criterion: Safeway Khalda (conversion 65% → Top) vs Shini
 * (20% → Low) — see lib/performance/tiering.test.ts.
 */

export type Tier = 'top' | 'medium' | 'low';

export type TierMetric =
  | 'conversion_rate'
  | 'engagement_rate'
  | 'sampling_rate'
  | 'interaction_rate'
  | 'sample_to_conversion_rate';

export type TierThresholds = {
  /** value >= tier_high → 'top' */
  tier_high: number;
  /** value >= tier_medium (and < tier_high) → 'medium'; else 'low' */
  tier_medium: number;
  /** Which numeric ratio to tier on */
  tier_metric: TierMetric;
};

export const DEFAULT_TIER_THRESHOLDS: TierThresholds = {
  tier_high: 0.5,
  tier_medium: 0.3,
  tier_metric: 'conversion_rate',
};

const TIER_METRICS: ReadonlySet<TierMetric> = new Set([
  'conversion_rate',
  'engagement_rate',
  'sampling_rate',
  'interaction_rate',
  'sample_to_conversion_rate',
]);

function isFiniteFraction(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
}

/**
 * Read tier configuration from a campaign's kpi_config JSONB blob.
 * Unknown / out-of-range / missing fields fall back to defaults — same
 * soft-add posture as readSamplingDenominator (D-007), readNoUsageHours
 * (D-027), and readLatenessGrace (D-019). Never throws.
 */
export function readTierConfig(kpiConfig: unknown): TierThresholds {
  if (!kpiConfig || typeof kpiConfig !== 'object') return DEFAULT_TIER_THRESHOLDS;
  const o = kpiConfig as Record<string, unknown>;

  const high = isFiniteFraction(o.tier_high) ? o.tier_high : DEFAULT_TIER_THRESHOLDS.tier_high;
  const med = isFiniteFraction(o.tier_medium)
    ? o.tier_medium
    : DEFAULT_TIER_THRESHOLDS.tier_medium;

  // tier_high must be >= tier_medium; otherwise fall back to defaults to
  // avoid an invalid configuration silently producing nonsense tiers.
  const validOrder = high >= med;

  const metric =
    typeof o.tier_metric === 'string' && TIER_METRICS.has(o.tier_metric as TierMetric)
      ? (o.tier_metric as TierMetric)
      : DEFAULT_TIER_THRESHOLDS.tier_metric;

  if (!validOrder) return { ...DEFAULT_TIER_THRESHOLDS, tier_metric: metric };

  return { tier_high: high, tier_medium: med, tier_metric: metric };
}

/**
 * Classify a single metric value into Top / Medium / Low.
 *
 * - value === null → null (not classifiable; UI renders "—")
 * - value >= tier_high   → 'top'
 * - value >= tier_medium → 'medium'
 * - else                 → 'low'
 *
 * Boundary policy is INCLUSIVE on the high side ("at-or-above") because the
 * spec phrasing is "above the threshold ⇒ Top"; for a continuous fraction
 * the difference between strict and inclusive is immaterial in practice
 * but inclusive matches the more common UX expectation ("hit the bar").
 */
export function assignTier(
  value: number | null,
  thresholds: Pick<TierThresholds, 'tier_high' | 'tier_medium'>,
): Tier | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (value >= thresholds.tier_high) return 'top';
  if (value >= thresholds.tier_medium) return 'medium';
  return 'low';
}

/**
 * Pull the metric column the campaign tiers on out of a KPI-shaped row.
 */
export function pickTierMetricValue<
  T extends Partial<Record<TierMetric, number | null>>,
>(row: T, metric: TierMetric): number | null {
  const v = row[metric];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export type RankedRow<T> = T & {
  rank_in_scope: number | null;
  scope_size: number;
};

/**
 * Dense-rank rows within a scope by descending metric. Ties share a rank;
 * the next rank skips (1, 2, 2, 4) — competition ranking. Null metric
 * values are unranked (rank_in_scope = null) and sorted to the end.
 *
 * scope_size is the count of rows that had a numeric metric (i.e., the
 * denominator the rank is "out of"). Returned in stable order: ranked rows
 * first by ascending rank, unranked rows after.
 */
export function rankWithinScope<T extends Partial<Record<TierMetric, number | null>>>(
  rows: ReadonlyArray<T>,
  metric: TierMetric,
): RankedRow<T>[] {
  const withValue: Array<{ row: T; v: number; idx: number }> = [];
  const withoutValue: Array<{ row: T; idx: number }> = [];

  rows.forEach((row, idx) => {
    const v = pickTierMetricValue(row, metric);
    if (v === null) withoutValue.push({ row, idx });
    else withValue.push({ row, v, idx });
  });

  // Sort by metric desc, then by original index asc for deterministic tie order.
  withValue.sort((a, b) => (b.v - a.v) || (a.idx - b.idx));

  const scopeSize = withValue.length;
  const ranked: RankedRow<T>[] = [];

  let lastValue: number | null = null;
  let lastRank = 0;
  withValue.forEach((entry, i) => {
    const oneBased = i + 1;
    const rank = entry.v === lastValue ? lastRank : oneBased;
    lastValue = entry.v;
    lastRank = rank;
    ranked.push({ ...entry.row, rank_in_scope: rank, scope_size: scopeSize });
  });

  for (const { row } of withoutValue) {
    ranked.push({ ...row, rank_in_scope: null, scope_size: scopeSize });
  }

  return ranked;
}

/**
 * Distribution of tiers across a set of ranked rows, useful for
 * client-facing aggregate views (D-019: clients see aggregates only).
 */
export function tierDistribution(
  rows: ReadonlyArray<{ tier: Tier | null }>,
): { top: number; medium: number; low: number; unclassified: number; total: number } {
  let top = 0;
  let medium = 0;
  let low = 0;
  let unclassified = 0;
  for (const r of rows) {
    if (r.tier === 'top') top += 1;
    else if (r.tier === 'medium') medium += 1;
    else if (r.tier === 'low') low += 1;
    else unclassified += 1;
  }
  return { top, medium, low, unclassified, total: rows.length };
}
