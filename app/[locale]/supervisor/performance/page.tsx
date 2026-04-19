import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { i18n } from '@/lib/validations/i18n';
import { listLocations } from '@/lib/queries/locations';
import { listLatestPerformance } from '@/lib/queries/performance';
import { TierBadge } from '@/components/features/performance/tier-badge';
import { PercentCell } from '@/components/features/performance/metric-cell';

/**
 * Supervisor performance — RLS already restricts the view to:
 *   - location-scope rows for the supervisor's assigned locations
 *   - promoter-scope rows for promoters at those locations
 *   - campaign-scope rows for campaigns those locations belong to
 * No additional filtering needed in app code; the page just renders.
 */
export default async function SupervisorPerformancePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Performance');

  const [locationRows, promoterRows, allLocations] = await Promise.all([
    listLatestPerformance({ scope_kind: 'location', period_kind: 'campaign_to_date' }),
    listLatestPerformance({ scope_kind: 'promoter', period_kind: 'campaign_to_date' }),
    listLocations(null),
  ]);

  const locName = (id: string) => {
    const loc = allLocations.find((l) => l.id === id);
    return loc ? i18n(loc.name_i18n, locale) : id;
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 space-y-8">
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('supervisor.title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('supervisor.description')}</p>
      </div>

      <section>
        <h2 className="text-lg font-semibold">{t('campaign.locations_title')}</h2>
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
                  <TH>{t('table.engagement')}</TH>
                  <TH>{t('table.tier')}</TH>
                  <TH>{t('table.reports')}</TH>
                </TR>
              </THead>
              <TBody>
                {locationRows.map((r) => (
                  <TR key={r.id}>
                    <TD numeric><span dir="ltr">#{r.rank_in_scope ?? '—'}</span></TD>
                    <TD>{locName(r.scope_id)}</TD>
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
                    <TD><span className="font-mono text-xs">{r.scope_id.slice(0, 8)}…</span></TD>
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
