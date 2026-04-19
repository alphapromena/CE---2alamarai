import { z } from 'zod';

/**
 * Shared zod schemas for attendance flows.
 *
 * Per D-017, the same schema is used for client-side react-hook-form
 * validation and server-side re-validation in the Server Action. `.strict()`
 * defends against form-data injection.
 *
 * Check-in and check-out metadata schemas are exported for parity with the
 * Deno Edge Function's hand-rolled validator — the client generates a
 * validated payload here before POSTing to the function.
 */

const id = z.string().uuid();

export const geoCoordsSchema = z
  .object({
    lat: z.number().gte(-90).lte(90),
    lng: z.number().gte(-180).lte(180),
  })
  .strict();

export const checkInMetadataSchema = z
  .object({
    idempotency_key: z.string().uuid(),
    campaign_id: id,
    location_id: id,
    shift_id: id.nullable().optional(),
    lat: z.number().gte(-90).lte(90),
    lng: z.number().gte(-180).lte(180),
    captured_at: z.string().datetime({ offset: true }),
  })
  .strict();

export type CheckInMetadata = z.infer<typeof checkInMetadataSchema>;

export const checkOutMetadataSchema = z
  .object({
    idempotency_key: z.string().uuid(),
    attendance_id: id,
    lat: z.number().gte(-90).lte(90),
    lng: z.number().gte(-180).lte(180),
    captured_at: z.string().datetime({ offset: true }),
  })
  .strict();

export type CheckOutMetadata = z.infer<typeof checkOutMetadataSchema>;

/**
 * Promoter asks a supervisor to authorise a check-in that failed geofence.
 * Creates an alert of type 'geofence_override_requested'.
 */
export const requestGeofenceOverrideSchema = z
  .object({
    attendance_id: id,
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export type RequestGeofenceOverrideInput = z.infer<typeof requestGeofenceOverrideSchema>;

/**
 * Supervisor approves a pending geofence override. Sets supervisor_override
 * + reason + by + at on the attendance row, and resolves the matching alert.
 */
export const approveGeofenceOverrideSchema = z
  .object({
    attendance_id: id,
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export type ApproveGeofenceOverrideInput = z.infer<typeof approveGeofenceOverrideSchema>;

/**
 * Supervisor or admin updates free-form notes on an attendance row.
 */
export const updateAttendanceNotesSchema = z
  .object({
    attendance_id: id,
    notes: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .or(z.literal('').transform(() => undefined)),
  })
  .strict();

export type UpdateAttendanceNotesInput = z.infer<typeof updateAttendanceNotesSchema>;

/**
 * Resolve (or dismiss) an open alert with an optional resolution note.
 */
export const resolveAlertSchema = z
  .object({
    alert_id: id,
    resolution_note: z
      .string()
      .trim()
      .max(500)
      .optional()
      .or(z.literal('').transform(() => undefined)),
    dismiss: z.boolean().default(false),
  })
  .strict();

export type ResolveAlertInput = z.infer<typeof resolveAlertSchema>;
