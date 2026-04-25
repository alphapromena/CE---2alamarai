'use server';

import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/auth/audit';
import { logError } from '@/lib/observability/logger';
import { isUserRole, LANDING_PATH_BY_ROLE } from '@/lib/auth/roles';
import { loginSchema } from '@/lib/validations/auth';
import { checkRateLimit } from '@/lib/rate-limit/check';

export type LoginActionState = { error: string | null };

export async function loginAction(
  _prev: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const locale = await getLocale();

  const rl = await checkRateLimit('login');
  if (!rl.allowed) {
    await logAuditEvent({
      actor_id: null,
      action: 'auth.login_rate_limited',
      entity: 'auth',
      after: { count: rl.count, reset_at: rl.resetAt.toISOString() },
    });
    return { error: 'rate_limited' };
  }

  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: 'invalid_credentials' };
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    await logAuditEvent({
      actor_id: null,
      action: 'auth.login_failed',
      entity: 'auth',
      after: { email: parsed.data.email, reason: error?.message ?? 'unknown' },
    });
    return { error: 'invalid_credentials' };
  }

  // .maybeSingle() + destructure error: previous .single() conflated a DB
  // error with a missing profile, then masked both as 'invalid_credentials' —
  // a transient DB issue would log the user out as if their password was
  // wrong, with no breadcrumb. (TS-03.) DB errors now surface as 'unknown';
  // the genuinely-missing-profile case still returns 'invalid_credentials'
  // intentionally (security UX — don't reveal which users have profiles).
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('role, active')
    .eq('id', data.user.id)
    .maybeSingle();

  if (profileErr) {
    logError('loginAction.profile_lookup_failed', {
      user_id: data.user.id,
      code: profileErr.code,
      message: profileErr.message,
    });
    await supabase.auth.signOut();
    return { error: 'unknown' };
  }

  if (!profile) {
    await supabase.auth.signOut();
    await logAuditEvent({
      actor_id: data.user.id,
      action: 'auth.login_no_profile',
      entity: 'auth',
    });
    return { error: 'invalid_credentials' };
  }

  if (!profile.active) {
    await supabase.auth.signOut();
    await logAuditEvent({
      actor_id: data.user.id,
      action: 'auth.login_deactivated',
      entity: 'auth',
    });
    return { error: 'deactivated' };
  }

  if (!isUserRole(profile.role)) {
    await supabase.auth.signOut();
    return { error: 'invalid_credentials' };
  }

  await logAuditEvent({
    actor_id: data.user.id,
    action: 'auth.login_success',
    entity: 'auth',
    entity_id: data.user.id,
    after: { email: parsed.data.email, role: profile.role },
  });

  redirect(`/${locale}${LANDING_PATH_BY_ROLE[profile.role]}`);
}
