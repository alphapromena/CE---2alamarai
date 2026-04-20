import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Plus } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { requireRole } from '@/lib/auth/guards';
import { listExportJobs } from '@/lib/queries/exports';
import { ExportsList } from '@/components/features/exports/exports-list';

export default async function ClientExportsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole('client', 'admin');
  const t = await getTranslations('Exports');

  const rows = await listExportJobs(50);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex items-end justify-between border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="mt-1 text-sm text-fg-secondary">{t('subtitle_client')}</p>
        </div>
        <Link
          href="/client/exports/new"
          className="inline-flex h-8 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-white hover:bg-accent-hover"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          {t('new_cta')}
        </Link>
      </header>
      <div className="pt-6">
        <ExportsList rows={rows} locale={locale} />
      </div>
    </div>
  );
}
