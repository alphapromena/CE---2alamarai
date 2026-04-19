'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { requireRole } from '@/lib/auth/guards';
import { logAuditEvent } from '@/lib/auth/audit';
import {
  createTaskSchema,
  updateTaskSchema,
  supervisorChangeTaskStatusSchema,
} from '@/lib/validations/tasks';

export type TaskActionState = { error: string | null; taskId?: string };

function isUniqueViolation(message: string | null | undefined): boolean {
  if (!message) return false;
  return /duplicate key|unique constraint|already exists/i.test(message);
}

function canTouchLocation(
  role: 'admin' | 'supervisor',
  assigned: readonly string[],
  locationId: string,
): boolean {
  return role === 'admin' || assigned.includes(locationId);
}

export async function createTaskAction(input: unknown): Promise<TaskActionState> {
  const actor = await requireRole('supervisor', 'admin');
  const parsed = createTaskSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalid_input' };

  const admin = createAdminSupabase();
  if (!canTouchLocation(actor.role as 'admin' | 'supervisor', actor.assigned_locations, parsed.data.location_id)) {
    return { error: 'location_not_assigned' };
  }

  // Idempotency read-through (D-009).
  const { data: existing } = await admin
    .from('tasks')
    .select('id')
    .eq('created_by', actor.id)
    .eq('idempotency_key', parsed.data.idempotency_key)
    .maybeSingle();
  if (existing) return { error: null, taskId: existing.id };

  const { data: inserted, error } = await admin
    .from('tasks')
    .insert({
      campaign_id: parsed.data.campaign_id,
      location_id: parsed.data.location_id,
      assigned_to_user_id: parsed.data.assigned_to_user_id,
      title_i18n: parsed.data.title_i18n,
      description_i18n: parsed.data.description_i18n ?? null,
      due_date: parsed.data.due_date ?? null,
      status: 'open',
      created_by: actor.id,
      idempotency_key: parsed.data.idempotency_key,
    })
    .select('id')
    .single();

  if (error || !inserted) {
    return { error: isUniqueViolation(error?.message) ? 'duplicate' : 'create_failed' };
  }

  await logAuditEvent({
    actor_id: actor.id,
    action: 'supervisor.task_created',
    entity: 'task',
    entity_id: inserted.id,
    after: {
      campaign_id: parsed.data.campaign_id,
      location_id: parsed.data.location_id,
      assigned_to_user_id: parsed.data.assigned_to_user_id,
    },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/supervisor/tasks`);
  return { error: null, taskId: inserted.id };
}

export async function updateTaskAction(input: unknown): Promise<TaskActionState> {
  const actor = await requireRole('supervisor', 'admin');
  const parsed = updateTaskSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalid_input' };

  const admin = createAdminSupabase();

  const { data: existing } = await admin
    .from('tasks')
    .select('location_id')
    .eq('id', parsed.data.id)
    .maybeSingle();
  if (!existing) return { error: 'not_found' };

  const allowOld = canTouchLocation(
    actor.role as 'admin' | 'supervisor',
    actor.assigned_locations,
    existing.location_id,
  );
  const allowNew = canTouchLocation(
    actor.role as 'admin' | 'supervisor',
    actor.assigned_locations,
    parsed.data.location_id,
  );
  if (!allowOld || !allowNew) return { error: 'location_not_assigned' };

  const { error } = await admin
    .from('tasks')
    .update({
      campaign_id: parsed.data.campaign_id,
      location_id: parsed.data.location_id,
      assigned_to_user_id: parsed.data.assigned_to_user_id,
      title_i18n: parsed.data.title_i18n,
      description_i18n: parsed.data.description_i18n ?? null,
      due_date: parsed.data.due_date ?? null,
    })
    .eq('id', parsed.data.id);
  if (error) return { error: 'update_failed' };

  const locale = await getLocale();
  revalidatePath(`/${locale}/supervisor/tasks`);
  return { error: null, taskId: parsed.data.id };
}

export async function changeTaskStatusAction(input: unknown): Promise<TaskActionState> {
  const actor = await requireRole('supervisor', 'admin');
  const parsed = supervisorChangeTaskStatusSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalid_input' };

  const admin = createAdminSupabase();
  const { data: existing } = await admin
    .from('tasks')
    .select('location_id, status')
    .eq('id', parsed.data.id)
    .maybeSingle();
  if (!existing) return { error: 'not_found' };

  if (!canTouchLocation(actor.role as 'admin' | 'supervisor', actor.assigned_locations, existing.location_id)) {
    return { error: 'location_not_assigned' };
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: parsed.data.status };
  if (parsed.data.status === 'done') {
    patch.completed_at = now;
    patch.cancelled_at = null;
    patch.cancelled_reason = null;
  } else if (parsed.data.status === 'cancelled') {
    patch.cancelled_at = now;
    patch.cancelled_reason = parsed.data.cancelled_reason ?? null;
    patch.completed_at = null;
  } else {
    // open | in_progress — clear terminal fields
    patch.completed_at = null;
    patch.cancelled_at = null;
    patch.cancelled_reason = null;
  }

  const { error } = await admin.from('tasks').update(patch).eq('id', parsed.data.id);
  if (error) return { error: 'update_failed' };

  await logAuditEvent({
    actor_id: actor.id,
    action: `supervisor.task_status_${parsed.data.status}`,
    entity: 'task',
    entity_id: parsed.data.id,
    before: { status: existing.status },
    after: { status: parsed.data.status },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/supervisor/tasks`);
  return { error: null, taskId: parsed.data.id };
}
