import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';
import { logError } from '@/lib/observability/logger';

export type SupervisorVisitRow = {
  id: string;
  supervisor_id: string;
  campaign_id: string;
  location_id: string;
  promoter_id: string | null;
  visited_at: string;
  lat: number;
  lng: number;
  distance_m: number;
  is_within_geofence: boolean;
  photo_path: string;
  outcome: 'ok' | 'issue_found' | 'coaching' | 'other';
  notes: string | null;
  created_at: string;
  updated_at: string;
  campaign_name_i18n: { ar?: string; en?: string } | null;
  location_name_i18n: { ar?: string; en?: string } | null;
  supervisor_name: string | null;
  promoter_name: string | null;
};

const VISIT_COLS = `
  id, supervisor_id, campaign_id, location_id, promoter_id, visited_at, lat, lng,
  distance_m, is_within_geofence, photo_path, outcome, notes, created_at,
  updated_at,
  campaign:campaigns ( name_i18n ),
  location:locations ( name_i18n ),
  supervisor:profiles!supervisor_visits_supervisor_id_fkey ( full_name ),
  promoter:profiles!supervisor_visits_promoter_id_fkey ( full_name )
`;

type RawVisitRow = Omit<
  SupervisorVisitRow,
  'campaign_name_i18n' | 'location_name_i18n' | 'supervisor_name' | 'promoter_name'
> & {
  campaign: { name_i18n: { ar?: string; en?: string } } | null;
  location: { name_i18n: { ar?: string; en?: string } } | null;
  supervisor: { full_name: string } | null;
  promoter: { full_name: string } | null;
};

function mapRaw(r: RawVisitRow): SupervisorVisitRow {
  return {
    ...r,
    campaign_name_i18n: r.campaign?.name_i18n ?? null,
    location_name_i18n: r.location?.name_i18n ?? null,
    supervisor_name: r.supervisor?.full_name ?? null,
    promoter_name: r.promoter?.full_name ?? null,
  };
}

export async function listSupervisorVisits(opts?: {
  limit?: number;
  campaignId?: string;
  locationId?: string;
  promoterId?: string;
  supervisorId?: string;
  fromDate?: string;
  toDate?: string;
}): Promise<SupervisorVisitRow[]> {
  const supabase = await createServerSupabase();
  let q = supabase
    .from('supervisor_visits')
    .select(VISIT_COLS)
    .order('visited_at', { ascending: false });
  if (opts?.campaignId) q = q.eq('campaign_id', opts.campaignId);
  if (opts?.locationId) q = q.eq('location_id', opts.locationId);
  if (opts?.promoterId) q = q.eq('promoter_id', opts.promoterId);
  if (opts?.supervisorId) q = q.eq('supervisor_id', opts.supervisorId);
  if (opts?.fromDate) q = q.gte('visited_at', opts.fromDate);
  if (opts?.toDate) q = q.lte('visited_at', opts.toDate);
  const { data, error } = await q.limit(opts?.limit ?? 100);
  if (error) {
    logError('listSupervisorVisits failed', {
      code: error.code,
      message: error.message,
      campaign_id: opts?.campaignId,
      location_id: opts?.locationId,
      promoter_id: opts?.promoterId,
      supervisor_id: opts?.supervisorId,
    });
    return [];
  }
  return ((data ?? []) as unknown as RawVisitRow[]).map(mapRaw);
}

/**
 * Visits relevant to a daily_report's context — same location + same date,
 * either explicitly targeting this promoter (Feature 4 / D-041) or untargeted
 * (Phase 3 visits where promoter_id was always null). RLS-aware: admin sees
 * all, supervisor at assigned locations, promoter via own-promoter policy.
 *
 * `reportDate` is a YYYY-MM-DD string; expanded to a UTC day-window because
 * `visited_at` is a timestamptz.
 */
export async function listSupervisorVisitsForReport(
  promoterUserId: string,
  locationId: string,
  reportDate: string,
): Promise<SupervisorVisitRow[]> {
  const supabase = await createServerSupabase();
  const startIso = `${reportDate}T00:00:00Z`;
  const endIso = `${reportDate}T23:59:59.999Z`;
  const { data, error } = await supabase
    .from('supervisor_visits')
    .select(VISIT_COLS)
    .eq('location_id', locationId)
    .gte('visited_at', startIso)
    .lte('visited_at', endIso)
    .or(`promoter_id.is.null,promoter_id.eq.${promoterUserId}`)
    .order('visited_at', { ascending: false });
  if (error) {
    logError('listSupervisorVisitsForReport failed', {
      code: error.code,
      message: error.message,
      promoter_user_id: promoterUserId,
      location_id: locationId,
      report_date: reportDate,
    });
    return [];
  }
  return ((data ?? []) as unknown as RawVisitRow[]).map(mapRaw);
}

/**
 * Feature 4 / D-041: visits where promoter_id = auth.uid(). RLS admits via
 * the supervisor_visits_select_promoter_self policy.
 */
export async function listMyReceivedVisits(limit = 50): Promise<SupervisorVisitRow[]> {
  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return [];
  const { data, error } = await supabase
    .from('supervisor_visits')
    .select(VISIT_COLS)
    .eq('promoter_id', userData.user.id)
    .order('visited_at', { ascending: false })
    .limit(limit);
  if (error) {
    logError('listMyReceivedVisits failed', {
      code: error.code,
      message: error.message,
    });
    return [];
  }
  return ((data ?? []) as unknown as RawVisitRow[]).map(mapRaw);
}
