// detect-live-issues — scheduled sweep (Phase 7, Module 8).
//
// Fires two alert types that can't be detected at write time:
//
//   1. LOW_PERFORMANCE. For each active campaign, look at
//      performance_snapshots rows written by compute-kpis. Promoter- or
//      location-scope rows in the latest `daily` period whose tier metric is
//      strictly below kpi_config.low_performance_threshold (default 0.3)
//      get an alert. Deduplicates on (campaign, scope_kind, scope_id).
//
//   2. NO_ACTIVITY. For every checked-in (status='checked_in' or 'late')
//      attendance row today whose (sum of contacts/engaged/samples/sales
//      across today's daily_reports) is zero and whose check_in_time was
//      more than kpi_config.no_activity_hours (default 3) ago, fire an
//      alert. Deduplicates on (attendance_id, alert_type).
//
// Fan-out: alerts.insert fires a Supabase Realtime event (via the Phase 7
// publication). Additionally this function inserts one notifications row
// per alert targeted at the promoter (if any user_id) and at all supervisors
// assigned to the alert's location — so the bell icon lights up even when
// the target isn't on the live dashboard.
//
// Auth: verify_jwt = false. The caller must pass x-cron-secret matching
// CRON_SECRET (a Supabase function secret). Same pattern as
// detect-attendance-issues.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.3';
import {
  detectLowPerformance,
  detectNoActivity,
  readLowPerformanceThreshold,
  readNoActivityHours,
  type LowPerformanceFlag,
  type NoActivityFlag,
  type NoActivityInput,
  type PerformanceSnapshotRow,
} from '../_shared/live-detect.ts';
import { readTierConfig } from '../_shared/performance.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

// ---------------------------------------------------------------------------
// Low-performance pass
// ---------------------------------------------------------------------------

type CampaignRow = { id: string; kpi_config: unknown };

type PerfRow = PerformanceSnapshotRow & { reports_count: number };

async function runLowPerformanceForCampaign(
  admin: ReturnType<typeof createClient>,
  camp: CampaignRow,
  today: string,
): Promise<{ flags: LowPerformanceFlag[]; openKeys: Set<string> }> {
  const tier = readTierConfig(camp.kpi_config);
  const threshold = readLowPerformanceThreshold(camp.kpi_config);

  // Latest daily snapshots for promoter + location scopes.
  const { data: rowsRaw, error } = await admin
    .from('performance_snapshots')
    .select(
      'scope_kind, scope_id, campaign_id, period_kind, period_start, reports_count, conversion_rate, engagement_rate, sampling_rate, interaction_rate, sample_to_conversion_rate',
    )
    .eq('campaign_id', camp.id)
    .eq('period_kind', 'daily')
    .eq('period_start', today)
    .in('scope_kind', ['promoter', 'location']);
  if (error) throw new Error(`perf snapshots fetch failed: ${error.message}`);

  const rows = (rowsRaw as unknown as PerfRow[]) ?? [];
  const flags: LowPerformanceFlag[] = [];
  for (const r of rows) {
    const flag = detectLowPerformance(r, {
      low_performance_threshold: threshold,
      tier_metric: tier.tier_metric,
      tier_high: tier.tier_high,
      tier_medium: tier.tier_medium,
    });
    if (flag) flags.push(flag);
  }

  // Existing open low_performance alerts for this campaign — dedup key is
  // (campaign, scope_kind, scope_id, period_kind, period_start).
  const { data: openRaw } = await admin
    .from('alerts')
    .select('id, campaign_id, message_params')
    .eq('campaign_id', camp.id)
    .eq('alert_type', 'low_performance')
    .in('status', ['open', 'acknowledged']);

  const openKeys = new Set<string>();
  for (const row of (openRaw as unknown as { message_params: Record<string, unknown> }[]) ?? []) {
    const p = row.message_params ?? {};
    const k = typeof p.scope_kind === 'string' ? p.scope_kind : '';
    const s = typeof p.scope_id === 'string' ? p.scope_id : '';
    const pk = typeof p.period_kind === 'string' ? p.period_kind : '';
    const ps = typeof p.period_start === 'string' ? p.period_start : '';
    openKeys.add(`${camp.id}|${k}|${s}|${pk}|${ps}`);
  }

  return { flags, openKeys };
}

// ---------------------------------------------------------------------------
// No-activity pass
// ---------------------------------------------------------------------------

