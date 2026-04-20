// cron-scheduled-reports — Phase 8, Module 11.
//
// Daily sweep that:
//   1. Selects every active scheduled_reports row due right now (UTC).
//   2. Inserts a fresh export_jobs row per due schedule.
//   3. Calls generate-report with the new job_id to materialise the artifact
//      in the `exports` bucket.
//   4. Updates scheduled_reports.last_run_at + last_job_id.
//
// Due-at logic:
//   - cadence='daily'  → due if current UTC hour = hour_utc AND either
//                        last_run_at is NULL or >= 23h ago.
//   - cadence='weekly' → due if day_of_week_utc = EXTRACT(dow FROM now UTC)
//                        AND hour_utc = current hour AND last_run_at is
//                        NULL or >= 6 days ago.
//   - cadence='end_of_campaign' → due if campaign.status = 'completed'
//                        AND (last_run_at IS NULL) — fire exactly once per
//                        schedule, the first time the campaign is closed.
//                        Checks against scope.campaign_ids; if empty, skipped.
//
// Auth: verify_jwt = false + x-cron-secret header. Same trust model as
// generate-report / detect-live-issues.
//
// On failure to enqueue one schedule, the function keeps going so one bad
// row doesn't block the rest. Each failure is returned in the summary.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.3';
import type { ExportFormat, ExportScope } from '../_shared/exports-types.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

type ScheduleRow = {
  id: string;
  client_id: string | null;
  scope: ExportScope;
  format: ExportFormat;
  cadence: 'daily' | 'weekly' | 'end_of_campaign';
  hour_utc: number;
  day_of_week_utc: number | null;
  last_run_at: string | null;
  created_by: string;
};

function hoursSince(iso: string | null, now: Date): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const diffMs = now.getTime() - new Date(iso).getTime();
  return diffMs / 3_600_000;
}

function isDue(row: ScheduleRow, now: Date, completedCampaigns: Set<string>): boolean {
  const hourNow = now.getUTCHours();
  const dowNow = now.getUTCDay();
  if (row.cadence === 'daily') {
    return row.hour_utc === hourNow && hoursSince(row.last_run_at, now) >= 23;
  }
  if (row.cadence === 'weekly') {
    if (row.day_of_week_utc === null) return false;
    return (
      row.day_of_week_utc === dowNow &&
      row.hour_utc === hourNow &&
      hoursSince(row.last_run_at, now) >= 24 * 6
    );
  }
  // end_of_campaign — fire once per schedule, first sweep after the campaign
  // is marked completed. Requires scope.campaign_ids.
  if (row.last_run_at) return false;
  for (const c of row.scope.campaign_ids) {
    if (completedCampaigns.has(c)) return true;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, { status: 405 });
  const provided = req.headers.get('x-cron-secret') ?? '';
  if (!CRON_SECRET || provided !== CRON_SECRET) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }
  const now = new Date();
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: rowsRaw, error } = await admin
    .from('scheduled_reports')
    .select(
      'id, client_id, scope, format, cadence, hour_utc, day_of_week_utc, last_run_at, created_by',
    )
    .eq('active', true);
  if (error) return json({ error: 'query_failed', message: error.message }, { status: 500 });
  const rows = (rowsRaw as unknown as ScheduleRow[]) ?? [];

  // Gather completed campaign ids referenced by end_of_campaign schedules.
  const eocCampaignIds = new Set<string>();
  for (const r of rows) {
    if (r.cadence === 'end_of_campaign') {
      for (const c of r.scope.campaign_ids) eocCampaignIds.add(c);
    }
  }
  let completed = new Set<string>();
  if (eocCampaignIds.size > 0) {
    const { data: camps } = await admin
      .from('campaigns')
      .select('id, status')
      .in('id', Array.from(eocCampaignIds));
    completed = new Set(
      ((camps as { id: string; status: string }[] | null) ?? [])
        .filter((c) => c.status === 'completed')
        .map((c) => c.id),
    );
  }

  const enqueued: { schedule_id: string; job_id: string }[] = [];
  const failures: { schedule_id: string; error: string }[] = [];

  for (const row of rows) {
    if (!isDue(row, now, completed)) continue;
    const idempotencyKey = crypto.randomUUID();
    const { data: job, error: insErr } = await admin
      .from('export_jobs')
      .insert({
        requested_by: row.created_by,
        client_id: row.client_id,
        scope: row.scope,
        format: row.format,
        status: 'queued',
        idempotency_key: idempotencyKey,
      })
      .select('id')
      .single();
    if (insErr || !job) {
      failures.push({ schedule_id: row.id, error: insErr?.message ?? 'insert_failed' });
      continue;
    }
    // Invoke generate-report for this specific job.
    const fnUrl = `${SUPABASE_URL}/functions/v1/generate-report`;
    try {
      const resp = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-cron-secret': CRON_SECRET,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ job_id: job.id }),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        failures.push({
          schedule_id: row.id,
          error: `generate-report ${resp.status}: ${txt.slice(0, 200)}`,
        });
      }
    } catch (err) {
      failures.push({
        schedule_id: row.id,
        error: err instanceof Error ? err.message : 'fetch_failed',
      });
    }
    await admin
      .from('scheduled_reports')
      .update({ last_run_at: now.toISOString(), last_job_id: job.id })
      .eq('id', row.id);
    enqueued.push({ schedule_id: row.id, job_id: job.id });
  }

  return json({ ok: true, enqueued, failures });
});
