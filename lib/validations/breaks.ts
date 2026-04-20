import { z } from 'zod';

const UUID = z.string().uuid();
// ISO 8601 datetime with timezone. Empty string → undefined in the submit
// form, then the server rejects via the required constraint.
const ISO_DATETIME = z.string().datetime({ offset: true });

export const submitBreakRequestSchema = z.strictObject({
  campaign_id: UUID,
  location_id: UUID.optional(),
  shift_id: UUID.optional(),
  attendance_id: UUID.optional(),
  requested_start: ISO_DATETIME,
  duration_minutes: z.number().int().positive().max(480),
  reason: z.string().trim().max(500).optional(),
  idempotency_key: UUID,
});
export type SubmitBreakRequestInput = z.infer<typeof submitBreakRequestSchema>;

export const reviewBreakRequestSchema = z.strictObject({
  id: UUID,
  decision: z.enum(['approve', 'reject', 'modify']),
  // Required when decision='modify' (but accepted on 'approve' too, as
  // an explicit confirmation of the requested window).
  approved_start: ISO_DATETIME.optional(),
  approved_duration_minutes: z.number().int().positive().max(480).optional(),
  reviewer_reason: z.string().trim().max(500).optional(),
});
export type ReviewBreakRequestInput = z.infer<typeof reviewBreakRequestSchema>;

export const startBreakSchema = z.strictObject({
  id: UUID,
});

export const endBreakSchema = z.strictObject({
  id: UUID,
});
