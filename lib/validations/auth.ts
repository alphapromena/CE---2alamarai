import { z } from 'zod';
import { USER_ROLES } from '@/lib/auth/roles';

const email = z.string().trim().toLowerCase().email().max(255);
const password = z.string().min(8, 'auth.errors.password_too_short').max(128);
const fullName = z.string().trim().min(1).max(120);
const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9\s()-]{7,20}$/)
  .optional();
const locale = z.enum(['ar', 'en']);
const role = z.enum(USER_ROLES);
const uuid = z.string().uuid();

export const loginSchema = z
  .object({
    email,
    password: z.string().min(1).max(128),
  })
  .strict();

export const requestResetSchema = z
  .object({
    email,
  })
  .strict();

export const confirmResetSchema = z
  .object({
    password,
    confirm_password: z.string(),
  })
  .strict()
  .refine((v) => v.password === v.confirm_password, {
    path: ['confirm_password'],
    message: 'auth.errors.passwords_mismatch',
  });

export const setPasswordSchema = confirmResetSchema;

export const inviteUserSchema = z
  .object({
    email,
    full_name: fullName,
    role,
    preferred_language: locale.default('en'),
    phone: phone,
  })
  .strict();

export const updateOwnProfileSchema = z
  .object({
    full_name: fullName,
    phone: phone,
    preferred_language: locale,
  })
  .strict();

export const changeUserRoleSchema = z
  .object({
    user_id: uuid,
    role,
  })
  .strict();

export const setUserActiveSchema = z
  .object({
    user_id: uuid,
    active: z.boolean(),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;
export type RequestResetInput = z.infer<typeof requestResetSchema>;
export type ConfirmResetInput = z.infer<typeof confirmResetSchema>;
export type InviteUserInput = z.infer<typeof inviteUserSchema>;
export type UpdateOwnProfileInput = z.infer<typeof updateOwnProfileSchema>;
export type ChangeUserRoleInput = z.infer<typeof changeUserRoleSchema>;
export type SetUserActiveInput = z.infer<typeof setUserActiveSchema>;
