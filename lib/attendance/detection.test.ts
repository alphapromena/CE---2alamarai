import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ABSENCE_CUTOFF_MINUTES,
  DEFAULT_LATENESS_GRACE_MINUTES,
  classifyCheckIn,
  classifyCheckOut,
  isAbsentAt,
  isMissingCheckout,
  readAbsenceCutoff,
  readLatenessGrace,
} from './detection';

// Fixed shift: 09:00 → 17:00 on 2026-04-20, expressed in UTC so tests don't
// depend on the runner's local timezone.
const SHIFT_START = new Date('2026-04-20T09:00:00Z');
const SHIFT_END = new Date('2026-04-20T17:00:00Z');

function shiftStartPlus(minutes: number): Date {
  return new Date(SHIFT_START.getTime() + minutes * 60_000);
}
function shiftEndPlus(minutes: number): Date {
  return new Date(SHIFT_END.getTime() + minutes * 60_000);
}

describe('classifyCheckIn', () => {
  it('returns checked_in for arrivals before shift start', () => {
    expect(
      classifyCheckIn({
        shiftStart: SHIFT_START,
        checkInAt: shiftStartPlus(-30),
        graceMinutes: DEFAULT_LATENESS_GRACE_MINUTES,
      }),
    ).toBe('checked_in');
  });

  it('returns checked_in for arrivals exactly at shift start', () => {
    expect(
      classifyCheckIn({
        shiftStart: SHIFT_START,
        checkInAt: SHIFT_START,
        graceMinutes: DEFAULT_LATENESS_GRACE_MINUTES,
      }),
    ).toBe('checked_in');
  });

  it('returns checked_in for arrivals within the grace window', () => {
    expect(
      classifyCheckIn({
        shiftStart: SHIFT_START,
        checkInAt: shiftStartPlus(10),
        graceMinutes: 15,
      }),
    ).toBe('checked_in');
  });

  it('treats the grace boundary as inclusive (exactly 15 min late = on time)', () => {
    expect(
      classifyCheckIn({
        shiftStart: SHIFT_START,
        checkInAt: shiftStartPlus(15),
        graceMinutes: 15,
      }),
    ).toBe('checked_in');
  });

  it('returns late one minute past the grace window', () => {
    expect(
      classifyCheckIn({
        shiftStart: SHIFT_START,
        checkInAt: shiftStartPlus(16),
        graceMinutes: 15,
      }),
    ).toBe('late');
  });

  it('returns late for very late arrivals', () => {
    expect(
      classifyCheckIn({
        shiftStart: SHIFT_START,
        checkInAt: shiftStartPlus(90),
        graceMinutes: 15,
      }),
    ).toBe('late');
  });

  it('with zero grace, any delay is late', () => {
    expect(
      classifyCheckIn({
        shiftStart: SHIFT_START,
        checkInAt: new Date(SHIFT_START.getTime() + 1_000),
        graceMinutes: 0,
      }),
    ).toBe('late');
    expect(
      classifyCheckIn({
        shiftStart: SHIFT_START,
        checkInAt: SHIFT_START,
        graceMinutes: 0,
      }),
    ).toBe('checked_in');
  });
});

describe('classifyCheckOut', () => {
  it('returns early_leave when checking out before shift end', () => {
    expect(
      classifyCheckOut({
        shiftEnd: SHIFT_END,
        checkOutAt: shiftEndPlus(-30),
      }),
    ).toBe('early_leave');
  });

  it('returns early_leave for even one minute early', () => {
    expect(
      classifyCheckOut({
        shiftEnd: SHIFT_END,
        checkOutAt: shiftEndPlus(-1),
      }),
    ).toBe('early_leave');
  });

  it('returns checked_out exactly at shift end', () => {
    expect(
      classifyCheckOut({ shiftEnd: SHIFT_END, checkOutAt: SHIFT_END }),
    ).toBe('checked_out');
  });

  it('returns checked_out after shift end', () => {
    expect(
      classifyCheckOut({
        shiftEnd: SHIFT_END,
        checkOutAt: shiftEndPlus(45),
      }),
    ).toBe('checked_out');
  });
});

