import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/guards';
import {
  getKpiSnapshot,
  getReportById,
  listActivityPhotos,
  listSalesEntries,
} from '@/lib/queries/reports';
import { listCampaignSkus } from '@/lib/queries/campaigns';
import { getAttendanceForReport } from '@/lib/queries/attendance';
import { listSupervisorVisitsForReport } from '@/lib/queries/supervisor-visits';
import { listFeedbackForReport } from '@/lib/queries/feedback';
import { ReportDetailView } from '@/components/features/reports/report-detail-view';

export default async function AdminReportDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireAdmin();

  const report = await getReportById(id);
  if (!report) notFound();

  const [entries, photos, kpis, skus, attendance, visits, feedback] = await Promise.all([
    listSalesEntries(id),
    listActivityPhotos(id),
    getKpiSnapshot(id),
    listCampaignSkus(report.campaign_id),
    getAttendanceForReport(report.promoter_user_id, report.location_id, report.report_date),
    listSupervisorVisitsForReport(
      report.promoter_user_id,
      report.location_id,
      report.report_date,
    ),
    listFeedbackForReport(id),
  ]);

  const admin = createAdminSupabase();
  const { data: metaRaw } = await admin
    .from('daily_reports')
    .select(
      `campaign:campaigns ( name_i18n ),
       location:locations ( name_i18n ),
       promoter:profiles!daily_reports_promoter_user_id_fkey ( full_name )`,
    )
    .eq('id', id)
    .maybeSingle();
  type MetaRow = {
    campaign: { name_i18n: { ar?: string; en?: string } | null } | null;
    location: { name_i18n: { ar?: string; en?: string } | null } | null;
    promoter: { full_name: string | null } | null;
  };
  const m = (metaRaw as unknown as MetaRow | null) ?? null;
  const meta = {
    campaign_name_i18n: m?.campaign?.name_i18n ?? null,
    location_name_i18n: m?.location?.name_i18n ?? null,
    promoter_name: m?.promoter?.full_name ?? null,
  };

  // Admin view is read-only — no reviewSlot. Approve/reject lives on the
  // supervisor surface today; admins triage via the live ops dashboard.
  return (
    <ReportDetailView
      locale={locale}
      report={report}
      meta={meta}
      entries={entries}
      photos={photos}
      kpis={kpis}
      skus={skus}
      attendance={attendance}
      visits={visits}
      feedback={feedback}
    />
  );
}
