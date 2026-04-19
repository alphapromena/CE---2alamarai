// detect-attendance-issues — scheduled sweep.
//
// Runs periodically (~every 5–10 minutes) and materialises two kinds of
// system-detected attendance states that the client-triggered Edge Functions
// cannot produce on their own:
//
//   1. ABSENT. For any (user, location, campaign, shift) that was scheduled
//      today and for which no attendance row exists, once the configured
//      absence cutoff has elapsed since shift start, an attendance row is
//      inserted with status='absent' (no check-in fields) and an 'absent'
//      alert is created.
//
//   2. MISSING CHECK-OUT. For any attendance row whose shift end has passed
//      but whose check_out_time is still null, status is bumped to
//      'missing_checkout' and a 'missing_check_out' alert is created.
//
// Invariants:
//   - No duplicate absent rows: the (user, date, campaign, location) unique
//     index on attendance blocks a second insert.
//   - No duplicate alerts: we look up existing 'absent' / 'missing_check_out'
//     alerts on the attendance row before inserting.
//
// Auth: verify_jwt = false. Instead, a shared CRON_SECRET header is required
// — configured in Supabase secrets and passed by whichever scheduler
// (pg_cron, Supabase scheduled functions, external cron) invokes us.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.3';
import {
  isAbsentAt,
  isMissingCheckout,
  readAbsenceCutoff,
} from '../_shared/detection.ts';
import {
  SHIFT_TZ_OFFSET_MINUTES,
  combineShiftInstant,
  localDateString,
} from '../_shared/shift-time.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

type ShiftRow = {
  id: string;
  start_time: string;
  end_time: string;
  days_of_week: number[];
  active: boolean;
  campaign_id: string;
  location_id: string;
  campaign: { kpi_config: unknown; status: string } | null;
};

type AssignmentRow = {
  id: string;
  user_id: string;
  location_id: string;
  shift_id: string;
  starts_on: string | null;
  ends_on: string | null;
  active: boolean;
};