type AttendanceRow = {
  id: string;
  user_id: string;
  campaign_id: string;
  location_id: string;
  check_in_time: string | null;
  status: string;
  attendance_date: string;
};

type DailyReportRow = {
  promoter_user_id: string;
  location_id: string;
  report_date: string;
  contacts: number | null;
  engaged: number | null;
  samples_total: number | null;
  sales_total: number | null;
};

async function runNoActivityForCampaign(
  admin: ReturnType<typeof createClient>,
  camp: CampaignRow,
  today: string,
  now: Date,
): Promise<{ flags: NoActivityFlag[]; openByAttendance: Set<string> }> {
  const hours = readNoActivityHours(camp.kpi_config);

  // All of today's checked-in / late attendance rows for this campaign.
  const { data: attRaw, error: attErr } = await admin
    .from('attendance')
    .select('id, user_id, campaign_id, location_id, check_in_time, status, attendance_date')
    .eq('campaign_id', camp.id)
    .eq('attendance_date', today)
    .in('status', ['checked_in', 'late']);
  if (attErr) throw new Error(`attendance fetch failed: ${attErr.message}`);
  const attendance = (attRaw as AttendanceRow[]) ?? [];
  if (attendance.length === 0) return { flags: [], openByAttendance: new Set() };

  // All of today's daily_reports for the same (promoter, location) pairs.
  const promoterIds = Array.from(new Set(attendance.map((a) => a.user_id)));
  const { data: reportsRaw } = await admin
    .from('daily_reports')
    .select('promoter_user_id, location_id, report_date, contacts, engaged, samples_total, sales_total')
    .eq('report_date', today)
    .in('promoter_user_id', promoterIds);
  const reports = (reportsRaw as DailyReportRow[]) ?? [];

  // Activity = sum of funnel counters on the daily_report header. Zero means
  // no data has been entered yet (even an unsubmitted draft has zero by default).
  const activityByKey = new Map<string, number>();
  for (const r of reports) {
    const key = `${r.promoter_user_id}|${r.location_id}|${r.report_date}`;
    const units =
      (r.contacts ?? 0)
      + (r.engaged ?? 0)
      + (r.samples_total ?? 0)
      + (r.sales_total ?? 0);
    activityByKey.set(key, (activityByKey.get(key) ?? 0) + units);
  }

  const inputs: NoActivityInput[] = [];
  for (const a of attendance) {
    if (!a.check_in_time) continue;
    const key = `${a.user_id}|${a.location_id}|${a.attendance_date}`;
    inputs.push({
      attendance_id: a.id,
      campaign_id: a.campaign_id,
      location_id: a.location_id,
      promoter_id: a.user_id,
      check_in_at: a.check_in_time,
      activity_units: activityByKey.get(key) ?? 0,
    });
  }

  const flags = detectNoActivity(inputs, { no_activity_hours: hours }, now);

  // Dedup: existing open/acknowledged no_activity alerts on the same attendance_id.
  const { data: openRaw } = await admin
    .from('alerts')
    .select('attendance_id')
    .eq('campaign_id', camp.id)
    .eq('alert_type', 'no_activity')
    .in('status', ['open', 'acknowledged']);
  const openByAttendance = new Set<string>();
  for (const row of (openRaw as unknown as { attendance_id: string | null }[]) ?? []) {
    if (row.attendance_id) openByAttendance.add(row.attendance_id);
  }

  return { flags, openByAttendance };
}

// ---------------------------------------------------------------------------
// Notification fan-out
// ---------------------------------------------------------------------------

