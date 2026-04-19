import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';

export type TaskRow = {
  id: string;
  campaign_id: string;
  location_id: string;
  assigned_to_user_id: string;
  title_i18n: { ar?: string; en?: string };
  description_i18n: { ar?: string; en?: string } | null;
  status: 'open' | 'in_progress' | 'done' | 'cancelled';
  due_date: string | null;
  created_by: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskListRow = TaskRow & {
  location_name_i18n: { ar?: string; en?: string } | null;
  campaign_name_i18n: { ar?: string; en?: string } | null;
  assignee_name: string | null;
};

const TASK_COLS =
  'id, campaign_id, location_id, assigned_to_user_id, title_i18n, description_i18n, status, due_date, created_by, completed_at, cancelled_at, cancelled_reason, created_at, updated_at';

/** Tasks I can see (RLS-filtered). */
export async function listMyTasks(
  filters: { status?: readonly TaskRow['status'][]; limit?: number } = {},
): Promise<TaskRow[]> {
  const supabase = await createServerSupabase();
  let q = supabase
    .from('tasks')
    .select(TASK_COLS)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 100);
  if (filters.status && filters.status.length > 0) q = q.in('status', filters.status);
  const { data } = await q;
  return (data as TaskRow[]) ?? [];
}

export async function listSupervisorTasks(
  filters: {
    status?: readonly TaskRow['status'][];
    campaignId?: string | null;
    locationId?: string | null;
    limit?: number;
  } = {},
): Promise<TaskListRow[]> {
  const supabase = await createServerSupabase();
  let q = supabase
    .from('tasks')
    .select(
      `${TASK_COLS},
       location:locations ( name_i18n ),
       campaign:campaigns ( name_i18n ),
       assignee:profiles!tasks_assigned_to_user_id_fkey ( full_name )`,
    )
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(filters.limit ?? 200);

  if (filters.status && filters.status.length > 0) q = q.in('status', filters.status);
  if (filters.campaignId) q = q.eq('campaign_id', filters.campaignId);
  if (filters.locationId) q = q.eq('location_id', filters.locationId);

  const { data } = await q;
  if (!data) return [];
  type RelOne<T> = T | T[] | null;
  type Row = TaskRow & {
    location: RelOne<{ name_i18n: { ar?: string; en?: string } | null }>;
    campaign: RelOne<{ name_i18n: { ar?: string; en?: string } | null }>;
    assignee: RelOne<{ full_name: string | null }>;
  };
  const pick = <T,>(v: RelOne<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  return (data as unknown as Row[]).map((r) => {
    const loc = pick(r.location);
    const camp = pick(r.campaign);
    const asn = pick(r.assignee);
    return {
      ...r,
      location_name_i18n: loc?.name_i18n ?? null,
      campaign_name_i18n: camp?.name_i18n ?? null,
      assignee_name: asn?.full_name ?? null,
    };
  });
}
