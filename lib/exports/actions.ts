'use server';

import { revalidatePath } from 'next/cache';
import { requireSessionProfile } from '@/lib/auth/guards';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { logAuditEvent } from '@/lib/auth/audit';
import { checkRateLimit } from '@/lib/rate-limit/check';
import { composeExport } from './compose';
import { assembleExportInput } from './assemble';
import type { ExportRole, ExportScope } from './types';
import {
  downloadExportSchema,
  queueExportSchema,
  type QueueExportInput,
} from '@/lib/validations/exports';

export type ExportActionState = { error: string | null; id?: string; url?: string };

const EXPORTS_BUCKET = 'exports';
const DOWNLOAD_TTL_SECONDS = 300; // 5 minutes

/**
 * Resolve + clamp the caller-supplied scope against the caller's role:
 *   - admin      → pass-through
 *   - supervisor → if location_ids empty, fill with assigned locations;
 *                  otherwise intersect with assigned locations.
 *   - client     → client_id forced to caller's client_id; if campaign_ids
 *                  empty, fill with client's campaigns; otherwise intersect.
 */
async function resolveEffectiveScope(
  role: ExportRole,
  userId: string,
  clientId: string | null,
  scope: ExportScope,
  providedClientId: string | null | undefined,
): Promise<
  | { ok: true; scope: ExportScope; clientId: string | null }
  | { ok: false; error: string }
> {
  const admin = createAdminSupabase();
  if (role === 'client') {
    if (!clientId) return { ok: false, error: 'no_client_id' };
    if (providedClientId && providedClientId !== clientId) {
      return { ok: false, error: 'client_id_mismatch' };
    }
    const { data } = await admin
      .from('campaigns')
      .select('id')
      .eq('client_id', clientId);
    const allowed = new Set((data as { id: string }[] | null)?.map((c) => c.id) ?? []);
    let effective: string[];
    if (scope.campaign_ids.length === 0) {
      effective = Array.from(allowed);
    } else {
      effective = scope.campaign_ids.filter((id) => allowed.has(id));
      if (effective.length === 0) return { ok: false, error: 'no_accessible_campaigns' };
    }
    return {
      ok: true,
      scope: { ...scope, campaign_ids: effective },
      clientId,
    };
  }
  if (role === 'supervisor') {
    const { data } = await admin
      .from('user_assignments')
      .select('location_id')
      .eq('user_id', userId)
      .eq('active', true);
    const assigned = new Set(
      ((data as { location_id: string }[] | null) ?? []).map((r) => r.location_id),
    );
    let effective: string[];
    if (scope.location_ids.length === 0) {
      effective = Array.from(assigned);
    } else {
      effective = scope.location_ids.filter((id) => assigned.has(id));
      if (effective.length === 0) return { ok: false, error: 'no_accessible_locations' };
    }
    return {
      ok: true,
      scope: { ...scope, location_ids: effective },
      clientId: providedClientId ?? null,
    };
  }
  // admin
  return { ok: true, scope, clientId: providedClientId ?? null };
}

function pathForArtifact(
  clientId: string | null,
  jobId: string,
  filename: string,
): string {
  const tenant = clientId ?? 'internal';
  return `${tenant}/${jobId}/${filename}`;
}

