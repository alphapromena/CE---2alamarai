import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireRole } from '@/lib/auth/guards';
import { listFeedback } from '@/lib/queries/feedback';
import { FeedbackList } from '@/components/features/feedback/feedback-list';

export default async function SupervisorFeedbackPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole('supervisor', 'admin');
  const t = await getTranslations('Feedback');

  const rows = await listFeedback({ limit: 200 });

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('title_supervisor')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('subtitle_supervisor')}</p>
      </header>
      <div className="pt-6">
        <FeedbackList rows={rows} locale={locale} showPromoter={true} />
      </div>
    </div>
  );
}
