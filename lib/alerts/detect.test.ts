import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BREAK_MAX_MINUTES,
  DEFAULT_LIVE_THRESHOLDS,
  detectLowPerformance,
  detectNoActivity,
  readBreakMaxMinutes,
  readLowPerformanceThreshold,
  readNoActivityHours,
  type NoActivityInput,
  type PerformanceSnapshotRow,
} from './detect';

// ============================================================================
// readLowPerformanceThreshold
// ============================================================================

describe('readLowPerformanceThreshold', () => {
  it('returns default when kpi_config is null/undefined/non-object', () => {
    expect(readLowPerformanceThreshold(null)).toBe(0.3);
    expect(readLowPerformanceThreshold(undefined)).toBe(0.3);
    expect(readLowPerformanceThreshold('string')).toBe(0.3);
    expect(readLowPerformanceThreshold(42)).toBe(0.3);
  });

  it('returns configured value when it is a valid fraction', () => {
    expect(readLowPerformanceThreshold({ low_performance_threshold: 0 })).toBe(0);
    expect(readLowPerformanceThreshold({ low_performance_threshold: 0.25 })).toBe(0.25);
    expect(readLowPerformanceThreshold({ low_performance_threshold: 1 })).toBe(1);
  });

  it('falls back on out-of-range or invalid values', () => {
    expect(readLowPerformanceThreshold({ low_performance_threshold: -0.1 })).toBe(0.3);
    expect(readLowPerformanceThreshold({ low_performance_threshold: 1.5 })).toBe(0.3);
    expect(readLowPerformanceThreshold({ low_performance_threshold: 'x' })).toBe(0.3);
    expect(readLowPerformanceThreshold({ low_performance_threshold: NaN })).toBe(0.3);
  });
});

// ============================================================================
// readNoActivityHours
// ============================================================================

describe('readNoActivityHours', () => {
  it('returns default when kpi_config is null/undefined/non-object', () => {
    expect(readNoActivityHours(null)).toBe(3);
    expect(readNoActivityHours(undefined)).toBe(3);
    expect(readNoActivityHours('x')).toBe(3);
  });

  it('returns configured value when positive', () => {
    expect(readNoActivityHours({ no_activity_hours: 1 })).toBe(1);
    expect(readNoActivityHours({ no_activity_hours: 6 })).toBe(6);
    expect(readNoActivityHours({ no_activity_hours: 0.5 })).toBe(0.5);
  });

  it('falls back on zero / negative / invalid', () => {
    expect(readNoActivityHours({ no_activity_hours: 0 })).toBe(3);
    expect(readNoActivityHours({ no_activity_hours: -2 })).toBe(3);
    expect(readNoActivityHours({ no_activity_hours: 'x' })).toBe(3);
    expect(readNoActivityHours({ no_activity_hours: Infinity })).toBe(3);
  });
});

// ============================================================================
// readBreakMaxMinutes
// ============================================================================

describe('readBreakMaxMinutes', () => {
  it('returns default 60 when unset', () => {
    expect(readBreakMaxMinutes(null)).toBe(DEFAULT_BREAK_MAX_MINUTES);
    expect(readBreakMaxMinutes({})).toBe(60);
  });

  it('returns configured value (floor) when in range', () => {
    expect(readBreakMaxMinutes({ break_max_minutes: 30 })).toBe(30);
    expect(readBreakMaxMinutes({ break_max_minutes: 45.7 })).toBe(45);
    expect(readBreakMaxMinutes({ break_max_minutes: 480 })).toBe(480);
  });

  it('falls back on zero / negative / > 480 / invalid', () => {
    expect(readBreakMaxMinutes({ break_max_minutes: 0 })).toBe(60);
    expect(readBreakMaxMinutes({ break_max_minutes: -1 })).toBe(60);
    expect(readBreakMaxMinutes({ break_max_minutes: 481 })).toBe(60);
    expect(readBreakMaxMinutes({ break_max_minutes: 'x' })).toBe(60);
  });
});

// ============================================================================
// detectLowPerformance — Case 3 (Shini) spec fixture
// ============================================================================

function snap(overrides: Partial<PerformanceSnapshotRow> = {}): PerformanceSnapshotRow {
  return {
    scope_kind: 'location',
    scope_id: 'loc-shini',
    campaign_id: 'camp-almarai',
    period_kind: 'daily',
    period_start: '2026-04-20',
    reports_count: 1,
    conversion_rate: 0.2,
    engagement_rate: 0.5,
    sampling_rate: 0.4,
    interaction_rate: 0.3,
    sample_to_conversion_rate: 0.4,
    ...overrides,
  };
}

