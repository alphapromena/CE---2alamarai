import 'server-only';
import { createAdminSupabase } from '@/lib/supabase/admin';

export type ClientRow = {
  id: string;
  name: string;
  name_i18n: { ar?: string; en?: string };
  contact_email: string | null;
  contact_phone: string | null;
  active: boolean;
  created_at: string;
};

const SELECT_COLUMNS = 'id, name, name_i18n, contact_email, contact_phone, active, created_at';

export async function listClients(): Promise<ClientRow[]> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from('clients')
    .select(SELECT_COLUMNS)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`clients list failed: ${error.message}`);
  return (data ?? []) as ClientRow[];
}

export async function getClient(id: string): Promise<ClientRow | null> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from('clients')
    .select(SELECT_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`client get failed: ${error.message}`);
  return data as ClientRow | null;
}
