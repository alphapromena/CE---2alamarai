import { describe, expect, it } from 'vitest';
import {
  buildActivitySheets,
  buildAllSheets,
  buildAttendanceSheets,
  buildFeedbackSheets,
  buildPerformanceSheets,
  buildStockSheets,
  buildSupervisorActionsSheets,
} from './builders';
import type {
  AttendanceRaw,
  DailyReportRaw,
  ExportInput,
  FeedbackRaw,
  PerformanceRaw,
  SalesEntryRaw,
  StockMovementRaw,
  SupervisorVisitRaw,
} from './types';

// ---------------------------------------------------------------------------
// Fixtures — Almarai Safeway mini-scenario (D-020 reference).
// ---------------------------------------------------------------------------
const CAMP = { id: 'c1', name: { ar: 'ألبان', en: 'Almarai Dairy' } };
const LOC_A = { id: 'l1', name: { ar: 'صفوي الجبيهة', en: 'Safeway Jubeiha' } };
const LOC_B = { id: 'l2', name: { ar: 'سيتي سنتر', en: 'C-Town' } };

const attendance: AttendanceRaw[] = [
  {
    id: 'a1',
    promoter_user_id: 'p1',
    promoter_name: 'Ahmed',
    campaign_id: CAMP.id,
    campaign_name: CAMP.name,
    location_id: LOC_A.id,
    location_name: LOC_A.name,
    check_in_ts: '2026-04-18T08:00:00.000Z',
    check_out_ts: '2026-04-18T16:00:00.000Z',
    status: 'on_time',
    check_in_distance_m: 0,
    check_out_distance_m: 0,
    late_minutes: 0,
  },
  {
    id: 'a2',
    promoter_user_id: 'p2',
    promoter_name: 'Sara',
    campaign_id: CAMP.id,
    campaign_name: CAMP.name,
    location_id: LOC_A.id,
    location_name: LOC_A.name,
    check_in_ts: '2026-04-18T08:30:00.000Z',
    check_out_ts: null,
    status: 'late',
    check_in_distance_m: 80,
    check_out_distance_m: null,
    late_minutes: 30,
  },
  {
    id: 'a3',
    promoter_user_id: 'p3',
    promoter_name: 'Laila',
    campaign_id: CAMP.id,
    campaign_name: CAMP.name,
    location_id: LOC_B.id,
    location_name: LOC_B.name,
    check_in_ts: '2026-04-18T09:00:00.000Z',
    check_out_ts: '2026-04-18T17:00:00.000Z',
    status: 'on_time',
    check_in_distance_m: 0,
    check_out_distance_m: 0,
    late_minutes: 0,
  },
];

const reports: DailyReportRaw[] = [
  {
    id: 'r1',
    report_date: '2026-04-18',
    promoter_user_id: 'p1',
    promoter_name: 'Ahmed',
    campaign_id: CAMP.id,
    campaign_name: CAMP.name,
    location_id: LOC_A.id,
    location_name: LOC_A.name,
    status: 'approved',
    contacts: 80,
    engaged: 64,
    samples_total: 53,
    sales_total: 30,
    total_traffic: 100,
    interaction_rate: 0.8,
    engagement_rate: 0.8,
    sampling_rate: 0.6625,
    conversion_rate: 0.469,
  },
  {
    id: 'r2',
    report_date: '2026-04-18',
    promoter_user_id: 'p3',
    promoter_name: 'Laila',
    campaign_id: CAMP.id,
    campaign_name: CAMP.name,
    location_id: LOC_B.id,
    location_name: LOC_B.name,
    status: 'submitted',
    contacts: 50,
    engaged: 30,
    samples_total: 20,
    sales_total: 10,
    total_traffic: 80,
    interaction_rate: 0.625,
    engagement_rate: 0.6,
    sampling_rate: 0.4,
    conversion_rate: 0.333,
  },
];

const salesEntries: SalesEntryRaw[] = [
  { daily_report_id: 'r1', sku_id: 's1', sku_name: { ar: 'لبن', en: 'Yogurt' }, samples: 30, sales: 18 },
  { daily_report_id: 'r1', sku_id: 's2', sku_name: { ar: 'حليب', en: 'Milk' }, samples: 15, sales: 8 },
  { daily_report_id: 'r2', sku_id: 's1', sku_name: { ar: 'لبن', en: 'Yogurt' }, samples: 12, sales: 6 },
];

