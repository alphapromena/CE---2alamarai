// supervisor-visit-create — server-side trust boundary for logging a
// supervisor site visit. Mirrors geo-validate-checkin but:
//   - caller must be role = supervisor at the location
//   - target table is supervisor_visits (not attendance)
//   - distance is recorded but is_within_geofence does NOT reject the insert
//     — supervisors can legitimately stand outside the fence (car park,
//     adjacent aisle); the flag is kept for reviewers.
//
// Re-uses _shared/{haversine,exif}. Outcome enum is validated against the
// fixed set here rather than pulled from the DB.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.3';
import { haversineDistance } from '../_shared/haversine.ts';
import { isJpeg, parseJpegExifMinimal, stripJpegMetadata } from '../_shared/exif.ts';
import { localDateString } from '../_shared/shift-time.ts';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const OUTCOMES = new Set(['ok', 'issue_found', 'coaching', 'other']);

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type VisitMetadata = {
  idempotency_key: string;
  campaign_id: string;
  location_id: string;
  promoter_id?: string | null;
  lat: number;
  lng: number;
  captured_at: string;
  outcome: 'ok' | 'issue_found' | 'coaching' | 'other';
  notes?: string | null;
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

function parseMetadata(raw: unknown): VisitMetadata | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.idempotency_key !== 'string' || !uuidRegex().test(m.idempotency_key)) return null;
  if (typeof m.campaign_id !== 'string' || !uuidRegex().test(m.campaign_id)) return null;
  if (typeof m.location_id !== 'string' || !uuidRegex().test(m.location_id)) return null;
  if (m.promoter_id !== undefined && m.promoter_id !== null) {
    if (typeof m.promoter_id !== 'string' || !uuidRegex().test(m.promoter_id)) return null;
  }
  if (typeof m.lat !== 'number' || m.lat < -90 || m.lat > 90) return null;
  if (typeof m.lng !== 'number' || m.lng < -180 || m.lng > 180) return null;
  if (typeof m.captured_at !== 'string' || Number.isNaN(Date.parse(m.captured_at))) return null;
  if (typeof m.outcome !== 'string' || !OUTCOMES.has(m.outcome)) return null;
  if (m.notes !== undefined && m.notes !== null && typeof m.notes !== 'string') return null;
  if (typeof m.notes === 'string' && m.notes.length > 2000) return null;
  return m as VisitMetadata;
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

  const image = form.get('image');
  if (!(image instanceof File)) {
    return json({ error: 'missing_image' }, { status: 400 });
  }
  if (image.type !== 'image/jpeg') {
    return json({ error: 'unsupported_image_type', accepted: ['image/jpeg'] }, { status: 415 });
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return json({ error: 'image_too_large', max_bytes: MAX_IMAGE_BYTES }, { status: 413 });
  }
  const original = new Uint8Array(await image.arrayBuffer());
  if (!isJpeg(original)) {
    return json({ error: 'not_a_jpeg' }, { status: 400 });
  }

  // Idempotency read-through per D-009.
  {
    const { data: existing } = await admin
      .from('supervisor_visits')
      .select('id, is_within_geofence, distance_m, photo_path, outcome, idempotency_key')
      .eq('supervisor_id', userId)
      .eq('idempotency_key', meta.idempotency_key)
      .maybeSingle();
    if (existing) {
      return json({
        visit_id: existing.id,
        is_within_geofence: existing.is_within_geofence,
        distance_m: existing.distance_m,
        photo_path: existing.photo_path,
        outcome: existing.outcome,
        idempotency_key: existing.idempotency_key,
        replayed: true,
      });
    }
  }

  // Authorization re-check: caller must be an active supervisor assigned to
  // the location.
  const { data: profile } = await admin
    .from('profiles')
    .select('id, role, active, assigned_locations')
    .eq('id', userId)
    .maybeSingle();
  if (!profile) return json({ error: 'profile_not_found' }, { status: 403 });
  if (!profile.active) return json({ error: 'profile_inactive' }, { status: 403 });
  if (profile.role !== 'supervisor') return json({ error: 'role_not_allowed' }, { status: 403 });
  const assigned: string[] = profile.assigned_locations ?? [];
  if (!assigned.includes(meta.location_id)) {
    return json({ error: 'location_not_assigned' }, { status: 403 });
  }

  // (campaign, location) pair must be valid + location active.
  const { data: loc } = await admin
    .from('locations')
    .select('id, lat, lng, geofence_radius_m, active')
    .eq('id', meta.location_id)
    .maybeSingle();
  if (!loc || !loc.active) {
    return json({ error: 'location_not_found_or_inactive' }, { status: 404 });
  }

  const { data: link } = await admin
    .from('campaign_locations')
    .select('campaign_id')
    .eq('campaign_id', meta.campaign_id)
    .eq('location_id', meta.location_id)
    .maybeSingle();
  if (!link) {
    return json({ error: 'campaign_location_not_linked' }, { status: 400 });
  }

  // Feature 4 / D-041: if a promoter is named, verify they are a real promoter
  // assigned to this location. Prevents cross-location visit logging.
  if (meta.promoter_id) {
    const { data: prom } = await admin
      .from('profiles')
      .select('id, role, active, assigned_locations')
      .eq('id', meta.promoter_id)
      .maybeSingle();
    if (!prom || !prom.active || prom.role !== 'promoter') {
      return json({ error: 'promoter_not_found_or_invalid' }, { status: 400 });
    }
    const promLocs: string[] = prom.assigned_locations ?? [];
    if (!promLocs.includes(meta.location_id)) {
      return json({ error: 'promoter_not_at_location' }, { status: 400 });
    }
  }

  const distanceRaw = haversineDistance(loc.lat, loc.lng, meta.lat, meta.lng);
  const distanceM = Math.round(distanceRaw);
  const isWithinGeofence = distanceM <= loc.geofence_radius_m;

  let stripped: Uint8Array;
  try {
    stripped = stripJpegMetadata(original);
  } catch {
    return json({ error: 'jpeg_strip_failed' }, { status: 400 });
  }
  const exifMinimal = parseJpegExifMinimal(original);

  const capturedAt = new Date(meta.captured_at);
  const visitDate = localDateString(capturedAt);
  const photoPath = `visits/${userId}/${visitDate}/${meta.idempotency_key}.jpg`;
  const { error: uploadErr } = await admin.storage
    .from('attendance-photos')
    .upload(photoPath, stripped, { contentType: 'image/jpeg', upsert: true });
  if (uploadErr) {
    return json({ error: 'photo_upload_failed', detail: uploadErr.message }, { status: 500 });
  }

  const { data: inserted, error: insErr } = await admin
    .from('supervisor_visits')
    .insert({
      supervisor_id: userId,
      campaign_id: meta.campaign_id,
      location_id: meta.location_id,
      promoter_id: meta.promoter_id ?? null,
      visited_at: capturedAt.toISOString(),
      lat: meta.lat,
      lng: meta.lng,
      distance_m: distanceM,
      is_within_geofence: isWithinGeofence,
      photo_path: photoPath,
      exif_minimal: exifMinimal,
      outcome: meta.outcome,
      notes: meta.notes ?? null,
      idempotency_key: meta.idempotency_key,
    })
    .select('id')
    .single();

  if (insErr || !inserted) {
    return json({ error: 'insert_failed', detail: insErr?.message }, { status: 500 });
  }

  // Feature 4 / D-041: notify the visited promoter. Fire-and-forget at the
  // response layer — a notification failure must not roll back the visit.
  if (meta.promoter_id) {
    const notifRes = await admin.from('notifications').insert({
      user_id: meta.promoter_id,
      kind: 'supervisor_visit',
      payload: {
        visit_id: inserted.id,
        supervisor_id: userId,
        location_id: meta.location_id,
        campaign_id: meta.campaign_id,
        visited_at: capturedAt.toISOString(),
        outcome: meta.outcome,
      },
    });
    if (notifRes.error) {
      console.warn('notification insert failed', notifRes.error.message);
    }
  }

  return json({
    visit_id: inserted.id,
    is_within_geofence: isWithinGeofence,
    distance_m: distanceM,
    photo_path: photoPath,
    outcome: meta.outcome,
    idempotency_key: meta.idempotency_key,
    replayed: false,
  });
});
