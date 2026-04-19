import 'server-only';
import { createAdminSupabase } from '@/lib/supabase/admin';

export type CityRow = {
  id: string;
  region_id: string;
  region_name_i18n: { ar?: string; en?: string } | null;
  region_country_code: string | null;
  name_i18n: { ar?: string; en?: string };
  active: boolean;
  created_at: string;
};

export async function listCities(regionId: string | null): Promise<CityRow[]> {
  const admin = createAdminSupabase();
  let q = admin
    .from('cities')
    .select(
      'id, region_id, name_i18n, active, created_at, region:regions ( name_i18n, country_code )',
    )
    .order('created_at', { ascending: false });
  if (regionId) q = q.eq('region_id', regionId);
  const { data, error } = await q;
  if (error) throw new Error(`cities list failed: ${error.message}`);
  return (data ?? []).map((row) => {
    const r = row as unknown as {
      id: string;
      region_id: string;
      name_i18n: { ar?: string; en?: string };
      active: boolean;
      created_at: string;
      region: { name_i18n: { ar?: string; en?: string }; country_code: string } | null;
    };
    return {
      id: r.id,
      region_id: r.region_id,
      region_name_i18n: r.region?.name_i18n ?? null,
      region_country_code: r.region?.country_code ?? null,
      name_i18n: r.name_i18n,
      active: r.active,
      created_at: r.created_at,
    };
  });
}

export async function getCity(id: string): Promise<CityRow | null> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from('cities')
    .select(
      'id, region_id, name_i18n, active, created_at, region:regions ( name_i18n, country_code )',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`city get failed: ${error.message}`);
  if (!data) return null;
  const r = data as unknown as {
    id: string;
    region_id: string;
    name_i18n: { ar?: string; en?: string };
    active: boolean;
    created_at: string;
    region: { name_i18n: { ar?: string; en?: string }; country_code: string } | null;
  };
  return {
    id: r.id,
    region_id: r.region_id,
    region_name_i18n: r.region?.name_i18n ?? null,
    region_country_code: r.region?.country_code ?? null,
    name_i18n: r.name_i18n,
    active: r.active,
    created_at: r.created_at,
  };
}
