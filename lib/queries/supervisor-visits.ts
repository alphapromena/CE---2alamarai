import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';

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
  if (error) return [];
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
  if (error) return [];
  return ((data ?? []) as unknown as RawVisitRow[]).map(mapRaw);
}
