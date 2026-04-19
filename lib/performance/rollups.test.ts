import { describe, expect, it } from 'vitest';
import { DEFAULT_TIER_THRESHOLDS } from './tiering';
import {
  campaignToDatePeriod,
  dailyPeriod,
  rollupCampaign,
  rollupLocation,
  rollupPromoter,
  weeklyPeriod,
  type SourceReport,
} from './rollups';

const KHALDA = 'loc-safeway-khalda';
const SHINI = 'loc-shini';
const COZMO = 'loc-cozmo';
const CAMPAIGN = 'cmp-almarai';

function r(args: Partial<SourceReport> & Pick<SourceReport, 'location_id' | 'promoter_user_id'>): SourceReport {
  return {
    daily_report_id: `dr-${Math.random().toString(36).slice(2, 8)}`,
    campaign_id: CAMPAIGN,
    report_date: '2026-04-19',
    total_traffic: 100,
    contacts: 100,
    engaged: 80,
    samples_total: 50,
    sales_total: 0,
    skus: [],
    ...args,
  };
}

describe('Section 7 — Almarai 3-location integration (Safeway Khalda Top, Shini Low)', () => {
  // Safeway Khalda: 100 contacts, 65 sales → 65% conversion → Top
  // Shini:         100 contacts, 20 sales → 20% conversion → Low
  // Cozmo (third location for ranking realism): 100 contacts, 40 sales → 40% → Medium
  const reports: SourceReport[] = [
    r({ location_id: KHALDA, promoter_user_id: 'p-khalda', sales_total: 65 }),
    r({ location_id: SHINI, promoter_user_id: 'p-shini', sales_total: 20 }),
    r({ location_id: COZMO, promoter_user_id: 'p-cozmo', sales_total: 40 }),
  ];

  const base = {
    campaign_id: CAMPAIGN,
    period_kind: 'daily' as const,
    period_start: '2026-04-19',
    period_end: '2026-04-19',
    reports,
    sampling_denominator: 'contacts' as const,
    tier: DEFAULT_TIER_THRESHOLDS,
  };

  it('location rollup tiers Khalda Top, Cozmo Medium, Shini Low', () => {
    const rolled = rollupLocation(base);
    const byId = new Map(rolled.map((x) => [x.scope_id, x]));
    expect(byId.get(KHALDA)?.tier).toBe('top');
    expect(byId.get(KHALDA)?.conversion_rate).toBe(0.65);
    expect(byId.get(SHINI)?.tier).toBe('low');
    expect(byId.get(SHINI)?.conversion_rate).toBe(0.2);
    expect(byId.get(COZMO)?.tier).toBe('medium');
    expect(byId.get(COZMO)?.conversion_rate).toBe(0.4);
  });

  it('Khalda ranks #1 of 3, Cozmo #2, Shini #3', () => {
    const rolled = rollupLocation(base);
    const byId = new Map(rolled.map((x) => [x.scope_id, x]));
    expect(byId.get(KHALDA)?.rank_in_scope).toBe(1);
    expect(byId.get(COZMO)?.rank_in_scope).toBe(2);
    expect(byId.get(SHINI)?.rank_in_scope).toBe(3);
    expect(byId.get(KHALDA)?.scope_size).toBe(3);
  });

  it('promoter rollup mirrors location rollup (one promoter per location)', () => {
    const rolled = rollupPromoter(base);
    const byId = new Map(rolled.map((x) => [x.scope_id, x]));
    expect(byId.get('p-khalda')?.tier).toBe('top');
    expect(byId.get('p-shini')?.tier).toBe('low');
  });

  it('campaign rollup totals the funnel (300 contacts, 125 sales) and ranks 1 of 1', () => {
    const rolled = rollupCampaign(base);
    expect(rolled).toHaveLength(1);
    const c = rolled[0]!;
    expect(c.scope_id).toBe(CAMPAIGN);
    expect(c.contacts).toBe(300);
    expect(c.sales_total).toBe(125);
    expect(c.conversion_rate).toBeCloseTo(125 / 300, 4);
    expect(c.rank_in_scope).toBe(1);
    expect(c.scope_size).toBe(1);
  });
});

