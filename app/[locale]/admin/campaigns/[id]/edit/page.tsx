import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { CampaignForm } from '@/components/features/admin/campaign-form';
import { CampaignLocationsManager } from '@/components/features/admin/campaign-locations-manager';
import { CampaignSkusManager } from '@/components/features/admin/campaign-skus-manager';
import {
  getCampaign,
  listCampaignLocationIds,
  listCampaignSkus,
  listClientsForSelect,
} from '@/lib/queries/campaigns';
import { listAssignableLocations } from '@/lib/queries/assignments';

export default async function EditCampaignPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const [campaign, clients, selectedLocationIds, locations, skus] = await Promise.all([
    getCampaign(id),
    listClientsForSelect(),
    listCampaignLocationIds(id),
    listAssignableLocations(),
    listCampaignSkus(id),
  ]);

  if (!campaign) notFound();

  const t = await getTranslations('Admin.campaigns');

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('edit_title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('edit_description')}</p>
      </div>

      <div className="mt-8 space-y-10">
        <section>
          <h2 className="mb-4 text-lg font-semibold">{t('details_section')}</h2>
          <CampaignForm mode="edit" initial={campaign} clients={clients} />
        </section>

        <section>
          <h2 className="mb-1 text-lg font-semibold">{t('locations_panel.title')}</h2>
          <p className="mb-4 text-sm text-fg-secondary">{t('locations_panel.description')}</p>
          <CampaignLocationsManager
            campaignId={campaign.id}
            selected={selectedLocationIds}
            available={locations}
            locale={locale}
          />
        </section>

        <section>
          <h2 className="mb-1 text-lg font-semibold">{t('skus_panel.title')}</h2>
          <p className="mb-4 text-sm text-fg-secondary">{t('skus_panel.description')}</p>
          <CampaignSkusManager campaignId={campaign.id} rows={skus} locale={locale} />
        </section>
      </div>
    </div>
  );
}
