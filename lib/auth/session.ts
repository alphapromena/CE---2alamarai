import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';
import { logError } from '@/lib/observability/logger';
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

  // .maybeSingle() so a missing profile (auth user exists, profile row not
  // yet materialised by handle_new_user trigger, etc.) returns data=null
  // without raising. .single() conflated that case with a real DB error.
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, full_name, phone, preferred_language, assigned_locations, active, client_id')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    logError('getSessionProfile failed', {
      user_id: user.id,
      code: error.code,
      message: error.message,
    });
    return null;
  }
  if (!data) return null;
  if (!isUserRole(data.role)) return null;
  if (data.preferred_language !== 'ar' && data.preferred_language !== 'en') return null;

  return data as SessionProfile;
}
