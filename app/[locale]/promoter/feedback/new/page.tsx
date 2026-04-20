import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireRole } from '@/lib/auth/guards';
import { listTodaysPromoterAssignments } from '@/lib/queries/attendance';
import { FeedbackForm } from '@/components/features/feedback/feedback-form';

export default async function PromoterFeedbackNewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const me = await requireRole('promoter', 'admin');
  const t = await getTranslations('Feedback.form');

  const assignments = await listTodaysPromoterAssignments(me.id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('subtitle')}</p>
      </header>
      <div className="pt-6">
        {assignments.length === 0 ? (
          <p className="rounded-lg border border-border p-6 text-sm text-fg-muted">
            {t('no_assignments')}
          </p>
        ) : (
          <FeedbackForm
            locale={locale}
            assignments={assignments.map((a) => ({
              assignment_id: a.assignment_id,
              campaign_id: a.campaign_id,
              location_id: a.location_id,
              campaign_name_i18n: a.campaign_name_i18n,
              location_name_i18n: a.location_name_i18n,
            }))}
            landingPath="/promoter/feedback"
          />
        )}
      </div>
    </div>
  );
}
