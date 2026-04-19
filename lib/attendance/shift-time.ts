/**
 * Shift-time helpers (Next.js server + client).
 *
 * Phase 3 ships Jordan only. Asia/Amman is UTC+3 year-round, no DST. We hard-
 * code the offset so the function is pure and serialisable. Revisit in Phase 7
 * if the product goes multi-region — at that point swap for Intl / tz-library.
 *
 * Mirrors `supabase/functions/_shared/shift-time.ts` (the Deno Edge Function
 * copy). Update both when either changes.
 */

export const SHIFT_TZ_OFFSET_MINUTES = 3 * 60;

/**
 * Combine a 'YYYY-MM-DD' date and 'HH:MM:SS' shift time into a UTC instant
 * at Asia/Amman wall clock.
 */
export function combineShiftInstant(
  attendanceDate: string,
  shiftTime: string,
): Date {
  const [y, mo, d] = attendanceDate.split('-').map(Number);
  const [h, mi, s] = shiftTime.split(':').map(Number);
  const ms = Date.UTC(
    y ?? 1970,
    (mo ?? 1) - 1,
    d ?? 1,
    h ?? 0,
    mi ?? 0,
    s ?? 0,
  );
  return new Date(ms - SHIFT_TZ_OFFSET_MINUTES * 60_000);
}

/**
 * YYYY-MM-DD at Asia/Amman wall clock for a given UTC instant.
 */
export function localDateString(d: Date): string {
  const local = new Date(d.getTime() + SHIFT_TZ_OFFSET_MINUTES * 60_000);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(local.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * 'YYYY-MM-DD' for "today" at Asia/Amman wall clock, used for querying
 * today's attendance rows.
 */
export function todayLocalDateString(now: Date = new Date()): string {
  return localDateString(now);
}