// ---------------------------------------------------------------------------
// queueExportAction — synchronous generate + upload (D-030).
// ---------------------------------------------------------------------------
export async function queueExportAction(
  input: unknown,
  locale: 'ar' | 'en' = 'en',
): Promise<ExportActionState> {
  const me = await requireSessionProfile();
  if (me.role !== 'admin' && me.role !== 'supervisor' && me.role !== 'client') {
    return { error: 'forbidden' };
  }
  const role: ExportRole = me.role;

  const rl = await checkRateLimit('export_queue', me.id);
  if (!rl.allowed) return { error: 'rate_limited' };

  const parsed = queueExportSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalid_input' };
  const body: QueueExportInput = parsed.data;

  const admin = createAdminSupabase();

  // Idempotency read-through (D-009).
  const { data: existing } = await admin
    .from('export_jobs')
    .select('id, status, result_path')
    .eq('requested_by', me.id)
    .eq('idempotency_key', body.idempotency_key)
    .maybeSingle();
  if (existing) {
    return { error: null, id: existing.id };
  }

  const resolved = await resolveEffectiveScope(
    role,
    me.id,
    me.client_id,
    body.scope,
    body.client_id ?? null,
  );
  if (!resolved.ok) return { error: resolved.error };

  // Insert queued row (service role bypasses RLS; matches the same shape
  // the authenticated INSERT policy allows for defense-in-depth).
  const { data: job, error: insErr } = await admin
    .from('export_jobs')
    .insert({
      requested_by: me.id,
      client_id: resolved.clientId,
      scope: resolved.scope,
      format: body.format,
      status: 'queued',
      idempotency_key: body.idempotency_key,
    })
    .select('id')
    .single();
  if (insErr || !job) return { error: 'insert_failed' };

  await logAuditEvent({
    actor_id: me.id,
    action: 'export_job.queue',
    entity: 'export_jobs',
    entity_id: job.id,
    after: { format: body.format, client_id: resolved.clientId, scope: resolved.scope },
  });

  // Flip to running + generate.
  await admin
    .from('export_jobs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', job.id);

  try {
    const exportInput = await assembleExportInput(admin, {
      scope: resolved.scope,
      role,
      locale,
    });
    const prefix = resolved.clientId ? `export-${resolved.clientId.slice(0, 8)}` : 'export';
    const artifact = composeExport(exportInput, body.format, { prefix });
    const path = pathForArtifact(resolved.clientId, job.id, artifact.filename);
    const { error: upErr } = await admin.storage
      .from(EXPORTS_BUCKET)
      .upload(path, artifact.bytes, {
        contentType: artifact.mime,
        upsert: false,
      });
    if (upErr) throw upErr;

    await admin
      .from('export_jobs')
      .update({
        status: 'done',
        result_path: path,
        result_size_bytes: artifact.bytes.length,
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    await logAuditEvent({
      actor_id: me.id,
      action: 'export_job.done',
      entity: 'export_jobs',
      entity_id: job.id,
      after: { result_path: path, bytes: artifact.bytes.length },
    });

    revalidatePath('/[locale]/admin/exports', 'page');
    revalidatePath('/[locale]/supervisor/exports', 'page');
    revalidatePath('/[locale]/client/exports', 'page');
    return { error: null, id: job.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    await admin
      .from('export_jobs')
      .update({
        status: 'failed',
        error_message: message.slice(0, 500),
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id);
    return { error: 'generation_failed', id: job.id };
  }
}

// ---------------------------------------------------------------------------
// getExportDownloadUrlAction — mints a short-TTL signed URL for an artifact.
// ---------------------------------------------------------------------------
export async function getExportDownloadUrlAction(
  input: unknown,
): Promise<ExportActionState> {
  const me = await requireSessionProfile();
  const parsed = downloadExportSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalid_input' };
  const admin = createAdminSupabase();

  const { data: job } = await admin
    .from('export_jobs')
    .select('id, requested_by, client_id, result_path, status')
    .eq('id', parsed.data.id)
    .maybeSingle();
  if (!job) return { error: 'not_found' };
  // Access check — mirrors export_jobs RLS:
  //   admin → always
  //   other → must be requester OR (client role AND client_id matches)
  const canAccess =
    me.role === 'admin' ||
    job.requested_by === me.id ||
    (me.role === 'client' && me.client_id !== null && me.client_id === job.client_id);
  if (!canAccess) return { error: 'forbidden' };
  if (job.status !== 'done' || !job.result_path) return { error: 'not_ready' };

  const { data, error } = await admin.storage
    .from(EXPORTS_BUCKET)
    .createSignedUrl(job.result_path, DOWNLOAD_TTL_SECONDS);
  if (error || !data) return { error: 'sign_failed' };

  await logAuditEvent({
    actor_id: me.id,
    action: 'export_job.download',
    entity: 'export_jobs',
    entity_id: job.id,
  });

  return { error: null, id: job.id, url: data.signedUrl };
}
