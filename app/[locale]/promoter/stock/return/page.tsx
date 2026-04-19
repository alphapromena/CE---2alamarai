import { setRequestLocale, getTranslations } from 'next-intl/server';
import { ReturnToSupervisorForm } from '@/components/features/promoter/return-to-supervisor-form';
import { requireRole } from '@/lib/auth/guards';
import { listCampaigns } from '@/lib/queries/campaigns';
import {
  listSupervisors,
  listLocationsLite,
  listCampaignSkusAdmin,
  type EntityLabelRow,
} from '@/lib/queries/stock';

export default async function PromoterReturnPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const actor = await requireRole('promoter');
  const [campaigns, supervisors, allLocations, t] = await Promise.all([
    listCampaigns(null),
    listSupervisors(),
    listLocationsLite(),
    getTranslations('Promoter.stock'),
  ]);
  const activeCampaigns = campaigns.filter((c) => c.status === 'active' || c.status === 'planned');
  const myLocations = allLocations.filter((l) => actor.assigned_locations.includes(l.id));

  const skusByCampaign: Record<string, EntityLabelRow[]> = {};
  await Promise.all(
    activeCampaigns.map(async (c) => {
      skusByCampaign[c.id] = await listCampaignSkusAdmin(c.id);
    }),
  );

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('return_title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('return_description')}</p>
      </div>
      <div className="mt-6">
        <ReturnToSupervisorForm
          locale={locale}
          campaigns={activeCampaigns}
          supervisors={supervisors}
          locations={myLocations}
          skusByCampaign={skusByCampaign}
        />
      </div>
    </div>
  );
}
