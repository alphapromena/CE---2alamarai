import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CalendarX } from 'lucide-react';
import { requireRole } from '@/lib/auth/guards';
import { listTodaysPromoterAssignments } from '@/lib/queries/attendance';
import {
  getMyReportForToday,
  listActivityPhotos,
  listCampaignSkus,
  listSalesEntries,
  type ActivityPhotoRow,
  type DailyReportRow,
  type SalesEntryRow,
  type SkuLite,
} from '@/lib/queries/reports';
import { todayLocalDateString } from '@/lib/attendance/shift-time';
import { EmptyState } from '@/components/ui/empty-state';
import { TodayReportClient } from './today-client';

export default async function PromoterReportsTodayPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const profile = await requireRole('promoter');
  const t = await getTranslations('Promoter.reports');

  const assignments = await listTodaysPromoterAssignments(profile.id);
  const today = todayLocalDateString(new Date());

  if (assignments.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="border-b border-border pb-6">
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="mt-1 text-sm text-fg-secondary">
            {t('subtitle', { date: today })}
          </p>
        </header>
        <div className="pt-6">
          <EmptyState
            icon={CalendarX}
            title={t('no_shift_title')}
            description={t('no_shift_description')}
          />
        </div>
      </div>
    );
  }

  // Pre-load reports + sales + photos + SKUs for each assignment (usually 1).
  const perAssignment: Array<{
    locationId: string;
    locationName: { ar?: string; en?: string };
    campaignId: string;
    campaignName: { ar?: string; en?: string };
    skus: SkuLite[];
    report: DailyReportRow | null;
    entries: SalesEntryRow[];
    photos: ActivityPhotoRow[];
  }> = [];

  for (const a of assignments) {
    const report = await getMyReportForToday(a.location_id);
    const [skus, entries, photos] = await Promise.all([
      listCampaignSkus(a.campaign_id),
      report ? listSalesEntries(report.id) : Promise.resolve([] as SalesEntryRow[]),
      report ? listActivityPhotos(report.id) : Promise.resolve([] as ActivityPhotoRow[]),
    ]);
    perAssignment.push({
      locationId: a.location_id,
      locationName: a.location_name_i18n,
      campaignId: a.campaign_id,
      campaignName: a.campaign_name_i18n,
      skus,
      report,
      entries,
      photos,
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">
          {t('subtitle', { date: today })}
        </p>
      </header>
      <div className="pt-6">
        <TodayReportClient
          locale={locale}
          reportDate={today}
          assignments={perAssignment}
        />
      </div>
    </div>
  );
}
