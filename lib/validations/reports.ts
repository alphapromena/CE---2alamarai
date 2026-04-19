import { z } from 'zod';

/**
 * Daily-reports + sales-entries + activity-photos schemas (Phase 4).
 *
 * All mutating schemas carry an idempotency_key (D-009). The submit/approve
 * actions are the ones that (re)trigger the compute-kpis Edge Function.
 */

const id = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const reportStatus = z.enum(['draft', 'submitted', 'approved', 'rejected']);

export const nonNegInt = z.coerce.number().int().gte(0);

// ─── daily_reports ────────────────────────────────────────────────────────

export const saveDraftReportSchema = z
  .object({
    id: id.optional(), // undefined on first save (create); present on update
    idempotency_key: id,
    campaign_id: id,
    location_id: id,
    report_date: date,
    // Header counters. engaged ≤ contacts ≤ total_traffic when traffic set.
    total_traffic: nonNegInt.optional().nullable(),
    contacts: nonNegInt,
    engaged: nonNegInt,
    notes: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .or(z.literal('').transform(() => undefined)),
  })
  .strict()
  .refine((v) => v.engaged <= v.contacts, {
    path: ['engaged'],
    message: 'errors.funnel_engaged_over_contacts',
  })
  .refine(
    (v) => v.total_traffic == null || v.contacts <= v.total_traffic,
    { path: ['contacts'], message: 'errors.funnel_contacts_over_traffic' },
  );

export const submitReportSchema = z
  .object({
    id,
    idempotency_key: id,
  })
  .strict();

export const approveReportSchema = z
  .object({
    id,
    idempotency_key: id,
  })
  .strict();

export const rejectReportSchema = z
  .object({
    id,
    idempotency_key: id,
    review_reason: z.string().trim().min(1, 'errors.required').max(2000),
  })
  .strict();

export const reopenReportSchema = z
  .object({
    id,
    idempotency_key: id,
  })
  .strict();

// ─── sales_entries ────────────────────────────────────────────────────────

export const upsertSalesEntrySchema = z
  .object({
    daily_report_id: id,
    sku_id: id,
    samples: nonNegInt,
    sales: nonNegInt,
  })
  .strict();

export const deleteSalesEntrySchema = z
  .object({
    daily_report_id: id,
    sku_id: id,
  })
  .strict();

// ─── activity_photos (metadata row — storage upload is separate) ──────────

export const photoKind = z.enum(['setup', 'during', 'end_of_shift']);

export const registerActivityPhotoSchema = z
  .object({
    daily_report_id: id,
    photo_kind: photoKind,
    storage_path: z.string().trim().min(1).max(500),
    exif_minimal: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const deleteActivityPhotoSchema = z
  .object({
    daily_report_id: id,
    photo_kind: photoKind,
  })
  .strict();

export type SaveDraftReportInput = z.infer<typeof saveDraftReportSchema>;
export type SubmitReportInput = z.infer<typeof submitReportSchema>;
export type ApproveReportInput = z.infer<typeof approveReportSchema>;
export type RejectReportInput = z.infer<typeof rejectReportSchema>;
export type ReopenReportInput = z.infer<typeof reopenReportSchema>;
export type UpsertSalesEntryInput = z.infer<typeof upsertSalesEntrySchema>;
export type DeleteSalesEntryInput = z.infer<typeof deleteSalesEntrySchema>;
export type RegisterActivityPhotoInput = z.infer<typeof registerActivityPhotoSchema>;
export type DeleteActivityPhotoInput = z.infer<typeof deleteActivityPhotoSchema>;
