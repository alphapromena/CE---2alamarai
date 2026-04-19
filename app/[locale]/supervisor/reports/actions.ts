'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { requireRole } from '@/lib/auth/guards';
import { logAuditEvent } from '@/lib/auth/audit';
import { invokeComputeKpis } from '@/lib/kpis/invoke';
import {
  approveReportSchema,
  rejectReportSchema,
  reopenReportSchema,
} from '@/lib/validations/reports';

export type SupervisorReviewState = { error: string | null };

async function loadReport(
  admin: ReturnType<typeof createAdminSupabase>,
  reportId: string,
): Promise<{ status: string; location_id: string; campaign_id: string; promoter_user_id: string } | null> {
  const { data } = await admin
    .from('daily_reports')
    .select('status, location_id, campaign_id, promoter_user_id')
    .eq('id', reportId)
    .maybeSingle();
  return (data as { status: string; location_id: string; campaign_id: string; promoter_user_id: string } | null) ?? null;
}

function isAuthorisedForLocation(
  role: 'admin' | 'supervisor',
  assigned: readonly string[],
  locationId: string,
): boolean {
  return role === 'admin' || assigned.includes(locationId);
}

export async function approveReportAction(input: unknown): Promise<SupervisorReviewState> {
  const actor = await requireRole('supervisor', 'admin');
  const parsed = approveReportSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalid_input' };

  const admin = createAdminSupabase();
  const report = await loadReport(admin, parsed.data.id);
  if (!report) return { error: 'not_found' };
  if (!isAuthorisedForLocation(actor.role as 'admin' | 'supervisor', actor.assigned_locations, report.location_id)) {
    return { error: 'location_not_assigned' };
  }
  if (report.status !== 'submitted') return { error: 'not_submitted' };

  const { error } = await admin
    .from('daily_reports')
    .update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      reviewed_by: actor.id,
      review_reason: null,
    })
    .eq('id', parsed.data.id);
  if (error) return { error: 'approve_failed' };

  await logAuditEvent({
    actor_id: actor.id,
    action: 'supervisor.report_approved',
    entity: 'daily_report',
    entity_id: parsed.data.id,
    before: { status: report.status },
    after: { status: 'approved' },
  });

  await invokeComputeKpis(parsed.data.id);

  const locale = await getLocale();
  revalidatePath(`/${locale}/supervisor/reports`);
  revalidatePath(`/${locale}/supervisor/reports/${parsed.data.id}`);
  revalidatePath(`/${locale}/admin/reports`);
  return { error: null };
}

export async function rejectReportAction(input: unknown): Promise<SupervisorReviewState> {
  const actor = await requireRole('supervisor', 'admin');
  const parsed = rejectReportSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalid_input' };

  const admin = createAdminSupabase();
  const report = await loadReport(admin, parsed.data.id);
  if (!report) return { error: 'not_found' };
  if (!isAuthorisedForLocation(actor.role as 'admin' | 'supervisor', actor.assigned_locations, report.location_id)) {
    return { error: 'location_not_assigned' };
  }
  if (report.status !== 'submitted') return { error: 'not_submitted' };

  const { error } = await admin
    .from('daily_reports')
    .update({
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: actor.id,
      review_reason: parsed.data.review_reason,
    })
    .eq('id', parsed.data.id);
  if (error) return { error: 'reject_failed' };

  await logAuditEvent({
    actor_id: actor.id,
    action: 'supervisor.report_rejected',
    entity: 'daily_report',
    entity_id: parsed.data.id,
    before: { status: report.status },
    after: { status: 'rejected', review_reason: parsed.data.review_reason },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/supervisor/reports`);
  revalidatePath(`/${locale}/supervisor/reports/${parsed.data.id}`);
  revalidatePath(`/${locale}/admin/reports`);
  return { error: null };
}

export async function reopenReportAction(input: unknown): Promise<SupervisorReviewState> {
  // Supervisor-initiated re-open of an approved report (correction path) OR
  // admin re-open of anything. Not part of the typical flow; gated carefully.
  const actor = await requireRole('supervisor', 'admin');
  const parsed = reopenReportSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalid_input' };

  const admin = createAdminSupabase();
  const report = await loadReport(admin, parsed.data.id);
  if (!report) return { error: 'not_found' };
  if (!isAuthorisedForLocation(actor.role as 'admin' | 'supervisor', actor.assigned_locations, report.location_id)) {
    return { error: 'location_not_assigned' };
  }
  if (report.status === 'draft') return { error: null }; // no-op

  const { error } = await admin
    .from('daily_reports')
    .update({
      status: 'draft',
      submitted_at: null,
      reviewed_at: null,
      reviewed_by: null,
      review_reason: null,
    })
    .eq('id', parsed.data.id);
  if (error) return { error: 'reopen_failed' };

  await logAuditEvent({
    actor_id: actor.id,
    action: 'supervisor.report_reopened',
    entity: 'daily_report',
    entity_id: parsed.data.id,
    before: { status: report.status },
    after: { status: 'draft' },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/supervisor/reports`);
  revalidatePath(`/${locale}/supervisor/reports/${parsed.data.id}`);
  return { error: null };
}
