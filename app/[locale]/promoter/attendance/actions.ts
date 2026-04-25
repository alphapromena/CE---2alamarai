'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { requireRole } from '@/lib/auth/guards';
import { logAuditEvent } from '@/lib/auth/audit';
import { logError } from '@/lib/observability/logger';
import { requestGeofenceOverrideSchema } from '@/lib/validations/attendance';

export type ActionState = { error: string | null };

/**
 * Promoter requests supervisor approval for a check-in that failed geofence.
 *
 * Creates an alert of type 'geofence_override_requested' pointing at the
 * attendance row. The supervisor resolves it via
 * `approveGeofenceOverrideAction`.
 *
 * Uses the admin client to write the alert — promoters cannot INSERT alerts
 * by RLS (alerts are system/supervisor-authored records).
 */
export async function requestGeofenceOverrideAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireRole('promoter');
  const locale = await getLocale();

  const parsed = requestGeofenceOverrideSchema.safeParse({
    attendance_id: formData.get('attendance_id'),
    reason: formData.get('reason'),
  });
  if (!parsed.success) return { error: 'unknown' };

  const admin = createAdminSupabase();

  // Verify ownership of the attendance row (the RLS policy would hide it from
  // a non-owner promoter anyway, but we re-check explicitly here because we're
  // about to use the service-role client).
  const { data: row, error: loadErr } = await admin
    .from('attendance')
    .select('id, user_id, campaign_id, location_id, is_within_geofence, supervisor_override')
    .eq('id', parsed.data.attendance_id)
    .maybeSingle();
  if (loadErr || !row) return { error: 'not_found' };
  if (row.user_id !== actor.id) return { error: 'forbidden' };
  if (row.is_within_geofence) return { error: 'not_applicable' };
  if (row.supervisor_override) return { error: 'already_overridden' };

  // One open request per attendance row — swallow duplicates quietly.
  const { data: existing } = await admin
    .from('alerts')
    .select('id')
    .eq('attendance_id', parsed.data.attendance_id)
    .eq('alert_type', 'geofence_override_requested')
    .in('status', ['open', 'acknowledged'])
    .maybeSingle();
  if (existing) {
    return { error: null };
  }

  const { error: insErr } = await admin.from('alerts').insert({
    alert_type: 'geofence_override_requested',
    severity: 'warning',
    status: 'open',
    user_id: actor.id,
    attendance_id: parsed.data.attendance_id,
    campaign_id: row.campaign_id,
    location_id: row.location_id,
    message_key: 'alerts.geofence_override_requested',
    message_params: { reason: parsed.data.reason },
  });
  if (insErr) {
    logError('requestGeofenceOverrideAction failed', {
      actor_id: actor.id,
      attendance_id: parsed.data.attendance_id,
      code: insErr.code,
      message: insErr.message,
    });
    return { error: 'unknown' };
  }

  await logAuditEvent({
    actor_id: actor.id,
    action: 'promoter.geofence_override_requested',
    entity: 'attendance',
    entity_id: parsed.data.attendance_id,
    after: { reason: parsed.data.reason },
  });

  revalidatePath(`/${locale}/promoter/attendance`);
  return { error: null };
}