describe('isAbsentAt', () => {
  it('returns false before shift starts', () => {
    expect(
      isAbsentAt({
        shiftStart: SHIFT_START,
        now: shiftStartPlus(-5),
        absenceCutoffMinutes: DEFAULT_ABSENCE_CUTOFF_MINUTES,
      }),
    ).toBe(false);
  });

  it('returns false before the cutoff elapses', () => {
    expect(
      isAbsentAt({
        shiftStart: SHIFT_START,
        now: shiftStartPlus(30),
        absenceCutoffMinutes: 60,
      }),
    ).toBe(false);
  });

  it('treats the cutoff as inclusive (exactly 60 min after start = absent)', () => {
    expect(
      isAbsentAt({
        shiftStart: SHIFT_START,
        now: shiftStartPlus(60),
        absenceCutoffMinutes: 60,
      }),
    ).toBe(true);
  });

  it('returns true well past the cutoff', () => {
    expect(
      isAbsentAt({
        shiftStart: SHIFT_START,
        now: shiftStartPlus(180),
        absenceCutoffMinutes: 60,
      }),
    ).toBe(true);
  });

  it('honours a custom cutoff value', () => {
    expect(
      isAbsentAt({
        shiftStart: SHIFT_START,
        now: shiftStartPlus(45),
        absenceCutoffMinutes: 30,
      }),
    ).toBe(true);
  });
});

describe('isMissingCheckout', () => {
  it('returns false while the shift is still running', () => {
    expect(
      isMissingCheckout({
        shiftEnd: SHIFT_END,
        now: shiftEndPlus(-30),
        hasCheckedOut: false,
      }),
    ).toBe(false);
  });

  it('returns false exactly at shift end (promoter is on time to check out)', () => {
    expect(
      isMissingCheckout({
        shiftEnd: SHIFT_END,
        now: SHIFT_END,
        hasCheckedOut: false,
      }),
    ).toBe(false);
  });

  it('returns true after shift end with no check-out', () => {
    expect(
      isMissingCheckout({
        shiftEnd: SHIFT_END,
        now: shiftEndPlus(1),
        hasCheckedOut: false,
      }),
    ).toBe(true);
  });

  it('returns false after shift end once checked out', () => {
    expect(
      isMissingCheckout({
        shiftEnd: SHIFT_END,
        now: shiftEndPlus(30),
        hasCheckedOut: true,
      }),
    ).toBe(false);
  });
});

describe('readLatenessGrace', () => {
  it('returns the default for null / undefined / non-object input', () => {
    expect(readLatenessGrace(null)).toBe(DEFAULT_LATENESS_GRACE_MINUTES);
    expect(readLatenessGrace(undefined)).toBe(DEFAULT_LATENESS_GRACE_MINUTES);
    expect(readLatenessGrace(42)).toBe(DEFAULT_LATENESS_GRACE_MINUTES);
    expect(readLatenessGrace('20')).toBe(DEFAULT_LATENESS_GRACE_MINUTES);
  });

  it('returns the default when the key is missing', () => {
    expect(readLatenessGrace({ sampling_rate_denominator: 'contacts' })).toBe(
      DEFAULT_LATENESS_GRACE_MINUTES,
    );
  });

  it('returns the default when the value is negative or non-integer', () => {
    expect(readLatenessGrace({ lateness_grace_minutes: -5 })).toBe(
      DEFAULT_LATENESS_GRACE_MINUTES,
    );
    expect(readLatenessGrace({ lateness_grace_minutes: 12.5 })).toBe(
      DEFAULT_LATENESS_GRACE_MINUTES,
    );
    expect(readLatenessGrace({ lateness_grace_minutes: '15' })).toBe(
      DEFAULT_LATENESS_GRACE_MINUTES,
    );
  });

  it('returns the configured value when valid', () => {
    expect(readLatenessGrace({ lateness_grace_minutes: 10 })).toBe(10);
    expect(readLatenessGrace({ lateness_grace_minutes: 0 })).toBe(0);
  });
});

describe('readAbsenceCutoff', () => {
  it('returns the default for invalid input', () => {
    expect(readAbsenceCutoff(null)).toBe(DEFAULT_ABSENCE_CUTOFF_MINUTES);
    expect(readAbsenceCutoff({ absence_cutoff_minutes: 'soon' })).toBe(
      DEFAULT_ABSENCE_CUTOFF_MINUTES,
    );
  });

  it('returns the configured value when valid', () => {
    expect(readAbsenceCutoff({ absence_cutoff_minutes: 45 })).toBe(45);
    expect(readAbsenceCutoff({ absence_cutoff_minutes: 120 })).toBe(120);
  });
});
