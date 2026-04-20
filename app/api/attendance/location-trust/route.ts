import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { requireRole } from '@/lib/auth/guards';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { locationTrustCheckSchema } from '@/lib/validations/location-trust';
import { recordLocationTrustCheck } from '@/lib/location-trust/record';
import { logDebug } from '@/lib/observability/logger';

// Fire-and-forget location-trust check fired by the promoter PWA right after
// a successful check-in. The Edge Function that records the attendance row is
// not touched — this handler is a separate signal-only path.
//
// Contract:
//   - Responds 202 immediately; never awaits the IPQS call or alert insert.
//   - Returns quickly (auth + body parse + ownership check + kick-off) even
//     when IPQS is slow or down.
//   - Promoter client calls this with keepalive: true and does not await.

export async function POST(req: Request) {
  const actor = await requireRole('promoter');

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = locationTrustCheckSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  // Verify the attendance row belongs to the caller before we hand the
  // context to the (admin-client) orchestrator.
  const admin = createAdminSupabase();
  const { data: row } = await admin
    .from('attendance')
    .select('id, user_id')
    .eq('id', parsed.data.attendance_id)
    .maybeSingle();
  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (row.user_id !== actor.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  const ip =
    (forwarded ? forwarded.split(',')[0]?.trim() : null) ??
    h.get('x-real-ip') ??
    null;

  if (!ip) {
    logDebug('location_trust.no_ip', { attendance_id: parsed.data.attendance_id });
    // Still accepted so the client side is always identical.
    return new NextResponse(null, { status: 202 });
  }

  // Intentionally not awaited: this is fire-and-forget. The orchestrator is
  // guaranteed to never throw. `void` silences lint/ts for an unhandled promise.
  void recordLocationTrustCheck({
    attendanceId: parsed.data.attendance_id,
    ip,
    lat: parsed.data.lat,
    lng: parsed.data.lng,
  });

  return new NextResponse(null, { status: 202 });
}
