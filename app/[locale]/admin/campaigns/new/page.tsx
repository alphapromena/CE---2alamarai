import { setRequestLocale, getTranslations } from 'next-intl/server';
import { CampaignForm } from '@/components/features/admin/campaign-form';
import { listClientsForSelect } from '@/lib/queries/campaigns';

export default async function NewCampaignPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const clients = await listClientsForSelect();
  const t = await getTranslations('Admin.campaigns');

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('new_title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('new_description')}</p>
      </div>
      <div className="mt-6">
        <CampaignForm mode="create" clients={clients} />
      </div>
    </div>
  );
}
