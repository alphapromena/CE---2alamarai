import 'server-only';

import { createAdminSupabase } from '@/lib/supabase/admin';
import { logInfo, logWarn, reportError } from '@/lib/observability/logger';
import { getIpReputation } from './ipqs';
import { detectLocationTrust } from './detect';

// Orchestrator for the fire-and-forget location-trust check fired at promoter
// check-in. Never throws — the check-in flow must never be blocked by this.

export type RecordArgs = {
  attendanceId: string;
  ip: string | null;
  lat: number | null;
  lng: number | null;
};

export async function recordLocationTrustCheck({ attendanceId, ip, lat, lng }: RecordArgs): Promise<void> {
  try {
    const reputation = await getIpReputation(ip);
    const signals = detectLocationTrust({ ip, lat, lng, reputation });

    if (!signals.overallSuspicious) {
      logInfo('location_trust.clear', {
        attendance_id: attendanceId,
        has_reputation: reputation !== null,
      });
      return;
    }

    const admin = createAdminSupabase();

    // Pull the attendance row for user_id / campaign_id / location_id context
    // so the alert lands on the same (user, campaign, location) the check-in
    // targeted. Existing alerts pattern mirrors requestGeofenceOverrideAction.
    const { data: att, error: attErr } = await admin
      .from('attendance')
      .select('id, user_id, campaign_id, location_id')
      .eq('id', attendanceId)
      .maybeSingle();
    if (attErr || !att) {
      logWarn('location_trust.attendance_missing', { attendance_id: attendanceId });
      return;
    }

    const { error: insErr } = await admin.from('alerts').insert({
      alert_type: 'location_trust_low',
      severity: 'warning',
      status: 'open',
      user_id: att.user_id,
      attendance_id: att.id,
      campaign_id: att.campaign_id,
      location_id: att.location_id,
      message_key: 'alerts.location_trust_low',
      message_params: {
        trust_signals: {
          is_vpn: signals.isVpn,
          is_proxy: signals.isProxy,
          fraud_score_high: signals.fraudScoreHigh,
          country_mismatch: signals.countryMismatch,
          fraud_score: reputation?.fraud_score ?? null,
          reported_country: reputation?.reported_country ?? null,
          computed_country: signals.computedCountry,
        },
        reasons: signals.reasons,
      },
    });
    if (insErr) {
      reportError(insErr, { at: 'location_trust.alert_insert', attendance_id: attendanceId });
      return;
    }

    logInfo('location_trust.alert_raised', {
      attendance_id: attendanceId,
      reasons: signals.reasons,
    });
  } catch (err) {
    // Absolute fire-and-forget guarantee — never propagate.
    reportError(err, { at: 'location_trust.record', attendance_id: attendanceId });
  }
}
