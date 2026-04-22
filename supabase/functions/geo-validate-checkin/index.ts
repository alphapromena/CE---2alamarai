// geo-validate-checkin — the trust boundary for promoter check-in.
//
// Flow:
//   1. Verify caller JWT (Supabase auto-injects authenticated context when
//      verify_jwt = true in config.toml).
//   2. Parse multipart/form-data: image + JSON metadata.
//   3. Require MIME image/jpeg, size <= 8 MiB (mobile-realistic upper bound).
//   4. Re-check authorization: caller's profile.role must be 'promoter' and
//      location_id must be in profiles.assigned_locations. RLS-style checks
//      live here rather than relying on the service-role client to respect
//      them (service role bypasses RLS).
//   5. Fetch location (lat/lng/geofence_radius_m), campaign (kpi_config),
//      shift (start_time for lateness).
//   6. Run haversine → distance_m, is_within_geofence.
//   7. Strip EXIF from the JPEG; parse DateTimeOriginal + GPS for the audit
//      record.
//   8. Upload stripped JPEG to the private attendance-photos bucket at
//      attendance/{user_id}/{attendance_date}/check_in.jpg.
//   9. Insert the attendance row (ON CONFLICT idempotency_key_check_in →
//      return existing row for safe retry per D-009).
//  10. Fire alert rows: geofence_violation (if out of fence), late_check_in
//      (if past grace).
//  11. Return { attendance_id, status, is_within_geofence, distance_m,
//      idempotency_key, photo_path }.
//
// All DB writes go through the service-role client. RLS on attendance also
// permits this path for the authenticated promoter, but we use service role
// to write the alert rows (promoters cannot INSERT alerts by RLS).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.3';
import { classifyCheckIn, readLatenessGrace } from '../_shared/detection.ts';
import { haversineDistance } from '../_shared/haversine.ts';
import { isJpeg, parseJpegExifMinimal, stripJpegMetadata } from '../_shared/exif.ts';
import { combineShiftInstant, localDateString } from '../_shared/shift-time.ts';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

type CheckInMetadata = {
  idempotency_key: string;
  campaign_id: string;
  location_id: string;
  shift_id?: string | null;
  lat: number;
  lng: number;
  captured_at: string;
};

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'content-type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      ...(init.headers ?? {}),
    },
  });
}

function uuidRegex() {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
}

