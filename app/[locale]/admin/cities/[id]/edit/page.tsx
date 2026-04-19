import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { CityForm } from '@/components/features/admin/city-form';
import { getCity } from '@/lib/queries/cities';
import { listRegions } from '@/lib/queries/regions';

export default async function EditCityPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const [row, regions] = await Promise.all([getCity(id), listRegions()]);
  if (!row) notFound();
  const t = await getTranslations('Admin.cities');

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('edit_title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('edit_description')}</p>
      </div>
      <div className="mt-6">
        <CityForm mode="edit" initial={row} regions={regions} locale={locale} />
      </div>
    </div>
  );
}
