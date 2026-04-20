import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';

export type CampaignRef = {
  id: string;
  name_i18n: { ar?: string; en?: string };
};

export type LocationRef = {
  id: string;
  name_i18n: { ar?: string; en?: string };
};

/**
 * Campaigns visible to the caller (RLS-filtered). For supervisors this is
 * the set of campaigns that touch one of their assigned locations; for
 * admins, all.
 */
export async function listVisibleCampaignsForSupervisor(): Promise<
  CampaignRef[]
> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('campaigns')
    .select('id, name_i18n')
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []) as CampaignRef[];
}

/**
 * Locations visible to the caller. Same RLS semantics as above.
 */
export async function listVisibleLocationsForSupervisor(): Promise<
  LocationRef[]
> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('locations')
    .select('id, name_i18n')
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []) as LocationRef[];
}

export type SupervisorCampaignLocation = {
  campaign_id: string;
  campaign_name_i18n: { ar?: string; en?: string };
  location_id: string;
  location_name_i18n: { ar?: string; en?: string };
  location_lat: number;
  location_lng: number;
  geofence_radius_m: number;
};

export type LocationPromoter = {
  id: string;
  full_name: string;
  location_id: string;
};

/**
 * Active promoters assigned to a set of locations. Used by the
 * supervisor-visit-new form so the promoter dropdown shows only promoters
 * who actually work at the selected (campaign, location) pair.
 *
 * RLS-aware via the server supabase client; the supervisor only sees
 * promoters at their assigned locations (assigned_locations overlap).
 */
export async function listPromotersAtLocations(
  locationIds: string[],
): Promise<LocationPromoter[]> {
  if (locationIds.length === 0) return [];
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, assigned_locations')
    .eq('role', 'promoter')
    .eq('active', true)
    .overlaps('assigned_locations', locationIds);
  if (error) return [];
  type Row = { id: string; full_name: string; assigned_locations: string[] | null };
  const out: LocationPromoter[] = [];
  for (const r of (data ?? []) as Row[]) {
    const assigned = r.assigned_locations ?? [];
    for (const loc of locationIds) {
      if (assigned.includes(loc)) {
        out.push({ id: r.id, full_name: r.full_name, location_id: loc });
      }
    }
  }
  return out;
}

/**
 * (campaign, location) pairs the supervisor may visit — those at their
 * assigned locations with linked active campaigns. Used by the new-visit
 * form.
 */
export async function listSupervisorVisitTargets(): Promise<
  SupervisorCampaignLocation[]
> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('campaign_locations')
    .select(
      `
      campaign_id,
      location_id,
      campaign:campaigns ( name_i18n, status ),
      location:locations ( name_i18n, lat, lng, geofence_radius_m, active )
      `,
    );
  if (error) return [];
  type Raw = {
    campaign_id: string;
    location_id: string;
    campaign: { name_i18n: { ar?: string; en?: string }; status: string } | null;
    location: {
      name_i18n: { ar?: string; en?: string };
      lat: number;
      lng: number;
      geofence_radius_m: number;
      active: boolean;
    } | null;
  };
  const out: SupervisorCampaignLocation[] = [];
  for (const r of data as unknown as Raw[]) {
    if (!r.campaign || !r.location) continue;
    if (!r.location.active) continue;
    if (r.campaign.status === 'cancelled' || r.campaign.status === 'completed') continue;
    out.push({
      campaign_id: r.campaign_id,
      campaign_name_i18n: r.campaign.name_i18n,
      location_id: r.location_id,
      location_name_i18n: r.location.name_i18n,
      location_lat: r.location.lat,
      location_lng: r.location.lng,
      geofence_radius_m: r.location.geofence_radius_m,
    });
  }
  return out;
}
