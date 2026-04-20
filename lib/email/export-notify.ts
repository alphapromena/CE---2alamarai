import 'server-only';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { logError, logWarn } from '@/lib/observability/logger';
import { isEmailConfigured, sendEmail } from './send';
import { exportReadyTemplate } from './templates';

/**
 * Fire-and-forget email notification for a finished export_jobs row.
 *
 * Contract: never throws. If anything fails (email provider down, user
 * missing, env unset), logs and returns quietly — the export is already
 * saved; the email is a convenience, not load-bearing. Also inserts a
 * `notifications` row so the in-app bell reflects the event regardless of
 * email delivery status (mirrors D-029 item 6 / D-031).
 */
export async function notifyExportReady(jobId: string, requestedBy: string): Promise<void> {
  if (!isEmailConfigured()) {
    // Still insert the in-app notification so the bell works.
    await insertInAppNotification(jobId, requestedBy).catch(() => undefined);
    return;
  }

  try {
    const admin = createAdminSupabase();

    // 1. Resolve recipient + preferred language.
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, preferred_language')
      .eq('id', requestedBy)
      .single();
    if (!profile) {
      logWarn('export.notify.profile_missing', { job_id: jobId, user_id: requestedBy });
      return;
    }
    const locale: 'ar' | 'en' = profile.preferred_language === 'ar' ? 'ar' : 'en';

    // 2. Resolve email from auth.users via the Phase-9 RPC.
    const { data: emailRows, error: emailErr } = await admin.rpc('admin_get_user_emails', {
      p_user_ids: [requestedBy],
    });
    if (emailErr || !emailRows?.[0]?.email) {
      logWarn('export.notify.email_missing', { job_id: jobId, user_id: requestedBy });
      return;
    }
    const toEmail = emailRows[0].email as string;

    // 3. Compose + send.
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
    const { subject, html, text } = exportReadyTemplate({
      locale,
      recipient_name: profile.full_name,
      job_id: jobId,
      app_url: appUrl,
    });
    const result = await sendEmail({ to: toEmail, subject, html, text });

    // 4. Always insert an in-app notification, regardless of email result.
    await insertInAppNotification(jobId, requestedBy, {
      emailed: result.status === 'sent',
      email_id: result.status === 'sent' ? result.id : null,
    });
  } catch (err) {
    logError('export.notify.exception', {
      job_id: jobId,
      user_id: requestedBy,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

async function insertInAppNotification(
  jobId: string,
  userId: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const admin = createAdminSupabase();
  await admin.from('notifications').insert({
    user_id: userId,
    kind: 'export_ready',
    payload: { job_id: jobId, ...extra },
  });
}
