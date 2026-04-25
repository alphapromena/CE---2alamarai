import 'server-only';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { logError } from '@/lib/observability/logger';

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
  if (error || !data) {
    if (error) {
      // Path is intentionally NOT logged (storage path = potential PII / row identifier).
      logError('signActivityPhotoUrl failed', {
        code: (error as { name?: string }).name,
        message: error.message,
      });
    }
    return null;
  }
  return data.signedUrl;
}
