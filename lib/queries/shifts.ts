import 'server-only';
import { createAdminSupabase } from '@/lib/supabase/admin';

export type ShiftRow = {
  id: string;
  campaign_id: string;
  campaign_name_i18n: { ar?: string; en?: string } | null;
  location_id: string;
  location_name_i18n: { ar?: string; en?: string } | null;
  start_time: string; // 'HH:MM:SS'
  end_time: string;
  days_of_week: number[];
  active: boolean;
  created_at: string;
};

const SELECT = `
  id, campaign_id, location_id, start_time, end_time, days_of_week, active, created_at,
  campaign:campaigns ( name_i18n ),
  location:locations ( name_i18n )
`;

function flatten(row: unknown): ShiftRow {
  const r = row as {
    id: string;
    campaign_id: string;
    location_id: string;
    start_time: string;
    end_time: string;
    days_of_week: number[];
    active: boolean;
    created_at: string;
    campaign: { name_i18n: { ar?: string; en?: string } } | null;
    location: { name_i18n: { ar?: string; en?: string } } | null;
  };
  return {
    id: r.id,
    campaign_id: r.campaign_id,
    campaign_name_i18n: r.campaign?.name_i18n ?? null,
    location_id: r.location_id,
    location_name_i18n: r.location?.name_i18n ?? null,
    start_time: r.start_time,
    end_time: r.end_time,
    days_of_week: r.days_of_week ?? [],
    active: r.active,
    created_at: r.created_at,
  };
}

export async function listShifts(): Promise<ShiftRow[]> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from('shifts')
    .select(SELECT)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`shifts list failed: ${error.message}`);
  return (data ?? []).map(flatten);
}

export async function getShift(id: string): Promise<ShiftRow | null> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.from('shifts').select(SELECT).eq('id', id).maybeSingle();
  if (error) throw new Error(`shift get failed: ${error.message}`);
  return data ? flatten(data) : null;
}

/**
 * Returns active campaigns with their assigned locations, as a flat list of
 * (campaign, location) pairs that are eligible for shifts. Empty when no
 * campaign_locations exist.
 */
export async function listShiftEligiblePairs(): Promise<
  {
    campaign_id: string;
    campaign_name_i18n: { ar?: string; en?: string };
    location_id: string;
    location_name_i18n: { ar?: string; en?: string };
  }[]
> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.from('campaign_locations').select(
    `
      campaign_id,
      location_id,
      campaign:campaigns ( name_i18n, status ),
      location:locations ( name_i18n, active )
    `,
  );
  if (error) throw new Error(`shift-eligible-pairs failed: ${error.message}`);
  return (data ?? [])
    .map((row) => {
      const r = row as unknown as {
        campaign_id: string;
        location_id: string;
        campaign: { name_i18n: { ar?: string; en?: string }; status: string } | null;
        location: { name_i18n: { ar?: string; en?: string }; active: boolean } | null;
      };
      if (!r.campaign || !r.location || !r.location.active) return null;
      if (r.campaign.status === 'cancelled' || r.campaign.status === 'completed') return null;
      return {
        campaign_id: r.campaign_id,
        campaign_name_i18n: r.campaign.name_i18n,
        location_id: r.location_id,
        location_name_i18n: r.location.name_i18n,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
}