function parseMetadata(raw: unknown): CheckInMetadata | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.idempotency_key !== 'string' || !uuidRegex().test(m.idempotency_key)) return null;
  if (typeof m.campaign_id !== 'string' || !uuidRegex().test(m.campaign_id)) return null;
  if (typeof m.location_id !== 'string' || !uuidRegex().test(m.location_id)) return null;
  if (m.shift_id !== undefined && m.shift_id !== null) {
    if (typeof m.shift_id !== 'string' || !uuidRegex().test(m.shift_id)) return null;
  }
  if (typeof m.lat !== 'number' || m.lat < -90 || m.lat > 90) return null;
  if (typeof m.lng !== 'number' || m.lng < -180 || m.lng > 180) return null;
  if (typeof m.captured_at !== 'string' || Number.isNaN(Date.parse(m.captured_at))) return null;
  return m as CheckInMetadata;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

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

  // Feature 4 / D-041: image is OPTIONAL. Validate the file only if one was
  // provided; a missing image is a legitimate check-in now.
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

  // Idempotency read-through: if we've already seen this key for this user,
  // return the prior row verbatim (D-009).
  {
    const { data: existing } = await admin
      .from('attendance')
      .select(
        'id, status, is_within_geofence, check_in_distance_m, check_in_photo_path, idempotency_key_check_in',
      )
      .eq('user_id', userId)
      .eq('idempotency_key_check_in', meta.idempotency_key)
      .maybeSingle();
    if (existing) {
      return json({
        attendance_id: existing.id,
        status: existing.status,
        is_within_geofence: existing.is_within_geofence,
        distance_m: existing.check_in_distance_m,
        photo_path: existing.check_in_photo_path,
        idempotency_key: existing.idempotency_key_check_in,
        replayed: true,
      });
    }
  }

  // Authorization re-check: caller must be an active promoter assigned to the
  // location. We read through the service role (RLS-bypassing) but validate
  // manually — this is the trust boundary.
  const { data: profile, error: profErr } = await admin
    .from('profiles')
    .select('id, role, active, assigned_locations')
    .eq('id', userId)
    .maybeSingle();
  if (profErr || !profile) {
    return json({ error: 'profile_not_found' }, { status: 403 });
  }
  if (!profile.active) {
    return json({ error: 'profile_inactive' }, { status: 403 });
  }
  if (profile.role !== 'promoter') {
    return json({ error: 'role_not_allowed' }, { status: 403 });
  }
  const assignedLocations: string[] = profile.assigned_locations ?? [];
  if (!assignedLocations.includes(meta.location_id)) {
    return json({ error: 'location_not_assigned' }, { status: 403 });
  }

  // Fetch location + campaign + (optionally) shift.
  const { data: loc, error: locErr } = await admin
    .from('locations')
    .select('id, lat, lng, geofence_radius_m, active')
    .eq('id', meta.location_id)
    .maybeSingle();
  if (locErr || !loc || !loc.active) {
    return json({ error: 'location_not_found_or_inactive' }, { status: 404 });
  }

  const { data: campaign, error: campErr } = await admin
    .from('campaigns')
    .select('id, kpi_config, status')
    .eq('id', meta.campaign_id)
    .maybeSingle();
  if (campErr || !campaign) {
    return json({ error: 'campaign_not_found' }, { status: 404 });
  }

  // (campaign, location) must be a valid pair. The DB CHECK enforces this on
  // insert too, but we surface a clearer error here.
  const { data: link } = await admin
    .from('campaign_locations')
    .select('campaign_id')
    .eq('campaign_id', meta.campaign_id)
    .eq('location_id', meta.location_id)
    .maybeSingle();
  if (!link) {
    return json({ error: 'campaign_location_not_linked' }, { status: 400 });
  }

  let shiftStart: Date | null = null;
  if (meta.shift_id) {
    const { data: shift } = await admin
      .from('shifts')
      .select('id, start_time, campaign_id, location_id')
      .eq('id', meta.shift_id)
      .maybeSingle();
    if (
      shift &&
      shift.campaign_id === meta.campaign_id &&
      shift.location_id === meta.location_id
    ) {
      const capturedAt = new Date(meta.captured_at);
      shiftStart = combineShiftInstant(localDateString(capturedAt), shift.start_time);
    }
  }

  // Haversine geofence check.
  const distanceRaw = haversineDistance(loc.lat, loc.lng, meta.lat, meta.lng);
  const distanceM = Math.round(distanceRaw);
  const isWithinGeofence = distanceM <= loc.geofence_radius_m;

  // Classify check-in vs shift.
  const capturedAt = new Date(meta.captured_at);
  const graceMinutes = readLatenessGrace(campaign.kpi_config);
  const checkInStatus: 'checked_in' | 'late' = shiftStart
    ? classifyCheckIn({ shiftStart, checkInAt: capturedAt, graceMinutes })
    : 'checked_in';

  // EXIF: strip + parse. Skipped entirely when no image was provided.
  const attendanceDate = localDateString(capturedAt);
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

    photoPath = `attendance/${userId}/${attendanceDate}/check_in_${meta.idempotency_key}.jpg`;
    const { error: uploadErr } = await admin.storage
      .from('attendance-photos')
      .upload(photoPath, stripped, { contentType: 'image/jpeg', upsert: true });
    if (uploadErr) {
      return json({ error: 'photo_upload_failed', detail: uploadErr.message }, { status: 500 });
    }
  }

  // Insert attendance row.
  const insertPayload = {
    user_id: userId,
    campaign_id: meta.campaign_id,
    location_id: meta.location_id,
    shift_id: meta.shift_id ?? null,
    attendance_date: attendanceDate,
    check_in_time: capturedAt.toISOString(),
    check_in_lat: meta.lat,
    check_in_lng: meta.lng,
    check_in_photo_path: photoPath,
    check_in_distance_m: distanceM,
    check_in_exif_minimal: exifMinimal ?? null,
    status: checkInStatus,
    is_within_geofence: isWithinGeofence,
    idempotency_key_check_in: meta.idempotency_key,
  };
  const { data: inserted, error: insertErr } = await admin
    .from('attendance')
    .insert(insertPayload)
    .select('id')
    .single();
  if (insertErr || !inserted) {
    // Pre-existing row for (user, date, campaign, location) — surface cleanly.
    if (insertErr?.code === '23505') {
      return json({ error: 'already_checked_in_today' }, { status: 409 });
    }
    return json({ error: 'insert_failed', detail: insertErr?.message }, { status: 500 });
  }
  const attendanceId = inserted.id;

  // Fire alerts.
  const alertsToInsert: Array<Record<string, unknown>> = [];
  if (!isWithinGeofence) {
    alertsToInsert.push({
      alert_type: 'geofence_violation',
      severity: 'warning',
      user_id: userId,
      attendance_id: attendanceId,
      campaign_id: meta.campaign_id,
      location_id: meta.location_id,
      message_key: 'alerts.geofence_violation',
      message_params: { distance_m: distanceM, radius_m: loc.geofence_radius_m },
    });
  }
  if (checkInStatus === 'late') {
    alertsToInsert.push({
      alert_type: 'late_check_in',
      severity: 'warning',
      user_id: userId,
      attendance_id: attendanceId,
      campaign_id: meta.campaign_id,
      location_id: meta.location_id,
      message_key: 'alerts.late_check_in',
      message_params: {
        grace_minutes: graceMinutes,
        shift_start: shiftStart?.toISOString(),
        check_in_at: capturedAt.toISOString(),
      },
    });
  }
  if (alertsToInsert.length > 0) {
    await admin.from('alerts').insert(alertsToInsert);
  }

  return json({
    attendance_id: attendanceId,
    status: checkInStatus,
    is_within_geofence: isWithinGeofence,
    distance_m: distanceM,
    photo_path: photoPath,
    idempotency_key: meta.idempotency_key,
    replayed: false,
  });
});
