import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { isImportTarget } from '@/lib/imports/templates';
import { BulkImportForm } from '@/components/features/admin/bulk-import-form';

export default async function BulkImportTargetPage({
  params,
}: {
  params: Promise<{ locale: string; target: string }>;
}) {
  const { locale, target } = await params;
  setRequestLocale(locale);
  if (!isImportTarget(target)) {
    notFound();
  }
  const t = await getTranslations('Admin.imports');

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="border-b border-border pb-6">
        <Link
          href="/admin/imports"
          className="text-sm text-fg-secondary hover:text-fg"
        >
          ← {t('back_to_imports')}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{t(`form_title_${target}`)}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t(`form_description_${target}`)}</p>
      </div>

      <div className="mt-6">
        <BulkImportForm target={target} />
      </div>
    </div>
  );
}
