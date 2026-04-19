import { describe, expect, it } from 'vitest';
import {
  COMPUTATION_VERSION,
  computeKpis,
  readSamplingDenominator,
  rollupKpis,
  safeRatio,
  type KpiInput,
  type RollupRow,
} from './compute';

/**
 * Ground truth — Almarai Safeway Jubeiha example from the CE Platform spec.
 *
 * traffic 300, contacts 150, engaged 120, samples 100, sales 70
 *   Laban 40, Greek Yogurt 20, Labneh 10
 *
 * Expected percentages per spec:
 *   Interaction 50%, Engagement 80%, Sampling (denom=contacts) 66.6%,
 *   Conversion 46.6%, Sample-to-Conversion 70%,
 *   Laban 57%, Greek Yogurt 29%, Labneh 14%.
 */
const ALMARAI_INPUT: KpiInput = {
  total_traffic: 300,
  contacts: 150,
  engaged: 120,
  samples_total: 100,
  sales_total: 70,
  skus: [
    { sku_id: 'laban', samples: 0, sales: 40 },
    { sku_id: 'greek-yogurt', samples: 0, sales: 20 },
    { sku_id: 'labneh', samples: 0, sales: 10 },
  ],
  sampling_rate_denominator: 'contacts',
};

describe('computeKpis — Almarai Safeway Jubeiha fixture', () => {
  const out = computeKpis(ALMARAI_INPUT);

  it('interaction_rate = 150/300 = 0.5000', () => {
    expect(out.interaction_rate).toBe(0.5);
  });

  it('engagement_rate = 120/150 = 0.8000', () => {
    expect(out.engagement_rate).toBe(0.8);
  });

  it('sampling_rate (denom=contacts) = 100/150 ≈ 0.6667', () => {
    expect(out.sampling_rate).toBe(0.6667);
  });

  it('conversion_rate = 70/150 ≈ 0.4667', () => {
    expect(out.conversion_rate).toBe(0.4667);
  });

  it('sample_to_conversion_rate = 70/100 = 0.7000', () => {
    expect(out.sample_to_conversion_rate).toBe(0.7);
  });

  it('SKU contributions match spec (Laban 57%, Greek 29%, Labneh 14%)', () => {
    expect(out.sku_contributions).toEqual({
      laban: 0.5714,
      'greek-yogurt': 0.2857,
      labneh: 0.1429,
    });
  });

  it('sums of SKU contributions rounds to ~1.0 (tolerating 4-decimal drift)', () => {
    const total = Object.values(out.sku_contributions).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0.999);
    expect(total).toBeLessThan(1.001);
  });

  it('records which denominator was used', () => {
    expect(out.sampling_rate_denominator).toBe('contacts');
  });
});

describe('computeKpis — sampling denominator = engaged (D-007 alternative)', () => {
  const out = computeKpis({ ...ALMARAI_INPUT, sampling_rate_denominator: 'engaged' });

  it('sampling_rate = 100/120 ≈ 0.8333 when denom=engaged', () => {
    expect(out.sampling_rate).toBe(0.8333);
  });

  it('other KPIs unchanged vs denom=contacts', () => {
    expect(out.interaction_rate).toBe(0.5);
    expect(out.engagement_rate).toBe(0.8);
    expect(out.conversion_rate).toBe(0.4667);
    expect(out.sample_to_conversion_rate).toBe(0.7);
  });
});

describe('computeKpis — degenerate inputs return null, never throw, never invent 0', () => {
  const empty = {
    total_traffic: null,
    contacts: 0,
    engaged: 0,
    samples_total: 0,
    sales_total: 0,
    skus: [] as const,
    sampling_rate_denominator: 'contacts' as const,
  };

  it('empty day → every ratio null, sku_contributions empty', () => {
    const out = computeKpis(empty);
    expect(out.interaction_rate).toBeNull();
    expect(out.engagement_rate).toBeNull();
    expect(out.sampling_rate).toBeNull();
    expect(out.conversion_rate).toBeNull();
    expect(out.sample_to_conversion_rate).toBeNull();
    expect(out.sku_contributions).toEqual({});
  });

  it('traffic = 0 → interaction_rate null (not 0)', () => {
    const out = computeKpis({ ...empty, total_traffic: 0, contacts: 5 });
    expect(out.interaction_rate).toBeNull();
  });

  it('traffic = null → interaction_rate null (contacts without denom known)', () => {
    const out = computeKpis({ ...empty, total_traffic: null, contacts: 10 });
    expect(out.interaction_rate).toBeNull();
  });

  it('contacts = 0 → engagement/sampling(contacts)/conversion all null', () => {
    const out = computeKpis({
      ...empty,
      total_traffic: 100,
      contacts: 0,
      engaged: 0,
      samples_total: 5,
      sales_total: 2,
    });
    expect(out.engagement_rate).toBeNull();
    expect(out.sampling_rate).toBeNull();
    expect(out.conversion_rate).toBeNull();
  });

  it('samples = 0 → sample_to_conversion_rate null', () => {
    const out = computeKpis({
      ...empty,
      contacts: 10,
      engaged: 5,
      samples_total: 0,
      sales_total: 3,
    });
    expect(out.sample_to_conversion_rate).toBeNull();
  });

  it('sales = 0 → sku_contributions is {} (no div-by-zero in map)', () => {
    const out = computeKpis({
      ...empty,
      contacts: 10,
      samples_total: 4,
      sales_total: 0,
      skus: [{ sku_id: 'a', samples: 2, sales: 0 }],
    });
    expect(out.sku_contributions).toEqual({});
  });

  it('single SKU with all sales → contribution 1.0', () => {
    const out = computeKpis({
      ...empty,
      contacts: 10,
      sales_total: 5,
      skus: [{ sku_id: 'only', samples: 0, sales: 5 }],
    });
    expect(out.sku_contributions).toEqual({ only: 1 });
  });
});

