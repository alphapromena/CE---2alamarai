import 'server-only';
import { createAdminSupabase } from '@/lib/supabase/admin';

export type LocationRow = {
  id: string;
  city_id: string;
  city_name_i18n: { ar?: string; en?: string } | null;
  region_country_code: string | null;
  name_i18n: { ar?: string; en?: string };
  address: string | null;
  lat: number;
  lng: number;
  geofence_radius_m: number;
  active: boolean;
  created_at: string;
};

const SELECT = `
  id, city_id, name_i18n, address, lat, lng, geofence_radius_m, active, created_at,
  city:cities ( name_i18n, region:regions ( country_code ) )
`;

function flatten(row: unknown): LocationRow {
  const r = row as {
    id: string;
    city_id: string;
    name_i18n: { ar?: string; en?: string };
    address: string | null;
    lat: number;
    lng: number;
    geofence_radius_m: number;
    active: boolean;
    created_at: string;
    city: {
      name_i18n: { ar?: string; en?: string };
      region: { country_code: string } | null;
    } | null;
  };
  return {
    id: r.id,
    city_id: r.city_id,
    city_name_i18n: r.city?.name_i18n ?? null,
    region_country_code: r.city?.region?.country_code ?? null,
    name_i18n: r.name_i18n,
    address: r.address,
    lat: r.lat,
    lng: r.lng,
    geofence_radius_m: r.geofence_radius_m,
    active: r.active,
    created_at: r.created_at,
  };
}

export async function listLocations(cityId: string | null): Promise<LocationRow[]> {
  const admin = createAdminSupabase();
  let q = admin.from('locations').select(SELECT).order('created_at', { ascending: false });
  if (cityId) q = q.eq('city_id', cityId);
  const { data, error } = await q;
  if (error) throw new Error(`locations list failed: ${error.message}`);
  return (data ?? []).map(flatten);
}

export async function getLocation(id: string): Promise<LocationRow | null> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.from('locations').select(SELECT).eq('id', id).maybeSingle();
  if (error) throw new Error(`location get failed: ${error.message}`);
  return data ? flatten(data) : null;
}

export async function listAllCitiesForSelect(): Promise<
  { id: string; name_i18n: { ar?: string; en?: string }; country_code: string | null }[]
> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from('cities')
    .select('id, name_i18n, region:regions ( country_code )')
    .eq('active', true)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`cities-for-select failed: ${error.message}`);
  return (data ?? []).map((row) => {
    const r = row as unknown as {
      id: string;
      name_i18n: { ar?: string; en?: string };
      region: { country_code: string } | null;
    };
    return { id: r.id, name_i18n: r.name_i18n, country_code: r.region?.country_code ?? null };
  });
}