type AttendanceRow = {
  id: string;
  user_id: string;
  campaign_id: string;
  location_id: string;
  shift_id: string | null;
  check_in_time: string | null;
  check_out_time: string | null;
  status: string;
  attendance_date: string;
};

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
  const today = localDateString(now);
  const localDow = new Date(now.getTime() + SHIFT_TZ_OFFSET_MINUTES * 60_000).getUTCDay();

  // 1. Load today's shifts with their campaign kpi_config.
  const { data: shiftsRaw, error: shiftErr } = await admin
    .from('shifts')
    .select(
      `
      id, start_time, end_time, days_of_week, active, campaign_id, location_id,
      campaign:campaigns ( kpi_config, status )
      `,
    )
    .eq('active', true);
  if (shiftErr) {
    return json({ error: 'shifts_query_failed', detail: shiftErr.message }, { status: 500 });
  }
  const shifts = (shiftsRaw as unknown as ShiftRow[]).filter(
    (s) =>
      s.days_of_week.includes(localDow) &&
      s.campaign &&
      s.campaign.status !== 'cancelled' &&
      s.campaign.status !== 'completed',
  );

  // 2. Gather assignments for those shifts.
  const shiftIds = shifts.map((s) => s.id);
  let assignments: AssignmentRow[] = [];
  if (shiftIds.length > 0) {
    const { data: asgnRaw, error: asgnErr } = await admin
      .from('user_assignments')
      .select('id, user_id, location_id, shift_id, starts_on, ends_on, active')
      .eq('active', true)
      .eq('role_scope', 'promoter')
      .in('shift_id', shiftIds);
    if (asgnErr) {
      return json({ error: 'assignments_query_failed', detail: asgnErr.message }, { status: 500 });
    }
    assignments = (asgnRaw as AssignmentRow[]).filter((a) => {
      if (a.starts_on && a.starts_on > today) return false;
      if (a.ends_on && a.ends_on < today) return false;
      return true;
    });
  }

  // 3. Load today's attendance rows across all relevant (user, campaign,
  //    location) triples so we can fast-match.
  let attendanceRows: AttendanceRow[] = [];
  if (assignments.length > 0) {
    const { data: attRaw } = await admin
      .from('attendance')
      .select(
        'id, user_id, campaign_id, location_id, shift_id, check_in_time, check_out_time, status, attendance_date',
      )
      .eq('attendance_date', today);
    attendanceRows = (attRaw as AttendanceRow[]) ?? [];
  }

  const attendanceByKey = new Map<string, AttendanceRow>();
  for (const r of attendanceRows) {
    attendanceByKey.set(`${r.user_id}|${r.campaign_id}|${r.location_id}`, r);
  }

  const shiftById = new Map(shifts.map((s) => [s.id, s]));

  let absentCreated = 0;
  let missingCheckoutUpdated = 0;
  let alertsCreated = 0;

  // 4. Pass 1 — absent.
  for (const a of assignments) {
    const shift = shiftById.get(a.shift_id);
    if (!shift) continue;
    const key = `${a.user_id}|${shift.campaign_id}|${a.location_id}`;
    if (attendanceByKey.has(key)) continue;

    const shiftStart = combineShiftInstant(today, shift.start_time);
    const cutoff = readAbsenceCutoff(shift.campaign?.kpi_config);
    if (!isAbsentAt({ shiftStart, now, absenceCutoffMinutes: cutoff })) continue;

    const { data: inserted, error: insErr } = await admin
      .from('attendance')
      .insert({
        user_id: a.user_id,
        campaign_id: shift.campaign_id,
        location_id: a.location_id,
        shift_id: a.shift_id,
        attendance_date: today,
        status: 'absent',
        is_within_geofence: false,
      })
      .select('id')
      .single();
    if (insErr || !inserted) continue; // unique-index conflict = another run beat us; fine
    absentCreated += 1;

    const { error: alertErr } = await admin.from('alerts').insert({
      alert_type: 'absent',
      severity: 'critical',
      status: 'open',
      user_id: a.user_id,
      attendance_id: inserted.id,
      campaign_id: shift.campaign_id,
      location_id: a.location_id,
      message_key: 'alerts.absent',
      message_params: {
        shift_start: shiftStart.toISOString(),
        cutoff_minutes: cutoff,
      },
    });
    if (!alertErr) alertsCreated += 1;
  }

  // 5. Pass 2 — missing check-out.
  for (const row of attendanceRows) {
    if (row.check_out_time) continue;
    if (!row.check_in_time) continue;
    if (row.status === 'missing_checkout') continue;
    if (!row.shift_id) continue;
    const shift = shifts.find((s) => s.id === row.shift_id);
    if (!shift) continue;

    const shiftEnd = combineShiftInstant(row.attendance_date, shift.end_time);
    if (!isMissingCheckout({ shiftEnd, now, hasCheckedOut: false })) continue;

    const { error: upErr } = await admin
      .from('attendance')
      .update({ status: 'missing_checkout' })
      .eq('id', row.id)
      .eq('status', row.status); // guard against concurrent update
    if (upErr) continue;
    missingCheckoutUpdated += 1;

    // Deduplicate alert: only create if no existing open/ack alert of this
    // type on this attendance row.
    const { data: existing } = await admin
      .from('alerts')
      .select('id')
      .eq('attendance_id', row.id)
      .eq('alert_type', 'missing_check_out')
      .in('status', ['open', 'acknowledged'])
      .maybeSingle();
    if (existing) continue;

    const { error: alertErr } = await admin.from('alerts').insert({
      alert_type: 'missing_check_out',
      severity: 'warning',
      status: 'open',
      user_id: row.user_id,
      attendance_id: row.id,
      campaign_id: row.campaign_id,
      location_id: row.location_id,
      message_key: 'alerts.missing_check_out',
      message_params: { shift_end: shiftEnd.toISOString() },
    });
    if (!alertErr) alertsCreated += 1;
  }

  return json({
    ok: true,
    ran_at: now.toISOString(),
    absent_created: absentCreated,
    missing_checkout_updated: missingCheckoutUpdated,
    alerts_created: alertsCreated,
    shifts_considered: shifts.length,
    assignments_considered: assignments.length,
  });
});
