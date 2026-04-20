import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireRole } from '@/lib/auth/guards';
import {
  listPromotersAtLocations,
  listSupervisorVisitTargets,
  type LocationPromoter,
  type SupervisorCampaignLocation,
} from '@/lib/queries/supervisor-scope';
import { EmptyState } from '@/components/ui/empty-state';
import { CalendarX } from 'lucide-react';
import { NewVisitClient } from './new-visit-client';

export default async function NewSupervisorVisitPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requireRole('supervisor');
  const t = await getTranslations('Supervisor.visits');

  const targets = await listSupervisorVisitTargets();
  const uniqueLocationIds = Array.from(new Set(targets.map((t) => t.location_id)));
  const promoters = await listPromotersAtLocations(uniqueLocationIds);

  const rawPromoterId = sp['promoter_id'];
  const rawLocationId = sp['location_id'];
  const initialPromoterId =
    typeof rawPromoterId === 'string' && rawPromoterId.length > 0 ? rawPromoterId : null;
  const initialLocationId =
    typeof rawLocationId === 'string' && rawLocationId.length > 0 ? rawLocationId : null;

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
            promoters={promoters as LocationPromoter[]}
            initialPromoterId={initialPromoterId}
            initialLocationId={initialLocationId}
          />
        )}
      </div>
    </div>
  );
}
