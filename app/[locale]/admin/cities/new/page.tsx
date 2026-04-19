import { setRequestLocale, getTranslations } from 'next-intl/server';
import { CityForm } from '@/components/features/admin/city-form';
import { listRegions } from '@/lib/queries/regions';

export default async function NewCityPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const regions = await listRegions();
  const t = await getTranslations('Admin.cities');

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('new_title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('new_description')}</p>
      </div>
      <div className="mt-6">
        <CityForm mode="create" regions={regions} locale={locale} />
      </div>
    </div>
  );
}
