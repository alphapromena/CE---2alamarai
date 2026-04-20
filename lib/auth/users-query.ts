import 'server-only';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { isUserRole, type UserRole } from './roles';

export type AdminUserRow = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  active: boolean;
  preferred_language: 'ar' | 'en';
  assigned_locations: string[];
  created_at: string;
};

export async function listAdminUsers(roleFilter: UserRole | null): Promise<AdminUserRow[]> {
  const admin = createAdminSupabase();

  let profQuery = admin
    .from('profiles')
    .select('id, role, full_name, preferred_language, assigned_locations, active, created_at')
    .order('created_at', { ascending: false });
  if (roleFilter) profQuery = profQuery.eq('role', roleFilter);

  const { data: profiles, error: profError } = await profQuery;
  if (profError) throw new Error(`profiles query failed: ${profError.message}`);
  if (!profiles) return [];

  const ids = profiles.map((p) => p.id);
  const emails = new Map<string, string>();

  if (ids.length > 0) {
    const { data: emailRows, error: emailError } = await admin.rpc('admin_get_user_emails', {
      p_user_ids: ids,
    });
    if (emailError) throw new Error(`admin_get_user_emails failed: ${emailError.message}`);
    for (const row of emailRows ?? []) {
      emails.set(row.id, row.email ?? '');
    }
  }

  const rows: AdminUserRow[] = [];
  for (const p of profiles) {
    if (!isUserRole(p.role)) continue;
    if (p.preferred_language !== 'ar' && p.preferred_language !== 'en') continue;
    rows.push({
      id: p.id,
      email: emails.get(p.id) ?? '',
      full_name: p.full_name,
      role: p.role,
      active: p.active,
      preferred_language: p.preferred_language,
      assigned_locations: p.assigned_locations ?? [],
      created_at: p.created_at,
    });
  }
  return rows;
}

export async function getAdminUser(userId: string): Promise<AdminUserRow | null> {
  const admin = createAdminSupabase();
  const { data: profile } = await admin
    .from('profiles')
    .select('id, role, full_name, preferred_language, assigned_locations, active, created_at')
    .eq('id', userId)
    .single();
  if (!profile || !isUserRole(profile.role)) return null;
  if (profile.preferred_language !== 'ar' && profile.preferred_language !== 'en') return null;

  const { data: emailRows } = await admin.rpc('admin_get_user_emails', {
    p_user_ids: [userId],
  });
  const email = emailRows?.[0]?.email ?? '';
  return {
    id: profile.id,
    email,
    full_name: profile.full_name,
    role: profile.role,
    active: profile.active,
    preferred_language: profile.preferred_language,
    assigned_locations: profile.assigned_locations ?? [],
    created_at: profile.created_at,
  };
}
