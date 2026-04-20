/**
 * Phase 8 export builders — pure, role-aware.
 *
 * Each builder turns a slice of ExportInput into zero or more Sheet objects.
 * The compose() orchestrator picks builders based on scope.domains and
 * passes the role through; the role governs the shape of the emitted sheets
 * per D-019 item 3 / D-028 / D-033:
 *
 *   admin / supervisor → raw row-level sheets (with promoter names, EXIF-safe
 *                        distances, etc. — supervisor already filtered by RLS)
 *   client             → aggregate sheets only (per-campaign, per-location,
 *                        per-SKU totals + KPI averages). No promoter names,
 *                        no raw attendance rows, no feedback body text,
 *                        no supervisor actions.
 *
 * No I/O. The input shapes already contain joined display names (i18n JSONB
 * resolved or promoter full_name) so the builder does no DB work.
 */

import { promoterDisplayId } from '@/lib/auth/client-visibility';
import type {
  AttendanceRaw,
  DailyReportRaw,
  ExportClientVisibility,
  ExportInput,
  ExportRole,
  FeedbackRaw,
  I18nName,
  PerformanceRaw,
  SalesEntryRaw,
  Sheet,
  StockMovementRaw,
  SupervisorVisitRaw,
} from './types';

const ALL_FALSE_VISIBILITY: ExportClientVisibility = Object.freeze({
  show_promoter_names: false,
  show_promoter_photos: false,
  show_promoter_alerts: false,
  show_promoter_full_profile: false,
}) as ExportClientVisibility;

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------
function i18nPick(value: I18nName, locale: 'ar' | 'en'): string {
  if (!value) return '';
  const primary = value[locale];
  if (primary && primary.length > 0) return primary;
  const fallback = locale === 'ar' ? value.en : value.ar;
  return fallback ?? '';
}

function roundRatio(n: number | null): number | null {
  if (n === null) return null;
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10_000) / 10_000;
}

