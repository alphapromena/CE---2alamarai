/**
 * Helpers for picking a locale-specific string from a `name_i18n`-shaped
 * `{ ar?: string; en?: string }` object.
 *
 * Two variants exist because the existing call sites have two different
 * contracts and we don't want a behavior change while consolidating
 * (QUAL-05). Pick the one that matches the call site's needs:
 *
 *   - `pickLocalizedName` — never returns null; missing input becomes `''`.
 *     Use when the result is rendered directly into JSX and falsy is fine.
 *
 *   - `pickLocalized` — may return null; trims whitespace from each side
 *     before falling back. Use when the caller wants to chain a translated
 *     "unknown" placeholder via `?? unknownLabel` (a trimmed-empty string
 *     would otherwise satisfy `??` and bypass the fallback).
 */

export type LocalizedName = { ar?: string; en?: string } | null | undefined;

/**
 * Pick the locale-appropriate name. Falls back to the other locale, then to
 * the empty string. Never returns null. Does not trim.
 */
export function pickLocalizedName(name: LocalizedName, locale: string): string {
  if (!name) return '';
  if (locale === 'ar') return name.ar ?? name.en ?? '';
  return name.en ?? name.ar ?? '';
}

/**
 * Pick the locale-appropriate name. Trims each candidate; falls back to the
 * other locale, then to null. Used by call sites that chain `?? fallback`.
 */
export function pickLocalized(name: LocalizedName, locale: string): string | null {
  if (!name) return null;
  const ar = name.ar?.trim();
  const en = name.en?.trim();
  if (locale === 'ar') return ar ?? en ?? null;
  return en ?? ar ?? null;
}
