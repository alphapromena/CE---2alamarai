import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { requireRole } from '@/lib/auth/guards';
import {
  getKpiSnapshot,
  getReportById,
  listActivityPhotos,
  listCampaignSkus,
  listSalesEntries,
} from '@/lib/queries/reports';
import { i18n } from '@/lib/validations/i18n';
import { StatusPill, type StatusPillVariant } from '@/components/ui/status-pill';
import { Alert } from '@/components/ui/alert';
import { ReviewPanel } from './review-panel';
import { PhotoThumb } from './photo-thumb';

function pillFor(status: string): { variant: StatusPillVariant; key: string } {
  switch (status) {
    case 'draft':
      return { variant: 'neutral', key: 'status_draft' };
    case 'submitted':
      return { variant: 'info', key: 'status_submitted' };
    case 'approved':
      return { variant: 'success', key: 'status_approved' };
    case 'rejected':
      return { variant: 'danger', key: 'status_rejected' };
    default:
      return { variant: 'neutral', key: 'status_draft' };
  }
}

function pct(n: number | null): string {
  if (n == null) return '—';
  return `${Math.round(n * 1000) / 10}%`;
}

export default async function SupervisorReportDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const actor = await requireRole('supervisor', 'admin');
  const t = await getTranslations('Supervisor.reports');
  const tp = await getTranslations('Promoter.reports');

  const report = await getReportById(id);
  if (!report) notFound();

  // Enforce supervisor scope early; RLS will also block but a friendly 404
  // is nicer than a blank page.
  if (
    actor.role === 'supervisor' &&
    !actor.assigned_locations.includes(report.location_id)
  ) {
    notFound();
  }

  const [entries, photos, kpis, skus] = await Promise.all([
    listSalesEntries(id),
    listActivityPhotos(id),
    getKpiSnapshot(id),
    listCampaignSkus(report.campaign_id),
  ]);

  // Look up i18n metadata for display.
  const admin = createAdminSupabase();
  const { data: meta } = await admin
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
  const m = (meta as unknown as MetaRow | null) ?? null;

  const p = pillFor(report.status);
  const skuMap = new Map(skus.map((s) => [s.id, s]));

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-semibold">
            {i18n(m?.location?.name_i18n ?? null, locale)} · {report.report_date}
          </h1>
          <p className="mt-1 text-sm text-fg-secondary">
            {i18n(m?.campaign?.name_i18n ?? null, locale)} ·{' '}
            {m?.promoter?.full_name ?? '—'}
          </p>
        </div>
        <StatusPill variant={p.variant} label={tp(p.key)} />
      </header>

      {report.status === 'rejected' && report.review_reason ? (
        <Alert variant="warning">
          <div className="font-medium">{t('rejected_heading')}</div>
          <div className="text-sm">{report.review_reason}</div>
        </Alert>
      ) : null}

      <section className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-border p-4">
          <h2 className="mb-3 text-sm font-medium">{t('funnel_heading')}</h2>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-fg-secondary">{tp('fields.traffic')}</dt>
            <dd className="tabular-nums">{report.total_traffic ?? '—'}</dd>
            <dt className="text-fg-secondary">{tp('fields.contacts')}</dt>
            <dd className="tabular-nums">{report.contacts}</dd>
            <dt className="text-fg-secondary">{tp('fields.engaged')}</dt>
            <dd className="tabular-nums">{report.engaged}</dd>
            <dt className="text-fg-secondary">{tp('fields.samples')}</dt>
            <dd className="tabular-nums">{report.samples_total}</dd>
            <dt className="text-fg-secondary">{tp('fields.sales')}</dt>
            <dd className="tabular-nums">{report.sales_total}</dd>
          </dl>
        </div>

        <div className="rounded-lg border border-border p-4">
          <h2 className="mb-3 text-sm font-medium">{t('kpis_heading')}</h2>
          {!kpis ? (
            <p className="text-sm text-fg-muted">{t('kpis_pending')}</p>
          ) : (
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-fg-secondary">{t('kpi.interaction')}</dt>
              <dd className="tabular-nums">{pct(kpis.interaction_rate)}</dd>
              <dt className="text-fg-secondary">{t('kpi.engagement')}</dt>
              <dd className="tabular-nums">{pct(kpis.engagement_rate)}</dd>
              <dt className="text-fg-secondary">
                {t('kpi.sampling')} ({kpis.sampling_rate_denominator ?? '—'})
              </dt>
              <dd className="tabular-nums">{pct(kpis.sampling_rate)}</dd>
              <dt className="text-fg-secondary">{t('kpi.conversion')}</dt>
              <dd className="tabular-nums">{pct(kpis.conversion_rate)}</dd>
              <dt className="text-fg-secondary">{t('kpi.sample_to_conversion')}</dt>
              <dd className="tabular-nums">{pct(kpis.sample_to_conversion_rate)}</dd>
            </dl>
          )}
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-border">
        <div className="border-b border-border bg-bg-subtle px-4 py-2 text-sm font-medium">
          {t('sku_breakdown')}
        </div>
        {entries.length === 0 ? (
          <div className="p-4 text-sm text-fg-muted">{t('no_sku_entries')}</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-fg-secondary">
              <tr>
                <th className="px-3 py-2 text-start font-medium">{t('sku_col')}</th>
                <th className="px-3 py-2 text-end font-medium">{tp('fields.samples')}</th>
                <th className="px-3 py-2 text-end font-medium">{tp('fields.sales')}</th>
                <th className="px-3 py-2 text-end font-medium">{t('contribution_col')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((e) => {
                const sku = skuMap.get(e.sku_id);
                const contrib = kpis?.sku_contributions?.[e.sku_id] ?? null;
                return (
                  <tr key={e.sku_id}>
                    <td className="px-3 py-2">{i18n(sku?.name_i18n ?? null, locale)}</td>
                    <td className="px-3 py-2 text-end tabular-nums">{e.samples}</td>
                    <td className="px-3 py-2 text-end tabular-nums">{e.sales}</td>
                    <td className="px-3 py-2 text-end tabular-nums">{pct(contrib)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {photos.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-medium">{t('photos_heading')}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {photos.map((ph) => (
              <PhotoThumb key={ph.photo_kind} path={ph.storage_path} kind={ph.photo_kind} />
            ))}
          </div>
        </section>
      ) : null}

      {report.status === 'submitted' ? (
        <ReviewPanel reportId={id} />
      ) : null}
    </div>
  );
}
