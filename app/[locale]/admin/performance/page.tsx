import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { listCampaigns } from '@/lib/queries/campaigns';
import { listLatestPerformance } from '@/lib/queries/performance';
import { i18n } from '@/lib/validations/i18n';
import { TierBadge } from '@/components/features/performance/tier-badge';
import { PercentCell } from '@/components/features/performance/metric-cell';

export default async function AdminPerformanceIndex({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('Performance');

  const campaigns = await listCampaigns(null);

  // For each campaign, fetch its campaign-scope row (campaign_to_date)
  const rows = await listLatestPerformance({
    scope_kind: 'campaign',
    period_kind: 'campaign_to_date',
  });
  const byCampaign = new Map(rows.map((r) => [r.campaign_id, r]));

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('admin.title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('admin.description')}</p>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState
          title={t('empty.no_campaigns_title')}
          description={t('empty.no_campaigns_description')}
        />
      ) : (
        <div className="mt-6 overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>{t('table.campaign')}</TH>
                <TH>{t('table.client')}</TH>
                <TH>{t('table.status')}</TH>
                <TH>{t('table.conversion')}</TH>
                <TH>{t('table.engagement')}</TH>
                <TH>{t('table.tier')}</TH>
                <TH>{t('table.reports')}</TH>
              </TR>
            </THead>
            <TBody>
              {campaigns.map((c) => {
                const r = byCampaign.get(c.id);
                return (
                  <TR key={c.id}>
                    <TD>
                      <Link
                        href={`/admin/performance/campaign/${c.id}`}
                        className="font-medium text-accent hover:underline"
                      >
                        {i18n(c.name_i18n, locale)}
                      </Link>
                    </TD>
                    <TD>{c.client_name ?? '—'}</TD>
                    <TD>{t(`status.${c.status}`)}</TD>
                    <TD><PercentCell value={r?.conversion_rate ?? null} /></TD>
                    <TD><PercentCell value={r?.engagement_rate ?? null} /></TD>
                    <TD><TierBadge tier={r?.tier ?? null} /></TD>
                    <TD>
                      <span dir="ltr" className="tabular-nums">{r?.reports_count ?? 0}</span>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}
