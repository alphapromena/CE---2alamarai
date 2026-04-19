// Shift-time helpers for Deno Edge Functions.
//
// Phase 3 ships Jordan only: Asia/Amman is UTC+3 year-round (no DST). We hard-
// code the offset rather than bring a tz-database dep into the cold path.
// Revisit in Phase 7 if the product goes multi-region.

export const SHIFT_TZ_OFFSET_MINUTES = 3 * 60;

/**
 * Combine an attendance date ('YYYY-MM-DD') and a shift time of day
 * ('HH:MM:SS') into a UTC instant at the Asia/Amman wall clock.
 */
export function combineShiftInstant(
  attendanceDate: string,
  shiftTime: string,
): Date {
  const [y, mo, d] = attendanceDate.split('-').map(Number);
  const [h, mi, s] = shiftTime.split(':').map(Number);
  const ms = Date.UTC(
    y,
    (mo ?? 1) - 1,
    d ?? 1,
    h ?? 0,
    mi ?? 0,
    s ?? 0,
  );
  return new Date(ms - SHIFT_TZ_OFFSET_MINUTES * 60_000);
}

/**
 * YYYY-MM-DD at the Asia/Amman wall clock for a given UTC instant.
 */
export function localDateString(d: Date): string {
  const local = new Date(d.getTime() + SHIFT_TZ_OFFSET_MINUTES * 60_000);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(local.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
