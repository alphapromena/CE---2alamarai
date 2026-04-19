import { setRequestLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { InviteForm } from './invite-form';

export default async function InviteUserPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Admin.users.invite_dialog');

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('description')}</p>
      </div>
      <div className="mt-8">
        <InviteForm />
      </div>
    </div>
  );
}
