import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { CorrectMovementForm } from '@/components/features/admin/correct-movement-form';
import { getMovement } from '@/lib/queries/stock';

export default async function AdminStockCorrectPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const [original, t] = await Promise.all([
    getMovement(id),
    getTranslations('Admin.stock.correct'),
  ]);
  if (!original) notFound();
  if (original.movement_kind === 'correction' || original.correction_of !== null) {
    notFound(); // corrections cannot themselves be corrected (RPC enforces this too)
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('description')}</p>
      </div>
      <div className="mt-6">
        <CorrectMovementForm original={original} />
      </div>
    </div>
  );
}
