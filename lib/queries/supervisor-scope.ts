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
