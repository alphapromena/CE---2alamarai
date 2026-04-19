import { setRequestLocale, getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { i18n } from '@/lib/validations/i18n';
import { listCampaigns } from '@/lib/queries/campaigns';
import {
  listLatestPerformance,
  listPerformanceHistory,
} from '@/lib/queries/performance';
import { PercentCell } from '@/components/features/performance/metric-cell';
import { Sparkline } from '@/components/features/performance/sparkline';

/**
 * Client performance — aggregates only (D-019 item 3).
 *
 * RLS exposes ONLY scope_kind='campaign' rows for this client's campaigns.
 * Per-promoter and per-location rows are not visible. The page reflects
 * that: a card per campaign with overall conversion / engagement /
 * sampling and a daily trend; tier distribution rendered as raw counts
 * (campaign-level tier_distribution would require visibility into
 * location/promoter rows, which clients don't have, so this page does not
 * show distribution).
 */
export default async function ClientPerformancePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Performance');

  // RLS already filters listCampaigns down to the client's tenant.
  const campaigns = await listCampaigns(null);

  const snapshots = await listLatestPerformance({
    scope_kind: 'campaign',
    period_kind: 'campaign_to_date',
  });
  const byCampaign = new Map(snapshots.map((s) => [s.campaign_id, s]));

  const trendsByCampaign = new Map<string, Array<{ period_start: string; value: number | null }>>();
  for (const c of campaigns) {
    const trend = await listPerformanceHistory({
      scope_kind: 'campaign',
      scope_id: c.id,
      campaign_id: c.id,
      period_kind: 'daily',
      limit: 30,
    });
    trendsByCampaign.set(
      c.id,
      trend.map((r) => ({ period_start: r.period_start, value: r.conversion_rate })),
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 space-y-8">
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('client.title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('client.description')}</p>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState title={t('empty.no_campaigns_title')} description={t('empty.no_campaigns_description')} />
      ) : (
        <div className="space-y-6">
          {campaigns.map((c) => {
            const s = byCampaign.get(c.id);
            const trend = trendsByCampaign.get(c.id) ?? [];
            return (
              <article key={c.id} className="rounded border border-border bg-bg-elevated p-6">
                <header className="flex items-baseline justify-between gap-4">
                  <h2 className="text-lg font-semibold">{i18n(c.name_i18n, locale)}</h2>
                  <p className="text-xs text-fg-secondary">
                    <span dir="ltr">{c.start_date} → {c.end_date}</span>
                  </p>
                </header>

                <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
                  <Stat label={t('table.conversion')} value={<PercentCell value={s?.conversion_rate ?? null} />} />
                  <Stat label={t('table.engagement')} value={<PercentCell value={s?.engagement_rate ?? null} />} />
                  <Stat label={t('table.sampling')} value={<PercentCell value={s?.sampling_rate ?? null} />} />
                  <Stat label={t('campaign.reports')} value={
                    <span dir="ltr" className="tabular-nums">{s?.reports_count ?? 0}</span>
                  } />
                </div>

                <div className="mt-6">
                  <p className="text-xs uppercase tracking-wide text-fg-secondary">
                    {t('location.trend_title')}
                  </p>
                  <div className="mt-2">
                    <Sparkline data={trend} ariaLabel={t('location.trend_aria')} />
                  </div>
                  <p className="mt-2 text-xs text-fg-tertiary">{t('location.trend_legend')}</p>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-fg-secondary">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

