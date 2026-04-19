import { z } from 'zod';
import { i18nNameSchema } from './i18n';

const id = z.string().uuid();

export const createCitySchema = z
  .object({
    region_id: id,
    name_i18n: i18nNameSchema,
    active: z.boolean().default(true),
  })
  .strict();

export const updateCitySchema = createCitySchema.extend({ id });

export type CreateCityInput = z.infer<typeof createCitySchema>;
export type UpdateCityInput = z.infer<typeof updateCitySchema>;
