'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { requireRole } from '@/lib/auth/guards';
import { logAuditEvent } from '@/lib/auth/audit';
import { logError } from '@/lib/observability/logger';
import { invokeComputeKpis } from '@/lib/kpis/invoke';
import {
  saveDraftReportSchema,
  submitReportSchema,
  upsertSalesEntrySchema,
  deleteSalesEntrySchema,
  registerActivityPhotoSchema,
  deleteActivityPhotoSchema,
} from '@/lib/validations/reports';

/**
 * Promoter-side Server Actions for daily reports. All mutations carry a
 * client-generated UUID idempotency_key (D-009); the UNIQUE index
 * daily_reports_idempotency_unique_idx turns a retry into a no-op insert
 * that finds the existing row.
 *
 * Offline queue (D-010): the client layer enqueues these calls with their
 * keys; on reconnect the queue replays them. Server replay is safe.
 */

export type ActionState = { error: string | null; reportId?: string };

function isUniqueViolation(message: string | null | undefined): boolean {
  if (!message) return false;
  return /duplicate key|unique constraint|already exists/i.test(message);
}

async function assertPromoterOwnsReport(
  admin: ReturnType<typeof createAdminSupabase>,
  actorId: string,
  reportId: string,
): Promise<{ status: string; location_id: string; campaign_id: string } | null> {
  const { data } = await admin
    .from('daily_reports')
    .select('id, promoter_user_id, status, location_id, campaign_id')
    .eq('id', reportId)
    .maybeSingle();
  if (!data || data.promoter_user_id !== actorId) return null;
  return { status: data.status, location_id: data.location_id, campaign_id: data.campaign_id };
}

async function recomputeReportTotals(
  admin: ReturnType<typeof createAdminSupabase>,
  reportId: string,
): Promise<void> {
  const { data } = await admin
    .from('sales_entries')
    .select('samples, sales')
    .eq('daily_report_id', reportId);
  const samples_total = (data ?? []).reduce((s, r) => s + (r.samples ?? 0), 0);
  const sales_total = (data ?? []).reduce((s, r) => s + (r.sales ?? 0), 0);
  await admin
    .from('daily_reports')
    .update({ samples_total, sales_total })
    .eq('id', reportId);
}

// ─── daily_reports ────────────────────────────────────────────────────────

