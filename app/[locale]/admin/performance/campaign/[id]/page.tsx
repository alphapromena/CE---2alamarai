import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { i18n } from '@/lib/validations/i18n';
import { listCampaigns } from '@/lib/queries/campaigns';
import {
  getLatestPerformance,
  listLatestPerformance,
  tierDistributionForCampaign,
} from '@/lib/queries/performance';
import { listLocations } from '@/lib/queries/locations';
import { TierBadge } from '@/components/features/performance/tier-badge';
import { PercentCell, DeltaCell } from '@/components/features/performance/metric-cell';

export default async function AdminPerformanceCampaignPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Performance');

  const campaigns = await listCampaigns(null);
  const campaign = campaigns.find((c) => c.id === id);
  if (!campaign) notFound();

  const [campaignSnapshot, locationRows, promoterRows, dist] = await Promise.all([
    getLatestPerformance({
      scope_kind: 'campaign',
      scope_id: id,
      campaign_id: id,
      period_kind: 'campaign_to_date',
    }),
    listLatestPerformance({
      campaign_id: id,
      scope_kind: 'location',
      period_kind: 'campaign_to_date',
    }),
    listLatestPerformance({
      campaign_id: id,
      scope_kind: 'promoter',
      period_kind: 'campaign_to_date',
    }),
    tierDistributionForCampaign({
      campaign_id: id,
      scope_kind: 'location',
      period_kind: 'campaign_to_date',
    }),
  ]);

  // Build a lookup for the campaign mean to compute per-location deltas.
  const campaignConv = campaignSnapshot?.conversion_rate ?? null;

  const allLocations = await listLocations(null);
  const locName = (locId: string) => {
    const loc = allLocations.find((l) => l.id === locId);
    return loc ? i18n(loc.name_i18n, locale) : locId;
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 space-y-8">
      <div className="border-b border-border pb-6">
        <p className="text-sm text-fg-secondary">
          <Link href="/admin/performance" className="hover:underline">
            {t('admin.title')}
          </Link>
          {' / '}
          {i18n(campaign.name_i18n, locale)}
        </p>
        <h1 className="mt-2 text-2xl font-semibold">{i18n(campaign.name_i18n, locale)}</h1>
        <p className="mt-1 text-sm text-fg-secondary">
          {campaign.client_name ?? '—'} · {campaign.start_date} → {campaign.end_date}
        </p>
      </div>

      {/* Campaign aggregate cards */}
      <section>
        <h2 className="text-lg font-semibold">{t('campaign.overview')}</h2>
        <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-5">
          <Card label={t('table.conversion')} value={<PercentCell value={campaignSnapshot?.conversion_rate ?? null} />} />
          <Card label={t('table.engagement')} value={<PercentCell value={campaignSnapshot?.engagement_rate ?? null} />} />
          <Card label={t('table.sampling')} value={<PercentCell value={campaignSnapshot?.sampling_rate ?? null} />} />
          <Card label={t('campaign.reports')} value={<span dir="ltr" className="tabular-nums">{campaignSnapshot?.reports_count ?? 0}</span>} />
          <Card label={t('campaign.tier_distribution')} value={
            <span dir="ltr" className="tabular-nums">
              {dist.top}/{dist.medium}/{dist.low}
            </span>
          } sublabel={t('campaign.tier_distribution_legend')} />
        </div>
      </section>

      {/* Location ranking */}
      <section>
        <h2 className="text-lg font-semibold">{t('campaign.locations_title')}</h2>
        <p className="mt-1 text-sm text-fg-secondary">{t('campaign.locations_description')}</p>
        {locationRows.length === 0 ? (
          <EmptyState title={t('empty.no_data_title')} description={t('empty.no_data_description')} />
        ) : (
          <div className="mt-3 overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>{t('table.rank')}</TH>
                  <TH>{t('table.location')}</TH>
                  <TH>{t('table.conversion')}</TH>
                  <TH>{t('table.delta_vs_campaign')}</TH>
                  <TH>{t('table.engagement')}</TH>
                  <TH>{t('table.tier')}</TH>
                  <TH>{t('table.reports')}</TH>
                </TR>
              </THead>
              <TBody>
                {locationRows.map((r) => (
                  <TR key={r.id}>
                    <TD numeric><span dir="ltr">#{r.rank_in_scope ?? '—'}</span></TD>
                    <TD>
                      <Link
                        href={`/admin/performance/location/${r.scope_id}`}
                        className="font-medium text-accent hover:underline"
                      >
                        {locName(r.scope_id)}
                      </Link>
                    </TD>
                    <TD><PercentCell value={r.conversion_rate} /></TD>
                    <TD>
                      <DeltaCell
                        value={
                          r.conversion_rate !== null && campaignConv !== null
                            ? r.conversion_rate - campaignConv
                            : null
                        }
                      />
                    </TD>
                    <TD><PercentCell value={r.engagement_rate} /></TD>
                    <TD><TierBadge tier={r.tier} /></TD>
                    <TD><span dir="ltr" className="tabular-nums">{r.reports_count}</span></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </section>

      {/* Promoter ranking */}
      <section>
        <h2 className="text-lg font-semibold">{t('campaign.promoters_title')}</h2>
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
                  <TH>{t('table.reports')}</TH>
                </TR>
              </THead>
              <TBody>
                {promoterRows.map((r) => (
                  <TR key={r.id}>
                    <TD numeric><span dir="ltr">#{r.rank_in_scope ?? '—'}</span></TD>
                    <TD>
                      <Link
                        href={`/admin/performance/promoter/${r.scope_id}?campaign=${id}`}
                        className="font-medium text-accent hover:underline"
                      >
                        <span className="font-mono text-xs">{r.scope_id.slice(0, 8)}…</span>
                      </Link>
                    </TD>
                    <TD><PercentCell value={r.conversion_rate} /></TD>
                    <TD><PercentCell value={r.engagement_rate} /></TD>
                    <TD><TierBadge tier={r.tier} /></TD>
                    <TD><span dir="ltr" className="tabular-nums">{r.reports_count}</span></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </section>
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
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {sublabel ? <p className="mt-1 text-xs text-fg-tertiary">{sublabel}</p> : null}
    </div>
  );
}