const stock: StockMovementRaw[] = [
  {
    id: 'm1',
    created_at: '2026-04-18T07:00:00.000Z',
    campaign_id: CAMP.id,
    campaign_name: CAMP.name,
    sku_id: 's1',
    sku_name: { ar: 'لبن', en: 'Yogurt' },
    movement_kind: 'allocation',
    from_entity_type: 'warehouse',
    from_entity_id: null,
    to_entity_type: 'supervisor',
    to_entity_id: 'sup1',
    quantity: 200,
    reason: null,
  },
  {
    id: 'm2',
    created_at: '2026-04-18T07:30:00.000Z',
    campaign_id: CAMP.id,
    campaign_name: CAMP.name,
    sku_id: 's1',
    sku_name: { ar: 'لبن', en: 'Yogurt' },
    movement_kind: 'distribution',
    from_entity_type: 'supervisor',
    from_entity_id: 'sup1',
    to_entity_type: 'promoter',
    to_entity_id: 'p1',
    quantity: 100,
    reason: null,
  },
  {
    id: 'm3',
    created_at: '2026-04-18T17:00:00.000Z',
    campaign_id: CAMP.id,
    campaign_name: CAMP.name,
    sku_id: 's1',
    sku_name: { ar: 'لبن', en: 'Yogurt' },
    movement_kind: 'usage',
    from_entity_type: 'promoter',
    from_entity_id: 'p1',
    to_entity_type: 'consumer',
    to_entity_id: null,
    quantity: 53,
    reason: null,
  },
];

const performance: PerformanceRaw[] = [
  {
    scope_kind: 'campaign',
    scope_id: CAMP.id,
    scope_name: 'Almarai Dairy',
    campaign_id: CAMP.id,
    campaign_name: CAMP.name,
    period_kind: 'daily',
    period_start: '2026-04-18',
    period_end: '2026-04-18',
    contacts: 130,
    engaged: 94,
    samples_total: 73,
    sales_total: 40,
    interaction_rate: 0.722,
    engagement_rate: 0.723,
    sampling_rate: 0.562,
    conversion_rate: 0.425,
    tier: 'top',
    rank: 1,
  },
  {
    scope_kind: 'promoter',
    scope_id: 'p1',
    scope_name: 'Ahmed',
    campaign_id: CAMP.id,
    campaign_name: CAMP.name,
    period_kind: 'daily',
    period_start: '2026-04-18',
    period_end: '2026-04-18',
    contacts: 80,
    engaged: 64,
    samples_total: 53,
    sales_total: 30,
    interaction_rate: 0.8,
    engagement_rate: 0.8,
    sampling_rate: 0.6625,
    conversion_rate: 0.469,
    tier: 'top',
    rank: 1,
  },
];

const visits: SupervisorVisitRaw[] = [
  {
    id: 'v1',
    created_at: '2026-04-18T11:00:00.000Z',
    supervisor_user_id: 'sup1',
    supervisor_name: 'Mohamed',
    campaign_id: CAMP.id,
    campaign_name: CAMP.name,
    location_id: LOC_A.id,
    location_name: LOC_A.name,
    distance_m: 0,
    notes: 'All clear',
  },
];

const feedback: FeedbackRaw[] = [
  {
    id: 'f1',
    created_at: '2026-04-18T10:00:00.000Z',
    campaign_id: CAMP.id,
    campaign_name: CAMP.name,
    location_id: LOC_A.id,
    location_name: LOC_A.name,
    promoter_user_id: 'p1',
    promoter_name: 'Ahmed',
    category: 'product',
    sentiment: 'positive',
    body: 'Tasty',
    competitor_brands: ['Nadec'],
  },
  {
    id: 'f2',
    created_at: '2026-04-18T12:00:00.000Z',
    campaign_id: CAMP.id,
    campaign_name: CAMP.name,
    location_id: LOC_A.id,
    location_name: LOC_A.name,
    promoter_user_id: 'p2',
    promoter_name: 'Sara',
    category: 'product',
    sentiment: 'positive',
    body: 'Nice texture',
    competitor_brands: [],
  },
  {
    id: 'f3',
    created_at: '2026-04-18T13:00:00.000Z',
    campaign_id: CAMP.id,
    campaign_name: CAMP.name,
    location_id: LOC_A.id,
    location_name: LOC_A.name,
    promoter_user_id: 'p2',
    promoter_name: 'Sara',
    category: 'complaint',
    sentiment: 'negative',
    body: 'Too cold',
    competitor_brands: [],
  },
];

