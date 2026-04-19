import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireRole } from '@/lib/auth/guards';
import {
  listLiveAttendanceJoined,
  type LiveAttendanceJoined,
} from '@/lib/queries/attendance';
import { listOpenAlerts, type AlertRow } from '@/lib/queries/alerts';
import {
  listVisibleCampaignsForSupervisor,
  listVisibleLocationsForSupervisor,
  type CampaignRef,
  type LocationRef,
} from '@/lib/queries/supervisor-scope';
import { todayLocalDateString } from '@/lib/attendance/shift-time';
import { SupervisorAttendanceClient } from './supervisor-attendance-client';

type Search = {
  date?: string;
  campaign_id?: string;
  location_id?: string;
};

export default async function SupervisorAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Search>;
}) {
  const { locale } = await params;
  const search = await searchParams;
  setRequestLocale(locale);
  await requireRole('supervisor', 'admin');
  const t = await getTranslations('Supervisor.attendance');

  const date = search.date ?? todayLocalDateString();
  const filters = {
    date,
    campaignId: search.campaign_id,
    locationId: search.location_id,
  };

  const [rows, campaigns, locations, alerts] = await Promise.all([
    listLiveAttendanceJoined(filters),
    listVisibleCampaignsForSupervisor(),
    listVisibleLocationsForSupervisor(),
    listOpenAlerts({
      campaignId: filters.campaignId,
      locationId: filters.locationId,
      limit: 50,
    }),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('description')}</p>
      </header>

      <SupervisorAttendanceClient
        locale={locale}
        rows={rows as LiveAttendanceJoined[]}
        alerts={alerts as AlertRow[]}
        campaigns={campaigns as CampaignRef[]}
        locations={locations as LocationRef[]}
        date={date}
        activeCampaignId={filters.campaignId ?? null}
        activeLocationId={filters.locationId ?? null}
      />
    </div>
  );
}
