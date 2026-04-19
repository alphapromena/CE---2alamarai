import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireRole } from '@/lib/auth/guards';
import { listMyTasks } from '@/lib/queries/tasks';
import { EmptyState } from '@/components/ui/empty-state';
import { ClipboardList } from 'lucide-react';
import { PromoterTasksClient } from './tasks-client';

export default async function PromoterTasksPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole('promoter');
  const t = await getTranslations('Promoter.tasks');

  const [open, done] = await Promise.all([
    listMyTasks({ status: ['open', 'in_progress'] }),
    listMyTasks({ status: ['done', 'cancelled'], limit: 20 }),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('subtitle')}</p>
      </header>

      <div className="space-y-8 pt-6">
        <section>
          <h2 className="mb-3 text-sm font-medium text-fg-secondary">{t('open_heading')}</h2>
          {open.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title={t('empty_open_title')}
              description={t('empty_open_description')}
            />
          ) : (
            <PromoterTasksClient locale={locale} tasks={open} allowComplete />
          )}
        </section>

        {done.length > 0 ? (
          <section>
            <h2 className="mb-3 text-sm font-medium text-fg-secondary">{t('done_heading')}</h2>
            <PromoterTasksClient locale={locale} tasks={done} allowComplete={false} />
          </section>
        ) : null}
      </div>
    </div>
  );
}
