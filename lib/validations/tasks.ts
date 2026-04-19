import { z } from 'zod';
import { i18nNameSchema } from './i18n';

/**
 * Tasks schemas (Phase 4). Shared between client forms (react-hook-form +
 * zodResolver) and Server Actions (re-parse with .strict() per D-017).
 */

const id = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const taskStatus = z.enum(['open', 'in_progress', 'done', 'cancelled']);

// Description is a softer i18n: optional, either language allowed alone.
export const i18nDescriptionSchema = z
  .object({
    en: z.string().trim().max(2000).optional(),
    ar: z.string().trim().max(2000).optional(),
  })
  .strict()
  .refine((v) => (v.en && v.en.length > 0) || (v.ar && v.ar.length > 0), {
    message: 'errors.required',
  });

export const createTaskSchema = z
  .object({
    campaign_id: id,
    location_id: id,
    assigned_to_user_id: id,
    title_i18n: i18nNameSchema,
    description_i18n: i18nDescriptionSchema.optional(),
    due_date: date.optional().or(z.literal('').transform(() => undefined)),
    idempotency_key: id,
  })
  .strict();

export const updateTaskSchema = z
  .object({
    id,
    campaign_id: id,
    location_id: id,
    assigned_to_user_id: id,
    title_i18n: i18nNameSchema,
    description_i18n: i18nDescriptionSchema.optional(),
    due_date: date.optional().or(z.literal('').transform(() => undefined)),
  })
  .strict();

export const promoterUpdateTaskStatusSchema = z
  .object({
    id,
    // Promoters can move into in_progress or done. Going back to open is a
    // supervisor-only action (re-open); self-cancelling is forbidden.
    status: z.enum(['in_progress', 'done']),
  })
  .strict();

export const supervisorChangeTaskStatusSchema = z
  .object({
    id,
    status: taskStatus,
    cancelled_reason: z
      .string()
      .trim()
      .max(500)
      .optional()
      .or(z.literal('').transform(() => undefined)),
  })
  .strict()
  .refine(
    (v) => v.status !== 'cancelled' || (v.cancelled_reason && v.cancelled_reason.length > 0),
    { path: ['cancelled_reason'], message: 'errors.required' },
  );

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type PromoterUpdateTaskStatusInput = z.infer<typeof promoterUpdateTaskStatusSchema>;
export type SupervisorChangeTaskStatusInput = z.infer<typeof supervisorChangeTaskStatusSchema>;