/** For aggregate sheets: ratio of sum(num)/sum(den) where appropriate. */
function safeRatio(num: number, den: number): number | null {
  if (!Number.isFinite(num) || !Number.isFinite(den)) return null;
  if (den <= 0) return null;
  return Math.round((num / den) * 10_000) / 10_000;
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------
export function buildAttendanceSheets(
  rows: readonly AttendanceRaw[],
  role: ExportRole,
  locale: 'ar' | 'en',
): Sheet[] {
  if (rows.length === 0) return [];
  if (role === 'client') {
    // Aggregate by (campaign, location, date).
    const key = (r: AttendanceRaw): string => {
      const d = r.check_in_ts ? r.check_in_ts.slice(0, 10) : '';
      return `${r.campaign_id}|${r.location_id}|${d}`;
    };
    const buckets = new Map<
      string,
      {
        campaign: string;
        location: string;
        date: string;
        total: number;
        on_time: number;
        late: number;
        absent: number;
        missing_checkout: number;
        geofence_violations: number;
      }
    >();
    for (const r of rows) {
      const k = key(r);
      let b = buckets.get(k);
      if (!b) {
        b = {
          campaign: i18nPick(r.campaign_name, locale),
          location: i18nPick(r.location_name, locale),
          date: r.check_in_ts ? r.check_in_ts.slice(0, 10) : '',
          total: 0,
          on_time: 0,
          late: 0,
          absent: 0,
          missing_checkout: 0,
          geofence_violations: 0,
        };
        buckets.set(k, b);
      }
      b.total += 1;
      if (r.status === 'on_time') b.on_time += 1;
      else if (r.status === 'late') b.late += 1;
      else if (r.status === 'absent') b.absent += 1;
      else if (r.status === 'missing_checkout') b.missing_checkout += 1;
      const dci = r.check_in_distance_m;
      const dco = r.check_out_distance_m;
      if ((dci !== null && dci > 0) || (dco !== null && dco > 0)) {
        b.geofence_violations += 1;
      }
    }
    const sorted = Array.from(buckets.values()).sort(
      (a, b) => a.date.localeCompare(b.date) || a.campaign.localeCompare(b.campaign),
    );
    return [
      {
        name: 'Attendance',
        columns: ['Date', 'Campaign', 'Location', 'Total', 'On time', 'Late', 'Absent', 'Missing checkout', 'Geofence violations'],
        rows: sorted.map((b) => [
          b.date,
          b.campaign,
          b.location,
          b.total,
          b.on_time,
          b.late,
          b.absent,
          b.missing_checkout,
          b.geofence_violations,
        ]),
      },
    ];
  }
  // admin / supervisor — raw rows
  return [
    {
      name: 'Attendance',
      columns: [
        'Date',
        'Campaign',
        'Location',
        'Promoter',
        'Check-in',
        'Check-out',
        'Status',
        'Late (min)',
        'Check-in distance (m)',
        'Check-out distance (m)',
      ],
      rows: rows.map((r) => [
        r.check_in_ts ? r.check_in_ts.slice(0, 10) : '',
        i18nPick(r.campaign_name, locale),
        i18nPick(r.location_name, locale),
        r.promoter_name ?? '',
        r.check_in_ts ?? '',
        r.check_out_ts ?? '',
        r.status,
        r.late_minutes,
        r.check_in_distance_m,
        r.check_out_distance_m,
      ]),
    },
  ];
}

// ---------------------------------------------------------------------------
// Activity (daily_reports + sales_entries)
// ---------------------------------------------------------------------------
export function buildActivitySheets(
  reports: readonly DailyReportRaw[],
  sales: readonly SalesEntryRaw[],
  role: ExportRole,
  locale: 'ar' | 'en',
): Sheet[] {
  if (reports.length === 0 && sales.length === 0) return [];
  if (role === 'client') {
    // Aggregate by campaign.
    type B = {
      campaign: string;
      reports: number;
      traffic: number;
      contacts: number;
      engaged: number;
      samples: number;
      sales: number;
    };
    const byCampaign = new Map<string, B>();
    for (const r of reports) {
      let b = byCampaign.get(r.campaign_id);
      if (!b) {
        b = {
          campaign: i18nPick(r.campaign_name, locale),
          reports: 0,
          traffic: 0,
          contacts: 0,
          engaged: 0,
          samples: 0,
          sales: 0,
        };
        byCampaign.set(r.campaign_id, b);
      }
      b.reports += 1;
      b.traffic += r.total_traffic ?? 0;
      b.contacts += r.contacts;
      b.engaged += r.engaged;
      b.samples += r.samples_total;
      b.sales += r.sales_total;
    }
    const campaignRows = Array.from(byCampaign.values()).sort((a, b) =>
      a.campaign.localeCompare(b.campaign),
    );
    const campaignSheet: Sheet = {
      name: 'Activity by campaign',
      columns: [
        'Campaign',
        'Reports',
        'Traffic',
        'Contacts',
        'Engaged',
        'Samples',
        'Sales',
        'Interaction rate',
        'Engagement rate',
        'Conversion rate',
      ],
      rows: campaignRows.map((b) => [
        b.campaign,
        b.reports,
        b.traffic,
        b.contacts,
        b.engaged,
        b.samples,
        b.sales,
        safeRatio(b.contacts, b.traffic),
        safeRatio(b.engaged, b.contacts),
        safeRatio(b.sales, b.engaged),
      ]),
    };
    // SKU aggregate.
    type S = { sku: string; samples: number; sales: number };
    const bySku = new Map<string, S>();
    for (const e of sales) {
      let s = bySku.get(e.sku_id);
      if (!s) {
        s = { sku: i18nPick(e.sku_name, locale), samples: 0, sales: 0 };
        bySku.set(e.sku_id, s);
      }
      s.samples += e.samples;
      s.sales += e.sales;
    }
    const skuRows = Array.from(bySku.values()).sort((a, b) => a.sku.localeCompare(b.sku));
    const skuSheet: Sheet = {
      name: 'Activity by SKU',
      columns: ['SKU', 'Samples', 'Sales'],
      rows: skuRows.map((s) => [s.sku, s.samples, s.sales]),
    };
    return [campaignSheet, skuSheet];
  }
  // admin / supervisor — raw
  const reportSheet: Sheet = {
    name: 'Daily reports',
    columns: [
      'Date',
      'Campaign',
      'Location',
      'Promoter',
      'Status',
      'Traffic',
      'Contacts',
      'Engaged',
      'Samples',
      'Sales',
      'Interaction rate',
      'Engagement rate',
      'Sampling rate',
      'Conversion rate',
    ],
    rows: reports.map((r) => [
      r.report_date,
      i18nPick(r.campaign_name, locale),
      i18nPick(r.location_name, locale),
      r.promoter_name ?? '',
      r.status,
      r.total_traffic,
      r.contacts,
      r.engaged,
      r.samples_total,
      r.sales_total,
      roundRatio(r.interaction_rate),
      roundRatio(r.engagement_rate),
      roundRatio(r.sampling_rate),
      roundRatio(r.conversion_rate),
    ]),
  };
  const salesSheet: Sheet = {
    name: 'Sales entries',
    columns: ['Daily report id', 'SKU', 'Samples', 'Sales'],
    rows: sales.map((e) => [
      e.daily_report_id,
      i18nPick(e.sku_name, locale),
      e.samples,
      e.sales,
    ]),
  };
  return [reportSheet, salesSheet];
}

// ---------------------------------------------------------------------------
// Stock
// ---------------------------------------------------------------------------
export function buildStockSheets(
  rows: readonly StockMovementRaw[],
  role: ExportRole,
  locale: 'ar' | 'en',
): Sheet[] {
  if (rows.length === 0) return [];
  if (role === 'client') {
    // Aggregate by (campaign, sku): allocated = sum of from=warehouse → *;
    // distributed = sum of supervisor → promoter; used = promoter → consumer.
    type B = { campaign: string; sku: string; allocated: number; distributed: number; used: number };
    const key = (r: StockMovementRaw): string => `${r.campaign_id}|${r.sku_id}`;
    const by = new Map<string, B>();
    for (const r of rows) {
      const k = key(r);
      let b = by.get(k);
      if (!b) {
        b = {
          campaign: i18nPick(r.campaign_name, locale),
          sku: i18nPick(r.sku_name, locale),
          allocated: 0,
          distributed: 0,
          used: 0,
        };
        by.set(k, b);
      }
      if (r.from_entity_type === 'warehouse') b.allocated += r.quantity;
      if (r.from_entity_type === 'supervisor' && r.to_entity_type === 'promoter') {
        b.distributed += r.quantity;
      }
      if (r.movement_kind === 'usage') b.used += r.quantity;
    }
    const sorted = Array.from(by.values()).sort(
      (a, b) => a.campaign.localeCompare(b.campaign) || a.sku.localeCompare(b.sku),
    );
    return [
      {
        name: 'Stock by SKU',
        columns: ['Campaign', 'SKU', 'Allocated', 'Distributed', 'Used'],
        rows: sorted.map((b) => [b.campaign, b.sku, b.allocated, b.distributed, b.used]),
      },
    ];
  }
  return [
    {
      name: 'Stock movements',
      columns: [
        'Timestamp',
        'Campaign',
        'SKU',
        'Kind',
        'From',
        'From id',
        'To',
        'To id',
        'Quantity',
        'Reason',
      ],
      rows: rows.map((r) => [
        r.created_at,
        i18nPick(r.campaign_name, locale),
        i18nPick(r.sku_name, locale),
        r.movement_kind,
        r.from_entity_type,
        r.from_entity_id,
        r.to_entity_type,
        r.to_entity_id,
        r.quantity,
        r.reason,
      ]),
    },
  ];
}

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------
export function buildPerformanceSheets(
  rows: readonly PerformanceRaw[],
  role: ExportRole,
  locale: 'ar' | 'en',
): Sheet[] {
  if (rows.length === 0) return [];
  const filtered = role === 'client' ? rows.filter((r) => r.scope_kind === 'campaign') : rows;
  if (filtered.length === 0) return [];
  return [
    {
      name: 'Performance',
      columns: [
        'Scope',
        'Scope id',
        'Scope name',
        'Campaign',
        'Period',
        'Period start',
        'Period end',
        'Contacts',
        'Engaged',
        'Samples',
        'Sales',
        'Interaction rate',
        'Engagement rate',
        'Sampling rate',
        'Conversion rate',
        'Tier',
        'Rank',
      ],
      rows: filtered.map((r) => [
        r.scope_kind,
        r.scope_id,
        r.scope_name ?? '',
        i18nPick(r.campaign_name, locale),
        r.period_kind,
        r.period_start,
        r.period_end,
        r.contacts,
        r.engaged,
        r.samples_total,
        r.sales_total,
        roundRatio(r.interaction_rate),
        roundRatio(r.engagement_rate),
        roundRatio(r.sampling_rate),
        roundRatio(r.conversion_rate),
        r.tier,
        r.rank,
      ]),
    },
  ];
}

// ---------------------------------------------------------------------------
// Supervisor actions (visits)
// ---------------------------------------------------------------------------
export function buildSupervisorActionsSheets(
  rows: readonly SupervisorVisitRaw[],
  role: ExportRole,
  locale: 'ar' | 'en',
): Sheet[] {
  if (role === 'client') return []; // D-033 — clients don't see supervisor activity
  if (rows.length === 0) return [];
  return [
    {
      name: 'Supervisor visits',
      columns: ['Timestamp', 'Supervisor', 'Campaign', 'Location', 'Distance (m)', 'Notes'],
      rows: rows.map((r) => [
        r.created_at,
        r.supervisor_name ?? '',
        i18nPick(r.campaign_name, locale),
        i18nPick(r.location_name, locale),
        r.distance_m,
        r.notes,
      ]),
    },
  ];
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------
export function buildFeedbackSheets(
  rows: readonly FeedbackRaw[],
  role: ExportRole,
  locale: 'ar' | 'en',
): Sheet[] {
  if (rows.length === 0) return [];
  if (role === 'client') {
    // Aggregate counts by (campaign, category, sentiment). No body text, no
    // competitor detail — per D-033 clients see category rollups only.
    type B = {
      campaign: string;
      category: string;
      sentiment: string;
      count: number;
    };
    const by = new Map<string, B>();
    for (const r of rows) {
      const sentiment = r.sentiment ?? 'unrated';
      const k = `${r.campaign_id}|${r.category}|${sentiment}`;
      let b = by.get(k);
      if (!b) {
        b = {
          campaign: i18nPick(r.campaign_name, locale),
          category: r.category,
          sentiment,
          count: 0,
        };
        by.set(k, b);
      }
      b.count += 1;
    }
    const sorted = Array.from(by.values()).sort(
      (a, b) =>
        a.campaign.localeCompare(b.campaign) ||
        a.category.localeCompare(b.category) ||
        a.sentiment.localeCompare(b.sentiment),
    );
    return [
      {
        name: 'Feedback rollup',
        columns: ['Campaign', 'Category', 'Sentiment', 'Count'],
        rows: sorted.map((b) => [b.campaign, b.category, b.sentiment, b.count]),
      },
    ];
  }
  // admin / supervisor — full rows + competitor column (comma-joined brands).
  return [
    {
      name: 'Feedback',
      columns: [
        'Timestamp',
        'Campaign',
        'Location',
        'Promoter',
        'Category',
        'Sentiment',
        'Body',
        'Competitors',
      ],
      rows: rows.map((r) => [
        r.created_at,
        i18nPick(r.campaign_name, locale),
        i18nPick(r.location_name, locale),
        r.promoter_name ?? '',
        r.category,
        r.sentiment ?? '',
        r.body,
        r.competitor_brands.join(', '),
      ]),
    },
  ];
}

// ---------------------------------------------------------------------------
// Client promoter sheet (D-040 override)
// ---------------------------------------------------------------------------
/**
 * Per-promoter rollup sheet emitted for a client tenant whose admin has
 * flipped `show_promoter_full_profile=true`. Aggregates attendance + daily
 * reports per promoter. Promoter identity column is the display id unless
 * `show_promoter_names=true`, in which case the real name is emitted
 * alongside.
 *
 * Callers that omit `visibility` or pass `show_promoter_full_profile=false`
 * get an empty result — the default aggregate-only output is untouched.
 */
export function buildClientPromoterSheet(
  attendance: readonly AttendanceRaw[],
  reports: readonly DailyReportRaw[],
  visibility: ExportClientVisibility,
  locale: 'ar' | 'en',
): Sheet[] {
  if (!visibility.show_promoter_full_profile) return [];
  if (attendance.length === 0 && reports.length === 0) return [];

  type B = {
    promoter_id: string;
    promoter_name: string | null;
    shifts: number;
    on_time: number;
    late: number;
    reports: number;
    contacts: number;
    engaged: number;
    samples: number;
    sales: number;
  };
  const by = new Map<string, B>();
  const bucket = (id: string, name: string | null): B => {
    let b = by.get(id);
    if (!b) {
      b = {
        promoter_id: id,
        promoter_name: name,
        shifts: 0,
        on_time: 0,
        late: 0,
        reports: 0,
        contacts: 0,
        engaged: 0,
        samples: 0,
        sales: 0,
      };
      by.set(id, b);
    } else if (b.promoter_name === null && name !== null) {
      b.promoter_name = name;
    }
    return b;
  };

  for (const a of attendance) {
    const b = bucket(a.promoter_user_id, a.promoter_name);
    b.shifts += 1;
    if (a.status === 'on_time') b.on_time += 1;
    else if (a.status === 'late') b.late += 1;
  }
  for (const r of reports) {
    const b = bucket(r.promoter_user_id, r.promoter_name);
    b.reports += 1;
    b.contacts += r.contacts;
    b.engaged += r.engaged;
    b.samples += r.samples_total;
    b.sales += r.sales_total;
  }

  const sorted = Array.from(by.values()).sort((a, b) =>
    a.promoter_id.localeCompare(b.promoter_id),
  );
  const columns = visibility.show_promoter_names
    ? ['Promoter id', 'Promoter name', 'Shifts', 'On time', 'Late', 'Reports', 'Contacts', 'Engaged', 'Samples', 'Sales']
    : ['Promoter id', 'Shifts', 'On time', 'Late', 'Reports', 'Contacts', 'Engaged', 'Samples', 'Sales'];
  // Reference the locale to keep the signature honest for future ar/en
  // specific formatting (e.g. numerals).
  void locale;
  return [
    {
      name: 'Promoters',
      columns,
      rows: sorted.map((b) => {
        const display = promoterDisplayId(b.promoter_id);
        const base = [b.shifts, b.on_time, b.late, b.reports, b.contacts, b.engaged, b.samples, b.sales];
        return visibility.show_promoter_names
          ? [display, b.promoter_name ?? '', ...base]
          : [display, ...base];
      }),
    },
  ];
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/** Build sheets for every domain present in input.scope.domains. */
export function buildAllSheets(input: ExportInput): Sheet[] {
  const out: Sheet[] = [];
  const push = (sheets: Sheet[]): void => {
    for (const s of sheets) out.push(s);
  };
  for (const d of input.scope.domains) {
    switch (d) {
      case 'attendance':
        push(buildAttendanceSheets(input.attendance ?? [], input.role, input.locale));
        break;
      case 'activity':
        push(
          buildActivitySheets(
            input.daily_reports ?? [],
            input.sales_entries ?? [],
            input.role,
            input.locale,
          ),
        );
        break;
      case 'stock':
        push(buildStockSheets(input.stock ?? [], input.role, input.locale));
        break;
      case 'performance':
        push(buildPerformanceSheets(input.performance ?? [], input.role, input.locale));
        break;
      case 'supervisor_actions':
        push(
          buildSupervisorActionsSheets(input.supervisor_visits ?? [], input.role, input.locale),
        );
        break;
      case 'feedback':
        push(buildFeedbackSheets(input.feedback ?? [], input.role, input.locale));
        break;
    }
  }
  // D-040: per-tenant opt-in override. Only applies when the exporting user
  // is a client AND their admin has explicitly flipped a toggle. Defaults
  // preserve D-033 (aggregates-only) byte-for-byte.
  if (input.role === 'client') {
    const vis = input.clientVisibility ?? ALL_FALSE_VISIBILITY;
    if (vis.show_promoter_full_profile) {
      push(
        buildClientPromoterSheet(
          input.attendance ?? [],
          input.daily_reports ?? [],
          vis,
          input.locale,
        ),
      );
    }
  }
  return out;
}