describe('rollupByScope — multiple reports per scope are aggregated', () => {
  it('a promoter who works two reports has them summed (not averaged)', () => {
    const reports: SourceReport[] = [
      r({ location_id: KHALDA, promoter_user_id: 'p1', contacts: 50, sales_total: 30 }),
      r({ location_id: KHALDA, promoter_user_id: 'p1', contacts: 50, sales_total: 35 }),
    ];
    const rolled = rollupPromoter({
      campaign_id: CAMPAIGN,
      period_kind: 'weekly',
      period_start: '2026-04-13',
      period_end: '2026-04-19',
      reports,
      sampling_denominator: 'contacts',
      tier: DEFAULT_TIER_THRESHOLDS,
    });
    expect(rolled).toHaveLength(1);
    expect(rolled[0]!.contacts).toBe(100);
    expect(rolled[0]!.sales_total).toBe(65);
    expect(rolled[0]!.conversion_rate).toBe(0.65); // weighted, not averaged
    expect(rolled[0]!.reports_count).toBe(2);
  });

  it('reports for other campaigns are filtered out', () => {
    const reports: SourceReport[] = [
      r({ location_id: KHALDA, promoter_user_id: 'p1', sales_total: 65 }),
      r({
        location_id: KHALDA,
        promoter_user_id: 'p1',
        campaign_id: 'cmp-other',
        sales_total: 10,
      }),
    ];
    const rolled = rollupPromoter({
      campaign_id: CAMPAIGN,
      period_kind: 'daily',
      period_start: '2026-04-19',
      period_end: '2026-04-19',
      reports,
      sampling_denominator: 'contacts',
      tier: DEFAULT_TIER_THRESHOLDS,
    });
    expect(rolled).toHaveLength(1);
    expect(rolled[0]!.sales_total).toBe(65);
  });

  it('any missing total_traffic propagates null at the rollup', () => {
    const reports: SourceReport[] = [
      r({ location_id: KHALDA, promoter_user_id: 'p1', total_traffic: 100, sales_total: 50 }),
      r({ location_id: KHALDA, promoter_user_id: 'p1', total_traffic: null, sales_total: 20 }),
    ];
    const rolled = rollupPromoter({
      campaign_id: CAMPAIGN,
      period_kind: 'daily',
      period_start: '2026-04-19',
      period_end: '2026-04-19',
      reports,
      sampling_denominator: 'contacts',
      tier: DEFAULT_TIER_THRESHOLDS,
    });
    expect(rolled[0]!.total_traffic).toBeNull();
    expect(rolled[0]!.interaction_rate).toBeNull();
  });
});

describe('period helpers', () => {
  it('dailyPeriod is identity', () => {
    expect(dailyPeriod('2026-04-19')).toEqual({
      period_start: '2026-04-19',
      period_end: '2026-04-19',
    });
  });

  it('weeklyPeriod produces Mon..Sun for any day in the week', () => {
    // 2026-04-19 is a Sunday (UTC). Week is 2026-04-13 (Mon) .. 2026-04-19 (Sun).
    expect(weeklyPeriod('2026-04-19')).toEqual({
      period_start: '2026-04-13',
      period_end: '2026-04-19',
    });
    expect(weeklyPeriod('2026-04-13')).toEqual({
      period_start: '2026-04-13',
      period_end: '2026-04-19',
    });
    expect(weeklyPeriod('2026-04-15')).toEqual({
      period_start: '2026-04-13',
      period_end: '2026-04-19',
    });
  });

  it('campaignToDatePeriod clamps to campaign end_date', () => {
    expect(campaignToDatePeriod('2026-04-01', '2026-04-19', '2026-04-10')).toEqual({
      period_start: '2026-04-01',
      period_end: '2026-04-10',
    });
    expect(campaignToDatePeriod('2026-04-01', '2026-04-19', null)).toEqual({
      period_start: '2026-04-01',
      period_end: '2026-04-19',
    });
    expect(campaignToDatePeriod('2026-04-01', '2026-04-05', '2026-04-30')).toEqual({
      period_start: '2026-04-01',
      period_end: '2026-04-05',
    });
  });
});
