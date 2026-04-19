import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { todayLocalDateString } from '@/lib/attendance/shift-time';

export type AttendanceRow = {
  id: string;
  user_id: string;
  campaign_id: string;
  location_id: string;
  shift_id: string | null;
  attendance_date: string;
  check_in_time: string | null;
  check_in_lat: number | null;
  check_in_lng: number | null;
  check_in_photo_path: string | null;
  check_in_distance_m: number | null;
  check_out_time: string | null;
  check_out_lat: number | null;
  check_out_lng: number | null;
  check_out_photo_path: string | null;
  check_out_distance_m: number | null;
  status:
    | 'checked_in'
    | 'checked_out'
    | 'late'
    | 'absent'
    | 'early_leave'
    | 'missing_checkout';
  is_within_geofence: boolean;
  supervisor_override: boolean;
  override_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const ATTENDANCE_COLS =
  'id, user_id, campaign_id, location_id, shift_id, attendance_date, check_in_time, check_in_lat, check_in_lng, check_in_photo_path, check_in_distance_m, check_out_time, check_out_lat, check_out_lng, check_out_photo_path, check_out_distance_m, status, is_within_geofence, supervisor_override, override_reason, notes, created_at, updated_at';

/**
 * Today's attendance rows for the calling user. Uses the RLS-aware server
 * client so promoters see only their own and supervisors see their assigned
 * locations.
 */
export async function listMyAttendanceToday(): Promise<AttendanceRow[]> {
  const supabase = await createServerSupabase();
  const today = todayLocalDateString();
  const { data, error } = await supabase
    .from('attendance')
    .select(ATTENDANCE_COLS)
    .eq('attendance_date', today)
    .order('check_in_time', { ascending: false, nullsFirst: false });
  if (error) return [];
  return (data ?? []) as AttendanceRow[];
}

/**
 * Live view for supervisors + admins. Returns today's attendance rows across
 * the caller's visible scope. RLS enforces that visibility.
 */
export async function listLiveAttendance(opts?: {
  date?: string;
  campaignId?: string;
  locationId?: string;
}): Promise<AttendanceRow[]> {
  const supabase = await createServerSupabase();
  const date = opts?.date ?? todayLocalDateString();
  let q = supabase
    .from('attendance')
    .select(ATTENDANCE_COLS)
    .eq('attendance_date', date);
  if (opts?.campaignId) q = q.eq('campaign_id', opts.campaignId);
  if (opts?.locationId) q = q.eq('location_id', opts.locationId);
  const { data, error } = await q.order('check_in_time', {
    ascending: false,
    nullsFirst: false,
  });
  if (error) return [];
  return (data ?? []) as AttendanceRow[];
}

/**
 * Single attendance row. Admin client (service role); caller is responsible
 * for authorising access before calling this helper.
 */
export async function getAttendanceByIdAdmin(
  id: string,
): Promise<AttendanceRow | null> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from('attendance')
    .select(ATTENDANCE_COLS)
    .eq('id', id)
    .maybeSingle();
  return (data ?? null) as AttendanceRow | null;
}

/**
 * Sign a short-lived URL for a private photo. Caller must have already
 * verified that the authenticated user may see the owning attendance row.
 * 5-minute TTL per PLAN §5 item 7.
 */
export async function signAttendancePhotoUrl(
  path: string,
  ttlSeconds = 300,
): Promise<string | null> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.storage
    .from('attendance-photos')
    .createSignedUrl(path, ttlSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}
