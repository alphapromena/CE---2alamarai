// generate-report — Phase 8, Module 11.
//
// Worker that picks up a queued export_jobs row and materialises the
// artifact (CSV-zip or XLSX) in the `exports` Storage bucket.
//
// Invocation modes:
//   1. Targeted (job_id in body) — invoked by cron-scheduled-reports after
//      it creates a new row. Processes exactly the given row.
//   2. Sweep (no body) — picks the oldest queued row per call (at most one
//      per invocation to keep latency bounded) and processes it. A retry
//      sweep can drain a backlog by being called repeatedly.
//
// Auth: verify_jwt = false + x-cron-secret header checked against
// CRON_SECRET. Same pattern as detect-attendance-issues / detect-live-issues.
//
// On-demand exports initiated from the UI do NOT go through this function —
// they run synchronously in the queueExportAction Server Action (D-030).
// This function is the cron/scheduled-reports path only.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.3';
import { assembleExportInput } from '../_shared/assemble.ts';
import { composeExport } from '../_shared/compose.ts';
import type { ExportFormat, ExportRole, ExportScope } from '../_shared/exports-types.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
const EXPORTS_BUCKET = 'exports';

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

type JobRow = {
  id: string;
  requested_by: string;
  client_id: string | null;
  scope: ExportScope;
  format: ExportFormat;
  status: string;
};

async function processJob(
  admin: ReturnType<typeof createClient>,
  job: JobRow,
): Promise<{ ok: true; path: string; bytes: number } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  await admin
    .from('export_jobs')
    .update({ status: 'running', started_at: now })
    .eq('id', job.id);

  try {
    // Role resolution: look up the requester's profile.
    const { data: profile } = await admin
      .from('profiles')
      .select('role, client_id, preferred_language')
      .eq('id', job.requested_by)
      .maybeSingle();
    const role: ExportRole =
      profile?.role === 'client'
        ? 'client'
        : profile?.role === 'supervisor'
          ? 'supervisor'
          : 'admin';
    const locale: 'ar' | 'en' = profile?.preferred_language === 'ar' ? 'ar' : 'en';

    const input = await assembleExportInput(admin, { scope: job.scope, role, locale });
    const prefix = job.client_id ? `export-${job.client_id.slice(0, 8)}` : 'export';
    const artifact = composeExport(input, job.format, { prefix });
    const tenant = job.client_id ?? 'internal';
    const path = `${tenant}/${job.id}/${artifact.filename}`;

    const { error: upErr } = await admin.storage.from(EXPORTS_BUCKET).upload(path, artifact.bytes, {
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

    return { ok: true, path, bytes: artifact.bytes.length };
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
    return { ok: false, error: message };
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, { status: 405 });
  }
  const provided = req.headers.get('x-cron-secret') ?? '';
  if (!CRON_SECRET || provided !== CRON_SECRET) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { job_id?: string } = {};
  try {
    if (req.headers.get('content-length') !== '0') {
      body = (await req.json()) as { job_id?: string };
    }
  } catch {
    body = {};
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let job: JobRow | null = null;
  if (body.job_id) {
    const { data } = await admin
      .from('export_jobs')
      .select('id, requested_by, client_id, scope, format, status')
      .eq('id', body.job_id)
      .maybeSingle();
    job = (data as JobRow | null) ?? null;
    if (!job) return json({ error: 'not_found' }, { status: 404 });
    if (job.status !== 'queued') return json({ error: 'not_queued', status: job.status });
  } else {
    const { data } = await admin
      .from('export_jobs')
      .select('id, requested_by, client_id, scope, format, status')
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(1);
    job = ((data as JobRow[] | null) ?? [])[0] ?? null;
    if (!job) return json({ ok: true, processed: 0 });
  }

  const result = await processJob(admin, job);
  if (!result.ok) {
    return json({ ok: false, id: job.id, error: result.error }, { status: 500 });
  }
  return json({ ok: true, id: job.id, path: result.path, bytes: result.bytes });
});
