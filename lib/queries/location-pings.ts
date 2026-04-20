import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';

export type LocationPingRow = {
  id: string;
  attendance_id: string;
  promoter_id: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  battery_pct: number | null;
  captured_at: string;
};

const PING_COLS =
  'id, attendance_id, promoter_id, lat, lng, accuracy_m, battery_pct, captured_at';

export type PingTrailData = {
  pings: LocationPingRow[];
  checkInPoint: { lat: number; lng: number } | null;
};

/**
 * Feature 5 D-042: all pings for a promoter on a given calendar day, ordered
 * chronologically, plus the check-in point (first open attendance on that day,
 * or the sole attendance row if already checked out). RLS enforces scope
 * (supervisor assigned_locations / admin / self).
 */
export async function listPingsForPromoterOnDate(
  promoterId: string,
  dateYYYYMMDD: string,
): Promise<PingTrailData> {
  const supabase = await createServerSupabase();
  const startIso = `${dateYYYYMMDD}T00:00:00Z`;
  const endIso = `${dateYYYYMMDD}T23:59:59.999Z`;

  const [pingsRes, attendanceRes] = await Promise.all([
    supabase
      .from('location_pings')
      .select(PING_COLS)
      .eq('promoter_id', promoterId)
      .gte('captured_at', startIso)
      .lte('captured_at', endIso)
      .order('captured_at', { ascending: true }),
    supabase
      .from('attendance')
      .select('check_in_lat, check_in_lng')
      .eq('user_id', promoterId)
      .eq('attendance_date', dateYYYYMMDD)
      .order('check_in_time', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const pings = (pingsRes.data ?? []) as LocationPingRow[];
  const a = attendanceRes.data as { check_in_lat: number | null; check_in_lng: number | null } | null;
  const checkInPoint =
    a && typeof a.check_in_lat === 'number' && typeof a.check_in_lng === 'number'
      ? { lat: a.check_in_lat, lng: a.check_in_lng }
      : null;

  return { pings, checkInPoint };
}

/**
 * Ping count for today for the calling promoter. Used by the transparency
 * card on the promoter profile.
 */
export async function countMyPingsForDate(
  dateYYYYMMDD: string,
): Promise<{ count: number; lastPingAt: string | null }> {
  const supabase = await createServerSupabase();
  const startIso = `${dateYYYYMMDD}T00:00:00Z`;
  const endIso = `${dateYYYYMMDD}T23:59:59.999Z`;
  const { data, error } = await supabase
    .from('location_pings')
    .select('captured_at')
    .gte('captured_at', startIso)
    .lte('captured_at', endIso)
    .order('captured_at', { ascending: false });
  if (error || !data) return { count: 0, lastPingAt: null };
  return {
    count: data.length,
    lastPingAt: data.length > 0 ? (data[0]!.captured_at as string) : null,
  };
}
