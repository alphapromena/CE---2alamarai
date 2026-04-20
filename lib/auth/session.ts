import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';
import { isUserRole, type UserRole } from './roles';

export type SessionProfile = {
  id: string;
  role: UserRole;
  full_name: string;
  phone: string | null;
  preferred_language: 'ar' | 'en';
  assigned_locations: string[];
  active: boolean;
  /** Tenant for the client role (D-016). NULL for admin/supervisor/promoter. */
  client_id: string | null;
};

export async function getSessionUser() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getSessionProfile(): Promise<SessionProfile | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, full_name, phone, preferred_language, assigned_locations, active, client_id')
    .eq('id', user.id)
    .single();

  if (error || !data) return null;
  if (!isUserRole(data.role)) return null;
  if (data.preferred_language !== 'ar' && data.preferred_language !== 'en') return null;

  return data as SessionProfile;
}
