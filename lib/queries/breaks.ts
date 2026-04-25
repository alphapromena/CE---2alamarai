import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';
import { logError } from '@/lib/observability/logger';

export type BreakRequestStatus = 'pending' | 'approved' | 'rejected' | 'modified';

export type BreakRequestRow = {
  id: string;
  promoter_id: string;
  campaign_id: string;
  location_id: string | null;
  shift_id: string | null;
  attendance_id: string | null;
  requested_start: string;
  duration_minutes: number;
  reason: string | null;
  status: BreakRequestStatus;
  reviewer_id: string | null;
  reviewer_reason: string | null;
  reviewed_at: string | null;
  approved_start: string | null;
  approved_duration_minutes: number | null;
  actual_start: string | null;
  actual_end: string | null;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
};

export type BreakRequestJoined = BreakRequestRow & {
  promoter_full_name: string | null;
  campaign_name_i18n: { ar?: string; en?: string } | null;
  location_name_i18n: { ar?: string; en?: string } | null;
};

const COLS =
  'id, promoter_id, campaign_id, location_id, shift_id, attendance_id, requested_start, duration_minutes, reason, status, reviewer_id, reviewer_reason, reviewed_at, approved_start, approved_duration_minutes, actual_start, actual_end, idempotency_key, created_at, updated_at';

/** Caller's own requests (promoter view). RLS enforces ownership. */
export async function listMyBreakRequests(): Promise<BreakRequestRow[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('break_requests')
    .select(COLS)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    logError('listMyBreakRequests failed', {
      code: error.code,
      message: error.message,
    });
    return [];
  }
  return (data ?? []) as BreakRequestRow[];
}

/**
 * All break requests the caller can see (supervisor/admin). RLS scopes to
 * assigned locations or globally for admin. Joined with promoter name +
 * localisable names for the supervisor inbox.
 */
export async function listVisibleBreakRequests(): Promise<BreakRequestJoined[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('break_requests')
    .select(
      `${COLS},
       promoter:profiles!break_requests_promoter_id_fkey ( full_name ),
       campaign:campaigns ( name_i18n ),
       location:locations ( name_i18n )`,
    )
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    logError('listVisibleBreakRequests failed', {
      code: error.code,
      message: error.message,
    });
    return [];
  }
  type Raw = BreakRequestRow & {
    promoter: { full_name: string } | null;
    campaign: { name_i18n: { ar?: string; en?: string } } | null;
    location: { name_i18n: { ar?: string; en?: string } } | null;
  };
  return ((data ?? []) as unknown as Raw[]).map((r) => ({
    ...(r as BreakRequestRow),
    promoter_full_name: r.promoter?.full_name ?? null,
    campaign_name_i18n: r.campaign?.name_i18n ?? null,
    location_name_i18n: r.location?.name_i18n ?? null,
  }));
}
