import { Boxes, Truck, RotateCcw, ArrowLeftRight, AlertTriangle } from 'lucide-react';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Alert } from '@/components/ui/alert';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { requireRole } from '@/lib/auth/guards';
import { listCampaigns } from '@/lib/queries/campaigns';
import { listCampaignBalances } from '@/lib/queries/stock';
import { listOpenStockAlerts } from '@/lib/queries/alerts';
import { i18n } from '@/lib/validations/i18n';

export default async function SupervisorStockPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ campaign?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;

  const [actor, campaigns, t] = await Promise.all([
    requireRole('supervisor', 'admin'),
    listCampaigns(null),
    getTranslations('Supervisor.stock'),
  ]);

  const activeCampaigns = campaigns.filter(
    (c) => c.status === 'active' || c.status === 'planned',
  );
  const selectedCampaignId = sp.campaign ?? activeCampaigns[0]?.id ?? null;

  const [balances, alerts] = await Promise.all([
    selectedCampaignId ? listCampaignBalances(selectedCampaignId) : Promise.resolve([]),
    selectedCampaignId
      ? listOpenStockAlerts({ campaignId: selectedCampaignId })
      : Promise.resolve([]),
  ]);

  // Focus: supervisor's own rows + any promoter/location in their scope. RLS
  // already scopes the view; we further sort for UX.
  const mine = balances.filter(
    (b) =>
      (b.entity_type === 'supervisor' && b.entity_id === actor.id) ||
      b.entity_type === 'promoter' ||
      b.entity_type === 'location',
  );
  const order = ['supervisor', 'location', 'promoter'] as const;
  mine.sort((a, b) => {
    const oa = order.indexOf(a.entity_type as typeof order[number]);
    const ob = order.indexOf(b.entity_type as typeof order[number]);
    if (oa !== ob) return oa - ob;
    return a.sku_id.localeCompare(b.sku_id);
  });

  const hasCritical = alerts.some((a) => a.severity === 'critical');
  const hasWarning = alerts.some((a) => a.severity === 'warning');

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="flex items-end justify-between border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="mt-1 text-sm text-fg-secondary">{t('description')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="secondary">
            <Link href="/supervisor/stock/reconcile">{t('reconcile_cta')}</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/supervisor/stock/return">
              <RotateCcw className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              {t('return_cta')}
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/supervisor/stock/reallocate">
              <ArrowLeftRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              {t('reallocate_cta')}
            </Link>
          </Button>
          <Button asChild>
            <Link href="/supervisor/stock/distribute">
              <Truck className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              {t('distribute_cta')}
            </Link>
          </Button>
        </div>
      </div>

      {alerts.length > 0 ? (
        <Alert variant={hasCritical ? 'danger' : hasWarning ? 'warning' : 'info'}>
          <AlertTriangle className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          {t('alerts_banner', { count: alerts.length })}
        </Alert>
      ) : null}

      <form method="get" className="mt-6 flex items-center gap-3">
        <label className="text-sm text-fg-secondary">{t('filter_campaign')}</label>
        <Select name="campaign" defaultValue={selectedCampaignId ?? ''} className="max-w-xs">
          {activeCampaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {i18n(c.name_i18n, locale)}
            </option>
          ))}
        </Select>
        <Button type="submit" size="sm" variant="secondary">
          {t('apply')}
        </Button>
      </form>

      <div className="mt-6">
        {mine.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title={t('empty_title')}
            description={t('empty_description')}
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t('columns.entity')}</TH>
                <TH>{t('columns.sku')}</TH>
                <TH numeric>{t('columns.in')}</TH>
                <TH numeric>{t('columns.out')}</TH>
                <TH numeric>{t('columns.balance')}</TH>
              </tr>
            </THead>
            <TBody>
              {mine.map((b) => (
                <TR key={`${b.entity_type}|${b.entity_id ?? '~'}|${b.sku_id}`}>
                  <TD>
                    <span className="text-xs font-medium uppercase tracking-wide text-fg-secondary">
                      {t(`entity_${b.entity_type}`)}
                    </span>
                    <span className="ms-2 font-mono text-xs text-fg-muted">
                      {b.entity_id ? b.entity_id.slice(0, 8) : '—'}
                    </span>
                  </TD>
                  <TD>
                    <span className="font-mono text-xs text-fg-muted">
                      {b.sku_id.slice(0, 8)}
                    </span>
                  </TD>
                  <TD numeric>
                    <span className="font-mono text-xs tabular-nums">{b.total_in}</span>
                  </TD>
                  <TD numeric>
                    <span className="font-mono text-xs tabular-nums">{b.total_out}</span>
                  </TD>
                  <TD numeric>
                    <span
                      className={`font-mono text-xs font-semibold tabular-nums ${
                        b.balance < 0
                          ? 'text-danger'
                          : b.balance === 0
                            ? 'text-fg-muted'
                            : b.balance <= 10
                              ? 'text-warning'
                              : ''
                      }`}
                    >
                      {b.balance}
                    </span>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}