describe('detectLowPerformance', () => {
  it('fires for Shini (conversion 0.20 < default 0.30)', () => {
    // Spec page 18–20 Case 3: Shini runs low on conversion → alert.
    const flag = detectLowPerformance(snap(), {
      low_performance_threshold: 0.3,
      tier_metric: 'conversion_rate',
    });
    expect(flag).not.toBeNull();
    expect(flag!.kind).toBe('low_performance');
    expect(flag!.scope_id).toBe('loc-shini');
    expect(flag!.metric_value).toBe(0.2);
    expect(flag!.threshold).toBe(0.3);
  });

  it('does not fire for Khalda (conversion 0.65 ≥ threshold)', () => {
    const flag = detectLowPerformance(
      snap({ scope_id: 'loc-khalda', conversion_rate: 0.65 }),
      { low_performance_threshold: 0.3, tier_metric: 'conversion_rate' },
    );
    expect(flag).toBeNull();
  });

  it('does not fire exactly at threshold (strictly below)', () => {
    const flag = detectLowPerformance(snap({ conversion_rate: 0.3 }), {
      low_performance_threshold: 0.3,
      tier_metric: 'conversion_rate',
    });
    expect(flag).toBeNull();
  });

  it('returns the carried tier when tier_high/tier_medium provided', () => {
    const flag = detectLowPerformance(snap({ conversion_rate: 0.2 }), {
      low_performance_threshold: 0.3,
      tier_metric: 'conversion_rate',
      tier_high: 0.5,
      tier_medium: 0.3,
    });
    expect(flag!.tier).toBe('low');
  });

  it('does not fire when reports_count is 0', () => {
    const flag = detectLowPerformance(snap({ reports_count: 0 }), {
      low_performance_threshold: 0.3,
      tier_metric: 'conversion_rate',
    });
    expect(flag).toBeNull();
  });

  it('does not fire when the metric is null (unclassifiable)', () => {
    const flag = detectLowPerformance(snap({ conversion_rate: null }), {
      low_performance_threshold: 0.3,
      tier_metric: 'conversion_rate',
    });
    expect(flag).toBeNull();
  });

  it('is disabled when threshold is 0 (opt-out)', () => {
    const flag = detectLowPerformance(snap({ conversion_rate: 0 }), {
      low_performance_threshold: 0,
      tier_metric: 'conversion_rate',
    });
    expect(flag).toBeNull();
  });

  it('respects tier_metric (sampling_rate)', () => {
    const flag = detectLowPerformance(snap({ sampling_rate: 0.05 }), {
      low_performance_threshold: 0.2,
      tier_metric: 'sampling_rate',
    });
    expect(flag!.tier_metric).toBe('sampling_rate');
    expect(flag!.metric_value).toBe(0.05);
  });
});

// ============================================================================
// detectNoActivity
// ============================================================================

const NOW = new Date('2026-04-20T14:00:00Z');

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();
}

function attendance(overrides: Partial<NoActivityInput> = {}): NoActivityInput {
  return {
    attendance_id: 'att-1',
    campaign_id: 'camp-almarai',
    location_id: 'loc-cozmo',
    promoter_id: 'prom-1',
    check_in_at: hoursAgo(4),
    activity_units: 0,
    ...overrides,
  };
}

describe('detectNoActivity', () => {
  it('fires when checked in 4h ago with zero activity (threshold 3h)', () => {
    const flags = detectNoActivity([attendance()], { no_activity_hours: 3 }, NOW);
    expect(flags).toHaveLength(1);
    const [f] = flags;
    expect(f!.kind).toBe('no_activity');
    expect(f!.promoter_id).toBe('prom-1');
    expect(f!.hours_since_check_in).toBeCloseTo(4, 5);
    expect(f!.threshold_hours).toBe(3);
  });

  it('does not fire when activity_units > 0', () => {
    const flags = detectNoActivity(
      [attendance({ activity_units: 12 })],
      { no_activity_hours: 3 },
      NOW,
    );
    expect(flags).toEqual([]);
  });

  it('treats null activity_units as zero', () => {
    const flags = detectNoActivity(
      [attendance({ activity_units: null })],
      { no_activity_hours: 3 },
      NOW,
    );
    expect(flags).toHaveLength(1);
  });

  it('does not fire at or before the threshold window', () => {
    // Exactly 3h → diff equals threshold → does NOT fire (strictly greater).
    const flags = detectNoActivity([attendance({ check_in_at: hoursAgo(3) })], { no_activity_hours: 3 }, NOW);
    expect(flags).toEqual([]);
  });

  it('fires just beyond the threshold', () => {
    const flags = detectNoActivity(
      [attendance({ check_in_at: hoursAgo(3.01) })],
      { no_activity_hours: 3 },
      NOW,
    );
    expect(flags).toHaveLength(1);
  });

  it('skips rows with unparseable check_in_at (defense-in-depth)', () => {
    const flags = detectNoActivity(
      [attendance({ check_in_at: 'not-a-date' })],
      { no_activity_hours: 3 },
      NOW,
    );
    expect(flags).toEqual([]);
  });

  it('detector is disabled when threshold ≤ 0', () => {
    const flags = detectNoActivity([attendance()], { no_activity_hours: 0 }, NOW);
    expect(flags).toEqual([]);
  });

  it('processes a batch and returns one flag per stale promoter', () => {
    const flags = detectNoActivity(
      [
        attendance({ promoter_id: 'A', check_in_at: hoursAgo(4) }),
        attendance({ promoter_id: 'B', check_in_at: hoursAgo(2) }),
        attendance({ promoter_id: 'C', check_in_at: hoursAgo(6), activity_units: 5 }),
        attendance({ promoter_id: 'D', check_in_at: hoursAgo(5), activity_units: null }),
      ],
      { no_activity_hours: 3 },
      NOW,
    );
    expect(flags.map((f) => f.promoter_id).sort()).toEqual(['A', 'D']);
  });
});

// ============================================================================
// Defaults sanity
// ============================================================================

describe('DEFAULT_LIVE_THRESHOLDS', () => {
  it('matches the documented Phase-7 defaults', () => {
    expect(DEFAULT_LIVE_THRESHOLDS.low_performance_threshold).toBe(0.3);
    expect(DEFAULT_LIVE_THRESHOLDS.no_activity_hours).toBe(3);
  });
});
