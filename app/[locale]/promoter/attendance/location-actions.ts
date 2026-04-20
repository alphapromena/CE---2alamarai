'use server';

import { createAdminSupabase } from '@/lib/supabase/admin';
import { requireRole } from '@/lib/auth/guards';
import { haversineDistance } from '@/lib/geo/haversine';
import { logInfo, logWarn, reportError } from '@/lib/observability/logger';
import {
  MAX_PING_DISTANCE_FROM_CHECKIN_M,
  PING_RATE_LIMIT_MAX,
  PING_RATE_LIMIT_WINDOW_SECONDS,
  recordLocationPingSchema,
  type RecordLocationPingInput,
} from '@/lib/validations/location-pings';

export type RecordLocationPingResult =
  | { ok: true; pingId: string }
  | {
      ok: false;
      error:
        | 'invalid_input'
        | 'invalid_coords'
        | 'no_open_attendance'
        | 'rate_limited'
        | 'too_far'
        | 'unknown';
    };

/**
 * Feature 5 D-042: record one GPS ping for an open attendance.
 *
 * Guards, in order:
 *   - caller is an authenticated promoter
 *   - payload matches the strict zod schema
 *   - coords are not (0,0) (common "no fix" stub from some devices)
 *   - attendance belongs to caller AND is open (check_out_time is null)
 *   - rate-limit: max 1 ping per 10 min per attendance (server hard floor —
 *     the client polls at 15 min, but we do not trust the client)
 *   - distance from check-in pin <= 5 km (GPS glitch / spoof guard; logged
 *     as a warning so supervisors can flag it if it recurs)
 *
 * On every failure path we return { ok: false, error } so the client hook can
 * surface the reason or silently retry; we never leak internal detail.
 */
export async function recordLocationPingAction(
  input: RecordLocationPingInput,
): Promise<RecordLocationPingResult> {
  try {
    const actor = await requireRole('promoter');

    const parsed = recordLocationPingSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: 'invalid_input' };
    const { attendanceId, lat, lng, accuracyM, batteryPct } = parsed.data;

    if (lat === 0 && lng === 0) {
      return { ok: false, error: 'invalid_coords' };
    }

    const admin = createAdminSupabase();

    const { data: attendance, error: attErr } = await admin
      .from('attendance')
      .select('id, user_id, check_out_time, check_in_lat, check_in_lng')
      .eq('id', attendanceId)
      .maybeSingle();
    if (attErr || !attendance) return { ok: false, error: 'no_open_attendance' };
    if (attendance.user_id !== actor.id) return { ok: false, error: 'no_open_attendance' };
    if (attendance.check_out_time != null) return { ok: false, error: 'no_open_attendance' };

    const { data: rlData, error: rlErr } = await admin.rpc('check_rate_limit', {
      p_key: `ping:${attendanceId}`,
      p_window_seconds: PING_RATE_LIMIT_WINDOW_SECONDS,
      p_max_requests: PING_RATE_LIMIT_MAX,
    });
    if (!rlErr && Array.isArray(rlData) && rlData.length > 0) {
      const row = rlData[0] as { allowed: boolean };
      if (row.allowed === false) {
        logInfo('ping_rate_limited', { attendance_id: attendanceId });
        return { ok: false, error: 'rate_limited' };
      }
    }

    if (
      typeof attendance.check_in_lat === 'number' &&
      typeof attendance.check_in_lng === 'number'
    ) {
      const distance = haversineDistance(
        attendance.check_in_lat,
        attendance.check_in_lng,
        lat,
        lng,
      );
      if (distance > MAX_PING_DISTANCE_FROM_CHECKIN_M) {
        logWarn('ping_far_from_checkin', {
          attendance_id: attendanceId,
          promoter_id: actor.id,
          distance_m: Math.round(distance),
        });
        return { ok: false, error: 'too_far' };
      }
    }

    const { data: inserted, error: insErr } = await admin
      .from('location_pings')
      .insert({
        attendance_id: attendanceId,
        promoter_id: actor.id,
        lat,
        lng,
        accuracy_m: accuracyM ?? null,
        battery_pct: batteryPct ?? null,
      })
      .select('id')
      .single();
    if (insErr || !inserted) {
      reportError(insErr ?? new Error('ping insert returned no row'), {
        attendance_id: attendanceId,
      });
      return { ok: false, error: 'unknown' };
    }

    return { ok: true, pingId: inserted.id as string };
  } catch (err) {
    reportError(err, { where: 'recordLocationPingAction' });
    return { ok: false, error: 'unknown' };
  }
}
