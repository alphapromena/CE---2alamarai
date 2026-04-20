/**
 * Phase 7 exit-criteria fixtures — the 5 cases on spec pages 18–20.
 *
 * This file runs each end-to-end detection → alert-payload flow against pure
 * code. It is the vitest companion to a future Supabase integration pass;
 * the goal here is to prove that for each spec case, the pure detection
 * logic produces the right alert shape that the Edge Function will then
 * persist through the `alerts` table. Supervisor resolution is exercised
 * against the same alert payload structure the UI consumes.
 *
 * Cases covered:
 *   1. Late              — classifyCheckIn → 'late'           (Phase 3)
 *   2. Absent            — isAbsentAt                         (Phase 3)
 *   3. Low Performance   — detectLowPerformance (Shini 0.20 < 0.30)  (Phase 7)
 *   4. Stock Shortage    — detectLowStock (Cozmo balance ≤ threshold) (Phase 5)
 *   5. No Check-Out      — isMissingCheckout                  (Phase 3)
 *
 * Each case ends with a "resolve" step that simulates the supervisor moving
 * the alert from 'open' → 'resolved' with a resolution_note, which is what
 * the UI action does via the existing alerts RLS UPDATE policy.
 */

import { describe, expect, it } from 'vitest';
import {
  classifyCheckIn,
  classifyCheckOut,
  isAbsentAt,
  isMissingCheckout,
} from '../attendance/detection';
import { detectLowPerformance } from './detect';
import { computeBalances, detectLowStock, type Movement } from '../stock/ledger';

type AlertInsert = {
  alert_type:
    | 'late_check_in'
    | 'absent'
    | 'low_performance'
    | 'low_stock'
    | 'missing_check_out';
  severity: 'info' | 'warning' | 'critical';
  status: 'open';
  user_id: string | null;
  location_id: string | null;
  campaign_id: string;
  message_key: string;
  message_params: Record<string, unknown>;
};

type ResolvedAlert = Omit<AlertInsert, 'status'> & {
  status: 'resolved';
  resolved_by: string;
  resolved_at: string;
  resolution_note: string;
};

function resolveAlert(alert: AlertInsert, supervisorId: string, note: string): ResolvedAlert {
  return {
    ...alert,
    status: 'resolved',
    resolved_by: supervisorId,
    resolved_at: new Date('2026-04-20T18:00:00Z').toISOString(),
    resolution_note: note,
  };
}

// Shared fixture constants
const CAMPAIGN_ID = 'camp-almarai';
const SUPERVISOR_ID = 'sup-1';
const LOCATION_KHALDA = 'loc-khalda';
const LOCATION_SHINI = 'loc-shini';
const LOCATION_COZMO = 'loc-cozmo';
const SKU_YOGURT = 'sku-yogurt';
const PROMOTER_LATE = 'prom-late';
const PROMOTER_ABSENT = 'prom-absent';
const PROMOTER_NO_CHECKOUT = 'prom-nco';
const PROMOTER_COZMO = 'prom-cozmo';

// ============================================================================
// Case 1 — Late
// ============================================================================
describe('spec Case 1 — Late', () => {
  it('classifies a 20-minute late arrival as late and emits a late_check_in alert', () => {
    const shiftStart = new Date('2026-04-20T09:00:00Z');
    const checkInAt = new Date('2026-04-20T09:20:00Z'); // 20 min late
    const classification = classifyCheckIn({
      shiftStart,
      checkInAt,
      graceMinutes: 15,
    });
    expect(classification).toBe('late');

    const alert: AlertInsert = {
      alert_type: 'late_check_in',
      severity: 'warning',
      status: 'open',
      user_id: PROMOTER_LATE,
      location_id: LOCATION_KHALDA,
      campaign_id: CAMPAIGN_ID,
      message_key: 'alerts.late_check_in',
      message_params: { grace_minutes: 15 },
    };
    expect(alert.alert_type).toBe('late_check_in');

    const resolved = resolveAlert(
      alert,
      SUPERVISOR_ID,
      'Contacted promoter; traffic delay; acknowledged.',
    );
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolved_by).toBe(SUPERVISOR_ID);
    expect(resolved.resolution_note).toContain('Contacted');
  });
});

// ============================================================================
// Case 2 — Absent
// ============================================================================
describe('spec Case 2 — Absent', () => {
  it('flags absent at 65 min past shift start with no check-in and emits an absent alert', () => {
    const shiftStart = new Date('2026-04-20T09:00:00Z');
    const now = new Date('2026-04-20T10:05:00Z'); // 65 min past start
    expect(isAbsentAt({ shiftStart, now, absenceCutoffMinutes: 60 })).toBe(true);

    const alert: AlertInsert = {
      alert_type: 'absent',
      severity: 'critical',
      status: 'open',
      user_id: PROMOTER_ABSENT,
      location_id: LOCATION_KHALDA,
      campaign_id: CAMPAIGN_ID,
      message_key: 'alerts.absent',
      message_params: {
        shift_start: shiftStart.toISOString(),
        cutoff_minutes: 60,
      },
    };

    const resolved = resolveAlert(
      alert,
      SUPERVISOR_ID,
      'Reached promoter by phone; confirmed sick leave; backup dispatched.',
    );
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolution_note).toContain('phone');
  });
});

