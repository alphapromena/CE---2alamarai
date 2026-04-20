import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireRole } from '@/lib/auth/guards';
import { listMyBreakRequests } from '@/lib/queries/breaks';
import { listTodaysPromoterAssignments } from '@/lib/queries/attendance';
import { PromoterBreaksClient } from './promoter-breaks-client';

export default async function PromoterBreaksPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const me = await requireRole('promoter', 'admin');
  const t = await getTranslations('Breaks.promoter');

  const [rows, assignments] = await Promise.all([
    listMyBreakRequests(),
    listTodaysPromoterAssignments(me.id),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('description')}</p>
      </header>
      <div className="mt-6">
        <PromoterBreaksClient locale={locale} rows={rows} assignments={assignments} />
      </div>
    </div>
  );
}
