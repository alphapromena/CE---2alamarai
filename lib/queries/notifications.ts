import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';
import { logError } from '@/lib/observability/logger';

export type NotificationKind =
  | 'alert_new'
  | 'break_requested'
  | 'break_approved'
  | 'break_rejected'
  | 'break_modified'
  | 'system';

export type NotificationRow = {
  id: string;
  user_id: string;
  kind: NotificationKind;
  alert_id: string | null;
  break_request_id: string | null;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

const COLS =
  'id, user_id, kind, alert_id, break_request_id, payload, read_at, created_at';

export async function listMyNotifications(limit = 30): Promise<NotificationRow[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('notifications')
    .select(COLS)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    logError('listMyNotifications failed', {
      code: error.code,
      message: error.message,
    });
    return [];
  }
  return (data ?? []) as NotificationRow[];
}

export async function getMyUnreadCount(): Promise<number> {
  const supabase = await createServerSupabase();
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .is('read_at', null);
  if (error) {
    logError('getMyUnreadCount failed', {
      code: error.code,
      message: error.message,
    });
    return 0;
  }
  return count ?? 0;
}
