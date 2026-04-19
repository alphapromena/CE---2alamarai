import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { LocationForm } from '@/components/features/admin/location-form';
import { getLocation, listAllCitiesForSelect } from '@/lib/queries/locations';

export default async function EditLocationPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const [row, cities] = await Promise.all([getLocation(id), listAllCitiesForSelect()]);
  if (!row) notFound();
  const t = await getTranslations('Admin.locations');

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('edit_title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('edit_description')}</p>
      </div>
      <div className="mt-6">
        <LocationForm mode="edit" initial={row} cities={cities} locale={locale} />
      </div>
    </div>
  );
}
