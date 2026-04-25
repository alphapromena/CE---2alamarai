import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { logError } from '@/lib/observability/logger';
import type { StockEntityType, StockMovementKind } from '@/lib/stock/ledger';

export type StockBalanceRow = {
  campaign_id: string;
  sku_id: string;
  entity_type: StockEntityType;
  entity_id: string | null;
  total_in: number;
  total_out: number;
  balance: number;
};

export type StockMovementListRow = {
  id: string;
  campaign_id: string;
  sku_id: string;
  from_entity_type: StockEntityType;
  from_entity_id: string | null;
  to_entity_type: StockEntityType;
  to_entity_id: string | null;
  quantity: number;
  movement_kind: StockMovementKind;
  user_id: string;
  location_id: string | null;
  reason: string | null;
  correction_of: string | null;
  reallocation_group_id: string | null;
  created_at: string;
  campaign_name_i18n: { ar?: string; en?: string } | null;
  sku_name_i18n: { ar?: string; en?: string } | null;
  location_name_i18n: { ar?: string; en?: string } | null;
  user_name: string | null;
};

export type EntityLabelRow = {
  id: string;
  label: string;
};

const MOVEMENT_COLS =
  'id, campaign_id, sku_id, from_entity_type, from_entity_id, to_entity_type, to_entity_id, quantity, movement_kind, user_id, location_id, reason, correction_of, reallocation_group_id, created_at';

/**
 * Pull balances for a campaign. RLS applies (admin sees everything;
 * supervisor sees their scope; promoter sees self).
 */
export async function listCampaignBalances(
  campaignId: string,
): Promise<StockBalanceRow[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('stock_balances')
    .select('*')
    .eq('campaign_id', campaignId);
  return (data as StockBalanceRow[] | null) ?? [];
}

/**
 * Admin-scoped audit trail. Joins campaign/sku/location names and the actor's
 * full_name. Ordered most-recent first. Filterable by campaign/kind/date.
 */
export async function listMovements(filters: {
  campaignId?: string | null;
  kind?: StockMovementKind | null;
  fromDate?: string | null;
  toDate?: string | null;
  limit?: number;
}): Promise<StockMovementListRow[]> {
  const supabase = await createServerSupabase();
  let q = supabase
    .from('stock_movements')
    .select(
      `${MOVEMENT_COLS},
       campaign:campaigns ( name_i18n ),
       sku:skus ( name_i18n ),
       location:locations ( name_i18n ),
       actor:profiles!stock_movements_user_id_fkey ( full_name )`,
    )
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 200);
  if (filters.campaignId) q = q.eq('campaign_id', filters.campaignId);
  if (filters.kind) q = q.eq('movement_kind', filters.kind);
  if (filters.fromDate) q = q.gte('created_at', filters.fromDate);
  if (filters.toDate) q = q.lte('created_at', filters.toDate);
  const { data } = await q;
  if (!data) return [];
  type RelOne<T> = T | T[] | null;
  type Row = StockMovementListRow & {
    campaign: RelOne<{ name_i18n: { ar?: string; en?: string } | null }>;
    sku: RelOne<{ name_i18n: { ar?: string; en?: string } | null }>;
    location: RelOne<{ name_i18n: { ar?: string; en?: string } | null }>;
    actor: RelOne<{ full_name: string | null }>;
  };
  const pick = <T,>(v: RelOne<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  return (data as unknown as Row[]).map((r) => {
    const camp = pick(r.campaign);
    const sku = pick(r.sku);
    const loc = pick(r.location);
    const actor = pick(r.actor);
    return {
      ...r,
      campaign_name_i18n: camp?.name_i18n ?? null,
      sku_name_i18n: sku?.name_i18n ?? null,
      location_name_i18n: loc?.name_i18n ?? null,
      user_name: actor?.full_name ?? null,
    };
  });
}

