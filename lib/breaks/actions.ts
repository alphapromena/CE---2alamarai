'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/guards';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { logAuditEvent } from '@/lib/auth/audit';
import { readBreakMaxMinutes } from '@/lib/alerts/detect';
import {
  endBreakSchema,
  reviewBreakRequestSchema,
  startBreakSchema,
  submitBreakRequestSchema,
} from '@/lib/validations/breaks';

export type BreakActionState = { error: string | null; id?: string };

// ---------------------------------------------------------------------------
// Submit (promoter) — D-009 idempotent on (promoter_id, idempotency_key).
// ---------------------------------------------------------------------------

export async function submitBreakRequestAction(
  input: unknown,
): Promise<BreakActionState> {
  const me = await requireRole('promoter', 'admin');
  const parsed = submitBreakRequestSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalid_input' };
  const body = parsed.data;

  const supabase = await createServerSupabase();
  const admin = createAdminSupabase();

  // Idempotency read-through: if a row with the same (promoter, idempotency_key)
  // already exists, return its id without inserting a second row (D-009 —
  // safe retry under flaky mobile networks).
  const { data: existing } = await supabase
    .from('break_requests')
    .select('id')
    .eq('promoter_id', me.id)
    .eq('idempotency_key', body.idempotency_key)
    .maybeSingle();
  if (existing) return { error: null, id: existing.id };

  // Server-side duration cap (kpi_config.break_max_minutes).
  const { data: campRow } = await admin
    .from('campaigns')
    .select('id, kpi_config, status')
    .eq('id', body.campaign_id)
    .maybeSingle();
  if (!campRow) return { error: 'campaign_not_found' };
  const cap = readBreakMaxMinutes(campRow.kpi_config);
  if (body.duration_minutes > cap) return { error: 'duration_exceeds_cap' };

  const { data: inserted, error } = await supabase
    .from('break_requests')
    .insert({
      promoter_id: me.id,
      campaign_id: body.campaign_id,
      location_id: body.location_id ?? null,
      shift_id: body.shift_id ?? null,
      attendance_id: body.attendance_id ?? null,
      requested_start: body.requested_start,
      duration_minutes: body.duration_minutes,
      reason: body.reason ?? null,
      status: 'pending',
      idempotency_key: body.idempotency_key,
    })
    .select('id')
    .single();
  if (error || !inserted) return { error: 'insert_failed' };

  await logAuditEvent({
    actor_id: me.id,
    action: 'break_request.submit',
    entity: 'break_requests',
    entity_id: inserted.id,
    after: { campaign_id: body.campaign_id, duration_minutes: body.duration_minutes },
  });

  // Fan-out: notify every supervisor on this location (if provided).
  if (body.location_id) {
    const { data: sups } = await admin
      .from('user_assignments')
      .select('user_id')
      .eq('active', true)
      .eq('role_scope', 'supervisor')
      .eq('location_id', body.location_id);
    const rows = ((sups as { user_id: string }[]) ?? []).map((s) => ({
      user_id: s.user_id,
      kind: 'break_requested' as const,
      break_request_id: inserted.id,
      payload: {
        promoter_id: me.id,
        campaign_id: body.campaign_id,
        location_id: body.location_id,
        duration_minutes: body.duration_minutes,
      },
    }));
    if (rows.length > 0) await admin.from('notifications').insert(rows);
  }

  revalidatePath('/[locale]/promoter/breaks', 'page');
  revalidatePath('/[locale]/supervisor/breaks', 'page');
  return { error: null, id: inserted.id };
}

// ---------------------------------------------------------------------------
// Review (supervisor) — approve / reject / modify.
// ---------------------------------------------------------------------------

