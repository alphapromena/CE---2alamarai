import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { i18n } from '@/lib/validations/i18n';
import { getLocation } from '@/lib/queries/locations';
import {
  getLatestPerformance,
  listLatestPerformance,
  listPerformanceHistory,
} from '@/lib/queries/performance';
import { TierBadge } from '@/components/features/performance/tier-badge';
import { PercentCell } from '@/components/features/performance/metric-cell';
import { Sparkline } from '@/components/features/performance/sparkline';

export default async function AdminPerformanceLocationPage({
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

  const loc = await getLocation(id);
  if (!loc) notFound();

  // Find the location's "latest" rows across campaigns and pick one to focus on
  const allRows = await listLatestPerformance({
    scope_kind: 'location',
    period_kind: 'campaign_to_date',
  });
  const locRows = allRows.filter((r) => r.scope_id === id);
  const focused =
    locRows.find((r) => r.campaign_id === (campaign ?? '')) ?? locRows[0] ?? null;

  const promoterRows = focused
    ? await listLatestPerformance({
        campaign_id: focused.campaign_id,
        scope_kind: 'promoter',
        period_kind: 'campaign_to_date',
      })
    : [];

  // Filter promoters whose snapshots match this location is non-trivial without a
  // location_id column on the promoter-scope row. Phase 6 keeps it simple by
  // showing all promoter rows for the campaign — the supervisor view is the
  // location-specific drill-down. Document this in DECISIONS.md.

  const trend = focused
    ? await listPerformanceHistory({
        scope_kind: 'location',
        scope_id: id,
        campaign_id: focused.campaign_id,
        period_kind: 'daily',
        limit: 30,
      })
    : [];

  const campaignSnapshot = focused
    ? await getLatestPerformance({
        scope_kind: 'campaign',
        scope_id: focused.campaign_id,
        campaign_id: focused.campaign_id,
        period_kind: 'campaign_to_date',
      })
    : null;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 space-y-8">
      <div className="border-b border-border pb-6">
        <p className="text-sm text-fg-secondary">
          <Link href="/admin/performance" className="hover:underline">
            {t('admin.title')}
          </Link>
          {focused ? (
            <>
              {' / '}
              <Link
                href={`/admin/performance/campaign/${focused.campaign_id}`}
                className="hover:underline"
              >
                {t('table.campaign')}
              </Link>
            </>
          ) : null}
          {' / '}
          {i18n(loc.name_i18n, locale)}
        </p>
        <h1 className="mt-2 text-2xl font-semibold">{i18n(loc.name_i18n, locale)}</h1>
      </div>

      {!focused ? (
        <EmptyState title={t('empty.no_data_title')} description={t('empty.no_data_description')} />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Card label={t('table.tier')} value={<TierBadge tier={focused.tier} />} />
            <Card label={t('table.rank')} value={
              <span dir="ltr" className="text-2xl font-semibold tabular-nums">
                #{focused.rank_in_scope ?? '—'} / {focused.scope_size ?? '—'}
              </span>
            } />
            <Card label={t('table.conversion')} value={<PercentCell value={focused.conversion_rate} />} />
            <Card
              label={t('campaign.vs_campaign')}
              value={
                <PercentCell
                  value={campaignSnapshot?.conversion_rate ?? null}
                />
              }
              sublabel={t('campaign.campaign_overall')}
            />
          </section>

          <section>
            <h2 className="text-lg font-semibold">{t('location.trend_title')}</h2>
            <p className="mt-1 text-sm text-fg-secondary">{t('location.trend_description')}</p>
            <div className="mt-3 rounded border border-border bg-bg-elevated p-4">
              <Sparkline
                data={trend.map((r) => ({ period_start: r.period_start, value: r.conversion_rate }))}
                ariaLabel={t('location.trend_aria')}
              />
              <p className="mt-2 text-xs text-fg-tertiary">{t('location.trend_legend')}</p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold">{t('location.promoters_title')}</h2>
            {promoterRows.length === 0 ? (
              <EmptyState title={t('empty.no_data_title')} description={t('empty.no_data_description')} />
            ) : (
              <div className="mt-3 overflow-x-auto">
                <Table>
                  <THead>
                    <TR>
                      <TH>{t('table.rank')}</TH>
                      <TH>{t('table.promoter')}</TH>
                      <TH>{t('table.conversion')}</TH>
                      <TH>{t('table.engagement')}</TH>
                      <TH>{t('table.tier')}</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {promoterRows.map((r) => (
                      <TR key={r.id}>
                        <TD numeric><span dir="ltr">#{r.rank_in_scope ?? '—'}</span></TD>
                        <TD>
                          <Link
                            href={`/admin/performance/promoter/${r.scope_id}?campaign=${r.campaign_id}`}
                            className="font-medium text-accent hover:underline"
                          >
                            <span className="font-mono text-xs">{r.scope_id.slice(0, 8)}…</span>
                          </Link>
                        </TD>
                        <TD><PercentCell value={r.conversion_rate} /></TD>
                        <TD><PercentCell value={r.engagement_rate} /></TD>
                        <TD><TierBadge tier={r.tier} /></TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Card({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: React.ReactNode;
  sublabel?: string;
}) {
  return (
    <div className="rounded border border-border bg-bg-elevated p-4">
      <p className="text-xs uppercase tracking-wide text-fg-secondary">{label}</p>
      <div className="mt-1">{value}</div>
      {sublabel ? <p className="mt-1 text-xs text-fg-tertiary">{sublabel}</p> : null}
    </div>
  );
}
