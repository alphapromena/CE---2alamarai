import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireRole } from '@/lib/auth/guards';
import { listVisibleBreakRequests } from '@/lib/queries/breaks';
import { SupervisorBreaksClient } from './supervisor-breaks-client';

export default async function SupervisorBreaksPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole('supervisor', 'admin');
  const t = await getTranslations('Breaks.supervisor');

  const rows = await listVisibleBreakRequests();

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('description')}</p>
      </header>
      <div className="mt-6">
        <SupervisorBreaksClient locale={locale} rows={rows} />
      </div>
    </div>
  );
}
