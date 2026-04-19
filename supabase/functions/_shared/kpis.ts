// Slim copy of lib/kpis/compute.ts for Deno Edge Functions.
// Used by the compute-kpis function.
// Update BOTH files together when the KPI math changes.
// lib/kpis/compute.test.ts is the source-of-truth test.

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

function isNonNegativeFiniteInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

function safeRatio(num: number, denom: number): number | null {
  if (!Number.isFinite(num) || !Number.isFinite(denom)) return null;
  if (denom === 0) return null;
  return num / denom;
}

export function readSamplingDenominator(kpiConfig: unknown): SamplingDenominator {
  if (kpiConfig && typeof kpiConfig === 'object') {
    const raw = (kpiConfig as Record<string, unknown>).sampling_rate_denominator;
    if (raw === 'engaged' || raw === 'contacts') return raw;
  }
  return 'contacts';
}

export function computeKpis(input: KpiInput): KpiResult {
  const { total_traffic, contacts, engaged, samples_total, sales_total } = input;
  const traffic = isNonNegativeFiniteInt(total_traffic) ? total_traffic : null;
  const interaction = traffic !== null && traffic > 0 ? safeRatio(contacts, traffic) : null;
  const engagement = contacts > 0 ? safeRatio(engaged, contacts) : null;
  const samplingDenom = input.sampling_rate_denominator === 'engaged' ? engaged : contacts;
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
