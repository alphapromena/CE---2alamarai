import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireRole } from '@/lib/auth/guards';
import { listLiveAttendanceJoined } from '@/lib/queries/attendance';
import { listOpenAlerts } from '@/lib/queries/alerts';
import { listVisibleCampaignsForSupervisor } from '@/lib/queries/supervisor-scope';
import { LiveDashboardClient } from '@/components/features/live/live-dashboard-client';

export default async function SupervisorLivePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole('supervisor', 'admin');
  const t = await getTranslations('Live');

  // RLS scopes these reads to assigned locations automatically.
  const [rows, alerts, campaigns] = await Promise.all([
    listLiveAttendanceJoined(),
    listOpenAlerts({ limit: 100 }),
    listVisibleCampaignsForSupervisor(),
  ]);

  const campaignLinks = campaigns.map((c) => ({
    id: c.id,
    label: (locale === 'ar' ? c.name_i18n?.ar : c.name_i18n?.en) ?? c.name_i18n?.en ?? c.name_i18n?.ar ?? c.id,
  }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('supervisor.title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('supervisor.description')}</p>
      </header>
      <div className="mt-6">
        <LiveDashboardClient
          scope="supervisor"
          locale={locale}
          rows={rows}
          alerts={alerts}
          campaignLinks={campaignLinks}
        />
      </div>
    </div>
  );
}