export async function getMovement(id: string): Promise<StockMovementListRow | null> {
  const supabase = await createServerSupabase();
  // Destructure error so DB failures are logged; previous code returned null
  // on both genuine not-found and DB error indistinguishably.
  const { data, error } = await supabase
    .from('stock_movements')
    .select(
      `${MOVEMENT_COLS},
       campaign:campaigns ( name_i18n ),
       sku:skus ( name_i18n ),
       location:locations ( name_i18n ),
       actor:profiles!stock_movements_user_id_fkey ( full_name )`,
    )
    .eq('id', id)
    .maybeSingle();
  if (error) {
    logError('getMovement failed', {
      movement_id: id,
      code: error.code,
      message: error.message,
    });
    return null;
  }
  if (!data) return null;
  type RelOne<T> = T | T[] | null;
  type Row = StockMovementListRow & {
    campaign: RelOne<{ name_i18n: { ar?: string; en?: string } | null }>;
    sku: RelOne<{ name_i18n: { ar?: string; en?: string } | null }>;
    location: RelOne<{ name_i18n: { ar?: string; en?: string } | null }>;
    actor: RelOne<{ full_name: string | null }>;
  };
  const pick = <T,>(v: RelOne<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const r = data as unknown as Row;
  const camp = pick(r.campaign);
  const sku = pick(r.sku);
  const loc = pick(r.location);
  const actor = pick(r.actor);
  return {
    ...r,
    campaign_name_i18n: camp?.name_i18n ?? null,
    sku_name_i18n: sku?.name_i18n ?? null,
    location_name_i18n: loc?.name_i18n ?? null,
    user_name: actor?.full_name ?? null,
  };
}

/**
 * Admin picker data — active supervisors across all clients.
 */
export async function listSupervisors(): Promise<EntityLabelRow[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'supervisor')
    .eq('active', true)
    .order('full_name', { ascending: true });
  return ((data as { id: string; full_name: string | null }[] | null) ?? []).map((r) => ({
    id: r.id,
    label: r.full_name ?? r.id,
  }));
}

/**
 * Admin picker data — active promoters. Optionally scoped to the supervisor's
 * assigned-location set for supervisor UI.
 */
export async function listPromoters(locationIds?: readonly string[] | null): Promise<EntityLabelRow[]> {
  const admin = createAdminSupabase();
  if (!locationIds || locationIds.length === 0) {
    const { data } = await admin
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'promoter')
      .eq('active', true)
      .order('full_name', { ascending: true });
    return ((data as { id: string; full_name: string | null }[] | null) ?? []).map((r) => ({
      id: r.id,
      label: r.full_name ?? r.id,
    }));
  }
  // Supervisor scope: promoters currently assigned to one of the locations.
  const { data } = await admin
    .from('user_assignments')
    .select('user_id, user:profiles!user_assignments_user_id_fkey ( id, full_name, role, active )')
    .in('location_id', locationIds as string[])
    .eq('active', true);
  const seen = new Set<string>();
  type Row = {
    user_id: string;
    user: { id: string; full_name: string | null; role: string; active: boolean } | { id: string; full_name: string | null; role: string; active: boolean }[] | null;
  };
  const out: EntityLabelRow[] = [];
  for (const row of (data as Row[] | null) ?? []) {
    const u = Array.isArray(row.user) ? row.user[0] : row.user;
    if (!u || u.role !== 'promoter' || !u.active) continue;
    if (seen.has(u.id)) continue;
    seen.add(u.id);
    out.push({ id: u.id, label: u.full_name ?? u.id });
  }
  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

export async function listLocationsLite(): Promise<EntityLabelRow[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from('locations')
    .select('id, name_i18n')
    .eq('active', true)
    .order('created_at', { ascending: false });
  type Row = { id: string; name_i18n: { ar?: string; en?: string } | null };
  return ((data as Row[] | null) ?? []).map((r) => ({
    id: r.id,
    label: r.name_i18n?.en ?? r.name_i18n?.ar ?? r.id,
  }));
}

export async function listCampaignSkusAdmin(campaignId: string): Promise<EntityLabelRow[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from('skus')
    .select('id, name_i18n, kind')
    .eq('campaign_id', campaignId)
    .eq('active', true)
    .order('created_at', { ascending: true });
  type Row = { id: string; name_i18n: { ar?: string; en?: string } | null; kind: string };
  return ((data as Row[] | null) ?? []).map((r) => ({
    id: r.id,
    label: (r.name_i18n?.en ?? r.name_i18n?.ar ?? r.id) + ` · ${r.kind}`,
  }));
}
