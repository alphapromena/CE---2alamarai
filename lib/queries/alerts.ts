import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';
import { logError } from '@/lib/observability/logger';

export type AlertType =
  | 'late_check_in'
  | 'absent'
  | 'early_leave'
  | 'missing_check_out'
  | 'geofence_violation'
  | 'geofence_override_requested'
  | 'low_stock'
  | 'over_consumption'
  | 'reconciliation_mismatch'
  | 'no_usage'
  | 'low_performance'
  | 'no_activity'
  | 'location_trust_low';

export type AlertRow = {
  id: string;
  alert_type: AlertType;
  severity: 'info' | 'warning' | 'critical';
  status: 'open' | 'acknowledged' | 'resolved' | 'dismissed';
  user_id: string | null;
  attendance_id: string | null;
  campaign_id: string | null;
  location_id: string | null;
  message_key: string;
  message_params: Record<string, unknown>;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
};

export const STOCK_ALERT_TYPES: readonly AlertType[] = [
  'low_stock',
  'over_consumption',
  'reconciliation_mismatch',
  'no_usage',
];

const ALERT_COLS =
  'id, alert_type, severity, status, user_id, attendance_id, campaign_id, location_id, message_key, message_params, acknowledged_by, acknowledged_at, resolved_by, resolved_at, resolution_note, created_at, updated_at';

/**
 * Open alerts in the caller's visible scope (RLS-filtered). Ordered newest
 * first. Limit defaults to 200 — the supervisor live dashboard shows a page;
 * admins can request more.
 */
export async function listOpenAlerts(opts?: {
  limit?: number;
  campaignId?: string;
  locationId?: string;
}): Promise<AlertRow[]> {
  const supabase = await createServerSupabase();
  let q = supabase
    .from('alerts')
    .select(ALERT_COLS)
    .in('status', ['open', 'acknowledged'])
    .order('created_at', { ascending: false });
  if (opts?.campaignId) q = q.eq('campaign_id', opts.campaignId);
  if (opts?.locationId) q = q.eq('location_id', opts.locationId);
  const { data, error } = await q.limit(opts?.limit ?? 200);
  if (error) {
    logError('listOpenAlerts failed', {
      code: error.code,
      message: error.message,
      campaign_id: opts?.campaignId,
      location_id: opts?.locationId,
    });
    return [];
  }
  return (data ?? []) as AlertRow[];
}

/**
 * Alerts attached to a specific attendance row. Used in the attendance
 * detail view for both promoter (own row) and supervisor.
 */
export async function listAlertsForAttendance(
  attendanceId: string,
): Promise<AlertRow[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('alerts')
    .select(ALERT_COLS)
    .eq('attendance_id', attendanceId)
    .order('created_at', { ascending: false });
  if (error) {
    logError('listAlertsForAttendance failed', {
      code: error.code,
      message: error.message,
      attendance_id: attendanceId,
    });
    return [];
  }
  return (data ?? []) as AlertRow[];
}

/**
 * Stock alerts (low_stock, over_consumption, reconciliation_mismatch,
 * no_usage) in the caller's scope. Surfaced by the supervisor stock page
 * as a banner + inline flags.
 */
export async function listOpenStockAlerts(opts?: {
  campaignId?: string;
  limit?: number;
}): Promise<AlertRow[]> {
  const supabase = await createServerSupabase();
  let q = supabase
    .from('alerts')
    .select(ALERT_COLS)
    .in('alert_type', STOCK_ALERT_TYPES)
    .in('status', ['open', 'acknowledged'])
    .order('created_at', { ascending: false });
  if (opts?.campaignId) q = q.eq('campaign_id', opts.campaignId);
  const { data, error } = await q.limit(opts?.limit ?? 100);
  if (error) {
    logError('listOpenStockAlerts failed', {
      code: error.code,
      message: error.message,
      campaign_id: opts?.campaignId,
    });
    return [];
  }
  return (data ?? []) as AlertRow[];
}