export async function reviewBreakRequestAction(
  input: unknown,
): Promise<BreakActionState> {
  const me = await requireRole('supervisor', 'admin');
  const parsed = reviewBreakRequestSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalid_input' };
  const body = parsed.data;

  const supabase = await createServerSupabase();
  const admin = createAdminSupabase();

  const { data: row } = await supabase
    .from('break_requests')
    .select('id, status, promoter_id, campaign_id, location_id, requested_start, duration_minutes')
    .eq('id', body.id)
    .maybeSingle();
  if (!row) return { error: 'not_found' };
  if (row.status !== 'pending') return { error: 'not_pending' };

  const now = new Date().toISOString();
  let newStatus: 'approved' | 'rejected' | 'modified';
  let approvedStart: string | null = null;
  let approvedDuration: number | null = null;
  let notifKind: 'break_approved' | 'break_rejected' | 'break_modified';

  if (body.decision === 'reject') {
    newStatus = 'rejected';
    notifKind = 'break_rejected';
  } else {
    const start = body.approved_start ?? row.requested_start;
    const dur = body.approved_duration_minutes ?? row.duration_minutes;
    const { data: campRow } = await admin
      .from('campaigns')
      .select('kpi_config')
      .eq('id', row.campaign_id)
      .maybeSingle();
    const cap = readBreakMaxMinutes(campRow?.kpi_config);
    if (dur > cap) return { error: 'duration_exceeds_cap' };
    approvedStart = start;
    approvedDuration = dur;
    const differs = start !== row.requested_start || dur !== row.duration_minutes;
    newStatus = body.decision === 'modify' || differs ? 'modified' : 'approved';
    notifKind = newStatus === 'modified' ? 'break_modified' : 'break_approved';
  }

  const { error } = await supabase
    .from('break_requests')
    .update({
      status: newStatus,
      reviewer_id: me.id,
      reviewer_reason: body.reviewer_reason ?? null,
      reviewed_at: now,
      approved_start: approvedStart,
      approved_duration_minutes: approvedDuration,
    })
    .eq('id', body.id);
  if (error) return { error: 'update_failed' };

  await logAuditEvent({
    actor_id: me.id,
    action: `break_request.${newStatus}`,
    entity: 'break_requests',
    entity_id: body.id,
    after: { status: newStatus, approved_start: approvedStart, approved_duration_minutes: approvedDuration },
  });

  // Fan-out: notify the promoter.
  await admin.from('notifications').insert({
    user_id: row.promoter_id,
    kind: notifKind,
    break_request_id: body.id,
    payload: {
      campaign_id: row.campaign_id,
      location_id: row.location_id,
      status: newStatus,
      approved_start: approvedStart,
      approved_duration_minutes: approvedDuration,
      reviewer_reason: body.reviewer_reason ?? null,
    },
  });

  revalidatePath('/[locale]/supervisor/breaks', 'page');
  revalidatePath('/[locale]/promoter/breaks', 'page');
  return { error: null, id: body.id };
}

// ---------------------------------------------------------------------------
// Promoter start / end.
// ---------------------------------------------------------------------------

export async function startBreakAction(input: unknown): Promise<BreakActionState> {
  const me = await requireRole('promoter', 'admin');
  const parsed = startBreakSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalid_input' };
  const supabase = await createServerSupabase();
  const { data: row } = await supabase
    .from('break_requests')
    .select('id, status, promoter_id, actual_start')
    .eq('id', parsed.data.id)
    .maybeSingle();
  if (!row) return { error: 'not_found' };
  if (row.promoter_id !== me.id && me.role !== 'admin') return { error: 'forbidden' };
  if (row.status !== 'approved' && row.status !== 'modified') return { error: 'not_approved' };
  if (row.actual_start) return { error: 'already_started' };
  const { error } = await supabase
    .from('break_requests')
    .update({ actual_start: new Date().toISOString() })
    .eq('id', parsed.data.id);
  if (error) return { error: 'update_failed' };
  revalidatePath('/[locale]/promoter/breaks', 'page');
  return { error: null, id: parsed.data.id };
}

export async function endBreakAction(input: unknown): Promise<BreakActionState> {
  const me = await requireRole('promoter', 'admin');
  const parsed = endBreakSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalid_input' };
  const supabase = await createServerSupabase();
  const { data: row } = await supabase
    .from('break_requests')
    .select('id, status, promoter_id, actual_start, actual_end')
    .eq('id', parsed.data.id)
    .maybeSingle();
  if (!row) return { error: 'not_found' };
  if (row.promoter_id !== me.id && me.role !== 'admin') return { error: 'forbidden' };
  if (!row.actual_start) return { error: 'not_started' };
  if (row.actual_end) return { error: 'already_ended' };
  const { error } = await supabase
    .from('break_requests')
    .update({ actual_end: new Date().toISOString() })
    .eq('id', parsed.data.id);
  if (error) return { error: 'update_failed' };
  revalidatePath('/[locale]/promoter/breaks', 'page');
  return { error: null, id: parsed.data.id };
}
