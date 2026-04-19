import { z } from 'zod';
import { i18nNameSchema } from './i18n';

const id = z.string().uuid();

const optionalAddress = z
  .string()
  .trim()
  .max(500)
  .optional()
  .or(z.literal('').transform(() => undefined));

export const createLocationSchema = z
  .object({
    city_id: id,
    name_i18n: i18nNameSchema,
    address: optionalAddress,
    lat: z.coerce.number().gte(-90).lte(90),
    lng: z.coerce.number().gte(-180).lte(180),
    geofence_radius_m: z.coerce.number().int().gte(10).lte(5000),
    active: z.boolean().default(true),
  })
  .strict();

export const updateLocationSchema = createLocationSchema.extend({ id });

export type CreateLocationInput = z.infer<typeof createLocationSchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
