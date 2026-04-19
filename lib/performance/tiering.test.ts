import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TIER_THRESHOLDS,
  assignTier,
  pickTierMetricValue,
  rankWithinScope,
  readTierConfig,
  tierDistribution,
} from './tiering';

/**
 * Ground truth — Almarai spec Section 7 example.
 *
 * Safeway Khalda: conversion = 65% → Top
 * Shini:          conversion = 20% → Low
 *
 * Defaults: tier_high = 0.50, tier_medium = 0.30, tier_metric = conversion_rate.
 */
describe('Spec Section 7 — Safeway Khalda vs Shini', () => {
  const cfg = DEFAULT_TIER_THRESHOLDS;

  it('Safeway Khalda 65% conversion → Top', () => {
    expect(assignTier(0.65, cfg)).toBe('top');
  });

  it('Shini 20% conversion → Low', () => {
    expect(assignTier(0.2, cfg)).toBe('low');
  });

  it('ranks Khalda above Shini and highlights top performer', () => {
    const rows = [
      { name: 'Shini', conversion_rate: 0.2 },
      { name: 'Safeway Khalda', conversion_rate: 0.65 },
    ];
    const ranked = rankWithinScope(rows, 'conversion_rate');
    expect(ranked.map((r) => r.name)).toEqual(['Safeway Khalda', 'Shini']);
    expect(ranked[0]!.rank_in_scope).toBe(1);
    expect(ranked[1]!.rank_in_scope).toBe(2);
    expect(ranked[0]!.scope_size).toBe(2);
  });
});

describe('assignTier — boundary policy', () => {
  const cfg = { tier_high: 0.5, tier_medium: 0.3 };

  it('exactly at tier_high → top (inclusive)', () => {
    expect(assignTier(0.5, cfg)).toBe('top');
  });

  it('exactly at tier_medium → medium (inclusive)', () => {
    expect(assignTier(0.3, cfg)).toBe('medium');
  });

  it('just below tier_medium → low', () => {
    expect(assignTier(0.2999, cfg)).toBe('low');
  });

  it('zero → low', () => {
    expect(assignTier(0, cfg)).toBe('low');
  });

  it('null → null (not classifiable)', () => {
    expect(assignTier(null, cfg)).toBeNull();
  });

  it('NaN / Infinity → null (defensive)', () => {
    expect(assignTier(Number.NaN, cfg)).toBeNull();
    expect(assignTier(Number.POSITIVE_INFINITY, cfg)).toBeNull();
  });
});

describe('readTierConfig — soft-add defaults from kpi_config', () => {
  it('missing kpi_config → defaults', () => {
    expect(readTierConfig(null)).toEqual(DEFAULT_TIER_THRESHOLDS);
    expect(readTierConfig(undefined)).toEqual(DEFAULT_TIER_THRESHOLDS);
    expect(readTierConfig({})).toEqual(DEFAULT_TIER_THRESHOLDS);
  });

  it('valid overrides win', () => {
    expect(
      readTierConfig({ tier_high: 0.7, tier_medium: 0.4, tier_metric: 'engagement_rate' }),
    ).toEqual({ tier_high: 0.7, tier_medium: 0.4, tier_metric: 'engagement_rate' });
  });

  it('out-of-range values fall back to defaults per field', () => {
    const cfg = readTierConfig({ tier_high: 1.5, tier_medium: -1, tier_metric: 'bogus' });
    expect(cfg).toEqual(DEFAULT_TIER_THRESHOLDS);
  });

  it('inverted thresholds (high < medium) → fall back to defaults', () => {
    const cfg = readTierConfig({ tier_high: 0.2, tier_medium: 0.5 });
    expect(cfg.tier_high).toBe(DEFAULT_TIER_THRESHOLDS.tier_high);
    expect(cfg.tier_medium).toBe(DEFAULT_TIER_THRESHOLDS.tier_medium);
  });

  it('unknown tier_metric → falls back to default metric', () => {
    expect(readTierConfig({ tier_metric: 'cost_per_sample' }).tier_metric).toBe(
      'conversion_rate',
    );
  });
});

describe('rankWithinScope — dense-rank desc, nulls last', () => {
  it('orders rows by descending metric', () => {
    const rows = [
      { id: 'a', conversion_rate: 0.2 },
      { id: 'b', conversion_rate: 0.6 },
      { id: 'c', conversion_rate: 0.4 },
    ];
    const ranked = rankWithinScope(rows, 'conversion_rate');
    expect(ranked.map((r) => r.id)).toEqual(['b', 'c', 'a']);
    expect(ranked.map((r) => r.rank_in_scope)).toEqual([1, 2, 3]);
  });

  it('ties share a rank and the next rank skips (competition ranking)', () => {
    const rows = [
      { id: 'a', conversion_rate: 0.5 },
      { id: 'b', conversion_rate: 0.5 },
      { id: 'c', conversion_rate: 0.4 },
    ];
    const ranked = rankWithinScope(rows, 'conversion_rate');
    expect(ranked.find((r) => r.id === 'a')?.rank_in_scope).toBe(1);
    expect(ranked.find((r) => r.id === 'b')?.rank_in_scope).toBe(1);
    expect(ranked.find((r) => r.id === 'c')?.rank_in_scope).toBe(3);
  });

  it('null metric → unranked, sorted to end, scope_size excludes nulls', () => {
    const rows = [
      { id: 'a', conversion_rate: 0.6 },
      { id: 'b', conversion_rate: null },
      { id: 'c', conversion_rate: 0.3 },
    ];
    const ranked = rankWithinScope(rows, 'conversion_rate');
    expect(ranked.map((r) => r.id)).toEqual(['a', 'c', 'b']);
    expect(ranked.find((r) => r.id === 'b')?.rank_in_scope).toBeNull();
    expect(ranked[0]!.scope_size).toBe(2);
  });

  it('empty scope → empty result', () => {
    expect(rankWithinScope([], 'conversion_rate')).toEqual([]);
  });
});

describe('pickTierMetricValue', () => {
  it('returns the requested numeric column', () => {
    expect(
      pickTierMetricValue(
        { conversion_rate: 0.4, engagement_rate: 0.8 },
        'engagement_rate',
      ),
    ).toBe(0.8);
  });

  it('null / undefined / non-numeric → null', () => {
    expect(pickTierMetricValue({ conversion_rate: null }, 'conversion_rate')).toBeNull();
    expect(pickTierMetricValue({}, 'conversion_rate')).toBeNull();
  });
});

describe('tierDistribution', () => {
  it('counts each tier separately, includes unclassified', () => {
    const rows = [
      { tier: 'top' as const },
      { tier: 'top' as const },
      { tier: 'medium' as const },
      { tier: 'low' as const },
      { tier: null },
    ];
    expect(tierDistribution(rows)).toEqual({
      top: 2,
      medium: 1,
      low: 1,
      unclassified: 1,
      total: 5,
    });
  });
});
