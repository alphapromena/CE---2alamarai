import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireRole } from '@/lib/auth/guards';
import {
  listSupervisorVisitTargets,
  type SupervisorCampaignLocation,
} from '@/lib/queries/supervisor-scope';
import { EmptyState } from '@/components/ui/empty-state';
import { CalendarX } from 'lucide-react';
import { NewVisitClient } from './new-visit-client';

export default async function NewSupervisorVisitPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole('supervisor');
  const t = await getTranslations('Supervisor.visits');

  const targets = await listSupervisorVisitTargets();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('new_title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('new_description')}</p>
      </header>

      <div className="pt-6">
        {targets.length === 0 ? (
          <EmptyState
            icon={CalendarX}
            title={t('no_targets_title')}
            description={t('no_targets_description')}
          />
        ) : (
          <NewVisitClient
            locale={locale}
            targets={targets as SupervisorCampaignLocation[]}
          />
        )}
      </div>
    </div>
  );
}
