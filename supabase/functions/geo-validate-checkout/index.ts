// geo-validate-checkout — mirror of geo-validate-checkin for the check-out leg.
//
// Differences from check-in:
//   - Target row must already exist (attendance row created at check-in).
//     Selected by (user_id, attendance_id) with attendance_id in the metadata.
//   - Row must not already have a check_out_time (forbid double check-out;
//     replay via idempotency_key_check_out IS allowed).
//   - Classification is classifyCheckOut → 'checked_out' | 'early_leave'
//     (against shifts.end_time).
//   - Alerts fired: geofence_violation (out of fence), early_leave
//     (before shift end).
//
// Re-uses all authorization + EXIF + haversine + shift-time machinery.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.3';
import { classifyCheckOut } from '../_shared/detection.ts';
import { haversineDistance } from '../_shared/haversine.ts';
import { isJpeg, parseJpegExifMinimal, stripJpegMetadata } from '../_shared/exif.ts';
import { combineShiftInstant, localDateString } from '../_shared/shift-time.ts';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type CheckOutMetadata = {
  idempotency_key: string;
  attendance_id: string;
  lat: number;
  lng: number;
  captured_at: string;
};

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

function uuidRegex() {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
}

function parseMetadata(raw: unknown): CheckOutMetadata | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.idempotency_key !== 'string' || !uuidRegex().test(m.idempotency_key)) return null;
  if (typeof m.attendance_id !== 'string' || !uuidRegex().test(m.attendance_id)) return null;
  if (typeof m.lat !== 'number' || m.lat < -90 || m.lat > 90) return null;
  if (typeof m.lng !== 'number' || m.lng < -180 || m.lng > 180) return null;
  if (typeof m.captured_at !== 'string' || Number.isNaN(Date.parse(m.captured_at))) return null;
  return m as CheckOutMetadata;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, { status: 405 });
  }

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userInfo, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userInfo?.user) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }
  const userId = userInfo.user.id;

  // Parse multipart body.
  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    return json({ error: 'expected_multipart' }, { status: 400 });
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: 'invalid_multipart' }, { status: 400 });
  }

  const metaRaw = form.get('metadata');
  if (typeof metaRaw !== 'string') {
    return json({ error: 'missing_metadata' }, { status: 400 });
  }
  let metaJson: unknown;
  try {
    metaJson = JSON.parse(metaRaw);
  } catch {
    return json({ error: 'invalid_metadata_json' }, { status: 400 });
  }
  const meta = parseMetadata(metaJson);
  if (!meta) {
    return json({ error: 'invalid_metadata' }, { status: 400 });
  }

  // Feature 4 / D-041: image is OPTIONAL on check-out (mirror of check-in).
  const imageField = form.get('image');
  let original: Uint8Array | null = null;
  if (imageField instanceof File) {
    if (imageField.type !== 'image/jpeg') {
      return json({ error: 'unsupported_image_type', accepted: ['image/jpeg'] }, { status: 415 });
    }
    if (imageField.size > MAX_IMAGE_BYTES) {
      return json({ error: 'image_too_large', max_bytes: MAX_IMAGE_BYTES }, { status: 413 });
    }
    original = new Uint8Array(await imageField.arrayBuffer());
    if (!isJpeg(original)) {
      return json({ error: 'not_a_jpeg' }, { status: 400 });
    }
  }

  // Idempotency read-through per D-009.
  {
    const { data: existing } = await admin
      .from('attendance')
      .select(
        'id, status, is_within_geofence, check_out_distance_m, check_out_photo_path, idempotency_key_check_out',
      )
      .eq('user_id', userId)
      .eq('idempotency_key_check_out', meta.idempotency_key)
      .maybeSingle();
    if (existing) {
      return json({
        attendance_id: existing.id,
        status: existing.status,
        is_within_geofence: existing.is_within_geofence,
        distance_m: existing.check_out_distance_m,
        photo_path: existing.check_out_photo_path,
        idempotency_key: existing.idempotency_key_check_out,
        replayed: true,
      });
    }
  }

  // Load the attendance row and confirm ownership.
  const { data: attendance, error: attErr } = await admin
    .from('attendance')
    .select(
      'id, user_id, campaign_id, location_id, shift_id, attendance_date, check_in_time, check_out_time, status, supervisor_override',
    )
    .eq('id', meta.attendance_id)
    .maybeSingle();
  if (attErr || !attendance) {
    return json({ error: 'attendance_not_found' }, { status: 404 });
  }
  if (attendance.user_id !== userId) {
    return json({ error: 'not_your_attendance' }, { status: 403 });
  }
  if (attendance.check_out_time) {
    return json({ error: 'already_checked_out' }, { status: 409 });
  }

  // Authorization re-check (defence in depth; role may have changed).
  const { data: profile } = await admin
    .from('profiles')
    .select('id, role, active')
    .eq('id', userId)
    .maybeSingle();
  if (!profile || !profile.active || profile.role !== 'promoter') {
    return json({ error: 'role_not_allowed' }, { status: 403 });
  }

  // Fetch location for geofence + shift for lateness.
  const { data: loc } = await admin
    .from('locations')
    .select('id, lat, lng, geofence_radius_m, active')
    .eq('id', attendance.location_id)
    .maybeSingle();
  if (!loc || !loc.active) {
    return json({ error: 'location_not_found_or_inactive' }, { status: 404 });
  }

  let shiftEnd: Date | null = null;
  if (attendance.shift_id) {
    const { data: shift } = await admin
      .from('shifts')
      .select('id, end_time')
      .eq('id', attendance.shift_id)
      .maybeSingle();
    if (shift) {
      shiftEnd = combineShiftInstant(attendance.attendance_date, shift.end_time);
    }
  }

  // Haversine geofence check.
  const distanceRaw = haversineDistance(loc.lat, loc.lng, meta.lat, meta.lng);
  const distanceM = Math.round(distanceRaw);
  const isWithinGeofence = distanceM <= loc.geofence_radius_m;

  // Classify check-out.
  const capturedAt = new Date(meta.captured_at);
  const checkOutStatus: 'checked_out' | 'early_leave' = shiftEnd
    ? classifyCheckOut({ shiftEnd, checkOutAt: capturedAt })
    : 'checked_out';

  // EXIF strip + parse. Skipped when no image was provided.
  let photoPath: string | null = null;
  let exifMinimal: ReturnType<typeof parseJpegExifMinimal> | null = null;
  if (original) {
    let stripped: Uint8Array;
    try {
      stripped = stripJpegMetadata(original);
    } catch {
      return json({ error: 'jpeg_strip_failed' }, { status: 400 });
    }
    exifMinimal = parseJpegExifMinimal(original);

    photoPath = `attendance/${userId}/${attendance.attendance_date}/check_out_${meta.idempotency_key}.jpg`;
    const { error: uploadErr } = await admin.storage
      .from('attendance-photos')
      .upload(photoPath, stripped, { contentType: 'image/jpeg', upsert: true });
    if (uploadErr) {
      return json({ error: 'photo_upload_failed', detail: uploadErr.message }, { status: 500 });
    }
  }

  // The overall attendance.status on check-out:
  //   - early_leave → 'early_leave' (alert fired)
  //   - otherwise   → 'checked_out'
  // The late/geofence status from check-in is preserved as an alert history
  // but not re-used as the row status — the final status reflects exit state.
  const finalStatus = checkOutStatus;

  // Update the row.
  const { error: updErr } = await admin
    .from('attendance')
    .update({
      check_out_time: capturedAt.toISOString(),
      check_out_lat: meta.lat,
      check_out_lng: meta.lng,
      check_out_photo_path: photoPath,
      check_out_distance_m: distanceM,
      check_out_exif_minimal: exifMinimal ?? null,
      status: finalStatus,
      idempotency_key_check_out: meta.idempotency_key,
    })
    .eq('id', attendance.id);
  if (updErr) {
    return json({ error: 'update_failed', detail: updErr.message }, { status: 500 });
  }

  // Fire alerts.
  const alertsToInsert: Array<Record<string, unknown>> = [];
  if (!isWithinGeofence) {
    alertsToInsert.push({
      alert_type: 'geofence_violation',
      severity: 'warning',
      user_id: userId,
      attendance_id: attendance.id,
      campaign_id: attendance.campaign_id,
      location_id: attendance.location_id,
      message_key: 'alerts.geofence_violation_checkout',
      message_params: { distance_m: distanceM, radius_m: loc.geofence_radius_m },
    });
  }
  if (checkOutStatus === 'early_leave') {
    alertsToInsert.push({
      alert_type: 'early_leave',
      severity: 'warning',
      user_id: userId,
      attendance_id: attendance.id,
      campaign_id: attendance.campaign_id,
      location_id: attendance.location_id,
      message_key: 'alerts.early_leave',
      message_params: {
        shift_end: shiftEnd?.toISOString(),
        check_out_at: capturedAt.toISOString(),
      },
    });
  }
  if (alertsToInsert.length > 0) {
    await admin.from('alerts').insert(alertsToInsert);
  }

  return json({
    attendance_id: attendance.id,
    status: finalStatus,
    is_within_geofence: isWithinGeofence,
    distance_m: distanceM,
    photo_path: photoPath,
    idempotency_key: meta.idempotency_key,
    replayed: false,
  });
});
