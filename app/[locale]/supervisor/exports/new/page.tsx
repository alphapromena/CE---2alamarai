import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireRole } from '@/lib/auth/guards';
import {
  listVisibleCampaignsForSupervisor,
  listVisibleLocationsForSupervisor,
} from '@/lib/queries/supervisor-scope';
import { i18n } from '@/lib/validations/i18n';
import { NewExportForm } from '@/components/features/exports/new-export-form';

export default async function SupervisorExportsNewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole('supervisor', 'admin');
  const t = await getTranslations('Exports.new');

  const [campaigns, locations] = await Promise.all([
    listVisibleCampaignsForSupervisor(),
    listVisibleLocationsForSupervisor(),
  ]);
  const safeLocale: 'ar' | 'en' = locale === 'ar' ? 'ar' : 'en';

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('subtitle')}</p>
      </header>
      <div className="pt-6">
        <NewExportForm
          locale={safeLocale}
          role="supervisor"
          campaigns={campaigns.map((c) => ({ id: c.id, label: i18n(c.name_i18n, locale) }))}
          locations={locations.map((l) => ({ id: l.id, label: i18n(l.name_i18n, locale) }))}
          skus={[]}
          landingPath="/supervisor/exports"
        />
      </div>
    </div>
  );
}
