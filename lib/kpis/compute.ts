/**
 * KPI computation — pure functions.
 *
 * Single source of truth for the Phase-4 KPI math. Imported both by:
 *   - the compute-kpis Supabase Edge Function (D-020 draft), which writes
 *     kpi_snapshots rows under the service role, and
 *   - vitest, which asserts against the Almarai Safeway Jubeiha ground-
 *     truth example from the spec.
 *
 * No I/O, no time, no randomness. The caller is responsible for validating
 * the shape of the input (zod at the trust boundary); these functions are
 * defensive against the usual degenerate inputs (zero denominator, missing
 * traffic) by returning null rather than throwing.
 *
 * D-007: the sampling_rate denominator is configured per campaign
 * (kpi_config.sampling_rate_denominator ∈ 'contacts' | 'engaged').
 *
 * Rounding: ratios are rounded to 4 decimals at the output boundary to
 * match the numeric(6,4) column precision in kpi_snapshots.
 */

export const COMPUTATION_VERSION = 1;

export type SamplingDenominator = 'contacts' | 'engaged';

export type SkuBreakdown = {
  sku_id: string;
  samples: number;
  sales: number;
};

export type KpiInput = {
  total_traffic: number | null;
  contacts: number;
  engaged: number;
  samples_total: number;
  sales_total: number;
  skus: ReadonlyArray<SkuBreakdown>;
  sampling_rate_denominator: SamplingDenominator;
};

export type KpiResult = {
  interaction_rate: number | null;
  engagement_rate: number | null;
  sampling_rate: number | null;
  conversion_rate: number | null;
  sample_to_conversion_rate: number | null;
  sku_contributions: Record<string, number>;
  sampling_rate_denominator: SamplingDenominator;
};

const DEFAULT_DENOMINATOR: SamplingDenominator = 'contacts';

function isNonNegativeFiniteInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/**
 * Safe ratio: returns null when the denominator is zero, NaN, infinite, or
 * when either operand is non-finite. Never throws.
 */
export function safeRatio(num: number, denom: number): number | null {
  if (!Number.isFinite(num) || !Number.isFinite(denom)) return null;
  if (denom === 0) return null;
  return num / denom;
}

/**
 * Normalise a sampling-denominator value read from kpi_config JSONB.
 * Unknown / missing values fall back to 'contacts' (the spec default).
 */
export function readSamplingDenominator(kpiConfig: unknown): SamplingDenominator {
  if (kpiConfig && typeof kpiConfig === 'object') {
    const raw = (kpiConfig as Record<string, unknown>).sampling_rate_denominator;
    if (raw === 'engaged' || raw === 'contacts') return raw;
  }
  return DEFAULT_DENOMINATOR;
}

/**
 * Pick the denominator value for sampling_rate, given the input funnel.
 */
function samplingDenominatorValue(input: KpiInput): number {
  return input.sampling_rate_denominator === 'engaged' ? input.engaged : input.contacts;
}

/**
 * Compute KPIs for one daily_report.
 *
 * Degenerate cases return null for the affected ratio rather than 0 —
 * storing 0 would be a lie ("you converted 0% of 0 contacts"); null is
 * "not computable", which UIs can render as "—".
 */
export function computeKpis(input: KpiInput): KpiResult {
  const { total_traffic, contacts, engaged, samples_total, sales_total } = input;

  const traffic = isNonNegativeFiniteInt(total_traffic) ? total_traffic : null;
  const interaction = traffic !== null && traffic > 0 ? safeRatio(contacts, traffic) : null;
  const engagement = contacts > 0 ? safeRatio(engaged, contacts) : null;
  const samplingDenom = samplingDenominatorValue(input);
  const sampling = samplingDenom > 0 ? safeRatio(samples_total, samplingDenom) : null;
  const conversion = contacts > 0 ? safeRatio(sales_total, contacts) : null;
  const sampleToConversion = samples_total > 0 ? safeRatio(sales_total, samples_total) : null;

  const skuContribs: Record<string, number> = {};
  if (sales_total > 0) {
    for (const row of input.skus) {
      if (!row.sku_id) continue;
      const ratio = safeRatio(row.sales, sales_total);
      if (ratio !== null) skuContribs[row.sku_id] = round4(ratio);
    }
  }

  return {
    interaction_rate: interaction === null ? null : round4(interaction),
    engagement_rate: engagement === null ? null : round4(engagement),
    sampling_rate: sampling === null ? null : round4(sampling),
    conversion_rate: conversion === null ? null : round4(conversion),
    sample_to_conversion_rate: sampleToConversion === null ? null : round4(sampleToConversion),
    sku_contributions: skuContribs,
    sampling_rate_denominator: input.sampling_rate_denominator,
  };
}

/**
 * Aggregate multiple KPI snapshots (e.g., for drill-down rollups) into a
 * single rollup. This is weighted by the underlying funnel numbers, NOT a
 * naive average of ratios — averaging ratios is a classic KPI bug
 * (Simpson's paradox).
 *
 * Caller passes the raw funnel totals alongside each snapshot. The result
 * has the same shape as computeKpis().
 */
export type RollupRow = {
  total_traffic: number | null;
  contacts: number;
  engaged: number;
  samples_total: number;
  sales_total: number;
  skus: ReadonlyArray<SkuBreakdown>;
};

export function rollupKpis(
  rows: ReadonlyArray<RollupRow>,
  samplingDenominator: SamplingDenominator,
): KpiResult {
  const agg: KpiInput = {
    total_traffic: 0,
    contacts: 0,
    engaged: 0,
    samples_total: 0,
    sales_total: 0,
    skus: [],
    sampling_rate_denominator: samplingDenominator,
  };

  // total_traffic sums ONLY when every row has a value; otherwise null.
  let anyTrafficMissing = false;
  let trafficSum = 0;
  const skuAgg = new Map<string, { samples: number; sales: number }>();

  for (const row of rows) {
    if (row.total_traffic === null || !isNonNegativeFiniteInt(row.total_traffic)) {
      anyTrafficMissing = true;
    } else {
      trafficSum += row.total_traffic;
    }
    agg.contacts += row.contacts;
    agg.engaged += row.engaged;
    agg.samples_total += row.samples_total;
    agg.sales_total += row.sales_total;
    for (const s of row.skus) {
      const prev = skuAgg.get(s.sku_id) ?? { samples: 0, sales: 0 };
      prev.samples += s.samples;
      prev.sales += s.sales;
      skuAgg.set(s.sku_id, prev);
    }
  }

  const merged: KpiInput = {
    ...agg,
    total_traffic: anyTrafficMissing ? null : trafficSum,
    skus: [...skuAgg.entries()].map(([sku_id, v]) => ({ sku_id, ...v })),
  };

  return computeKpis(merged);
}
