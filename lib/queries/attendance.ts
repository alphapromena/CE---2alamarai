import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import {
  SHIFT_TZ_OFFSET_MINUTES,
  todayLocalDateString,
} from '@/lib/attendance/shift-time';

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

export type LiveAttendanceJoined = AttendanceRow & {
  user_full_name: string | null;
  campaign_name_i18n: { ar?: string; en?: string } | null;
  location_name_i18n: { ar?: string; en?: string } | null;
};

/**
 * Live attendance rows joined with user + campaign + location names — used by
 * the supervisor dashboard (shows "who / where / when" without N+1 queries).
 * RLS still applies so supervisors only see their assigned locations.
 */
export async function listLiveAttendanceJoined(opts?: {
  date?: string;
  campaignId?: string;
  locationId?: string;
}): Promise<LiveAttendanceJoined[]> {
  const supabase = await createServerSupabase();
  const date = opts?.date ?? todayLocalDateString();
  let q = supabase
    .from('attendance')
    .select(
      `${ATTENDANCE_COLS},
       user:profiles ( full_name ),
       campaign:campaigns ( name_i18n ),
       location:locations ( name_i18n )`,
    )
    .eq('attendance_date', date);
  if (opts?.campaignId) q = q.eq('campaign_id', opts.campaignId);
  if (opts?.locationId) q = q.eq('location_id', opts.locationId);
  const { data, error } = await q.order('check_in_time', {
    ascending: false,
    nullsFirst: false,
  });
  if (error) return [];
  type Raw = AttendanceRow & {
    user: { full_name: string } | null;
    campaign: { name_i18n: { ar?: string; en?: string } } | null;
    location: { name_i18n: { ar?: string; en?: string } } | null;
  };
  return (data as unknown as Raw[]).map((r) => ({
    ...(r as AttendanceRow),
    user_full_name: r.user?.full_name ?? null,
    campaign_name_i18n: r.campaign?.name_i18n ?? null,
    location_name_i18n: r.location?.name_i18n ?? null,
  }));
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

export type PromoterShiftAssignment = {
  assignment_id: string;
  location_id: string;
  location_name_i18n: { ar?: string; en?: string };
  location_lat: number;
  location_lng: number;
  geofence_radius_m: number;
  shift_id: string | null;
  shift_start_time: string | null;
  shift_end_time: string | null;
  campaign_id: string;
  campaign_name_i18n: { ar?: string; en?: string };
};

/**
 * Today's active assignments for a promoter, joined with location + shift +
 * campaign. Filters shifts by days_of_week against today's Asia/Amman
 * weekday. Assignments without a shift are included unconditionally (ad-hoc
 * coverage).
 *
 * Note: uses the admin client for the join; the caller (the authenticated
 * promoter) is passed in explicitly and filtered on. RLS equivalents would
 * have required several queries; the explicit filter keeps this to one.
 */
export async function listTodaysPromoterAssignments(
  userId: string,
): Promise<PromoterShiftAssignment[]> {
  const admin = createAdminSupabase();
  const now = new Date();
  const localDow = new Date(now.getTime() + SHIFT_TZ_OFFSET_MINUTES * 60_000).getUTCDay();
  const today = todayLocalDateString(now);

  const { data, error } = await admin
    .from('user_assignments')
    .select(
      `
      id,
      location_id,
      shift_id,
      starts_on,
      ends_on,
      location:locations ( name_i18n, lat, lng, geofence_radius_m, active ),
      shift:shifts (
        start_time, end_time, days_of_week, active, campaign_id,
        campaign:campaigns ( name_i18n, status )
      )
      `,
    )
    .eq('user_id', userId)
    .eq('active', true)
    .eq('role_scope', 'promoter');

  if (error || !data) return [];

  type Row = {
    id: string;
    location_id: string;
    shift_id: string | null;
    starts_on: string | null;
    ends_on: string | null;
    location: {
      name_i18n: { ar?: string; en?: string };
      lat: number;
      lng: number;
      geofence_radius_m: number;
      active: boolean;
    } | null;
    shift: {
      start_time: string;
      end_time: string;
      days_of_week: number[];
      active: boolean;
      campaign_id: string;
      campaign: { name_i18n: { ar?: string; en?: string }; status: string } | null;
    } | null;
  };

  const out: PromoterShiftAssignment[] = [];
  for (const raw of data as unknown as Row[]) {
    if (!raw.location || !raw.location.active) continue;
    if (raw.starts_on && raw.starts_on > today) continue;
    if (raw.ends_on && raw.ends_on < today) continue;
    if (raw.shift) {
      if (!raw.shift.active) continue;
      if (!raw.shift.days_of_week.includes(localDow)) continue;
      if (!raw.shift.campaign) continue;
      if (raw.shift.campaign.status === 'cancelled' || raw.shift.campaign.status === 'completed') {
        continue;
      }
      out.push({
        assignment_id: raw.id,
        location_id: raw.location_id,
        location_name_i18n: raw.location.name_i18n,
        location_lat: raw.location.lat,
        location_lng: raw.location.lng,
        geofence_radius_m: raw.location.geofence_radius_m,
        shift_id: raw.shift_id,
        shift_start_time: raw.shift.start_time,
        shift_end_time: raw.shift.end_time,
        campaign_id: raw.shift.campaign_id,
        campaign_name_i18n: raw.shift.campaign.name_i18n,
      });
    }
  }
  return out;
}
