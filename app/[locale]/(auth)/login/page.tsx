import { redirect } from 'next/navigation';
import { getLocale, setRequestLocale } from 'next-intl/server';
import { getSessionProfile } from '@/lib/auth/session';
import { LANDING_PATH_BY_ROLE } from '@/lib/auth/roles';
import { LoginForm } from './login-form';

type Params = Promise<{ locale: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const profile = await getSessionProfile();
  if (profile && profile.active) {
    const current = await getLocale();
    redirect(`/${current}${LANDING_PATH_BY_ROLE[profile.role]}`);
  }

  const sp = await searchParams;
  const deactivatedNotice = sp.reason === 'deactivated';

  return <LoginForm deactivatedNotice={deactivatedNotice} />;
}