export async function saveDraftReportAction(input: unknown): Promise<ActionState> {
  const actor = await requireRole('promoter', 'admin');
  const parsed = saveDraftReportSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalid_input' };

  const admin = createAdminSupabase();
  const data = parsed.data;

  // Check location is in promoter's assigned set (RLS would also enforce,
  // but fail fast with a better error).
  if (actor.role === 'promoter' && !actor.assigned_locations.includes(data.location_id)) {
    return { error: 'location_not_assigned' };
  }

  if (data.id) {
    // UPDATE path. Must exist and be in draft/submitted, owned by actor.
    const owns = await assertPromoterOwnsReport(admin, actor.id, data.id);
    if (!owns) return { error: 'not_found' };
    if (owns.status !== 'draft' && owns.status !== 'submitted') {
      return { error: 'frozen' };
    }
    const { error } = await admin
      .from('daily_reports')
      .update({
        total_traffic: data.total_traffic ?? null,
        contacts: data.contacts,
        engaged: data.engaged,
        notes: data.notes ?? null,
        // Keep status in draft while saving drafts; do not auto-submit here.
        status: 'draft',
        // Clear review audit if promoter re-edits after rejection.
        submitted_at: null,
        reviewed_at: null,
        reviewed_by: null,
        review_reason: null,
      })
      .eq('id', data.id);
    if (error) {
      logError('saveDraftReportAction update failed', {
        actor_id: actor.id,
        report_id: data.id,
        code: error.code,
        message: error.message,
      });
      return { error: 'update_failed' };
    }
    return { error: null, reportId: data.id };
  }

  // INSERT path — check idempotency replay.
  const { data: existing } = await admin
    .from('daily_reports')
    .select('id')
    .eq('promoter_user_id', actor.id)
    .eq('idempotency_key', data.idempotency_key)
    .maybeSingle();
  if (existing) return { error: null, reportId: existing.id };

  const { data: inserted, error } = await admin
    .from('daily_reports')
    .insert({
      campaign_id: data.campaign_id,
      location_id: data.location_id,
      promoter_user_id: actor.id,
      report_date: data.report_date,
      total_traffic: data.total_traffic ?? null,
      contacts: data.contacts,
      engaged: data.engaged,
      notes: data.notes ?? null,
      status: 'draft',
      idempotency_key: data.idempotency_key,
    })
    .select('id')
    .single();

  if (error || !inserted) {
    // Unique (promoter, location, date) — look up the sibling row.
    if (isUniqueViolation(error?.message)) {
      const { data: sibling } = await admin
        .from('daily_reports')
        .select('id')
        .eq('promoter_user_id', actor.id)
        .eq('location_id', data.location_id)
        .eq('report_date', data.report_date)
        .maybeSingle();
      if (sibling) return { error: null, reportId: sibling.id };
    }
    if (error) {
      logError('saveDraftReportAction insert failed', {
        actor_id: actor.id,
        campaign_id: data.campaign_id,
        location_id: data.location_id,
        report_date: data.report_date,
        code: error.code,
        message: error.message,
      });
    }
    return { error: 'create_failed' };
  }

  await logAuditEvent({
    actor_id: actor.id,
    action: 'promoter.report_draft_created',
    entity: 'daily_report',
    entity_id: inserted.id,
    after: { campaign_id: data.campaign_id, location_id: data.location_id, report_date: data.report_date },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/promoter/reports/today`);
  return { error: null, reportId: inserted.id };
}

export async function submitReportAction(input: unknown): Promise<ActionState> {
  const actor = await requireRole('promoter', 'admin');
  const parsed = submitReportSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalid_input' };

  const admin = createAdminSupabase();
  const owns = await assertPromoterOwnsReport(admin, actor.id, parsed.data.id);
  if (!owns && actor.role !== 'admin') return { error: 'not_found' };
  if (owns && owns.status !== 'draft' && owns.status !== 'submitted' && owns.status !== 'rejected') {
    return { error: 'frozen' };
  }

  // Recompute header sums from sales_entries before submit (defence in depth
  // — UI also does it, but the submit action must be authoritative).
  await recomputeReportTotals(admin, parsed.data.id);

  const { error } = await admin
    .from('daily_reports')
    .update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      reviewed_at: null,
      reviewed_by: null,
      review_reason: null,
    })
    .eq('id', parsed.data.id);
  if (error) {
    logError('submitReportAction failed', {
      actor_id: actor.id,
      report_id: parsed.data.id,
      code: error.code,
      message: error.message,
    });
    return { error: 'submit_failed' };
  }

  await logAuditEvent({
    actor_id: actor.id,
    action: 'promoter.report_submitted',
    entity: 'daily_report',
    entity_id: parsed.data.id,
  });

  // Fire-and-forget; sweep catches missed invocations.
  await invokeComputeKpis(parsed.data.id);

  const locale = await getLocale();
  revalidatePath(`/${locale}/promoter/reports/today`);
  return { error: null, reportId: parsed.data.id };
}

// ─── sales_entries ────────────────────────────────────────────────────────

export async function upsertSalesEntryAction(input: unknown): Promise<ActionState> {
  const actor = await requireRole('promoter', 'admin');
  const parsed = upsertSalesEntrySchema.safeParse(input);
  if (!parsed.success) return { error: 'invalid_input' };

  const admin = createAdminSupabase();
  const owns = await assertPromoterOwnsReport(admin, actor.id, parsed.data.daily_report_id);
  if (!owns && actor.role !== 'admin') return { error: 'not_found' };
  if (owns && owns.status !== 'draft' && owns.status !== 'submitted') {
    return { error: 'frozen' };
  }

  const { error } = await admin
    .from('sales_entries')
    .upsert(
      {
        daily_report_id: parsed.data.daily_report_id,
        sku_id: parsed.data.sku_id,
        samples: parsed.data.samples,
        sales: parsed.data.sales,
      },
      { onConflict: 'daily_report_id,sku_id' },
    );
  if (error) {
    logError('upsertSalesEntryAction failed', {
      actor_id: actor.id,
      report_id: parsed.data.daily_report_id,
      sku_id: parsed.data.sku_id,
      code: error.code,
      message: error.message,
    });
    return { error: 'upsert_failed' };
  }

  await recomputeReportTotals(admin, parsed.data.daily_report_id);
  return { error: null, reportId: parsed.data.daily_report_id };
}

export async function deleteSalesEntryAction(input: unknown): Promise<ActionState> {
  const actor = await requireRole('promoter', 'admin');
  const parsed = deleteSalesEntrySchema.safeParse(input);
  if (!parsed.success) return { error: 'invalid_input' };

  const admin = createAdminSupabase();
  const owns = await assertPromoterOwnsReport(admin, actor.id, parsed.data.daily_report_id);
  if (!owns && actor.role !== 'admin') return { error: 'not_found' };
  if (owns && owns.status !== 'draft' && owns.status !== 'submitted') {
    return { error: 'frozen' };
  }

  const { error } = await admin
    .from('sales_entries')
    .delete()
    .eq('daily_report_id', parsed.data.daily_report_id)
    .eq('sku_id', parsed.data.sku_id);
  if (error) {
    logError('deleteSalesEntryAction failed', {
      actor_id: actor.id,
      report_id: parsed.data.daily_report_id,
      sku_id: parsed.data.sku_id,
      code: error.code,
      message: error.message,
    });
    return { error: 'delete_failed' };
  }

  await recomputeReportTotals(admin, parsed.data.daily_report_id);
  return { error: null, reportId: parsed.data.daily_report_id };
}

// ─── activity_photos ──────────────────────────────────────────────────────

export async function registerActivityPhotoAction(input: unknown): Promise<ActionState> {
  const actor = await requireRole('promoter', 'admin');
  const parsed = registerActivityPhotoSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalid_input' };

  const admin = createAdminSupabase();
  const owns = await assertPromoterOwnsReport(admin, actor.id, parsed.data.daily_report_id);
  if (!owns && actor.role !== 'admin') return { error: 'not_found' };
  if (owns && owns.status !== 'draft' && owns.status !== 'submitted') {
    return { error: 'frozen' };
  }

  // Delete any existing row of this kind (and its storage object) first so a
  // re-upload replaces cleanly.
  const { data: prior } = await admin
    .from('activity_photos')
    .select('storage_path')
    .eq('daily_report_id', parsed.data.daily_report_id)
    .eq('photo_kind', parsed.data.photo_kind)
    .maybeSingle();

  const { error: upErr } = await admin
    .from('activity_photos')
    .upsert(
      {
        daily_report_id: parsed.data.daily_report_id,
        photo_kind: parsed.data.photo_kind,
        storage_path: parsed.data.storage_path,
        exif_minimal: parsed.data.exif_minimal ?? null,
        uploaded_by: actor.id,
      },
      { onConflict: 'daily_report_id,photo_kind' },
    );
  if (upErr) {
    logError('registerActivityPhotoAction failed', {
      actor_id: actor.id,
      report_id: parsed.data.daily_report_id,
      photo_kind: parsed.data.photo_kind,
      code: upErr.code,
      message: upErr.message,
    });
    return { error: 'register_failed' };
  }

  if (prior?.storage_path && prior.storage_path !== parsed.data.storage_path) {
    await admin.storage.from('activity-photos').remove([prior.storage_path]);
  }

  const locale = await getLocale();
  revalidatePath(`/${locale}/promoter/reports/today`);
  return { error: null, reportId: parsed.data.daily_report_id };
}

export async function deleteActivityPhotoAction(input: unknown): Promise<ActionState> {
  const actor = await requireRole('promoter', 'admin');
  const parsed = deleteActivityPhotoSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalid_input' };

  const admin = createAdminSupabase();
  const owns = await assertPromoterOwnsReport(admin, actor.id, parsed.data.daily_report_id);
  if (!owns && actor.role !== 'admin') return { error: 'not_found' };
  if (owns && owns.status !== 'draft' && owns.status !== 'submitted') {
    return { error: 'frozen' };
  }

  const { data: existing } = await admin
    .from('activity_photos')
    .select('storage_path')
    .eq('daily_report_id', parsed.data.daily_report_id)
    .eq('photo_kind', parsed.data.photo_kind)
    .maybeSingle();

  if (existing?.storage_path) {
    await admin.storage.from('activity-photos').remove([existing.storage_path]);
  }
  const { error } = await admin
    .from('activity_photos')
    .delete()
    .eq('daily_report_id', parsed.data.daily_report_id)
    .eq('photo_kind', parsed.data.photo_kind);
  if (error) {
    logError('deleteActivityPhotoAction failed', {
      actor_id: actor.id,
      report_id: parsed.data.daily_report_id,
      photo_kind: parsed.data.photo_kind,
      code: error.code,
      message: error.message,
    });
    return { error: 'delete_failed' };
  }

  const locale = await getLocale();
  revalidatePath(`/${locale}/promoter/reports/today`);
  return { error: null, reportId: parsed.data.daily_report_id };
}
