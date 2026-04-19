import { z } from 'zod';
import { i18nNameSchema } from './i18n';

const id = z.string().uuid();

export const createRegionSchema = z
  .object({
    name_i18n: i18nNameSchema,
    country_code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/),
    active: z.boolean().default(true),
  })
  .strict();

export const updateRegionSchema = createRegionSchema.extend({ id });

export type CreateRegionInput = z.infer<typeof createRegionSchema>;
export type UpdateRegionInput = z.infer<typeof updateRegionSchema>;
