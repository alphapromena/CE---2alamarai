import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { signActivityPhotoUrl } from '@/lib/queries/activity-photos';

/**
 * Issue a short-lived signed URL for a private activity photo.
 *
 * Access model (mirrors D-019 Phase 3 attendance):
 *   - admin: any photo
 *   - supervisor: only photos whose owning daily_report.location_id ∈
 *     the supervisor's assigned_locations
 *   - promoter: only photos on their own daily_reports
 *   - client: no access (aggregate-only in Phase 4)
 */
export async function POST(req: Request) {
  const actor = await requireRole('admin', 'supervisor', 'promoter');

  const body = (await req.json().catch(() => null)) as { path?: string } | null;
  const path = typeof body?.path === 'string' ? body.path : null;
  if (!path) {
    return NextResponse.json({ error: 'missing_path' }, { status: 400 });
  }

  const admin = createAdminSupabase();

  const { data: row } = await admin
    .from('activity_photos')
    .select('id, daily_report_id')
    .eq('storage_path', path)
    .maybeSingle();
  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const { data: report } = await admin
    .from('daily_reports')
    .select('promoter_user_id, location_id')
    .eq('id', row.daily_report_id)
    .maybeSingle();
  if (!report) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  if (actor.role === 'promoter') {
    if (report.promoter_user_id !== actor.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  } else if (actor.role === 'supervisor') {
    if (!actor.assigned_locations.includes(report.location_id)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  }
  // admin: allowed unconditionally.

  const url = await signActivityPhotoUrl(path, 300);
  if (!url) {
    return NextResponse.json({ error: 'sign_failed' }, { status: 500 });
  }
  return NextResponse.json({ url, expires_in: 300 });
}
