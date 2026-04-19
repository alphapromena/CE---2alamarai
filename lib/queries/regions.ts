import 'server-only';
import { createAdminSupabase } from '@/lib/supabase/admin';

export type RegionRow = {
  id: string;
  name_i18n: { ar?: string; en?: string };
  country_code: string;
  active: boolean;
  created_at: string;
};

const SELECT_COLUMNS = 'id, name_i18n, country_code, active, created_at';

export async function listRegions(): Promise<RegionRow[]> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from('regions')
    .select(SELECT_COLUMNS)
    .order('country_code', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw new Error(`regions list failed: ${error.message}`);
  return (data ?? []) as RegionRow[];
}

export async function getRegion(id: string): Promise<RegionRow | null> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from('regions')
    .select(SELECT_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`region get failed: ${error.message}`);
  return data as RegionRow | null;
}
