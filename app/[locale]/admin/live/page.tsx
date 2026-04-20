import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireAdmin } from '@/lib/auth/guards';
import { listLiveAttendanceJoined } from '@/lib/queries/attendance';
import { listOpenAlerts } from '@/lib/queries/alerts';
import { listCampaigns } from '@/lib/queries/campaigns';
import { LiveDashboardClient } from '@/components/features/live/live-dashboard-client';

export default async function AdminLivePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin();
  const t = await getTranslations('Live');

  const [rows, alerts, campaigns] = await Promise.all([
    listLiveAttendanceJoined(),
    listOpenAlerts({ limit: 100 }),
    listCampaigns(null),
  ]);

  const campaignLinks = campaigns.map((c) => ({
    id: c.id,
    label: (locale === 'ar' ? c.name_i18n?.ar : c.name_i18n?.en) ?? c.name_i18n?.en ?? c.name_i18n?.ar ?? c.id,
  }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('admin.title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('admin.description')}</p>
      </header>
      <div className="mt-6">
        <LiveDashboardClient
          scope="admin"
          locale={locale}
          rows={rows}
          alerts={alerts}
          campaignLinks={campaignLinks}
        />
      </div>
    </div>
  );
}
