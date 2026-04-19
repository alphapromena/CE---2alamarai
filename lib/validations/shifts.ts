import { z } from 'zod';

const id = z.string().uuid();

// Sun=0..Sat=6 mirroring the DB CHECK on shifts.days_of_week.
const dayOfWeek = z.coerce.number().int().min(0).max(6);

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const createShiftSchema = z
  .object({
    campaign_id: id,
    location_id: id,
    start_time: time,
    end_time: time,
    days_of_week: z.array(dayOfWeek).min(1).max(7),
    active: z.boolean().default(true),
  })
  .strict()
  .refine((v) => v.start_time < v.end_time, {
    path: ['end_time'],
    message: 'errors.invalid_time_range',
  })
  .refine((v) => new Set(v.days_of_week).size === v.days_of_week.length, {
    path: ['days_of_week'],
    message: 'errors.duplicate_days',
  });

export const updateShiftSchema = z
  .object({
    id,
    campaign_id: id,
    location_id: id,
    start_time: time,
    end_time: time,
    days_of_week: z.array(dayOfWeek).min(1).max(7),
    active: z.boolean().default(true),
  })
  .strict()
  .refine((v) => v.start_time < v.end_time, {
    path: ['end_time'],
    message: 'errors.invalid_time_range',
  })
  .refine((v) => new Set(v.days_of_week).size === v.days_of_week.length, {
    path: ['days_of_week'],
    message: 'errors.duplicate_days',
  });

export type CreateShiftInput = z.infer<typeof createShiftSchema>;
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;
