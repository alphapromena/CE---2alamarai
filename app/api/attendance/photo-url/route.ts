import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { signAttendancePhotoUrl } from '@/lib/queries/attendance';

/**
 * Issue a short-lived signed URL for a private attendance photo.
 *
 * Access model:
 *   - admin: any photo
 *   - supervisor: only photos attached to attendance rows at their assigned
 *     locations
 *   - promoter: only photos on their own attendance rows
 *   - client: no access (Phase 3 — clients get aggregates only per D-019)
 *
 * Called from the supervisor dashboard "view photo" action and (later) from
 * the promoter history view.
 */
export async function POST(req: Request) {
  const actor = await requireRole('admin', 'supervisor', 'promoter');

  const body = (await req.json().catch(() => null)) as { path?: string } | null;
  const path = typeof body?.path === 'string' ? body.path : null;
  if (!path) {
    return NextResponse.json({ error: 'missing_path' }, { status: 400 });
  }

  const admin = createAdminSupabase();

  // Resolve the attendance row that owns this path — so we can authorise.
  const { data: row } = await admin
    .from('attendance')
    .select('id, user_id, location_id')
    .or(`check_in_photo_path.eq.${path},check_out_photo_path.eq.${path}`)
    .maybeSingle();
  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  if (actor.role === 'promoter') {
    if (row.user_id !== actor.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  } else if (actor.role === 'supervisor') {
    if (!actor.assigned_locations.includes(row.location_id)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  }
  // admin: allowed unconditionally.

  const url = await signAttendancePhotoUrl(path, 300);
  if (!url) {
    return NextResponse.json({ error: 'sign_failed' }, { status: 500 });
  }
  return NextResponse.json({ url, expires_in: 300 });
}