async function fanoutNotifications(
  admin: ReturnType<typeof createClient>,
  alertId: string,
  alertType: 'low_performance' | 'no_activity',
  userId: string | null,
  locationId: string | null,
  campaignId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const recipients = new Set<string>();
  if (userId) recipients.add(userId);

  if (locationId) {
    const { data: supRaw } = await admin
      .from('user_assignments')
      .select('user_id, role_scope')
      .eq('location_id', locationId)
      .eq('active', true)
      .eq('role_scope', 'supervisor');
    for (const row of (supRaw as { user_id: string }[]) ?? []) {
      recipients.add(row.user_id);
    }
  }

  if (recipients.size === 0) return;
  const rows = Array.from(recipients).map((uid) => ({
    user_id: uid,
    kind: 'alert_new' as const,
    alert_id: alertId,
    payload: {
      alert_type: alertType,
      campaign_id: campaignId,
      location_id: locationId,
      ...payload,
    },
  }));
  await admin.from('notifications').insert(rows);
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, { status: 405 });
  }
  const provided = req.headers.get('x-cron-secret') ?? '';
  if (!CRON_SECRET || provided !== CRON_SECRET) {
    return json({ error: 'forbidden' }, { status: 403 });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const { data: campsRaw, error: campErr } = await admin
    .from('campaigns')
    .select('id, kpi_config, status')
    .eq('status', 'active');
  if (campErr) {
    return json({ error: 'campaigns_query_failed', detail: campErr.message }, { status: 500 });
  }
  const campaigns = (campsRaw as unknown as CampaignRow[]) ?? [];

  let lowPerfInserted = 0;
  let noActivityInserted = 0;
  let notifInserted = 0;
  let errors = 0;

  for (const camp of campaigns) {
    // LOW PERFORMANCE
    try {
      const { flags, openKeys } = await runLowPerformanceForCampaign(admin, camp, today);
      for (const f of flags) {
        const dedupKey = `${f.campaign_id}|${f.scope_kind}|${f.scope_id}|${f.period_kind}|${f.period_start}`;
        if (openKeys.has(dedupKey)) continue;
        openKeys.add(dedupKey);

        const { data: inserted, error: insErr } = await admin
          .from('alerts')
          .insert({
            alert_type: 'low_performance',
            severity: 'warning',
            status: 'open',
            user_id: f.scope_kind === 'promoter' ? f.scope_id : null,
            location_id: f.scope_kind === 'location' ? f.scope_id : null,
            campaign_id: f.campaign_id,
            message_key: 'alerts.low_performance',
            message_params: {
              scope_kind: f.scope_kind,
              scope_id: f.scope_id,
              period_kind: f.period_kind,
              period_start: f.period_start,
              tier_metric: f.tier_metric,
              metric_value: f.metric_value,
              threshold: f.threshold,
              tier: f.tier,
            },
          })
          .select('id')
          .single();
        if (insErr || !inserted) continue;
        lowPerfInserted += 1;

        try {
          await fanoutNotifications(
            admin,
            (inserted as { id: string }).id,
            'low_performance',
            f.scope_kind === 'promoter' ? f.scope_id : null,
            f.scope_kind === 'location' ? f.scope_id : null,
            f.campaign_id,
            {
              tier_metric: f.tier_metric,
              metric_value: f.metric_value,
              threshold: f.threshold,
            },
          );
          notifInserted += 1;
        } catch (e) {
          console.error('notif fanout failed (low_performance)', (e as Error).message);
        }
      }
    } catch (e) {
      errors += 1;
      console.error('low_performance sweep failed', { campaign_id: camp.id, error: (e as Error).message });
    }

    // NO ACTIVITY
    try {
      const { flags, openByAttendance } = await runNoActivityForCampaign(admin, camp, today, now);
      for (const f of flags) {
        if (openByAttendance.has(f.attendance_id)) continue;
        openByAttendance.add(f.attendance_id);

        const { data: inserted, error: insErr } = await admin
          .from('alerts')
          .insert({
            alert_type: 'no_activity',
            severity: 'warning',
            status: 'open',
            user_id: f.promoter_id,
            attendance_id: f.attendance_id,
            location_id: f.location_id,
            campaign_id: f.campaign_id,
            message_key: 'alerts.no_activity',
            message_params: {
              check_in_at: f.check_in_at,
              hours_since_check_in: Math.round(f.hours_since_check_in * 10) / 10,
              threshold_hours: f.threshold_hours,
            },
          })
          .select('id')
          .single();
        if (insErr || !inserted) continue;
        noActivityInserted += 1;

        try {
          await fanoutNotifications(
            admin,
            (inserted as { id: string }).id,
            'no_activity',
            f.promoter_id,
            f.location_id,
            f.campaign_id,
            {
              attendance_id: f.attendance_id,
              hours_since_check_in: Math.round(f.hours_since_check_in * 10) / 10,
            },
          );
          notifInserted += 1;
        } catch (e) {
          console.error('notif fanout failed (no_activity)', (e as Error).message);
        }
      }
    } catch (e) {
      errors += 1;
      console.error('no_activity sweep failed', { campaign_id: camp.id, error: (e as Error).message });
    }
  }

  return json({
    ok: true,
    ran_at: now.toISOString(),
    campaigns_considered: campaigns.length,
    low_performance_alerts_created: lowPerfInserted,
    no_activity_alerts_created: noActivityInserted,
    notifications_created: notifInserted,
    errors,
  });
});
