export const USER_ROLES = ['admin', 'supervisor', 'promoter', 'client'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

export const LANDING_PATH_BY_ROLE: Record<UserRole, string> = {
  admin: '/admin/dashboard',
  supervisor: '/supervisor/dashboard',
  promoter: '/promoter/dashboard',
  client: '/client/dashboard',
};
