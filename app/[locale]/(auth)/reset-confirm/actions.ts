'use server';

import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/auth/audit';
import { logError } from '@/lib/observability/logger';
import { confirmResetSchema } from '@/lib/validations/auth';
import { checkRateLimit } from '@/lib/rate-limit/check';

export type ResetConfirmState = { error: string | null };

export async function resetConfirmAction(
  _prev: ResetConfirmState,
  formData: FormData,
): Promise<ResetConfirmState> {
  const locale = await getLocale();

  const rl = await checkRateLimit('reset_confirm');
  if (!rl.allowed) {
    return { error: 'rate_limited' };
  }

  const parsed = confirmResetSchema.safeParse({
    password: formData.get('password'),
    confirm_password: formData.get('confirm_password'),
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: first?.message ?? 'unknown' };
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'session_expired' };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    logError('resetConfirmAction failed', {
      actor_id: user.id,
      code: (error as { name?: string; status?: number }).name,
      status: (error as { status?: number }).status,
      message: error.message,
    });
    return { error: 'unknown' };
  }

  await logAuditEvent({
    actor_id: user.id,
    action: 'auth.password_reset',
    entity: 'auth',
    entity_id: user.id,
  });

  // Force re-login with the new password.
  await supabase.auth.signOut();

  redirect(`/${locale}/login?reset=ok`);
}
