import { Plus, Boxes, ClipboardList } from 'lucide-react';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { listCampaigns } from '@/lib/queries/campaigns';
import { listCampaignBalances } from '@/lib/queries/stock';
import { i18n } from '@/lib/validations/i18n';

function entityTypeLabelKey(t: 'warehouse' | 'supervisor' | 'promoter' | 'location' | 'consumer'): string {
  return `entity_${t}`;
}

export default async function AdminStockPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ campaign?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;

  const [t, tStock, campaigns] = await Promise.all([
    getTranslations('Admin.stock'),
    getTranslations('Admin.stock'),
    listCampaigns(null),
  ]);

  const selectedCampaignId = sp.campaign ?? campaigns[0]?.id ?? null;
  const selectedCampaign = selectedCampaignId
    ? campaigns.find((c) => c.id === selectedCampaignId) ?? null
    : null;

  const balances = selectedCampaignId
    ? await listCampaignBalances(selectedCampaignId)
    : [];

  // Sort for UX: warehouse → supervisor → location → promoter → consumer.
  const order = ['warehouse', 'supervisor', 'location', 'promoter', 'consumer'] as const;
  const sortedBalances = [...balances].sort((a, b) => {
    const oa = order.indexOf(a.entity_type);
    const ob = order.indexOf(b.entity_type);
    if (oa !== ob) return oa - ob;
    return a.sku_id.localeCompare(b.sku_id);
  });

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="flex items-end justify-between border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="mt-1 text-sm text-fg-secondary">{t('description')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="secondary">
            <Link href="/admin/stock/audit">
              <ClipboardList className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              {t('audit_cta')}
            </Link>
          </Button>
          <Button asChild>
            <Link href="/admin/stock/new">
              <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              {t('allocate_cta')}
            </Link>
          </Button>
        </div>
      </div>

      <div className="mt-6">
        <form className="flex items-center gap-3" method="get">
          <label className="text-sm text-fg-secondary">{t('filter_campaign')}</label>
          <Select
            name="campaign"
            defaultValue={selectedCampaignId ?? ''}
            className="max-w-xs"
          >
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {i18n(c.name_i18n, locale)}
              </option>
            ))}
          </Select>
          <Button type="submit" size="sm" variant="secondary">
            {tStock('apply')}
          </Button>
        </form>
      </div>

      <div className="mt-6">
        {!selectedCampaign ? (
          <EmptyState
            icon={Boxes}
            title={t('empty_no_campaign_title')}
            description={t('empty_no_campaign_description')}
          />
        ) : sortedBalances.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title={t('empty_title')}
            description={t('empty_description')}
            action={
              <Button asChild>
                <Link href="/admin/stock/new">
                  <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  {t('allocate_cta')}
                </Link>
              </Button>
            }
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t('columns.entity')}</TH>
                <TH>{t('columns.sku')}</TH>
                <TH numeric>{t('columns.total_in')}</TH>
                <TH numeric>{t('columns.total_out')}</TH>
                <TH numeric>{t('columns.balance')}</TH>
              </tr>
            </THead>
            <TBody>
              {sortedBalances.map((b) => (
                <TR key={`${b.entity_type}|${b.entity_id ?? '~'}|${b.sku_id}`}>
                  <TD>
                    <span className="text-xs font-medium uppercase tracking-wide text-fg-secondary">
                      {t(entityTypeLabelKey(b.entity_type))}
                    </span>
                    <span className="ms-2 font-mono text-xs text-fg-muted">
                      {b.entity_id ? b.entity_id.slice(0, 8) : '—'}
                    </span>
                  </TD>
                  <TD>
                    <span className="font-mono text-xs text-fg-muted">{b.sku_id.slice(0, 8)}</span>
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
                        b.balance < 0 ? 'text-danger' : b.balance === 0 ? 'text-fg-muted' : ''
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
