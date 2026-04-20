import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireRole } from '@/lib/auth/guards';
import { clientListCampaigns } from '@/lib/queries/client-campaigns';
import { i18n } from '@/lib/validations/i18n';
import { NewExportForm } from '@/components/features/exports/new-export-form';

export default async function ClientExportsNewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole('client', 'admin');
  const t = await getTranslations('Exports.new');

  const campaigns = await clientListCampaigns();
  const safeLocale: 'ar' | 'en' = locale === 'ar' ? 'ar' : 'en';

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('subtitle_client')}</p>
      </header>
      <div className="pt-6">
        <NewExportForm
          locale={safeLocale}
          role="client"
          campaigns={campaigns.map((c) => ({ id: c.id, label: i18n(c.name_i18n, locale) }))}
          locations={[]}
          skus={[]}
          landingPath="/client/exports"
        />
      </div>
    </div>
  );
}
