import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Plus } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { requireRole } from '@/lib/auth/guards';
import { listFeedback } from '@/lib/queries/feedback';
import { FeedbackList } from '@/components/features/feedback/feedback-list';

export default async function PromoterFeedbackPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole('promoter', 'admin');
  const t = await getTranslations('Feedback');

  const rows = await listFeedback({ limit: 50 });

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex items-end justify-between border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('title_promoter')}</h1>
          <p className="mt-1 text-sm text-fg-secondary">{t('subtitle_promoter')}</p>
        </div>
        <Link
          href="/promoter/feedback/new"
          className="inline-flex h-8 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-white hover:bg-accent-hover"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          {t('new_cta')}
        </Link>
      </header>
      <div className="pt-6">
        <FeedbackList rows={rows} locale={locale} showPromoter={false} />
      </div>
    </div>
  );
}
