// compute-kpis — the server-side KPI writer (D-020).
//
// Two modes:
//
//   1. TARGETED (default). POST body = { daily_report_id: "<uuid>" }.
//      Runs under verify_jwt = true; caller must have SELECT access to that
//      daily_report via RLS (admin / owner promoter / assigned supervisor).
//      We re-check by doing a JWT-bound fetch before reading with service
//      role — RLS tells us "may this user see it?" and then we compute.
//
//   2. SWEEP. POST body = { sweep: true } with x-cron-secret header.
//      Finds all (status ∈ submitted | approved) daily_reports whose
//      kpi_snapshots.computed_at is older than daily_reports.updated_at
//      (or missing entirely) and recomputes each one. Safety net in case
//      the submit/approve Server Action failed to invoke us.
//
// Writes use service role to bypass RLS on kpi_snapshots (no authenticated
// INSERT/UPDATE policy exists — by design, per migration).
//
// The KPI math lives in ../_shared/kpis.ts, a byte-for-byte mirror of
// lib/kpis/compute.ts. Vitest tests lib/kpis/compute.test.ts cover both.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.3';
import {
  COMPUTATION_VERSION,
  computeKpis,
  readSamplingDenominator,
  type SkuBreakdown,
} from '../_shared/kpis.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

type DailyReportRow = {
  id: string;
  campaign_id: string;
  location_id: string;
  promoter_user_id: string;
  report_date: string;
  total_traffic: number | null;
  contacts: number;
  engaged: number;
  samples_total: number;
  sales_total: number;
  status: string;
  updated_at: string;
};

type SalesEntryRow = {
  sku_id: string;
  samples: number;
  sales: number;
};

async function fetchReportInputs(
  admin: ReturnType<typeof createClient>,
  dailyReportId: string,
): Promise<
  | { report: DailyReportRow; entries: SalesEntryRow[]; kpiConfig: unknown }
  | { error: string; status: number }
> {
  const { data: report, error: repErr } = await admin
    .from('daily_reports')
    .select(
      'id, campaign_id, location_id, promoter_user_id, report_date, total_traffic, contacts, engaged, samples_total, sales_total, status, updated_at',
    )
    .eq('id', dailyReportId)
    .maybeSingle();
  if (repErr) return { error: 'report_fetch_failed', status: 500 };
  if (!report) return { error: 'not_found', status: 404 };

  const { data: entries, error: entErr } = await admin
    .from('sales_entries')
    .select('sku_id, samples, sales')
    .eq('daily_report_id', dailyReportId);
  if (entErr) return { error: 'entries_fetch_failed', status: 500 };

  const { data: campaign, error: campErr } = await admin
    .from('campaigns')
    .select('kpi_config')
    .eq('id', (report as DailyReportRow).campaign_id)
    .maybeSingle();
  if (campErr) return { error: 'campaign_fetch_failed', status: 500 };

  return {
    report: report as DailyReportRow,
    entries: (entries as SalesEntryRow[]) ?? [],
    kpiConfig: campaign?.kpi_config ?? null,
  };
}