// ---------------------------------------------------------------------------
describe('buildAttendanceSheets', () => {
  it('admin/supervisor → raw rows with promoter names', () => {
    const sheets = buildAttendanceSheets(attendance, 'admin', 'en');
    expect(sheets).toHaveLength(1);
    const s = sheets[0];
    expect(s?.name).toBe('Attendance');
    expect(s?.rows).toHaveLength(3);
    expect(s?.columns).toContain('Promoter');
    expect(s?.rows[0]?.[3]).toBe('Ahmed');
  });

  it('client → aggregate sheet with no promoter names', () => {
    const sheets = buildAttendanceSheets(attendance, 'client', 'en');
    expect(sheets).toHaveLength(1);
    const s = sheets[0];
    expect(s?.columns).not.toContain('Promoter');
    // (campaign, location_a, date) + (campaign, location_b, date) → 2 rows
    expect(s?.rows).toHaveLength(2);
    // Safeway Jubeiha has 2 attendance rows (on_time + late, one with
    // geofence distance 80m).
    const jub = s?.rows.find((r) => r[2] === 'Safeway Jubeiha');
    expect(jub?.[3]).toBe(2); // total
    expect(jub?.[4]).toBe(1); // on_time
    expect(jub?.[5]).toBe(1); // late
    expect(jub?.[8]).toBe(1); // geofence violations
  });

  it('empty input → no sheets', () => {
    expect(buildAttendanceSheets([], 'admin', 'en')).toHaveLength(0);
    expect(buildAttendanceSheets([], 'client', 'en')).toHaveLength(0);
  });
});

describe('buildActivitySheets', () => {
  it('admin → 2 raw sheets (reports + sales)', () => {
    const sheets = buildActivitySheets(reports, salesEntries, 'admin', 'en');
    expect(sheets).toHaveLength(2);
    expect(sheets[0]?.name).toBe('Daily reports');
    expect(sheets[1]?.name).toBe('Sales entries');
    expect(sheets[0]?.rows).toHaveLength(2);
    expect(sheets[1]?.rows).toHaveLength(3);
  });

  it('client → 2 aggregate sheets with summed KPIs', () => {
    const sheets = buildActivitySheets(reports, salesEntries, 'client', 'en');
    expect(sheets).toHaveLength(2);
    const byCampaign = sheets[0];
    expect(byCampaign?.name).toBe('Activity by campaign');
    // One campaign → one row.
    expect(byCampaign?.rows).toHaveLength(1);
    const row = byCampaign?.rows[0];
    // Reports = 2, traffic = 180, contacts = 130, engaged = 94, samples = 73, sales = 40
    expect(row?.[1]).toBe(2);
    expect(row?.[2]).toBe(180);
    expect(row?.[3]).toBe(130);
    expect(row?.[4]).toBe(94);
    expect(row?.[5]).toBe(73);
    expect(row?.[6]).toBe(40);
    // Interaction rate = 130/180 ≈ 0.7222
    expect(row?.[7]).toBeCloseTo(0.7222, 4);
    // Engagement rate = 94/130 ≈ 0.7231
    expect(row?.[8]).toBeCloseTo(0.7231, 4);
    // Conversion = 40/94 ≈ 0.4255
    expect(row?.[9]).toBeCloseTo(0.4255, 4);

    const bySku = sheets[1];
    expect(bySku?.name).toBe('Activity by SKU');
    // Milk = 1 entry (15 samples, 8 sales); Yogurt = 2 entries (30+12=42 samples, 18+6=24 sales)
    const yogurt = bySku?.rows.find((r) => r[0] === 'Yogurt');
    expect(yogurt?.[1]).toBe(42);
    expect(yogurt?.[2]).toBe(24);
    const milk = bySku?.rows.find((r) => r[0] === 'Milk');
    expect(milk?.[1]).toBe(15);
    expect(milk?.[2]).toBe(8);
  });
});

describe('buildStockSheets', () => {
  it('admin → raw movements sheet', () => {
    const sheets = buildStockSheets(stock, 'admin', 'en');
    expect(sheets[0]?.name).toBe('Stock movements');
    expect(sheets[0]?.rows).toHaveLength(3);
  });

  it('client → per-SKU aggregate: allocated / distributed / used', () => {
    const sheets = buildStockSheets(stock, 'client', 'en');
    expect(sheets[0]?.name).toBe('Stock by SKU');
    const row = sheets[0]?.rows[0];
    expect(row?.[1]).toBe('Yogurt');
    expect(row?.[2]).toBe(200); // allocated
    expect(row?.[3]).toBe(100); // distributed (supervisor → promoter)
    expect(row?.[4]).toBe(53); // used
  });
});

