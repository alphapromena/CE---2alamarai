import { z } from 'zod';
import { i18nNameSchema } from './i18n';

const id = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const samplingDenominator = z.enum(['contacts', 'engaged']);
const status = z.enum(['planned', 'active', 'completed', 'cancelled']);

export const createCampaignSchema = z
  .object({
    client_id: id,
    name_i18n: i18nNameSchema,
    start_date: date,
    end_date: date,
    objectives: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .or(z.literal('').transform(() => undefined)),
    sampling_rate_denominator: samplingDenominator.default('contacts'),
    status: status.default('planned'),
  })
  .strict()
  .refine((v) => v.end_date >= v.start_date, {
    path: ['end_date'],
    message: 'errors.invalid_date_range',
  });

export const updateCampaignSchema = z
  .object({
    id,
    client_id: id,
    name_i18n: i18nNameSchema,
    start_date: date,
    end_date: date,
    objectives: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .or(z.literal('').transform(() => undefined)),
    sampling_rate_denominator: samplingDenominator,
    status,
  })
  .strict()
  .refine((v) => v.end_date >= v.start_date, {
    path: ['end_date'],
    message: 'errors.invalid_date_range',
  });

export const setCampaignLocationsSchema = z
  .object({
    campaign_id: id,
    location_ids: z.array(id).max(500),
  })
  .strict();

export const createSkuSchema = z
  .object({
    campaign_id: id,
    name_i18n: i18nNameSchema,
    unit_i18n: i18nNameSchema,
    target: z.coerce.number().int().gte(0),
    stock_allocated: z.coerce.number().int().gte(0),
    active: z.boolean().default(true),
  })
  .strict();

export const updateSkuSchema = createSkuSchema.extend({ id });

export const deleteSkuSchema = z.object({ id, campaign_id: id }).strict();

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
export type SetCampaignLocationsInput = z.infer<typeof setCampaignLocationsSchema>;
export type CreateSkuInput = z.infer<typeof createSkuSchema>;
export type UpdateSkuInput = z.infer<typeof updateSkuSchema>;