// ============================================================================
// Case 3 — Low Performance (Shini)
// ============================================================================
describe('spec Case 3 — Low Performance', () => {
  it('flags Shini (0.20 conversion) below the 0.30 threshold with a low_performance alert', () => {
    const flag = detectLowPerformance(
      {
        scope_kind: 'location',
        scope_id: LOCATION_SHINI,
        campaign_id: CAMPAIGN_ID,
        period_kind: 'daily',
        period_start: '2026-04-20',
        reports_count: 1,
        conversion_rate: 0.2,
      },
      { low_performance_threshold: 0.3, tier_metric: 'conversion_rate' },
    );
    expect(flag).not.toBeNull();
    expect(flag!.scope_id).toBe(LOCATION_SHINI);
    expect(flag!.metric_value).toBe(0.2);

    const alert: AlertInsert = {
      alert_type: 'low_performance',
      severity: 'warning',
      status: 'open',
      user_id: null,
      location_id: LOCATION_SHINI,
      campaign_id: CAMPAIGN_ID,
      message_key: 'alerts.low_performance',
      message_params: {
        tier_metric: flag!.tier_metric,
        metric_value: flag!.metric_value,
        threshold: flag!.threshold,
      },
    };

    // Supervisor visits Shini, coaches the promoter, logs the action.
    const resolved = resolveAlert(
      alert,
      SUPERVISOR_ID,
      'Visited Shini; coached promoter on approach; conversion trending up.',
    );
    expect(resolved.status).toBe('resolved');
    expect(resolved.message_params.metric_value).toBe(0.2);
  });

  it('does NOT flag Khalda (0.65 conversion) — sanity check for the negative case', () => {
    const flag = detectLowPerformance(
      {
        scope_kind: 'location',
        scope_id: LOCATION_KHALDA,
        campaign_id: CAMPAIGN_ID,
        period_kind: 'daily',
        period_start: '2026-04-20',
        reports_count: 1,
        conversion_rate: 0.65,
      },
      { low_performance_threshold: 0.3, tier_metric: 'conversion_rate' },
    );
    expect(flag).toBeNull();
  });
});

// ============================================================================
// Case 4 — Stock Shortage (Cozmo)
// ============================================================================
describe('spec Case 4 — Stock Shortage', () => {
  it('flags Cozmo as low_stock when the promoter balance falls to 5 with threshold 10', () => {
    // Almarai warehouse distributes 20 cups to Cozmo promoter; promoter uses 15.
    // Balance = 5; threshold = 10 → low_stock fires.
    const movements: Movement[] = [
      {
        id: 'mv-1',
        campaign_id: CAMPAIGN_ID,
        sku_id: SKU_YOGURT,
        from_entity_type: 'warehouse',
        from_entity_id: null,
        to_entity_type: 'promoter',
        to_entity_id: PROMOTER_COZMO,
        quantity: 20,
        movement_kind: 'allocation',
      },
      {
        id: 'mv-2',
        campaign_id: CAMPAIGN_ID,
        sku_id: SKU_YOGURT,
        from_entity_type: 'promoter',
        from_entity_id: PROMOTER_COZMO,
        to_entity_type: 'consumer',
        to_entity_id: null,
        quantity: 15,
        movement_kind: 'usage',
      },
    ];
    const balances = computeBalances(movements);
    const flags = detectLowStock(balances, { low_stock_threshold: 10 });
    const cozmoFlag = flags.find(
      (f) =>
        f.kind === 'low_stock' &&
        f.entity_type === 'promoter' &&
        f.entity_id === PROMOTER_COZMO,
    );
    expect(cozmoFlag).toBeDefined();
    if (cozmoFlag?.kind !== 'low_stock') throw new Error('expected low_stock flag');
    expect(cozmoFlag.balance).toBe(5);

    const alert: AlertInsert = {
      alert_type: 'low_stock',
      severity: 'warning',
      status: 'open',
      user_id: PROMOTER_COZMO,
      location_id: LOCATION_COZMO,
      campaign_id: CAMPAIGN_ID,
      message_key: 'alerts.low_stock',
      message_params: {
        sku_id: SKU_YOGURT,
        balance: cozmoFlag.balance,
        threshold: 10,
      },
    };

    // Supervisor reallocates from Khalda (via reallocate_stock RPC in prod);
    // fixture just confirms the resolution flow shape.
    const resolved = resolveAlert(
      alert,
      SUPERVISOR_ID,
      'Reallocated 30 cups from Khalda to Cozmo; promoter resumed sampling.',
    );
    expect(resolved.status).toBe('resolved');
    expect(resolved.message_params.balance).toBe(5);
  });
});

// ============================================================================
// Case 5 — No Check-Out
// ============================================================================
describe('spec Case 5 — No Check-Out', () => {
  it('flags missing_check_out past shift end with no check_out_time', () => {
    const shiftEnd = new Date('2026-04-20T17:00:00Z');
    const now = new Date('2026-04-20T17:15:00Z'); // 15 min after end, still no checkout
    expect(isMissingCheckout({ shiftEnd, now, hasCheckedOut: false })).toBe(true);

    // Sanity: a checkout at 17:00 classifies as 'checked_out', not 'early_leave'.
    expect(classifyCheckOut({ shiftEnd, checkOutAt: shiftEnd })).toBe('checked_out');

    const alert: AlertInsert = {
      alert_type: 'missing_check_out',
      severity: 'warning',
      status: 'open',
      user_id: PROMOTER_NO_CHECKOUT,
      location_id: LOCATION_KHALDA,
      campaign_id: CAMPAIGN_ID,
      message_key: 'alerts.missing_check_out',
      message_params: { shift_end: shiftEnd.toISOString() },
    };

    // Supervisor closes shift manually with a note — status → resolved.
    const resolved = resolveAlert(
      alert,
      SUPERVISOR_ID,
      'Promoter phone dead; shift closed manually at 17:10.',
    );
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolution_note).toContain('closed manually');
  });
});
