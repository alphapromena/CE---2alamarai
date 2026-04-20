'use server';

import { z } from 'zod';
import { requireSessionProfile } from '@/lib/auth/guards';
import { createServerSupabase } from '@/lib/supabase/server';

const markOneSchema = z.strictObject({ id: z.string().uuid() });

export type NotifyActionState = { error: string | null };

/**
 * Mark a single notification as read. RLS guarantees the row belongs to the
 * caller; we additionally guard with an explicit user_id filter as defense
 * in depth.
 */
export async function markNotificationReadAction(
  _prev: NotifyActionState,
  formData: FormData,
): Promise<NotifyActionState> {
  const me = await requireSessionProfile();
  const parsed = markOneSchema.safeParse({ id: formData.get('id') });
  if (!parsed.success) return { error: 'invalid_input' };
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', parsed.data.id)
    .eq('user_id', me.id)
    .is('read_at', null);
  if (error) return { error: 'update_failed' };
  return { error: null };
}

/**
 * Mark all the caller's unread notifications as read.
 */
export async function markAllNotificationsReadAction(): Promise<NotifyActionState> {
  const me = await requireSessionProfile();
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', me.id)
    .is('read_at', null);
  if (error) return { error: 'update_failed' };
  return { error: null };
}
