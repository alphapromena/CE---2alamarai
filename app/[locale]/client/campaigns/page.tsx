import { Megaphone } from 'lucide-react';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { StatusPill } from '@/components/ui/status-pill';
import { EmptyState } from '@/components/ui/empty-state';
import { clientListCampaigns } from '@/lib/queries/client-campaigns';
import { i18n } from '@/lib/validations/i18n';

const STATUS_VARIANT = {
  planned: 'neutral',
  active: 'success',
  completed: 'info',
  cancelled: 'danger',
} as const;

export default async function ClientCampaignsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const rows = await clientListCampaigns();
  const t = await getTranslations('Client.campaigns');
  const tStatus = await getTranslations('Admin.campaigns.status');

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('description')}</p>
      </div>

      <div className="mt-6">
        {rows.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title={t('empty_title')}
            description={t('empty_description')}
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t('columns.name')}</TH>
                <TH>{t('columns.dates')}</TH>
                <TH>{t('columns.status')}</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={row.id}>
                  <TD>
                    <Link
                      href={`/client/campaigns/${row.id}`}
                      className="font-medium text-accent hover:underline"
                    >
                      {i18n(row.name_i18n, locale)}
                    </Link>
                  </TD>
                  <TD>
                    <span dir="ltr" className="font-mono text-xs tabular-nums text-fg-secondary">
                      {row.start_date} → {row.end_date}
                    </span>
                  </TD>
                  <TD>
                    <StatusPill variant={STATUS_VARIANT[row.status]} label={tStatus(row.status)} />
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
