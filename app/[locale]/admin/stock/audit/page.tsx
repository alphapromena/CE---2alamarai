import { ClipboardList, Pencil } from 'lucide-react';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { StatusPill } from '@/components/ui/status-pill';
import { EmptyState } from '@/components/ui/empty-state';
import { listCampaigns } from '@/lib/queries/campaigns';
import { listMovements } from '@/lib/queries/stock';
import type { StockMovementKind } from '@/lib/stock/ledger';
import { i18n } from '@/lib/validations/i18n';

const KIND_VARIANT: Record<StockMovementKind, 'neutral' | 'success' | 'info' | 'warning' | 'danger'> = {
  allocation: 'success',
  distribution: 'info',
  reallocation: 'warning',
  usage: 'neutral',
  return: 'neutral',
  correction: 'danger',
};

const KINDS: StockMovementKind[] = [
  'allocation',
  'distribution',
  'reallocation',
  'usage',
  'return',
  'correction',
];

export default async function AdminStockAuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ campaign?: string; kind?: StockMovementKind }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;

  const [t, tKind, campaigns] = await Promise.all([
    getTranslations('Admin.stock'),
    getTranslations('Admin.stock.kinds'),
    listCampaigns(null),
  ]);

  const campaignFilter = sp.campaign || null;
  const kindFilter = (KINDS as string[]).includes(sp.kind ?? '')
    ? ((sp.kind as StockMovementKind) ?? null)
    : null;

  const movements = await listMovements({
    campaignId: campaignFilter,
    kind: kindFilter,
    limit: 200,
  });

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="flex items-end justify-between border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('audit_title')}</h1>
          <p className="mt-1 text-sm text-fg-secondary">{t('audit_description')}</p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/admin/stock">{t('back_to_overview')}</Link>
        </Button>
      </div>

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-fg-secondary">{t('filter_campaign')}</label>
          <Select name="campaign" defaultValue={campaignFilter ?? ''}>
            <option value="">{t('filter_all')}</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {i18n(c.name_i18n, locale)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="text-xs text-fg-secondary">{t('filter_kind')}</label>
          <Select name="kind" defaultValue={kindFilter ?? ''}>
            <option value="">{t('filter_all')}</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {tKind(k)}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" size="sm" variant="secondary">
          {t('apply')}
        </Button>
      </form>

      <div className="mt-6">
        {movements.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={t('audit_empty_title')}
            description={t('audit_empty_description')}
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t('columns.when')}</TH>
                <TH>{t('columns.kind')}</TH>
                <TH>{t('columns.campaign')}</TH>
                <TH>{t('columns.flow')}</TH>
                <TH numeric>{t('columns.qty')}</TH>
                <TH>{t('columns.actor')}</TH>
                <TH numeric>
                  <span className="sr-only">{t('columns.actions')}</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {movements.map((m) => {
                const created = new Date(m.created_at);
                return (
                  <TR key={m.id}>
                    <TD>
                      <span
                        dir="ltr"
                        className="font-mono text-xs tabular-nums text-fg-secondary"
                      >
                        {created.toISOString().replace('T', ' ').slice(0, 16)}
                      </span>
                    </TD>
                    <TD>
                      <StatusPill
                        variant={KIND_VARIANT[m.movement_kind]}
                        label={tKind(m.movement_kind)}
                      />
                    </TD>
                    <TD>
                      <span className="text-xs">
                        {i18n(m.campaign_name_i18n, locale) || m.campaign_id.slice(0, 8)}
                      </span>
                    </TD>
                    <TD>
                      <span className="text-xs text-fg-secondary">
                        {t(`entity_${m.from_entity_type}`)} →{' '}
                        {t(`entity_${m.to_entity_type}`)}
                      </span>
                      <br />
                      <span className="font-mono text-xs text-fg-muted">
                        {m.from_entity_id ? m.from_entity_id.slice(0, 8) : '—'} →{' '}
                        {m.to_entity_id ? m.to_entity_id.slice(0, 8) : '—'}
                      </span>
                    </TD>
                    <TD numeric>
                      <span className="font-mono text-xs font-semibold tabular-nums">
                        {m.quantity}
                      </span>
                    </TD>
                    <TD>
                      <span className="text-xs">{m.user_name ?? m.user_id.slice(0, 8)}</span>
                    </TD>
                    <TD numeric>
                      {m.movement_kind !== 'correction' && m.correction_of === null ? (
                        <Link
                          href={`/admin/stock/audit/${m.id}/correct`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-secondary hover:bg-bg-hover hover:text-fg"
                          aria-label={t('correct_cta')}
                          title={t('correct_cta')}
                        >
                          <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                        </Link>
                      ) : (
                        <span className="text-xs text-fg-muted">—</span>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}
