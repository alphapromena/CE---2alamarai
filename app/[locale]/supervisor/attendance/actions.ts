'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { requireRole } from '@/lib/auth/guards';
import { logAuditEvent } from '@/lib/auth/audit';
import {
  approveGeofenceOverrideSchema,
  resolveAlertSchema,
  updateAttendanceNotesSchema,
} from '@/lib/validations/attendance';

export type ActionState = { error: string | null };

async function supervisorCanAccessLocation(
  locationId: string,
  assignedLocations: string[],
  isAdmin: boolean,
): Promise<boolean> {
  if (isAdmin) return true;
  return assignedLocations.includes(locationId);
}

/**
 * Supervisor (or admin) approves a pending geofence override on an
 * attendance row. Writes supervisor_override + reason + by + at, resolves
 * the matching 'geofence_override_requested' alert, and audit-logs the
 * action.
 */
export async function approveGeofenceOverrideAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireRole('supervisor', 'admin');
  const locale = await getLocale();

  const parsed = approveGeofenceOverrideSchema.safeParse({
    attendance_id: formData.get('attendance_id'),
    reason: formData.get('reason'),
  });
  if (!parsed.success) return { error: 'unknown' };

  const admin = createAdminSupabase();

  const { data: row } = await admin
    .from('attendance')
    .select('id, location_id, supervisor_override, is_within_geofence')
    .eq('id', parsed.data.attendance_id)
    .maybeSingle();
  if (!row) return { error: 'not_found' };
  if (row.supervisor_override) return { error: 'already_overridden' };

  const allowed = await supervisorCanAccessLocation(
    row.location_id,
    actor.assigned_locations,
    actor.role === 'admin',
  );
  if (!allowed) return { error: 'forbidden' };

  const nowIso = new Date().toISOString();

  const { error: upErr } = await admin
    .from('attendance')
    .update({
      supervisor_override: true,
      override_reason: parsed.data.reason,
      override_by: actor.id,
      override_at: nowIso,
    })
    .eq('id', parsed.data.attendance_id);
  if (upErr) return { error: 'unknown' };

  // Resolve any open / acknowledged override-request alert on this row.
  await admin
    .from('alerts')
    .update({
      status: 'resolved',
      resolved_by: actor.id,
      resolved_at: nowIso,
      resolution_note: parsed.data.reason,
    })
    .eq('attendance_id', parsed.data.attendance_id)
    .eq('alert_type', 'geofence_override_requested')
    .in('status', ['open', 'acknowledged']);

  await logAuditEvent({
    actor_id: actor.id,
    action: 'supervisor.geofence_override_approved',
    entity: 'attendance',
    entity_id: parsed.data.attendance_id,
    after: { reason: parsed.data.reason },
  });

  revalidatePath(`/${locale}/supervisor/attendance`);
  return { error: null };
}

/**
 * Update free-form notes on an attendance row. Empty notes clear the field.
 */
export async function updateAttendanceNotesAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireRole('supervisor', 'admin');
  const locale = await getLocale();

  const parsed = updateAttendanceNotesSchema.safeParse({
    attendance_id: formData.get('attendance_id'),
    notes: formData.get('notes'),
  });
  if (!parsed.success) return { error: 'unknown' };

  const admin = createAdminSupabase();

  const { data: row } = await admin
    .from('attendance')
    .select('id, location_id, notes')
    .eq('id', parsed.data.attendance_id)
    .maybeSingle();
  if (!row) return { error: 'not_found' };

  const allowed = await supervisorCanAccessLocation(
    row.location_id,
    actor.assigned_locations,
    actor.role === 'admin',
  );
  if (!allowed) return { error: 'forbidden' };

  const { error: upErr } = await admin
    .from('attendance')
    .update({ notes: parsed.data.notes ?? null })
    .eq('id', parsed.data.attendance_id);
  if (upErr) return { error: 'unknown' };

  await logAuditEvent({
    actor_id: actor.id,
    action: 'supervisor.attendance_notes_updated',
    entity: 'attendance',
    entity_id: parsed.data.attendance_id,
    before: { notes: row.notes },
    after: { notes: parsed.data.notes ?? null },
  });

  revalidatePath(`/${locale}/supervisor/attendance`);
  return { error: null };
}

/**
 * Supervisor resolves (or dismisses) an open alert. Resolution note is
 * optional; dismissing records the state without treating the issue as
 * addressed.
 */
export async function resolveAlertAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireRole('supervisor', 'admin');
  const locale = await getLocale();

  const parsed = resolveAlertSchema.safeParse({
    alert_id: formData.get('alert_id'),
    resolution_note: formData.get('resolution_note'),
    dismiss: formData.get('dismiss') === 'true',
  });
  if (!parsed.success) return { error: 'unknown' };

  const admin = createAdminSupabase();

  const { data: alert } = await admin
    .from('alerts')
    .select('id, location_id, status')
    .eq('id', parsed.data.alert_id)
    .maybeSingle();
  if (!alert) return { error: 'not_found' };
  if (alert.status === 'resolved' || alert.status === 'dismissed') {
    return { error: null };
  }

  if (alert.location_id) {
    const allowed = await supervisorCanAccessLocation(
      alert.location_id,
      actor.assigned_locations,
      actor.role === 'admin',
    );
    if (!allowed) return { error: 'forbidden' };
  } else if (actor.role !== 'admin') {
    return { error: 'forbidden' };
  }

  const nowIso = new Date().toISOString();
  const nextStatus = parsed.data.dismiss ? 'dismissed' : 'resolved';

  const { error: upErr } = await admin
    .from('alerts')
    .update({
      status: nextStatus,
      resolved_by: actor.id,
      resolved_at: nowIso,
      resolution_note: parsed.data.resolution_note ?? null,
    })
    .eq('id', parsed.data.alert_id);
  if (upErr) return { error: 'unknown' };

  await logAuditEvent({
    actor_id: actor.id,
    action: `supervisor.alert_${nextStatus}`,
    entity: 'alert',
    entity_id: parsed.data.alert_id,
    after: { resolution_note: parsed.data.resolution_note ?? null },
  });

  revalidatePath(`/${locale}/supervisor/attendance`);
  return { error: null };
}
