import { z } from 'zod';
import { i18nNameSchema } from './i18n';

const id = z.string().uuid();
const name = z.string().trim().min(1).max(120);
const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(255)
  .optional()
  .or(z.literal('').transform(() => undefined));
const optionalPhone = z
  .string()
  .trim()
  .regex(/^\+?[0-9\s()-]{7,20}$/)
  .optional()
  .or(z.literal('').transform(() => undefined));

export const createClientSchema = z
  .object({
    name,
    name_i18n: i18nNameSchema,
    contact_email: optionalEmail,
    contact_phone: optionalPhone,
    active: z.boolean().default(true),
  })
  .strict();

export const updateClientSchema = createClientSchema.extend({ id });

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
