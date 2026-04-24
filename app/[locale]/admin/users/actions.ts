'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { createServerSupabase } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/guards';
import { logAuditEvent } from '@/lib/auth/audit';
import { logError } from '@/lib/observability/logger';
import {
  inviteUserSchema,
  changeUserRoleSchema,
  setUserActiveSchema,
} from '@/lib/validations/auth';

export type AdminActionState = { error: string | null };

function getAppOrigin(hostHeader: string | null): string {
  const envOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (envOrigin) return envOrigin.replace(/\/$/, '');
  if (hostHeader) return `https://${hostHeader}`;
  return 'http://localhost:3000';
}

export async function inviteUserAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const actor = await requireAdmin();
  const locale = await getLocale();
  const h = await headers();

  const parsed = inviteUserSchema.safeParse({
    email: formData.get('email'),
    full_name: formData.get('full_name'),
    role: formData.get('role'),
    preferred_language: formData.get('preferred_language') ?? 'en',
    phone: formData.get('phone') || undefined,
  });
  if (!parsed.success) {
    return { error: 'unknown' };
  }

  const admin = createAdminSupabase();
  const origin = getAppOrigin(h.get('host'));
  const redirectTo = `${origin}/${locale}/auth/callback?next=/set-password`;

  const { data, error } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
    redirectTo,
    data: {
      full_name: parsed.data.full_name,
      role: parsed.data.role,
      preferred_language: parsed.data.preferred_language,
      invited_by: actor.id,
    },
  });

  if (error || !data.user) {
    const duplicate = /already registered|already been registered|exists/i.test(
      error?.message ?? '',
    );
    await logAuditEvent({
      actor_id: actor.id,
      action: 'admin.user_invite_failed',
      entity: 'user',
      after: { email: parsed.data.email, error: error?.message ?? 'unknown' },
    });
    return { error: duplicate ? 'duplicate_email' : 'unknown' };
  }

  // Post-invite profile UPDATE runs on the SSR client so auth.uid() resolves
  // to the admin's UUID and `profiles_self_update_guard_trg` short-circuits.
  // The service-role admin client would silently fail this UPDATE (the guard
  // raises 'profiles: created_by is immutable' when auth.uid() is NULL).
  // Errors here are logged but not surfaced — the invite itself already
  // succeeded; failing the action would leave an invited user in limbo.
  const supabase = await createServerSupabase();
  const { error: profileUpdateError } = parsed.data.phone
    ? await supabase
        .from('profiles')
        .update({ phone: parsed.data.phone, created_by: actor.id })
        .eq('id', data.user.id)
    : await supabase
        .from('profiles')
        .update({ created_by: actor.id })
        .eq('id', data.user.id);

  if (profileUpdateError) {
    logError('admin.invite_post_create_profile_update_failed', {
      user_id: data.user.id,
      email: parsed.data.email,
      code: profileUpdateError.code,
      message: profileUpdateError.message,
    });
  }

  await logAuditEvent({
    actor_id: actor.id,
    action: 'admin.user_invited',
    entity: 'user',
    entity_id: data.user.id,
    after: {
      email: parsed.data.email,
      full_name: parsed.data.full_name,
      role: parsed.data.role,
      preferred_language: parsed.data.preferred_language,
    },
  });

  revalidatePath(`/${locale}/admin/users`);
  redirect(`/${locale}/admin/users?invited=${encodeURIComponent(parsed.data.email)}`);
}

export async function changeUserRoleAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const actor = await requireAdmin();
  const locale = await getLocale();

  const parsed = changeUserRoleSchema.safeParse({
    user_id: formData.get('user_id'),
    role: formData.get('role'),
  });
  if (!parsed.success) {
    return { error: 'unknown' };
  }

  if (parsed.data.user_id === actor.id) {
    return { error: 'cannot_self_demote' };
  }

  const admin = createAdminSupabase();
  const { data: before } = await admin
    .from('profiles')
    .select('role')
    .eq('id', parsed.data.user_id)
    .single();

  // UPDATE runs on the SSR client so auth.uid() populates and the
  // profiles_self_update_guard_trg trigger short-circuits via is_admin().
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('profiles')
    .update({ role: parsed.data.role })
    .eq('id', parsed.data.user_id);

  if (error) {
    return { error: 'unknown' };
  }

  await logAuditEvent({
    actor_id: actor.id,
    action: 'admin.user_role_changed',
    entity: 'user',
    entity_id: parsed.data.user_id,
    before: before ? { role: before.role } : null,
    after: { role: parsed.data.role },
  });

  revalidatePath(`/${locale}/admin/users`);
  revalidatePath(`/${locale}/admin/users/${parsed.data.user_id}`);
  return { error: null };
}

export async function setUserActiveAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const actor = await requireAdmin();
  const locale = await getLocale();

  const parsed = setUserActiveSchema.safeParse({
    user_id: formData.get('user_id'),
    active: formData.get('active') === 'true',
  });
  if (!parsed.success) {
    return { error: 'unknown' };
  }

  if (parsed.data.user_id === actor.id && !parsed.data.active) {
    return { error: 'cannot_self_deactivate' };
  }

  const admin = createAdminSupabase();
  const { data: before } = await admin
    .from('profiles')
    .select('active')
    .eq('id', parsed.data.user_id)
    .single();

  // UPDATE runs on the SSR client so auth.uid() populates and the
  // profiles_self_update_guard_trg trigger short-circuits via is_admin().
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('profiles')
    .update({ active: parsed.data.active })
    .eq('id', parsed.data.user_id);

  if (error) {
    return { error: 'unknown' };
  }

  await logAuditEvent({
    actor_id: actor.id,
    action: parsed.data.active ? 'admin.user_activated' : 'admin.user_deactivated',
    entity: 'user',
    entity_id: parsed.data.user_id,
    before: before ? { active: before.active } : null,
    after: { active: parsed.data.active },
  });

  revalidatePath(`/${locale}/admin/users`);
  revalidatePath(`/${locale}/admin/users/${parsed.data.user_id}`);
  return { error: null };
}