describe('safeRatio', () => {
  it('returns null on zero denominator', () => {
    expect(safeRatio(5, 0)).toBeNull();
  });
  it('returns null on NaN / Infinity', () => {
    expect(safeRatio(Number.NaN, 5)).toBeNull();
    expect(safeRatio(5, Number.POSITIVE_INFINITY)).toBeNull();
  });
  it('computes a positive ratio normally', () => {
    expect(safeRatio(3, 4)).toBe(0.75);
  });
});

describe('readSamplingDenominator', () => {
  it('defaults to "contacts" when config missing or malformed', () => {
    expect(readSamplingDenominator(null)).toBe('contacts');
    expect(readSamplingDenominator(undefined)).toBe('contacts');
    expect(readSamplingDenominator({})).toBe('contacts');
    expect(readSamplingDenominator({ sampling_rate_denominator: 'lol' })).toBe('contacts');
    expect(readSamplingDenominator({ sampling_rate_denominator: 42 })).toBe('contacts');
  });
  it('honours "engaged" when explicitly set', () => {
    expect(readSamplingDenominator({ sampling_rate_denominator: 'engaged' })).toBe('engaged');
  });
  it('honours "contacts" when explicitly set', () => {
    expect(readSamplingDenominator({ sampling_rate_denominator: 'contacts' })).toBe('contacts');
  });
});

describe('rollupKpis — weighted aggregation (not a mean of ratios)', () => {
  it('matches single-row output when only one row is rolled up', () => {
    const solo = rollupKpis(
      [
        {
          total_traffic: ALMARAI_INPUT.total_traffic,
          contacts: ALMARAI_INPUT.contacts,
          engaged: ALMARAI_INPUT.engaged,
          samples_total: ALMARAI_INPUT.samples_total,
          sales_total: ALMARAI_INPUT.sales_total,
          skus: ALMARAI_INPUT.skus,
        },
      ],
      'contacts',
    );
    const direct = computeKpis(ALMARAI_INPUT);
    expect(solo).toEqual(direct);
  });

  it('weights by underlying funnel — two identical rows = one doubled row', () => {
    const row: RollupRow = {
      total_traffic: 300,
      contacts: 150,
      engaged: 120,
      samples_total: 100,
      sales_total: 70,
      skus: ALMARAI_INPUT.skus,
    };
    const rolled = rollupKpis([row, row], 'contacts');
    // Same ratios because weights scale equally.
    expect(rolled.interaction_rate).toBe(0.5);
    expect(rolled.engagement_rate).toBe(0.8);
    expect(rolled.conversion_rate).toBe(0.4667);
  });

  it('returns null traffic when any row has null traffic', () => {
    const a: RollupRow = {
      total_traffic: 100,
      contacts: 50,
      engaged: 40,
      samples_total: 10,
      sales_total: 5,
      skus: [],
    };
    const b: RollupRow = {
      total_traffic: null,
      contacts: 20,
      engaged: 10,
      samples_total: 3,
      sales_total: 1,
      skus: [],
    };
    const rolled = rollupKpis([a, b], 'contacts');
    expect(rolled.interaction_rate).toBeNull();
    // engagement still computable: 50/(50+20) → (40+10)/(50+20) = 50/70
    expect(rolled.engagement_rate).toBe(0.7143);
  });

  it('merges SKU breakdowns by id', () => {
    const a: RollupRow = {
      total_traffic: 100,
      contacts: 50,
      engaged: 25,
      samples_total: 10,
      sales_total: 10,
      skus: [
        { sku_id: 'laban', samples: 5, sales: 8 },
        { sku_id: 'labneh', samples: 5, sales: 2 },
      ],
    };
    const b: RollupRow = {
      total_traffic: 100,
      contacts: 50,
      engaged: 25,
      samples_total: 10,
      sales_total: 10,
      skus: [
        { sku_id: 'laban', samples: 2, sales: 2 },
        { sku_id: 'greek-yogurt', samples: 8, sales: 8 },
      ],
    };
    const rolled = rollupKpis([a, b], 'contacts');
    // Laban: (8+2)/20 = 0.5, Labneh: 2/20 = 0.1, Greek: 8/20 = 0.4
    expect(rolled.sku_contributions).toEqual({
      laban: 0.5,
      labneh: 0.1,
      'greek-yogurt': 0.4,
    });
  });
});

describe('COMPUTATION_VERSION', () => {
  it('is a positive integer — bump when KPI math changes', () => {
    expect(Number.isInteger(COMPUTATION_VERSION)).toBe(true);
    expect(COMPUTATION_VERSION).toBeGreaterThan(0);
  });
});
