'use server';

import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/auth/audit';
import { isUserRole, LANDING_PATH_BY_ROLE } from '@/lib/auth/roles';
import { loginSchema } from '@/lib/validations/auth';

export type LoginActionState = { error: string | null };

export async function loginAction(
  _prev: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const locale = await getLocale();

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

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, active')
    .eq('id', data.user.id)
    .single();

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
