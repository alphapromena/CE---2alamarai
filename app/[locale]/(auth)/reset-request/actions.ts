'use server';

import { headers } from 'next/headers';
import { getLocale } from 'next-intl/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/auth/audit';
import { requestResetSchema } from '@/lib/validations/auth';
import { checkRateLimit } from '@/lib/rate-limit/check';

export type ResetRequestState = { ok: boolean; error: string | null };

function getAppOrigin(hostHeader: string | null): string {
  const envOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (envOrigin) return envOrigin.replace(/\/$/, '');
  if (hostHeader) return `https://${hostHeader}`;
  return 'http://localhost:3000';
}

export async function resetRequestAction(
  _prev: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  const locale = await getLocale();
  const h = await headers();

  const rl = await checkRateLimit('reset_request');
  if (!rl.allowed) {
    await logAuditEvent({
      actor_id: null,
      action: 'auth.reset_request_rate_limited',
      entity: 'auth',
      after: { count: rl.count, reset_at: rl.resetAt.toISOString() },
    });
    // Still reply 'ok' to avoid leaking rate-limit state to scrapers.
    return { ok: true, error: null };
  }

  const parsed = requestResetSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) {
    // Still reply 'ok' to avoid leaking which emails exist.
    return { ok: true, error: null };
  }

  const supabase = await createServerSupabase();
  const origin = getAppOrigin(h.get('host'));
  const redirectTo = `${origin}/${locale}/auth/callback?next=/reset-confirm`;

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo,
  });

  await logAuditEvent({
    actor_id: null,
    action: error ? 'auth.reset_request_failed' : 'auth.reset_request_sent',
    entity: 'auth',
    after: { email: parsed.data.email, error: error?.message ?? null },
  });

  // Always return ok so the UI cannot be used for email enumeration.
  return { ok: true, error: null };
}
