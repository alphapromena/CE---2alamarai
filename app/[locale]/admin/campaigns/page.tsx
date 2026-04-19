import { Plus, Pencil, Megaphone } from 'lucide-react';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { StatusPill } from '@/components/ui/status-pill';
import { EmptyState } from '@/components/ui/empty-state';
import { listCampaigns } from '@/lib/queries/campaigns';
import { i18n } from '@/lib/validations/i18n';

const STATUS_VARIANT = {
  planned: 'neutral',
  active: 'success',
  completed: 'info',
  cancelled: 'danger',
} as const;

export default async function AdminCampaignsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const rows = await listCampaigns(null);
  const t = await getTranslations('Admin.campaigns');
  const tStatus = await getTranslations('Admin.campaigns.status');
  const tCommon = await getTranslations('Common');

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="flex items-end justify-between border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="mt-1 text-sm text-fg-secondary">{t('description')}</p>
        </div>
        <Link
          href="/admin/campaigns/new"
          className="inline-flex h-8 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-white hover:bg-accent-hover"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          {t('new_cta')}
        </Link>
      </div>

      <div className="mt-6">
        {rows.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title={t('empty_title')}
            description={t('empty_description')}
            action={
              <Link
                href="/admin/campaigns/new"
                className="inline-flex h-8 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-white hover:bg-accent-hover"
              >
                <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                {t('new_cta')}
              </Link>
            }
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t('columns.name')}</TH>
                <TH>{t('columns.client')}</TH>
                <TH>{t('columns.dates')}</TH>
                <TH>{t('columns.status')}</TH>
                <TH numeric>
                  <span className="sr-only">{tCommon('edit')}</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={row.id}>
                  <TD>
                    <p className="font-medium">{i18n(row.name_i18n, locale)}</p>
                  </TD>
                  <TD>
                    <span className="text-fg-secondary">{row.client_name ?? '—'}</span>
                  </TD>
                  <TD>
                    <span dir="ltr" className="font-mono text-xs tabular-nums text-fg-secondary">
                      {row.start_date} → {row.end_date}
                    </span>
                  </TD>
                  <TD>
                    <StatusPill variant={STATUS_VARIANT[row.status]} label={tStatus(row.status)} />
                  </TD>
                  <TD numeric>
                    <Link
                      href={`/admin/campaigns/${row.id}/edit`}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-secondary hover:bg-bg-hover hover:text-fg"
                      aria-label={tCommon('edit')}
                    >
                      <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                    </Link>
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
