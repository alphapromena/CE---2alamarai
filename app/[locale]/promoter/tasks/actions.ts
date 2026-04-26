'use server';

import { revalidatePath } from 'next/cache';
import type { Database } from '@/lib/supabase/database.types';
import { getLocale } from 'next-intl/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { requireRole } from '@/lib/auth/guards';
import { logAuditEvent } from '@/lib/auth/audit';
import { logError } from '@/lib/observability/logger';
import { promoterUpdateTaskStatusSchema } from '@/lib/validations/tasks';

/**
 * Promoter-side task status change (D-020 item 4): promoters self-complete
 * without supervisor sign-off. Allowed transitions from promoter:
 *   open → in_progress
 *   open | in_progress → done
 * Reopening (done → in_progress) and cancellation are supervisor-only.
 */
export type PromoterTaskActionState = { error: string | null };

export async function markMyTaskStatusAction(input: unknown): Promise<PromoterTaskActionState> {
  const actor = await requireRole('promoter');
  const parsed = promoterUpdateTaskStatusSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalid_input' };

  const admin = createAdminSupabase();
  const { data: existing } = await admin
    .from('tasks')
    .select('assigned_to_user_id, status')
    .eq('id', parsed.data.id)
    .maybeSingle();
  if (!existing) return { error: 'not_found' };
  if (existing.assigned_to_user_id !== actor.id) return { error: 'not_yours' };

  // Transition whitelist enforced here, not at the DB — keeps RLS simple.
  const from = existing.status;
  const to = parsed.data.status;
  const allowed =
    (from === 'open' && (to === 'in_progress' || to === 'done')) ||
    (from === 'in_progress' && to === 'done');
  if (!allowed) return { error: 'invalid_transition' };

  const patch: Database['public']['Tables']['tasks']['Update'] = { status: to };
  if (to === 'done') patch.completed_at = new Date().toISOString();
  else patch.completed_at = null;

  const { error } = await admin.from('tasks').update(patch).eq('id', parsed.data.id);
  if (error) {
    logError('markMyTaskStatusAction failed', {
      actor_id: actor.id,
      task_id: parsed.data.id,
      next_status: to,
      code: error.code,
      message: error.message,
    });
    return { error: 'update_failed' };
  }

  await logAuditEvent({
    actor_id: actor.id,
    action: `promoter.task_status_${to}`,
    entity: 'task',
    entity_id: parsed.data.id,
    before: { status: from },
    after: { status: to },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/promoter/tasks`);
  return { error: null };
}
