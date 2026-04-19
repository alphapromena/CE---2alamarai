import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { signAttendancePhotoUrl } from '@/lib/queries/attendance';

/**
 * Short-lived signed URL for a supervisor visit photo.
 *
 * Access:
 *   - admin: any visit photo
 *   - supervisor: own visits or visits at an assigned location
 *   - other roles: denied
 */
export async function POST(req: Request) {
  const actor = await requireRole('admin', 'supervisor');
  const body = (await req.json().catch(() => null)) as { path?: string } | null;
  const path = typeof body?.path === 'string' ? body.path : null;
  if (!path) {
    return NextResponse.json({ error: 'missing_path' }, { status: 400 });
  }

  const admin = createAdminSupabase();
  const { data: row } = await admin
    .from('supervisor_visits')
    .select('id, supervisor_id, location_id')
    .eq('photo_path', path)
    .maybeSingle();
  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  if (actor.role === 'supervisor') {
    if (row.supervisor_id !== actor.id && !actor.assigned_locations.includes(row.location_id)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  }

  const url = await signAttendancePhotoUrl(path, 300);
  if (!url) {
    return NextResponse.json({ error: 'sign_failed' }, { status: 500 });
  }
  return NextResponse.json({ url, expires_in: 300 });
}
