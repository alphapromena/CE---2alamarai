import { setRequestLocale, getTranslations } from 'next-intl/server';
import { LocationForm } from '@/components/features/admin/location-form';
import { listAllCitiesForSelect } from '@/lib/queries/locations';

export default async function NewLocationPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const cities = await listAllCitiesForSelect();
  const t = await getTranslations('Admin.locations');

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('new_title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('new_description')}</p>
      </div>
      <div className="mt-6">
        <LocationForm mode="create" cities={cities} locale={locale} />
      </div>
    </div>
  );
}
