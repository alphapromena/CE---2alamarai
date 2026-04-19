import 'server-only';
import { createAdminSupabase } from '@/lib/supabase/admin';

/**
 * Sign a short-lived URL for a private activity photo. Caller must have
 * already verified that the authenticated user may see the owning
 * daily_report. 5-minute TTL (D-019 pattern).
 */
export async function signActivityPhotoUrl(
  path: string,
  ttlSeconds = 300,
): Promise<string | null> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.storage
    .from('activity-photos')
    .createSignedUrl(path, ttlSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}
