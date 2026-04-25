'use server';

import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/auth/audit';
import { logError } from '@/lib/observability/logger';
import { isUserRole, LANDING_PATH_BY_ROLE } from '@/lib/auth/roles';
import { setPasswordSchema } from '@/lib/validations/auth';

export type SetPasswordState = { error: string | null };

export async function setPasswordAction(
  _prev: SetPasswordState,
  formData: FormData,
): Promise<SetPasswordState> {
  const locale = await getLocale();

  const parsed = setPasswordSchema.safeParse({
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
    logError('setPasswordAction failed', {
      actor_id: user.id,
      code: (error as { name?: string; status?: number }).name,
      status: (error as { status?: number }).status,
      message: error.message,
    });
    return { error: 'unknown' };
  }

  // Phase 10: clear the temp-password flag for bulk-imported promoters so
  // the middleware redirect releases. Self-update is allowed by the
  // profiles_update_self RLS policy; the self-update guard permits this
  // column because it isn't on the protected list.
  await supabase
    .from('profiles')
    .update({ must_change_password: false })
    .eq('id', user.id);

  await logAuditEvent({
    actor_id: user.id,
    action: 'auth.password_set',
    entity: 'auth',
    entity_id: user.id,
  });

  // .maybeSingle() + destructure error: previous .single() collapsed four
  // cases (DB error, missing profile, role corrupted, account deactivated)
  // into a single 'deactivated' return — a transient DB error would tell
  // the user their account was deactivated. (TS-03.) Now: DB error and
  // missing-profile / corrupted-role surface as 'unknown'; only the
  // genuinely-deactivated case still returns 'deactivated'.
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('role, active')
    .eq('id', user.id)
    .maybeSingle();

  if (profileErr) {
    logError('setPasswordAction.profile_lookup_failed', {
      user_id: user.id,
      code: profileErr.code,
      message: profileErr.message,
    });
    await supabase.auth.signOut();
    return { error: 'unknown' };
  }

  if (!profile || !isUserRole(profile.role)) {
    // Profile genuinely missing (impossible after a successful auth.updateUser
    // unless the row was deleted between calls) or role enum corrupted.
    await supabase.auth.signOut();
    return { error: 'unknown' };
  }

  if (!profile.active) {
    await supabase.auth.signOut();
    return { error: 'deactivated' };
  }

  redirect(`/${locale}${LANDING_PATH_BY_ROLE[profile.role]}`);
}
