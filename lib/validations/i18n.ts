import { z } from 'zod';

/**
 * Bilingual JSONB shape used for user-facing entity names (D-005).
 * Both languages required at the validation layer; the DB CHECK enforces it
 * server-side as defence in depth.
 */
export const i18nNameSchema = z
  .object({
    en: z.string().trim().min(1, 'errors.required').max(120),
    ar: z.string().trim().min(1, 'errors.required').max(120),
  })
  .strict();

export type I18nName = z.infer<typeof i18nNameSchema>;

/**
 * Helper: pick the locale-appropriate string from an i18n JSONB value, with
 * an English-then-Arabic fallback. Mirrors the rule from D-005.
 */
export function i18n(
  value: { ar?: string | null; en?: string | null } | null | undefined,
  locale: string,
): string {
  if (!value) return '';
  if (locale === 'ar' && value.ar) return value.ar;
  if (locale === 'en' && value.en) return value.en;
  return value.en ?? value.ar ?? '';
}
