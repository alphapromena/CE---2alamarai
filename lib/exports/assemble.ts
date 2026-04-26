/**
 * Assemble ExportInput from a SupabaseClient. Pure per-domain fetchers
 * + a single top-level `assembleExportInput` that respects scope.domains.
 *
 * The caller passes in a client (service-role admin for Server Action + Edge
 * Function paths) and the already-scoped inputs: campaign_ids, location_ids,
 * sku_ids, date range, domains. Role scoping (client tenancy, supervisor
 * location set) is applied by the caller BEFORE invoking assemble — this
 * function trusts its inputs.
 *
 * No Next.js imports; safe to call from an Edge Function via the Deno
 * supabase-js client.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import type {
  AttendanceRaw,
  DailyReportRaw,
  ExportInput,
  ExportRole,
  ExportScope,
  FeedbackRaw,
  PerformanceRaw,
  SalesEntryRaw,
  StockMovementRaw,
  SupervisorVisitRaw,
} from './types';

type AnyClient = SupabaseClient<Database>;

type RelOne<T> = T | T[] | null;
const pickOne = <T>(v: RelOne<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

function applyScopeFilters<Q extends { in: (col: string, vals: string[]) => Q; gte: (col: string, v: string) => Q; lte: (col: string, v: string) => Q }>(
  q: Q,
  scope: ExportScope,
  opts: { campaignCol: string; locationCol?: string; dateCol: string; dateIsTimestamp?: boolean },
): Q {
  let out = q;
  if (scope.campaign_ids.length > 0) out = out.in(opts.campaignCol, scope.campaign_ids);
  if (opts.locationCol && scope.location_ids.length > 0) {
    out = out.in(opts.locationCol, scope.location_ids);
  }
  if (opts.dateIsTimestamp) {
    out = out.gte(opts.dateCol, `${scope.from_date}T00:00:00Z`);
    out = out.lte(opts.dateCol, `${scope.to_date}T23:59:59.999Z`);
  } else {
    out = out.gte(opts.dateCol, scope.from_date);
    out = out.lte(opts.dateCol, scope.to_date);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------
async function fetchAttendance(
  supabase: AnyClient,
  scope: ExportScope,
): Promise<AttendanceRaw[]> {
  let q = supabase
    .from('attendance')
    .select(
      `id, user_id, campaign_id, location_id, check_in_time, check_out_time,
       status, check_in_distance_m, check_out_distance_m,
       promoter:profiles!attendance_user_id_fkey ( full_name ),
       campaign:campaigns ( name_i18n ),
       location:locations ( name_i18n )`,
    )
    .order('attendance_date', { ascending: false });
  q = applyScopeFilters(q, scope, {
    campaignCol: 'campaign_id',
    locationCol: 'location_id',
    dateCol: 'attendance_date',
  });
  const { data, error } = await q;
  if (error || !data) return [];
  type Raw = {
    id: string;
    user_id: string;
    campaign_id: string;
    location_id: string;
    check_in_time: string | null;
    check_out_time: string | null;
    status: string;
    check_in_distance_m: number | null;
    check_out_distance_m: number | null;
    promoter: RelOne<{ full_name: string | null }>;
    campaign: RelOne<{ name_i18n: { ar?: string; en?: string } | null }>;
    location: RelOne<{ name_i18n: { ar?: string; en?: string } | null }>;
  };
  return (data as unknown as Raw[]).map((r) => ({
    id: r.id,
    promoter_user_id: r.user_id,
    promoter_name: pickOne(r.promoter)?.full_name ?? null,
    campaign_id: r.campaign_id,
    campaign_name: pickOne(r.campaign)?.name_i18n ?? null,
    location_id: r.location_id,
    location_name: pickOne(r.location)?.name_i18n ?? null,
    check_in_ts: r.check_in_time,
    check_out_ts: r.check_out_time,
    status: r.status,
    check_in_distance_m: r.check_in_distance_m,
    check_out_distance_m: r.check_out_distance_m,
    late_minutes: null,
  }));
}

// ---------------------------------------------------------------------------
// Activity (daily_reports + sales_entries)
// ---------------------------------------------------------------------------
async function fetchDailyReports(
  supabase: AnyClient,
  scope: ExportScope,
): Promise<DailyReportRaw[]> {
  let q = supabase
    .from('daily_reports')
    .select(
      `id, report_date, campaign_id, location_id, promoter_user_id, status,
       contacts, engaged, samples_total, sales_total, total_traffic,
       promoter:profiles!daily_reports_promoter_user_id_fkey ( full_name ),
       campaign:campaigns ( name_i18n ),
       location:locations ( name_i18n ),
       kpi:kpi_snapshots ( interaction_rate, engagement_rate, sampling_rate, conversion_rate )`,
    )
    .order('report_date', { ascending: false });
  q = applyScopeFilters(q, scope, {
    campaignCol: 'campaign_id',
    locationCol: 'location_id',
    dateCol: 'report_date',
  });
  const { data, error } = await q;
  if (error || !data) return [];
  type Raw = {
    id: string;
    report_date: string;
    campaign_id: string;
    location_id: string;
    promoter_user_id: string;
    status: string;
    contacts: number;
    engaged: number;
    samples_total: number;
    sales_total: number;
    total_traffic: number | null;
    promoter: RelOne<{ full_name: string | null }>;
    campaign: RelOne<{ name_i18n: { ar?: string; en?: string } | null }>;
    location: RelOne<{ name_i18n: { ar?: string; en?: string } | null }>;
    kpi: RelOne<{
      interaction_rate: number | null;
      engagement_rate: number | null;
      sampling_rate: number | null;
      conversion_rate: number | null;
    }>;
  };
  return (data as unknown as Raw[]).map((r) => {
    const k = pickOne(r.kpi);
    return {
      id: r.id,
      report_date: r.report_date,
      promoter_user_id: r.promoter_user_id,
      promoter_name: pickOne(r.promoter)?.full_name ?? null,
      campaign_id: r.campaign_id,
      campaign_name: pickOne(r.campaign)?.name_i18n ?? null,
      location_id: r.location_id,
      location_name: pickOne(r.location)?.name_i18n ?? null,
      status: r.status,
      contacts: r.contacts,
      engaged: r.engaged,
      samples_total: r.samples_total,
      sales_total: r.sales_total,
      total_traffic: r.total_traffic,
      interaction_rate: k?.interaction_rate ?? null,
      engagement_rate: k?.engagement_rate ?? null,
      sampling_rate: k?.sampling_rate ?? null,
      conversion_rate: k?.conversion_rate ?? null,
    };
  });
}

async function fetchSalesEntries(
  supabase: AnyClient,
  reportIds: readonly string[],
  scope: ExportScope,
): Promise<SalesEntryRaw[]> {
  if (reportIds.length === 0) return [];
  let q = supabase
    .from('sales_entries')
    .select(
      `daily_report_id, sku_id, samples, sales,
       sku:skus ( name_i18n )`,
    )
    .in('daily_report_id', reportIds as string[]);
  if (scope.sku_ids.length > 0) q = q.in('sku_id', scope.sku_ids);
  const { data, error } = await q;
  if (error || !data) return [];
  type Raw = {
    daily_report_id: string;
    sku_id: string;
    samples: number;
    sales: number;
    sku: RelOne<{ name_i18n: { ar?: string; en?: string } | null }>;
  };
  return (data as unknown as Raw[]).map((r) => ({
    daily_report_id: r.daily_report_id,
    sku_id: r.sku_id,
    sku_name: pickOne(r.sku)?.name_i18n ?? null,
    samples: r.samples,
    sales: r.sales,
  }));
}

// ---------------------------------------------------------------------------
// Stock
// ---------------------------------------------------------------------------
async function fetchStockMovements(
  supabase: AnyClient,
  scope: ExportScope,
): Promise<StockMovementRaw[]> {
  let q = supabase
    .from('stock_movements')
    .select(
      `id, created_at, campaign_id, sku_id, movement_kind,
       from_entity_type, from_entity_id, to_entity_type, to_entity_id,
       quantity, reason,
       campaign:campaigns ( name_i18n ),
       sku:skus ( name_i18n )`,
    )
    .order('created_at', { ascending: false });
  q = applyScopeFilters(q, scope, {
    campaignCol: 'campaign_id',
    dateCol: 'created_at',
    dateIsTimestamp: true,
  });
  if (scope.sku_ids.length > 0) q = q.in('sku_id', scope.sku_ids);
  const { data, error } = await q;
  if (error || !data) return [];
  type Raw = {
    id: string;
    created_at: string;
    campaign_id: string;
    sku_id: string;
    movement_kind: string;
    from_entity_type: string;
    from_entity_id: string | null;
    to_entity_type: string;
    to_entity_id: string | null;
    quantity: number;
    reason: string | null;
    campaign: RelOne<{ name_i18n: { ar?: string; en?: string } | null }>;
    sku: RelOne<{ name_i18n: { ar?: string; en?: string } | null }>;
  };
  return (data as unknown as Raw[]).map((r) => ({
    id: r.id,
    created_at: r.created_at,
    campaign_id: r.campaign_id,
    campaign_name: pickOne(r.campaign)?.name_i18n ?? null,
    sku_id: r.sku_id,
    sku_name: pickOne(r.sku)?.name_i18n ?? null,
    movement_kind: r.movement_kind,
    from_entity_type: r.from_entity_type,
    from_entity_id: r.from_entity_id,
    to_entity_type: r.to_entity_type,
    to_entity_id: r.to_entity_id,
    quantity: r.quantity,
    reason: r.reason,
  }));
}

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------
async function fetchPerformance(
  supabase: AnyClient,
  scope: ExportScope,
): Promise<PerformanceRaw[]> {
  let q = supabase
    .from('performance_snapshots')
    .select(
      `scope_kind, scope_id, campaign_id, period_kind, period_start, period_end,
       contacts, engaged, samples_total, sales_total,
       interaction_rate, engagement_rate, sampling_rate, conversion_rate,
       tier, rank,
       campaign:campaigns ( name_i18n )`,
    )
    .order('period_start', { ascending: false });
  q = applyScopeFilters(q, scope, {
    campaignCol: 'campaign_id',
    dateCol: 'period_start',
  });
  const { data, error } = await q;
  if (error || !data) return [];
  type Raw = {
    scope_kind: 'promoter' | 'location' | 'campaign';
    scope_id: string;
    campaign_id: string;
    period_kind: string;
    period_start: string;
    period_end: string;
    contacts: number;
    engaged: number;
    samples_total: number;
    sales_total: number;
    interaction_rate: number | null;
    engagement_rate: number | null;
    sampling_rate: number | null;
    conversion_rate: number | null;
    tier: string | null;
    rank: number | null;
    campaign: RelOne<{ name_i18n: { ar?: string; en?: string } | null }>;
  };
  return (data as unknown as Raw[]).map((r) => ({
    scope_kind: r.scope_kind,
    scope_id: r.scope_id,
    scope_name: null, // Filled via a second pass below when admin/supervisor.
    campaign_id: r.campaign_id,
    campaign_name: pickOne(r.campaign)?.name_i18n ?? null,
    period_kind: r.period_kind,
    period_start: r.period_start,
    period_end: r.period_end,
    contacts: r.contacts,
    engaged: r.engaged,
    samples_total: r.samples_total,
    sales_total: r.sales_total,
    interaction_rate: r.interaction_rate,
    engagement_rate: r.engagement_rate,
    sampling_rate: r.sampling_rate,
    conversion_rate: r.conversion_rate,
    tier: r.tier,
    rank: r.rank,
  }));
}

async function resolveScopeNames(
  supabase: AnyClient,
  rows: PerformanceRaw[],
  locale: 'ar' | 'en',
): Promise<PerformanceRaw[]> {
  if (rows.length === 0) return rows;
  const promoterIds = new Set<string>();
  const locationIds = new Set<string>();
  for (const r of rows) {
    if (r.scope_kind === 'promoter') promoterIds.add(r.scope_id);
    else if (r.scope_kind === 'location') locationIds.add(r.scope_id);
  }
  const promoterNames = new Map<string, string>();
  const locationNames = new Map<string, string>();
  if (promoterIds.size > 0) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', Array.from(promoterIds));
    for (const p of (data as { id: string; full_name: string | null }[] | null) ?? []) {
      if (p.full_name) promoterNames.set(p.id, p.full_name);
    }
  }
  if (locationIds.size > 0) {
    const { data } = await supabase
      .from('locations')
      .select('id, name_i18n')
      .in('id', Array.from(locationIds));
    for (const l of (data as
      | { id: string; name_i18n: { ar?: string; en?: string } | null }[]
      | null) ?? []) {
      const n = l.name_i18n?.[locale] ?? l.name_i18n?.en ?? l.name_i18n?.ar ?? '';
      if (n) locationNames.set(l.id, n);
    }
  }
  return rows.map((r) => ({
    ...r,
    scope_name:
      r.scope_kind === 'promoter'
        ? (promoterNames.get(r.scope_id) ?? null)
        : r.scope_kind === 'location'
          ? (locationNames.get(r.scope_id) ?? null)
          : null,
  }));
}

// ---------------------------------------------------------------------------
// Supervisor visits
// ---------------------------------------------------------------------------
async function fetchSupervisorVisits(
  supabase: AnyClient,
  scope: ExportScope,
): Promise<SupervisorVisitRaw[]> {
  let q = supabase
    .from('supervisor_visits')
    .select(
      `id, visited_at, supervisor_id, campaign_id, location_id, distance_m, notes,
       supervisor:profiles!supervisor_visits_supervisor_id_fkey ( full_name ),
       campaign:campaigns ( name_i18n ),
       location:locations ( name_i18n )`,
    )
    .order('visited_at', { ascending: false });
  q = applyScopeFilters(q, scope, {
    campaignCol: 'campaign_id',
    locationCol: 'location_id',
    dateCol: 'visited_at',
    dateIsTimestamp: true,
  });
  const { data, error } = await q;
  if (error || !data) return [];
  type Raw = {
    id: string;
    visited_at: string;
    supervisor_id: string;
    campaign_id: string;
    location_id: string;
    distance_m: number | null;
    notes: string | null;
    supervisor: RelOne<{ full_name: string | null }>;
    campaign: RelOne<{ name_i18n: { ar?: string; en?: string } | null }>;
    location: RelOne<{ name_i18n: { ar?: string; en?: string } | null }>;
  };
  return (data as unknown as Raw[]).map((r) => ({
    id: r.id,
    created_at: r.visited_at,
    supervisor_user_id: r.supervisor_id,
    supervisor_name: pickOne(r.supervisor)?.full_name ?? null,
    campaign_id: r.campaign_id,
    campaign_name: pickOne(r.campaign)?.name_i18n ?? null,
    location_id: r.location_id,
    location_name: pickOne(r.location)?.name_i18n ?? null,
    distance_m: r.distance_m,
    notes: r.notes,
  }));
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------
async function fetchFeedback(
  supabase: AnyClient,
  scope: ExportScope,
): Promise<FeedbackRaw[]> {
  let q = supabase
    .from('consumer_feedback')
    .select(
      `id, created_at, campaign_id, location_id, promoter_user_id,
       category, sentiment, body,
       promoter:profiles!consumer_feedback_promoter_user_id_fkey ( full_name ),
       campaign:campaigns ( name_i18n ),
       location:locations ( name_i18n ),
       competitor_mentions ( brand )`,
    )
    .order('created_at', { ascending: false });
  q = applyScopeFilters(q, scope, {
    campaignCol: 'campaign_id',
    locationCol: 'location_id',
    dateCol: 'created_at',
    dateIsTimestamp: true,
  });
  const { data, error } = await q;
  if (error || !data) return [];
  type Raw = {
    id: string;
    created_at: string;
    campaign_id: string;
    location_id: string;
    promoter_user_id: string;
    category: string;
    sentiment: string | null;
    body: string;
    promoter: RelOne<{ full_name: string | null }>;
    campaign: RelOne<{ name_i18n: { ar?: string; en?: string } | null }>;
    location: RelOne<{ name_i18n: { ar?: string; en?: string } | null }>;
    competitor_mentions: { brand: string }[] | null;
  };
  return (data as unknown as Raw[]).map((r) => ({
    id: r.id,
    created_at: r.created_at,
    campaign_id: r.campaign_id,
    campaign_name: pickOne(r.campaign)?.name_i18n ?? null,
    location_id: r.location_id,
    location_name: pickOne(r.location)?.name_i18n ?? null,
    promoter_user_id: r.promoter_user_id,
    promoter_name: pickOne(r.promoter)?.full_name ?? null,
    category: r.category,
    sentiment: r.sentiment,
    body: r.body,
    competitor_brands: (r.competitor_mentions ?? []).map((c) => c.brand),
  }));
}

// ---------------------------------------------------------------------------
// Top-level
// ---------------------------------------------------------------------------
export async function assembleExportInput(
  supabase: AnyClient,
  args: { scope: ExportScope; role: ExportRole; locale: 'ar' | 'en' },
): Promise<ExportInput> {
  const { scope, role, locale } = args;
  const result: ExportInput = { scope, role, locale };
  const wants = new Set(scope.domains);

  if (wants.has('attendance')) {
    result.attendance = await fetchAttendance(supabase, scope);
  }
  if (wants.has('activity')) {
    const reports = await fetchDailyReports(supabase, scope);
    result.daily_reports = reports;
    const reportIds = reports.map((r) => r.id);
    result.sales_entries = await fetchSalesEntries(supabase, reportIds, scope);
  }
  if (wants.has('stock')) {
    result.stock = await fetchStockMovements(supabase, scope);
  }
  if (wants.has('performance')) {
    const rows = await fetchPerformance(supabase, scope);
    result.performance = await resolveScopeNames(supabase, rows, locale);
  }
  if (wants.has('supervisor_actions')) {
    result.supervisor_visits = await fetchSupervisorVisits(supabase, scope);
  }
  if (wants.has('feedback')) {
    result.feedback = await fetchFeedback(supabase, scope);
  }
  return result;
}
