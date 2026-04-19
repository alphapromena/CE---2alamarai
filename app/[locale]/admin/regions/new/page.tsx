import { setRequestLocale, getTranslations } from 'next-intl/server';
import { RegionForm } from '@/components/features/admin/region-form';

export default async function NewRegionPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Admin.regions');

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('new_title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('new_description')}</p>
      </div>
      <div className="mt-6">
        <RegionForm mode="create" />
      </div>
    </div>
  );
}
