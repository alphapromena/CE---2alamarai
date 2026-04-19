import 'server-only';
import { createAdminSupabase } from '@/lib/supabase/admin';

export type CampaignRow = {
  id: string;
  client_id: string;
  client_name: string | null;
  name_i18n: { ar?: string; en?: string };
  start_date: string;
  end_date: string;
  objectives: string | null;
  kpi_config: { sampling_rate_denominator?: 'contacts' | 'engaged' };
  status: 'planned' | 'active' | 'completed' | 'cancelled';
  created_at: string;
};

const SELECT = `
  id, client_id, name_i18n, start_date, end_date, objectives, kpi_config, status, created_at,
  client:clients ( name )
`;

function flatten(row: unknown): CampaignRow {
  const r = row as unknown as {
    id: string;
    client_id: string;
    name_i18n: { ar?: string; en?: string };
    start_date: string;
    end_date: string;
    objectives: string | null;
    kpi_config: { sampling_rate_denominator?: 'contacts' | 'engaged' };
    status: CampaignRow['status'];
    created_at: string;
    client: { name: string } | null;
  };
  return {
    id: r.id,
    client_id: r.client_id,
    client_name: r.client?.name ?? null,
    name_i18n: r.name_i18n,
    start_date: r.start_date,
    end_date: r.end_date,
    objectives: r.objectives,
    kpi_config: r.kpi_config ?? {},
    status: r.status,
    created_at: r.created_at,
  };
}

export async function listCampaigns(clientFilter: string | null): Promise<CampaignRow[]> {
  const admin = createAdminSupabase();
  let q = admin.from('campaigns').select(SELECT).order('created_at', { ascending: false });
  if (clientFilter) q = q.eq('client_id', clientFilter);
  const { data, error } = await q;
  if (error) throw new Error(`campaigns list failed: ${error.message}`);
  return (data ?? []).map(flatten);
}

export async function getCampaign(id: string): Promise<CampaignRow | null> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.from('campaigns').select(SELECT).eq('id', id).maybeSingle();
  if (error) throw new Error(`campaign get failed: ${error.message}`);
  return data ? flatten(data) : null;
}

export async function listClientsForSelect(): Promise<{ id: string; name: string }[]> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from('clients')
    .select('id, name')
    .eq('active', true)
    .order('name', { ascending: true });
  if (error) throw new Error(`clients-for-select failed: ${error.message}`);
  return data ?? [];
}

export async function listCampaignLocationIds(campaignId: string): Promise<string[]> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from('campaign_locations')
    .select('location_id')
    .eq('campaign_id', campaignId);
  if (error) throw new Error(`campaign_locations list failed: ${error.message}`);
  return (data ?? []).map((r) => r.location_id as string);
}

export type CampaignSkuRow = {
  id: string;
  campaign_id: string;
  name_i18n: { ar?: string; en?: string };
  unit_i18n: { ar?: string; en?: string };
  target: number;
  stock_allocated: number;
  active: boolean;
};

export async function listCampaignSkus(campaignId: string): Promise<CampaignSkuRow[]> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from('skus')
    .select('id, campaign_id, name_i18n, unit_i18n, target, stock_allocated, active')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`skus list failed: ${error.message}`);
  return (data ?? []) as CampaignSkuRow[];
}