async function computeAndWrite(
  admin: ReturnType<typeof createClient>,
  dailyReportId: string,
): Promise<{ ok: true } | { error: string; status: number }> {
  const input = await fetchReportInputs(admin, dailyReportId);
  if ('error' in input) return input;
  const { report, entries, kpiConfig } = input;

  const skus: SkuBreakdown[] = entries.map((e) => ({
    sku_id: e.sku_id,
    samples: e.samples,
    sales: e.sales,
  }));

  const kpis = computeKpis({
    total_traffic: report.total_traffic,
    contacts: report.contacts,
    engaged: report.engaged,
    samples_total: report.samples_total,
    sales_total: report.sales_total,
    skus,
    sampling_rate_denominator: readSamplingDenominator(kpiConfig),
  });

  // Upsert by the unique daily_report_id column.
  const nowIso = new Date().toISOString();
  const { error: upErr } = await admin
    .from('kpi_snapshots')
    .upsert(
      {
        daily_report_id: report.id,
        interaction_rate: kpis.interaction_rate,
        engagement_rate: kpis.engagement_rate,
        sampling_rate: kpis.sampling_rate,
        conversion_rate: kpis.conversion_rate,
        sample_to_conversion_rate: kpis.sample_to_conversion_rate,
        sku_contributions: kpis.sku_contributions,
        sampling_rate_denominator: kpis.sampling_rate_denominator,
        computation_version: COMPUTATION_VERSION,
        computed_at: nowIso,
      },
      { onConflict: 'daily_report_id' },
    );
  if (upErr) return { error: 'snapshot_write_failed', status: 500 };
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, { status: 405 });
  }

  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return json({ error: 'invalid_json' }, { status: 400 });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // SWEEP mode — cron-secret gated.
  if (body.sweep === true) {
    const provided = req.headers.get('x-cron-secret') ?? '';
    if (!CRON_SECRET || provided !== CRON_SECRET) {
      return json({ error: 'forbidden' }, { status: 403 });
    }
    // Find reports needing (re)computation: those with no snapshot, or whose
    // snapshot.computed_at is stale vs the report's updated_at. Status must
    // be submitted or approved — drafts and rejected don't need snapshots.
    const { data: stale, error: staleErr } = await admin
      .from('daily_reports')
      .select('id, updated_at, kpi_snapshots!left ( computed_at )')
      .in('status', ['submitted', 'approved'])
      .limit(500);
    if (staleErr) {
      return json({ error: 'sweep_query_failed', detail: staleErr.message }, { status: 500 });
    }

    const toCompute: string[] = [];
    type SweepRow = { id: string; updated_at: string; kpi_snapshots: { computed_at: string | null } | { computed_at: string | null }[] | null };
    for (const row of (stale as unknown as SweepRow[]) ?? []) {
      const rel = row.kpi_snapshots;
      const computedAt = Array.isArray(rel)
        ? rel[0]?.computed_at ?? null
        : (rel?.computed_at ?? null);
      if (!computedAt) {
        toCompute.push(row.id);
        continue;
      }
      if (Date.parse(computedAt) < Date.parse(row.updated_at)) {
        toCompute.push(row.id);
      }
    }

    let computed = 0;
    let failures = 0;
    for (const id of toCompute) {
      const out = await computeAndWrite(admin, id);
      if ('ok' in out) computed += 1;
      else failures += 1;
    }
    return json({
      ok: true,
      mode: 'sweep',
      ran_at: new Date().toISOString(),
      considered: toCompute.length,
      computed,
      failures,
    });
  }

  // TARGETED mode — JWT-verified (by platform, via verify_jwt=true).
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return json({ error: 'unauthenticated' }, { status: 401 });
  }
  const callerToken = authHeader.slice(7).trim();
  const dailyReportId =
    typeof body.daily_report_id === 'string' && UUID_RE.test(body.daily_report_id)
      ? body.daily_report_id
      : null;
  if (!dailyReportId) {
    return json({ error: 'invalid_daily_report_id' }, { status: 400 });
  }

  // RLS re-check: an authenticated client attempting to access the row
  // through the user-scoped client. If they can SELECT it, they can cause
  // us to (re)compute its snapshot. Service role then does the actual work.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: allowed, error: rlsErr } = await userClient
    .from('daily_reports')
    .select('id')
    .eq('id', dailyReportId)
    .maybeSingle();
  if (rlsErr) return json({ error: 'authorization_check_failed' }, { status: 500 });
  if (!allowed) return json({ error: 'not_found' }, { status: 404 });

  const result = await computeAndWrite(admin, dailyReportId);
  if ('error' in result) return json({ error: result.error }, { status: result.status });

  return json({ ok: true, daily_report_id: dailyReportId, computation_version: COMPUTATION_VERSION });
});
