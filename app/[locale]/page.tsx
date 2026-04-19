import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { getSessionProfile } from '@/lib/auth/session';
import { LANDING_PATH_BY_ROLE } from '@/lib/auth/roles';

export default async function LocalePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const profile = await getSessionProfile();
  if (profile?.active) {
    redirect(`/${locale}${LANDING_PATH_BY_ROLE[profile.role]}`);
  }

  redirect(`/${locale}/login`);
}
