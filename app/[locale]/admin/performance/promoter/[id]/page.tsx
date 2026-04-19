import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { EmptyState } from '@/components/ui/empty-state';
import {
  getLatestPerformance,
  listLatestPerformance,
  listPerformanceHistory,
} from '@/lib/queries/performance';
import { TierBadge } from '@/components/features/performance/tier-badge';
import { PercentCell, DeltaCell } from '@/components/features/performance/metric-cell';
import { Sparkline } from '@/components/features/performance/sparkline';

export default async function AdminPerformancePromoterPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ campaign?: string }>;
}) {
  const { locale, id } = await params;
  const { campaign } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('Performance');

  const allLatest = await listLatestPerformance({
    scope_kind: 'promoter',
    period_kind: 'campaign_to_date',
  });
  const promoterRows = allLatest.filter((r) => r.scope_id === id);
  if (promoterRows.length === 0) notFound();

  const focused =
    promoterRows.find((r) => r.campaign_id === (campaign ?? '')) ?? promoterRows[0]!;

  const [campaignSnapshot, dailyHistory] = await Promise.all([
    getLatestPerformance({
      scope_kind: 'campaign',
      scope_id: focused.campaign_id,
      campaign_id: focused.campaign_id,
      period_kind: 'campaign_to_date',
    }),
    listPerformanceHistory({
      scope_kind: 'promoter',
      scope_id: id,
      campaign_id: focused.campaign_id,
      period_kind: 'daily',
      limit: 30,
    }),
  ]);

  const delta =
    focused.conversion_rate !== null && campaignSnapshot?.conversion_rate !== undefined && campaignSnapshot?.conversion_rate !== null
      ? focused.conversion_rate - campaignSnapshot.conversion_rate
      : null;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 space-y-8">
      <div className="border-b border-border pb-6">
        <p className="text-sm text-fg-secondary">
          <Link href="/admin/performance" className="hover:underline">
            {t('admin.title')}
          </Link>
          {' / '}
          <Link
            href={`/admin/performance/campaign/${focused.campaign_id}`}
            className="hover:underline"
          >
            {t('table.campaign')}
          </Link>
          {' / '}
          {t('table.promoter')}
        </p>
        <h1 className="mt-2 text-2xl font-semibold font-mono">{id}</h1>
        <p className="mt-1 text-sm text-fg-secondary">
          {t('promoter.scope_size', { size: focused.scope_size ?? 0 })}
        </p>
      </div>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Card label={t('table.tier')} value={<TierBadge tier={focused.tier} />} />
        <Card label={t('table.rank')} value={
          <span dir="ltr" className="text-2xl font-semibold tabular-nums">
            #{focused.rank_in_scope ?? '—'} / {focused.scope_size ?? '—'}
          </span>
        } />
        <Card label={t('table.conversion')} value={<PercentCell value={focused.conversion_rate} />} />
        <Card label={t('table.engagement')} value={<PercentCell value={focused.engagement_rate} />} />
        <Card label={t('table.delta_vs_campaign')} value={<DeltaCell value={delta} />} />
      </section>

      <section>
        <h2 className="text-lg font-semibold">{t('promoter.trend_title')}</h2>
        <p className="mt-1 text-sm text-fg-secondary">{t('promoter.trend_description')}</p>
        <div className="mt-3 rounded border border-border bg-bg-elevated p-4">
          <Sparkline
            data={dailyHistory.map((r) => ({ period_start: r.period_start, value: r.conversion_rate }))}
            ariaLabel={t('promoter.trend_aria')}
          />
          <p className="mt-2 text-xs text-fg-tertiary">{t('promoter.trend_legend')}</p>
        </div>
      </section>

      {promoterRows.length > 1 ? (
        <section>
          <h2 className="text-lg font-semibold">{t('promoter.other_campaigns')}</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {promoterRows
              .filter((r) => r.campaign_id !== focused.campaign_id)
              .map((r) => (
                <li key={r.campaign_id}>
                  <Link
                    href={`/admin/performance/promoter/${id}?campaign=${r.campaign_id}`}
                    className="text-accent hover:underline"
                  >
                    {r.campaign_id.slice(0, 8)}… — <PercentCell value={r.conversion_rate} />
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ) : (
        <EmptyState title={t('empty.no_other_campaigns_title')} description={t('empty.no_other_campaigns_description')} />
      )}
    </div>
  );
}

function Card({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded border border-border bg-bg-elevated p-4">
      <p className="text-xs uppercase tracking-wide text-fg-secondary">{label}</p>
      <div className="mt-1">{value}</div>
    </div>
  );
}
