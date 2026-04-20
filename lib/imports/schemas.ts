import { z } from 'zod';

/**
 * Per-row zod schemas for the bulk CSV import feature. Schemas operate on the
 * raw string-valued rows produced by `lib/imports/parse.ts`; coercion to
 * numbers/booleans happens here so the server action stays a thin orchestrator.
 *
 * Failures surface their first issue path + message; the import action turns
 * that into the user-facing "row N: <error>" line.
 */

const uuid = z.string().uuid();
const i18nString = z.string().trim().min(1).max(120);

const csvBoolean = z
  .union([z.string(), z.boolean(), z.undefined()])
  .transform((v) => {
    if (typeof v === 'boolean') return v;
    if (v === undefined) return true;
    const t = v.trim().toLowerCase();
    if (t === '' || t === 'true' || t === '1' || t === 'yes' || t === 'y') return true;
    if (t === 'false' || t === '0' || t === 'no' || t === 'n') return false;
    return undefined;
  })
  .pipe(z.boolean({ message: 'expected boolean' }));

const csvInt = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(1, 'required')
    .transform((v, ctx) => {
      const n = Number(v);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        ctx.addIssue({ code: 'custom', message: 'expected integer' });
        return z.NEVER;
      }
      if (n < min || n > max) {
        ctx.addIssue({ code: 'custom', message: `must be between ${min} and ${max}` });
        return z.NEVER;
      }
      return n;
    });

const csvFloat = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(1, 'required')
    .transform((v, ctx) => {
      const n = Number(v);
      if (!Number.isFinite(n)) {
        ctx.addIssue({ code: 'custom', message: 'expected number' });
        return z.NEVER;
      }
      if (n < min || n > max) {
        ctx.addIssue({ code: 'custom', message: `must be between ${min} and ${max}` });
        return z.NEVER;
      }
      return n;
    });

const optionalString = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(max).optional(),
  );

export const productRowSchema = z
  .object({
    campaign_id: uuid,
    name_en: i18nString,
    name_ar: i18nString,
    unit_en: i18nString,
    unit_ar: i18nString,
    target: csvInt(0, 1_000_000),
    stock_allocated: csvInt(0, 1_000_000),
    active: csvBoolean,
  })
  .transform((row) => ({
    campaign_id: row.campaign_id,
    name_i18n: { en: row.name_en, ar: row.name_ar },
    unit_i18n: { en: row.unit_en, ar: row.unit_ar },
    target: row.target,
    stock_allocated: row.stock_allocated,
    active: row.active,
  }));

export const promoterRowSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  full_name: z.string().trim().min(1).max(120),
  preferred_language: z
    .enum(['ar', 'en'])
    .or(z.literal('').transform(() => 'en' as const))
    .default('en'),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9\s()-]{7,20}$/, 'invalid phone')
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

export const locationRowSchema = z
  .object({
    city_id: uuid,
    name_en: i18nString,
    name_ar: i18nString,
    address: optionalString(500),
    lat: csvFloat(-90, 90),
    lng: csvFloat(-180, 180),
    geofence_radius_m: csvInt(10, 5000),
  })
  .transform((row) => ({
    city_id: row.city_id,
    name_i18n: { en: row.name_en, ar: row.name_ar },
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    geofence_radius_m: row.geofence_radius_m,
  }));

export type ProductRow = z.infer<typeof productRowSchema>;
export type PromoterRow = z.infer<typeof promoterRowSchema>;
export type LocationRow = z.infer<typeof locationRowSchema>;

/**
 * Convert the first issue from a ZodError into a compact "field: message"
 * string suitable for showing alongside a row number in the failures table.
 */
export function firstIssueMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'invalid';
  const path = issue.path.length > 0 ? issue.path.join('.') : 'row';
  return `${path}: ${issue.message}`;
}
