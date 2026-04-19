import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { StatusPill } from '@/components/ui/status-pill';
import { clientGetCampaign } from '@/lib/queries/client-campaigns';
import { i18n } from '@/lib/validations/i18n';

const STATUS_VARIANT = {
  planned: 'neutral',
  active: 'success',
  completed: 'info',
  cancelled: 'danger',
} as const;

export default async function ClientCampaignDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const campaign = await clientGetCampaign(id);
  if (!campaign) notFound();

  const t = await getTranslations('Client.campaign_detail');
  const tCampaigns = await getTranslations('Client.campaigns');
  const tStatus = await getTranslations('Admin.campaigns.status');
  const isRtl = locale === 'ar';
  const BackIcon = isRtl ? ArrowRight : ArrowLeft;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <Link
        href="/client/campaigns"
        className="inline-flex items-center gap-1 text-xs text-fg-secondary hover:text-fg"
      >
        <BackIcon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
        {tCampaigns('title')}
      </Link>

      <div className="mt-3 flex items-end justify-between border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-semibold">{i18n(campaign.name_i18n, locale)}</h1>
          <p className="mt-1 font-mono text-xs tabular-nums text-fg-secondary" dir="ltr">
            {campaign.start_date} → {campaign.end_date}
          </p>
        </div>
        <StatusPill variant={STATUS_VARIANT[campaign.status]} label={tStatus(campaign.status)} />
      </div>

      {campaign.objectives ? (
        <section className="mt-8">
          <h2 className="mb-2 text-lg font-semibold">{t('objectives')}</h2>
          <p className="whitespace-pre-line text-sm text-fg-secondary">{campaign.objectives}</p>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="mb-2 text-lg font-semibold">{t('locations')}</h2>
        {campaign.locations.length === 0 ? (
          <p className="text-sm text-fg-muted">{t('no_locations')}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {campaign.locations.map((loc) => (
              <li
                key={loc.id}
                className="rounded-md border border-border bg-white px-3 py-2 text-sm"
              >
                {i18n(loc.name_i18n, locale)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-lg font-semibold">{t('skus')}</h2>
        {campaign.skus.length === 0 ? (
          <p className="text-sm text-fg-muted">{t('no_skus')}</p>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t('sku_columns.name')}</TH>
                <TH>{t('sku_columns.unit')}</TH>
                <TH numeric>{t('sku_columns.target')}</TH>
                <TH numeric>{t('sku_columns.stock')}</TH>
              </tr>
            </THead>
            <TBody>
              {campaign.skus.map((s) => (
                <TR key={s.id}>
                  <TD>{i18n(s.name_i18n, locale)}</TD>
                  <TD>
                    <span className="text-fg-secondary">{i18n(s.unit_i18n, locale)}</span>
                  </TD>
                  <TD numeric>{s.target}</TD>
                  <TD numeric>{s.stock_allocated}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>
    </div>
  );
}
