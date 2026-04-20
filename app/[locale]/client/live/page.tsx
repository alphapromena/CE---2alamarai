import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireRole } from '@/lib/auth/guards';
import { clientListCampaigns } from '@/lib/queries/client-campaigns';
import { LiveDashboardClient } from '@/components/features/live/live-dashboard-client';

/**
 * Client live view — aggregates only (D-019 item 3, reaffirmed in D-028).
 * No per-promoter rows, no per-location breakdown. Alert feed is the campaign-
 * scope alerts the client's RLS policies permit (which today are none —
 * kept for forward-compatibility when Phase 8 reporting opens that surface).
 */
export default async function ClientLivePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole('client');
  const t = await getTranslations('Live');

  const campaigns = await clientListCampaigns();

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('client.title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('client.description')}</p>
      </header>
      <div className="mt-6">
        <LiveDashboardClient
          scope="client"
          locale={locale}
          rows={[]}
          alerts={[]}
          campaignLinks={campaigns.map((c) => ({
            id: c.id,
            label:
              (locale === 'ar' ? c.name_i18n?.ar : c.name_i18n?.en) ??
              c.name_i18n?.en ??
              c.name_i18n?.ar ??
              c.id,
          }))}
        />
      </div>
    </div>
  );
}
