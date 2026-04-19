import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { isJpeg, parseJpegExifMinimal, stripJpegMetadata } from '@/lib/storage/exif';

/**
 * Server-side upload for activity photos (setup / during / end_of_shift).
 *
 * Flow:
 *   1. Auth: promoter/admin only.
 *   2. Read multipart/form-data: file + daily_report_id + photo_kind.
 *   3. Validate ownership + report status (draft|submitted only).
 *   4. Validate MIME = image/jpeg, size ≤ 8 MiB, magic bytes.
 *   5. Strip EXIF (keep nothing persistent — activity photos aren't
 *      forensic evidence, but mandatory-strip is cheap insurance).
 *      Also read DateTimeOriginal + GPS for the exif_minimal row column.
 *   6. Upload stripped JPEG with service role to the private
 *      activity-photos bucket at
 *        activity/<daily_report_id>/<photo_kind>/<uuid>.jpg
 *   7. Upsert activity_photos row (replace storage object if the kind
 *      already existed).
 *
 * Returns { storage_path, exif_minimal }.
 */

export const runtime = 'nodejs';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHOTO_KINDS = new Set(['setup', 'during', 'end_of_shift']);

function uuid(): string {
  return crypto.randomUUID();
}

export async function POST(req: Request) {
  const actor = await requireRole('promoter', 'admin');

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: 'invalid_form' }, { status: 400 });
  }

  const dailyReportId = String(form.get('daily_report_id') ?? '');
  const photoKind = String(form.get('photo_kind') ?? '');
  const file = form.get('file');

  if (!UUID_RE.test(dailyReportId)) {
    return NextResponse.json({ error: 'invalid_daily_report_id' }, { status: 400 });
  }
  if (!PHOTO_KINDS.has(photoKind)) {
    return NextResponse.json({ error: 'invalid_photo_kind' }, { status: 400 });
  }
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'missing_file' }, { status: 400 });
  }
  if (file.type && file.type !== 'image/jpeg') {
    return NextResponse.json({ error: 'mime_not_jpeg' }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: 'too_large' }, { status: 413 });
  }

  const admin = createAdminSupabase();

  const { data: report } = await admin
    .from('daily_reports')
    .select('promoter_user_id, location_id, status')
    .eq('id', dailyReportId)
    .maybeSingle();
  if (!report) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  if (actor.role === 'promoter') {
    if (report.promoter_user_id !== actor.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  }
  if (report.status !== 'draft' && report.status !== 'submitted') {
    return NextResponse.json({ error: 'frozen' }, { status: 409 });
  }

  const buf = new Uint8Array(await file.arrayBuffer());
  if (!isJpeg(buf)) {
    return NextResponse.json({ error: 'not_a_jpeg' }, { status: 400 });
  }

  let stripped: Uint8Array;
  try {
    stripped = stripJpegMetadata(buf);
  } catch {
    return NextResponse.json({ error: 'jpeg_parse_failed' }, { status: 400 });
  }
  const exifMinimal = parseJpegExifMinimal(buf);

  const filename = `${uuid()}.jpg`;
  const storagePath = `activity/${dailyReportId}/${photoKind}/${filename}`;

  const { error: upErr } = await admin.storage
    .from('activity-photos')
    .upload(storagePath, stripped, {
      contentType: 'image/jpeg',
      cacheControl: 'private, max-age=0',
      upsert: false,
    });
  if (upErr) {
    return NextResponse.json({ error: 'upload_failed', detail: upErr.message }, { status: 500 });
  }

  // Replace any existing photo of this kind (activity_photos has a UNIQUE
  // constraint on (daily_report_id, photo_kind)). Delete prior storage
  // object if the path changed.
  const { data: prior } = await admin
    .from('activity_photos')
    .select('storage_path')
    .eq('daily_report_id', dailyReportId)
    .eq('photo_kind', photoKind)
    .maybeSingle();

  const { error: rowErr } = await admin
    .from('activity_photos')
    .upsert(
      {
        daily_report_id: dailyReportId,
        photo_kind: photoKind,
        storage_path: storagePath,
        exif_minimal: exifMinimal,
        uploaded_by: actor.id,
      },
      { onConflict: 'daily_report_id,photo_kind' },
    );
  if (rowErr) {
    // Attempt to delete the newly-uploaded object so we don't leak.
    await admin.storage.from('activity-photos').remove([storagePath]).catch(() => {});
    return NextResponse.json({ error: 'register_failed', detail: rowErr.message }, { status: 500 });
  }

  if (prior?.storage_path && prior.storage_path !== storagePath) {
    await admin.storage.from('activity-photos').remove([prior.storage_path]).catch(() => {});
  }

  return NextResponse.json({ storage_path: storagePath, exif_minimal: exifMinimal });
}
