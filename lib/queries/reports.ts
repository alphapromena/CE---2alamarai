import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { todayLocalDateString } from '@/lib/attendance/shift-time';
import { logError } from '@/lib/observability/logger';

export type DailyReportRow = {
  id: string;
  campaign_id: string;
  location_id: string;
  promoter_user_id: string;
  report_date: string;
  total_traffic: number | null;
  contacts: number;
  engaged: number;
  samples_total: number;
  sales_total: number;
  notes: string | null;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type SalesEntryRow = {
  daily_report_id: string;
  sku_id: string;
  samples: number;
  sales: number;
};

export type ActivityPhotoRow = {
  daily_report_id: string;
  photo_kind: 'setup' | 'during' | 'end_of_shift';
  storage_path: string;
};

export type KpiSnapshotRow = {
  daily_report_id: string;
  interaction_rate: number | null;
  engagement_rate: number | null;
  sampling_rate: number | null;
  conversion_rate: number | null;
  sample_to_conversion_rate: number | null;
  sku_contributions: Record<string, number>;
  sampling_rate_denominator: 'contacts' | 'engaged' | null;
  computation_version: number;
  computed_at: string;
};

export type SkuLite = {
  id: string;
  name_i18n: { ar?: string; en?: string };
  unit_i18n: { ar?: string; en?: string };
};

const REPORT_COLS =
  'id, campaign_id, location_id, promoter_user_id, report_date, total_traffic, contacts, engaged, samples_total, sales_total, notes, status, submitted_at, reviewed_at, reviewed_by, review_reason, created_at, updated_at';

/**
 * Fetch today's report for (this promoter, given location). Returns the
 * existing draft/submitted row if one exists. RLS enforces ownership.
 */
export async function getMyReportForToday(
  locationId: string,
): Promise<DailyReportRow | null> {
  const supabase = await createServerSupabase();
  const today = todayLocalDateString(new Date());
  const { data } = await supabase
    .from('daily_reports')
    .select(REPORT_COLS)
    .eq('location_id', locationId)
    .eq('report_date', today)
    .maybeSingle();
  return (data as DailyReportRow) ?? null;
}

export async function getReportById(id: string): Promise<DailyReportRow | null> {
  const supabase = await createServerSupabase();
  // Destructure error so a real DB failure is logged rather than silently
  // becoming "not found" (data === null). Contract unchanged: null is still
  // returned both for genuine not-found and for DB error.
  const { data, error } = await supabase
    .from('daily_reports')
    .select(REPORT_COLS)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    logError('getReportById failed', {
      report_id: id,
      code: error.code,
      message: error.message,
    });
    return null;
  }
  return (data as DailyReportRow) ?? null;
}

export async function listSalesEntries(dailyReportId: string): Promise<SalesEntryRow[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('sales_entries')
    .select('daily_report_id, sku_id, samples, sales')
    .eq('daily_report_id', dailyReportId);
  return (data as SalesEntryRow[]) ?? [];
}

export async function listActivityPhotos(dailyReportId: string): Promise<ActivityPhotoRow[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('activity_photos')
    .select('daily_report_id, photo_kind, storage_path')
    .eq('daily_report_id', dailyReportId);
  return (data as ActivityPhotoRow[]) ?? [];
}

export async function getKpiSnapshot(dailyReportId: string): Promise<KpiSnapshotRow | null> {
  const supabase = await createServerSupabase();
  // See note on getReportById above — same destructure-and-log pattern.
  const { data, error } = await supabase
    .from('kpi_snapshots')
    .select(
      'daily_report_id, interaction_rate, engagement_rate, sampling_rate, conversion_rate, sample_to_conversion_rate, sku_contributions, sampling_rate_denominator, computation_version, computed_at',
    )
    .eq('daily_report_id', dailyReportId)
    .maybeSingle();
  if (error) {
    logError('getKpiSnapshot failed', {
      daily_report_id: dailyReportId,
      code: error.code,
      message: error.message,
    });
    return null;
  }
  return (data as KpiSnapshotRow) ?? null;
}

export async function listCampaignSkus(campaignId: string): Promise<SkuLite[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from('skus')
    .select('id, name_i18n, unit_i18n')
    .eq('campaign_id', campaignId)
    .eq('active', true)
    .order('created_at', { ascending: true });
  return (data as SkuLite[]) ?? [];
}

export type ReportListRow = DailyReportRow & {
  location_name_i18n: { ar?: string; en?: string } | null;
  campaign_name_i18n: { ar?: string; en?: string } | null;
  promoter_name: string | null;
};

/**
 * List reports visible to the current user (RLS-filtered). Admin + supervisor
 * views pass filters; promoter gets own only.
 */
export async function listReports(filters: {
  status?: ('draft' | 'submitted' | 'approved' | 'rejected')[];
  campaignId?: string | null;
  locationId?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  limit?: number;
}): Promise<ReportListRow[]> {
  const supabase = await createServerSupabase();
  let q = supabase
    .from('daily_reports')
    .select(
      `${REPORT_COLS},
       location:locations ( name_i18n ),
       campaign:campaigns ( name_i18n ),
       promoter:profiles!daily_reports_promoter_user_id_fkey ( full_name )`,
    )
    .order('report_date', { ascending: false })
    .limit(filters.limit ?? 100);

  if (filters.status && filters.status.length > 0) {
    q = q.in('status', filters.status);
  }
  if (filters.campaignId) q = q.eq('campaign_id', filters.campaignId);
  if (filters.locationId) q = q.eq('location_id', filters.locationId);
  if (filters.fromDate) q = q.gte('report_date', filters.fromDate);
  if (filters.toDate) q = q.lte('report_date', filters.toDate);

  const { data } = await q;
  if (!data) return [];
  type RelOne<T> = T | T[] | null;
  type Row = DailyReportRow & {
    location: RelOne<{ name_i18n: { ar?: string; en?: string } | null }>;
    campaign: RelOne<{ name_i18n: { ar?: string; en?: string } | null }>;
    promoter: RelOne<{ full_name: string | null }>;
  };
  const pick = <T,>(v: RelOne<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  return (data as unknown as Row[]).map((r) => {
    const loc = pick(r.location);
    const camp = pick(r.campaign);
    const prom = pick(r.promoter);
    return {
      ...r,
      location_name_i18n: loc?.name_i18n ?? null,
      campaign_name_i18n: camp?.name_i18n ?? null,
      promoter_name: prom?.full_name ?? null,
    };
  });
}