describe('buildPerformanceSheets', () => {
  it('admin → all scopes included', () => {
    const sheets = buildPerformanceSheets(performance, 'admin', 'en');
    expect(sheets[0]?.rows).toHaveLength(2);
  });

  it('client → campaign-scope rows only (D-028 / D-033)', () => {
    const sheets = buildPerformanceSheets(performance, 'client', 'en');
    expect(sheets[0]?.rows).toHaveLength(1);
    expect(sheets[0]?.rows[0]?.[0]).toBe('campaign');
  });
});

describe('buildSupervisorActionsSheets', () => {
  it('admin/supervisor → visits sheet', () => {
    const sheets = buildSupervisorActionsSheets(visits, 'admin', 'en');
    expect(sheets[0]?.name).toBe('Supervisor visits');
  });

  it('client → no sheet (D-033)', () => {
    const sheets = buildSupervisorActionsSheets(visits, 'client', 'en');
    expect(sheets).toHaveLength(0);
  });
});

describe('buildFeedbackSheets', () => {
  it('admin → raw feedback sheet with body + competitors', () => {
    const sheets = buildFeedbackSheets(feedback, 'admin', 'en');
    expect(sheets[0]?.name).toBe('Feedback');
    expect(sheets[0]?.rows).toHaveLength(3);
    // Competitor column joins brand names.
    const ahmedRow = sheets[0]?.rows.find((r) => r[3] === 'Ahmed');
    expect(ahmedRow?.[7]).toBe('Nadec');
  });

  it('client → aggregate counts by (campaign, category, sentiment); no body text', () => {
    const sheets = buildFeedbackSheets(feedback, 'client', 'en');
    const s = sheets[0];
    expect(s?.columns).not.toContain('Body');
    expect(s?.columns).not.toContain('Competitors');
    // 2 positive product + 1 negative complaint = 2 buckets
    expect(s?.rows).toHaveLength(2);
    const positive = s?.rows.find((r) => r[2] === 'positive');
    expect(positive?.[3]).toBe(2);
    const negative = s?.rows.find((r) => r[2] === 'negative');
    expect(negative?.[3]).toBe(1);
  });
});

describe('buildAllSheets (orchestrator)', () => {
  it('selects only the domains requested', () => {
    const input: ExportInput = {
      role: 'admin',
      locale: 'en',
      scope: {
        campaign_ids: [],
        location_ids: [],
        sku_ids: [],
        from_date: '2026-04-18',
        to_date: '2026-04-18',
        domains: ['attendance', 'feedback'],
      },
      attendance,
      daily_reports: reports,
      sales_entries: salesEntries,
      stock,
      performance,
      supervisor_visits: visits,
      feedback,
    };
    const sheets = buildAllSheets(input);
    // attendance: 1, feedback: 1 — total 2.
    expect(sheets.map((s) => s.name)).toEqual(['Attendance', 'Feedback']);
  });

  it('client role shapes all domains as aggregates and omits supervisor_actions', () => {
    const input: ExportInput = {
      role: 'client',
      locale: 'en',
      scope: {
        campaign_ids: [CAMP.id],
        location_ids: [],
        sku_ids: [],
        from_date: '2026-04-18',
        to_date: '2026-04-18',
        domains: [
          'attendance',
          'activity',
          'stock',
          'performance',
          'supervisor_actions',
          'feedback',
        ],
      },
      attendance,
      daily_reports: reports,
      sales_entries: salesEntries,
      stock,
      performance,
      supervisor_visits: visits,
      feedback,
    };
    const sheets = buildAllSheets(input);
    const names = sheets.map((s) => s.name);
    // Attendance (agg), Activity by campaign, Activity by SKU, Stock by SKU,
    // Performance (campaign only), Feedback rollup. No supervisor sheet.
    expect(names).toEqual([
      'Attendance',
      'Activity by campaign',
      'Activity by SKU',
      'Stock by SKU',
      'Performance',
      'Feedback rollup',
    ]);
    // Performance sheet is campaign-only.
    const perf = sheets.find((s) => s.name === 'Performance');
    expect(perf?.rows).toHaveLength(1);
    expect(perf?.rows[0]?.[0]).toBe('campaign');
  });

  it('Arabic locale falls back to EN when AR missing and preserves AR when present', () => {
    const sheets = buildAttendanceSheets(attendance, 'admin', 'ar');
    const s = sheets[0];
    // LOC_A.name.ar = صفوي الجبيهة
    expect(s?.rows[0]?.[2]).toBe('صفوي الجبيهة');
  });
});
