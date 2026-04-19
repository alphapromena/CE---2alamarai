// Slim copy of lib/attendance/detection.ts for the Deno Edge Function. Only
// the functions this function actually calls are included (classifyCheckIn
// + kpi_config readers). Update both files together.

export const DEFAULT_LATENESS_GRACE_MINUTES = 15;
export const DEFAULT_ABSENCE_CUTOFF_MINUTES = 60;

const MINUTE_MS = 60_000;

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function readLatenessGrace(kpiConfig: unknown): number {
  if (kpiConfig && typeof kpiConfig === 'object') {
    const raw = (kpiConfig as Record<string, unknown>).lateness_grace_minutes;
    if (isPositiveInt(raw)) return raw;
  }
  return DEFAULT_LATENESS_GRACE_MINUTES;
}

export function readAbsenceCutoff(kpiConfig: unknown): number {
  if (kpiConfig && typeof kpiConfig === 'object') {
    const raw = (kpiConfig as Record<string, unknown>).absence_cutoff_minutes;
    if (isPositiveInt(raw)) return raw;
  }
  return DEFAULT_ABSENCE_CUTOFF_MINUTES;
}

export function classifyCheckIn(args: {
  shiftStart: Date;
  checkInAt: Date;
  graceMinutes: number;
}): 'checked_in' | 'late' {
  const delayMs = args.checkInAt.getTime() - args.shiftStart.getTime();
  const graceMs = args.graceMinutes * MINUTE_MS;
  return delayMs > graceMs ? 'late' : 'checked_in';
}
