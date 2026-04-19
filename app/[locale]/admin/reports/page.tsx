import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireAdmin } from '@/lib/auth/guards';
import { listReports } from '@/lib/queries/reports';
import { ReportsTable } from '@/components/features/reports/reports-table';

type Search = {
  status?: string;
  from?: string;
  to?: string;
};

export default async function AdminReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Search>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin();
  const t = await getTranslations('Admin.reports');
  const ts = await getTranslations('Supervisor.reports');
  const sp = await searchParams;

  const statusParam = sp.status ?? 'all';
  const statusFilter =
    statusParam === 'all'
      ? undefined
      : ([statusParam] as ('draft' | 'submitted' | 'approved' | 'rejected')[]);

  const rows = await listReports({
    status: statusFilter,
    fromDate: sp.from ?? null,
    toDate: sp.to ?? null,
    limit: 500,
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('subtitle')}</p>
      </header>

      <div className="flex flex-wrap items-end gap-3 border-b border-border py-4 text-sm">
        {(['all', 'submitted', 'approved', 'rejected', 'draft'] as const).map((s) => (
          <a
            key={s}
            href={`?status=${s}`}
            className={`rounded-md border px-3 py-1 ${
              statusParam === s
                ? 'border-accent bg-accent text-white'
                : 'border-border bg-white hover:bg-bg-hover'
            }`}
          >
            {ts(`filter.${s}`)}
          </a>
        ))}
      </div>

      <div className="pt-6">
        <ReportsTable
          locale={locale}
          rows={rows}
          detailHrefPrefix={`/${locale}/supervisor/reports`}
          emptyMessage={ts('empty')}
        />
      </div>
    </div>
  );
}
