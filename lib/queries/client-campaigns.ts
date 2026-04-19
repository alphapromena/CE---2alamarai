import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * Client-facing campaign queries. These intentionally use the *server*
 * supabase client (anon key + cookies) so RLS applies — `client` users will
 * only see their own tenant's rows.
 */

export type ClientCampaignRow = {
  id: string;
  name_i18n: { ar?: string; en?: string };
  start_date: string;
  end_date: string;
  status: 'planned' | 'active' | 'completed' | 'cancelled';
};

export async function clientListCampaigns(): Promise<ClientCampaignRow[]> {
  const sb = await createServerSupabase();
  const { data, error } = await sb
    .from('campaigns')
    .select('id, name_i18n, start_date, end_date, status')
    .order('start_date', { ascending: false });
  if (error) throw new Error(`client campaigns list failed: ${error.message}`);
  return (data ?? []) as ClientCampaignRow[];
}

export type ClientCampaignDetail = ClientCampaignRow & {
  objectives: string | null;
  kpi_config: { sampling_rate_denominator?: 'contacts' | 'engaged' };
  locations: { id: string; name_i18n: { ar?: string; en?: string } }[];
  skus: {
    id: string;
    name_i18n: { ar?: string; en?: string };
    unit_i18n: { ar?: string; en?: string };
    target: number;
    stock_allocated: number;
    active: boolean;
  }[];
};

export async function clientGetCampaign(id: string): Promise<ClientCampaignDetail | null> {
  const sb = await createServerSupabase();
  const { data: campaign, error } = await sb
    .from('campaigns')
    .select('id, name_i18n, start_date, end_date, status, objectives, kpi_config')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`client campaign get failed: ${error.message}`);
  if (!campaign) return null;

  const [{ data: locRows }, { data: skuRows }] = await Promise.all([
    sb
      .from('campaign_locations')
      .select('location:locations ( id, name_i18n )')
      .eq('campaign_id', id),
    sb
      .from('skus')
      .select('id, name_i18n, unit_i18n, target, stock_allocated, active')
      .eq('campaign_id', id)
      .order('created_at', { ascending: true }),
  ]);

  const locations = (
    (locRows ?? []) as unknown as {
      location: { id: string; name_i18n: { ar?: string; en?: string } } | null;
    }[]
  )
    .map((r) => r.location)
    .filter((l): l is NonNullable<typeof l> => l !== null);

  return {
    id: campaign.id,
    name_i18n: campaign.name_i18n,
    start_date: campaign.start_date,
    end_date: campaign.end_date,
    status: campaign.status,
    objectives: campaign.objectives,
    kpi_config: campaign.kpi_config ?? {},
    locations,
    skus: (skuRows ?? []) as ClientCampaignDetail['skus'],
  };
}
