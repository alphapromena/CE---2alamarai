import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';

export type SupervisorVisitRow = {
  id: string;
  supervisor_id: string;
  campaign_id: string;
  location_id: string;
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
};

const VISIT_COLS =
  'id, supervisor_id, campaign_id, location_id, visited_at, lat, lng, distance_m, is_within_geofence, photo_path, outcome, notes, created_at, updated_at';

export async function listSupervisorVisits(opts?: {
  limit?: number;
  campaignId?: string;
  locationId?: string;
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
  if (opts?.fromDate) q = q.gte('visited_at', opts.fromDate);
  if (opts?.toDate) q = q.lte('visited_at', opts.toDate);
  const { data, error } = await q.limit(opts?.limit ?? 100);
  if (error) return [];
  return (data ?? []) as SupervisorVisitRow[];
}
