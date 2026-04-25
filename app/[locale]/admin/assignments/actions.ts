'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/guards';
import { logAuditEvent } from '@/lib/auth/audit';
import { logError } from '@/lib/observability/logger';
import { createAssignmentSchema, updateAssignmentSchema } from '@/lib/validations/assignments';

export type AssignmentActionState = { error: string | null };

function isUniqueViolation(message: string | null | undefined): boolean {
  if (!message) return false;
  return /duplicate key|unique constraint|already exists/i.test(message);
}

function readForm(formData: FormData) {
  const active = formData.get('active');
  return {
    user_id: formData.get('user_id'),
    location_id: formData.get('location_id'),
    shift_id: formData.get('shift_id') || undefined,
    role_scope: formData.get('role_scope'),
    starts_on: formData.get('starts_on') || undefined,
    ends_on: formData.get('ends_on') || undefined,
    active: active === 'on' || active === 'true' || active === null,
  };
}

export async function createAssignmentAction(
  _prev: AssignmentActionState,
  formData: FormData,
): Promise<AssignmentActionState> {
  const actor = await requireAdmin();
  const locale = await getLocale();

  const parsed = createAssignmentSchema.safeParse(readForm(formData));
  if (!parsed.success) return { error: 'unknown' };

  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from('user_assignments')
    .insert({
      user_id: parsed.data.user_id,
      location_id: parsed.data.location_id,
      shift_id: parsed.data.shift_id ?? null,
      role_scope: parsed.data.role_scope,
      starts_on: parsed.data.starts_on ?? null,
      ends_on: parsed.data.ends_on ?? null,
      active: parsed.data.active,
      created_by: actor.id,
    })
    .select('id')
    .single();

  if (error || !data) {
    const isDup = isUniqueViolation(error?.message);
    if (!isDup && error) {
      logError('createAssignmentAction failed', {
        actor_id: actor.id,
        user_id: parsed.data.user_id,
        location_id: parsed.data.location_id,
        code: error.code,
        message: error.message,
      });
    }
    return { error: isDup ? 'duplicate' : 'unknown' };
  }

  await logAuditEvent({
    actor_id: actor.id,
    action: 'admin.assignment_created',
    entity: 'user_assignment',
    entity_id: data.id,
    after: parsed.data,
  });

  revalidatePath(`/${locale}/admin/assignments`);
  redirect(`/${locale}/admin/assignments`);
}

export async function updateAssignmentAction(
  _prev: AssignmentActionState,
  formData: FormData,
): Promise<AssignmentActionState> {
  const actor = await requireAdmin();
  const locale = await getLocale();

  const parsed = updateAssignmentSchema.safeParse({
    id: formData.get('id'),
    ...readForm(formData),
  });
  if (!parsed.success) return { error: 'unknown' };

  const admin = createAdminSupabase();
  const { data: before } = await admin
    .from('user_assignments')
    .select('user_id, location_id, shift_id, role_scope, starts_on, ends_on, active')
    .eq('id', parsed.data.id)
    .maybeSingle();

  const { error } = await admin
    .from('user_assignments')
    .update({
      user_id: parsed.data.user_id,
      location_id: parsed.data.location_id,
      shift_id: parsed.data.shift_id ?? null,
      role_scope: parsed.data.role_scope,
      starts_on: parsed.data.starts_on ?? null,
      ends_on: parsed.data.ends_on ?? null,
      active: parsed.data.active,
    })
    .eq('id', parsed.data.id);

  if (error) {
    const isDup = isUniqueViolation(error.message);
    if (!isDup) {
      logError('updateAssignmentAction failed', {
        actor_id: actor.id,
        assignment_id: parsed.data.id,
        code: error.code,
        message: error.message,
      });
    }
    return { error: isDup ? 'duplicate' : 'unknown' };
  }

  await logAuditEvent({
    actor_id: actor.id,
    action: 'admin.assignment_updated',
    entity: 'user_assignment',
    entity_id: parsed.data.id,
    before: before ?? null,
    after: parsed.data,
  });

  revalidatePath(`/${locale}/admin/assignments`);
  revalidatePath(`/${locale}/admin/assignments/${parsed.data.id}/edit`);
  return { error: null };
}
