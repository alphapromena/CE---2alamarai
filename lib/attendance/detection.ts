/**
 * Attendance classification — pure functions.
 *
 * These helpers decide whether a given timestamp is "late", "early leave",
 * "absent", or "missing check-out" relative to a scheduled shift. They take
 * fully-formed Date objects so the caller is responsible for assembling a
 * shift's time-of-day + date + timezone into an instant; this keeps
 * detection.ts purely arithmetic and trivially testable.
 *
 * Configurable thresholds come from `campaigns.kpi_config` with the defaults
 * exported below. readLatenessGrace / readAbsenceCutoff parse the JSON blob
 * safely; unknown/invalid values fall back to the default (fail-open to the
 * stricter-for-the-user behaviour, i.e., longer grace, longer cutoff).
 */

export const DEFAULT_LATENESS_GRACE_MINUTES = 15;
export const DEFAULT_ABSENCE_CUTOFF_MINUTES = 60;

export type CheckInClassification = 'checked_in' | 'late';
export type CheckOutClassification = 'checked_out' | 'early_leave';

const MINUTE_MS = 60_000;

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * Read the lateness grace (minutes) from a campaigns.kpi_config JSONB value.
 * Falls back to DEFAULT_LATENESS_GRACE_MINUTES when missing or invalid.
 */
export function readLatenessGrace(kpiConfig: unknown): number {
  if (kpiConfig && typeof kpiConfig === 'object') {
    const raw = (kpiConfig as Record<string, unknown>).lateness_grace_minutes;
    if (isPositiveInt(raw)) return raw;
  }
  return DEFAULT_LATENESS_GRACE_MINUTES;
}

/**
 * Read the absence cutoff (minutes) from a campaigns.kpi_config JSONB value.
 * Falls back to DEFAULT_ABSENCE_CUTOFF_MINUTES when missing or invalid.
 */
export function readAbsenceCutoff(kpiConfig: unknown): number {
  if (kpiConfig && typeof kpiConfig === 'object') {
    const raw = (kpiConfig as Record<string, unknown>).absence_cutoff_minutes;
    if (isPositiveInt(raw)) return raw;
  }
  return DEFAULT_ABSENCE_CUTOFF_MINUTES;
}

/**
 * Classify a check-in against a scheduled shift start.
 *
 * A check-in is 'late' iff `checkInAt - shiftStart > graceMinutes`. The grace
 * window is inclusive of the boundary second: checking in exactly at
 * shiftStart + graceMinutes is still on time.
 *
 * Early arrivals are always 'checked_in' — never "early".
 */
export function classifyCheckIn(args: {
  shiftStart: Date;
  checkInAt: Date;
  graceMinutes: number;
}): CheckInClassification {
  const delayMs = args.checkInAt.getTime() - args.shiftStart.getTime();
  const graceMs = args.graceMinutes * MINUTE_MS;
  return delayMs > graceMs ? 'late' : 'checked_in';
}

/**
 * Classify a check-out against a scheduled shift end.
 *
 * A check-out is 'early_leave' iff `checkOutAt < shiftEnd`. Exactly at
 * shiftEnd or later is 'checked_out'. There is no late-checkout penalty —
 * staying past the end is fine.
 */
export function classifyCheckOut(args: {
  shiftEnd: Date;
  checkOutAt: Date;
}): CheckOutClassification {
  return args.checkOutAt.getTime() < args.shiftEnd.getTime()
    ? 'early_leave'
    : 'checked_out';
}

/**
 * Has this (scheduled) shift been missed — i.e., is the promoter absent at
 * this moment?
 *
 * True iff `now - shiftStart >= absenceCutoffMinutes`. The cutoff is
 * inclusive: exactly at the boundary counts as absent, because the cron that
 * calls this will run at coarse intervals and we'd rather flag one minute
 * early than miss the window entirely.
 *
 * Before the shift starts (now < shiftStart) → false; a shift can't be
 * missed before it's begun.
 */
export function isAbsentAt(args: {
  shiftStart: Date;
  now: Date;
  absenceCutoffMinutes: number;
}): boolean {
  const elapsedMs = args.now.getTime() - args.shiftStart.getTime();
  if (elapsedMs < 0) return false;
  return elapsedMs >= args.absenceCutoffMinutes * MINUTE_MS;
}

/**
 * Did the promoter fail to check out after their shift ended?
 *
 * True iff the shift end is strictly in the past AND no check-out has been
 * recorded. The cron that calls this should do so a few minutes after
 * shift_end so the promoter has the chance to check out at the boundary.
 */
export function isMissingCheckout(args: {
  shiftEnd: Date;
  now: Date;
  hasCheckedOut: boolean;
}): boolean {
  if (args.hasCheckedOut) return false;
  return args.now.getTime() > args.shiftEnd.getTime();
}
