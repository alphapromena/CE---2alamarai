import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { ShiftForm } from '@/components/features/admin/shift-form';
import { getShift, listShiftEligiblePairs } from '@/lib/queries/shifts';

export default async function EditShiftPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const [row, pairs] = await Promise.all([getShift(id), listShiftEligiblePairs()]);
  if (!row) notFound();
  const t = await getTranslations('Admin.shifts');
  const tDays = await getTranslations('Admin.shifts.day_short');

  const dayLabels: [string, string, string, string, string, string, string] = [
    tDays('sun'),
    tDays('mon'),
    tDays('tue'),
    tDays('wed'),
    tDays('thu'),
    tDays('fri'),
    tDays('sat'),
  ];

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('edit_title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('edit_description')}</p>
      </div>
      <div className="mt-6">
        <ShiftForm mode="edit" initial={row} pairs={pairs} locale={locale} dayLabels={dayLabels} />
      </div>
    </div>
  );
}
