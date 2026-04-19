import { setRequestLocale, getTranslations } from 'next-intl/server';
import { AllocateStockForm } from '@/components/features/admin/allocate-stock-form';
import { listCampaigns } from '@/lib/queries/campaigns';
import {
  listSupervisors,
  listCampaignSkusAdmin,
  type EntityLabelRow,
} from '@/lib/queries/stock';

export default async function AdminStockAllocatePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [campaigns, supervisors, t] = await Promise.all([
    listCampaigns(null),
    listSupervisors(),
    getTranslations('Admin.stock'),
  ]);
  const activeCampaigns = campaigns.filter((c) => c.status === 'active' || c.status === 'planned');

  // Preload skus for every active campaign so the <Select> can swap instantly
  // when the user picks a campaign. At most ~12 campaigns in practice.
  const skusByCampaign: Record<string, EntityLabelRow[]> = {};
  await Promise.all(
    activeCampaigns.map(async (c) => {
      skusByCampaign[c.id] = await listCampaignSkusAdmin(c.id);
    }),
  );

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('allocate_title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('allocate_description')}</p>
      </div>
      <div className="mt-6">
        <AllocateStockForm
          locale={locale}
          campaigns={activeCampaigns}
          supervisors={supervisors}
          skusByCampaign={skusByCampaign}
        />
      </div>
    </div>
  );
}
