import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { getSessionProfile, type SessionProfile } from './session';
import { LANDING_PATH_BY_ROLE, type UserRole } from './roles';

export async function requireSessionProfile(): Promise<SessionProfile> {
  const profile = await getSessionProfile();
  if (!profile) {
    const locale = await getLocale();
    redirect(`/${locale}/login`);
  }
  if (!profile.active) {
    const locale = await getLocale();
    redirect(`/${locale}/login?reason=deactivated`);
  }
  return profile;
}

export async function requireRole(...allowed: readonly UserRole[]): Promise<SessionProfile> {
  const profile = await requireSessionProfile();
  if (!allowed.includes(profile.role)) {
    notFound();
  }
  return profile;
}

export async function requireAdmin(): Promise<SessionProfile> {
  return requireRole('admin');
}

export async function redirectToLandingForRole(role: UserRole): Promise<never> {
  const locale = await getLocale();
  redirect(`/${locale}${LANDING_PATH_BY_ROLE[role]}`);
}
