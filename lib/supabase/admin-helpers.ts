import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * Subset of `public.profiles` columns an admin server action may patch.
 * Hand-typed against `supabase/migrations/20260419000000_phase1_auth_profiles_audit.sql`,
 * `20260419010000_phase2_clients.sql`, and `20260427000000_phase10_bulk_import.sql`.
 * Migrate to the generated `Database['public']['Tables']['profiles']['Update']`
 * type once `supabase gen types` is wired (TS-01 / D-N+1).
 */
export type ProfileAdminPatch = Partial<{
  full_name: string;
  phone: string | null;
  preferred_language: 'ar' | 'en';
  role: 'admin' | 'supervisor' | 'promoter' | 'client';
  active: boolean;
  client_id: string | null;
  created_by: string | null;
  assigned_locations: string[];
  must_change_password: boolean;
}>;

/**
 * Update a `public.profiles` row from an admin server action.
 *
 * ⚠️ D-044 / D-046: any UPDATE on `profiles` that touches `role`, `active`,
 * `client_id`, `created_by`, or `assigned_locations` MUST run on the SSR
 * client (`createServerSupabase()`) — NOT the service-role admin client.
 * The `profiles_self_update_guard_trg` trigger short-circuits via
 * `public.is_admin()`, which reads `auth.uid()`. Service-role connections
 * carry no end-user JWT, so `auth.uid()` is NULL, the guard rejects, and
 * the UPDATE silently fails (or surfaces as `{ error: 'unknown' }`).
 *
 * This helper is the canonical path for admin-driven profile updates. Use
 * it for ALL admin-initiated profile UPDATEs, even benign columns like
 * `phone` or `full_name`, so the correct client is the easy default and
 * mistakes can't recur (D-044 was violated twice already — commit `1520347`
 * for `inviteUserAction` and SEC-01 for `bulkImportAction`).
 *
 * Authorization is the caller's responsibility — call `requireAdmin()` at
 * the top of the action. The helper does not re-check.
 *
 * @example
 *   const { error } = await updateProfileAsAdmin(userId, {
 *     created_by: actor.id,
 *     must_change_password: true,
 *   });
 */
export async function updateProfileAsAdmin(
  userId: string,
  patch: ProfileAdminPatch,
) {
  const supabase = await createServerSupabase();
  return supabase.from('profiles').update(patch).eq('id', userId);
}
