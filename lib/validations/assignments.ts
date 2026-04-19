import { z } from 'zod';

const id = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const optionalDate = date.optional().or(z.literal('').transform(() => undefined));
const optionalShiftId = id.optional().or(z.literal('').transform(() => undefined));

const roleScope = z.enum(['promoter', 'supervisor']);

const baseSchema = z
  .object({
    user_id: id,
    location_id: id,
    shift_id: optionalShiftId,
    role_scope: roleScope,
    starts_on: optionalDate,
    ends_on: optionalDate,
    active: z.boolean().default(true),
  })
  .strict()
  .refine((v) => v.starts_on == null || v.ends_on == null || v.ends_on >= v.starts_on, {
    path: ['ends_on'],
    message: 'errors.invalid_date_range',
  });

export const createAssignmentSchema = baseSchema;

export const updateAssignmentSchema = z
  .object({
    id,
    user_id: id,
    location_id: id,
    shift_id: optionalShiftId,
    role_scope: roleScope,
    starts_on: optionalDate,
    ends_on: optionalDate,
    active: z.boolean().default(true),
  })
  .strict()
  .refine((v) => v.starts_on == null || v.ends_on == null || v.ends_on >= v.starts_on, {
    path: ['ends_on'],
    message: 'errors.invalid_date_range',
  });

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;
