import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Plus } from 'lucide-react';
import { requireRole } from '@/lib/auth/guards';
import { listSupervisorVisits } from '@/lib/queries/supervisor-visits';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusPill } from '@/components/ui/status-pill';
import { VisitPhotoButton } from './visit-photo-button';

function pickName(
  n: { ar?: string; en?: string } | null,
  locale: string,
): string {
  if (!n) return '';
  if (locale === 'ar') return n.ar ?? n.en ?? '';
  return n.en ?? n.ar ?? '';
}

function formatTs(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale === 'ar' ? 'ar-JO' : 'en-JO', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export default async function SupervisorVisitsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole('supervisor');
  const t = await getTranslations('Supervisor.visits');
  const tCommon = await getTranslations('Common');

  const visits = await listSupervisorVisits({ limit: 100 });

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex items-start justify-between gap-3 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="mt-1 text-sm text-fg-secondary">{t('description')}</p>
        </div>
        <Button asChild>
          <Link href={`/${locale}/supervisor/visits/new`}>
            <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            {t('new_cta')}
          </Link>
        </Button>
      </header>

      <div className="pt-6">
        {visits.length === 0 ? (
          <EmptyState title={t('empty_title')} description={t('empty_description')} />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-white">
            <table className="w-full">
              <thead className="bg-bg-subtle text-xs font-medium uppercase tracking-wide text-fg-secondary">
                <tr>
                  <th className="px-4 py-2.5 text-start">{t('columns.visited_at')}</th>
                  <th className="px-4 py-2.5 text-start">{t('columns.campaign')}</th>
                  <th className="px-4 py-2.5 text-start">{t('columns.location')}</th>
                  <th className="px-4 py-2.5 text-end">{t('columns.distance')}</th>
                  <th className="px-4 py-2.5 text-start">{t('columns.outcome')}</th>
                  <th className="px-4 py-2.5 text-start">{t('columns.notes')}</th>
                  <th className="px-4 py-2.5 text-end">{t('columns.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {visits.map((v) => (
                  <tr key={v.id} className="border-t border-border hover:bg-bg-subtle/50">
                    <td className="px-4 py-3 text-sm">
                      <span dir="ltr" className="tabular-nums">
                        {formatTs(v.visited_at, locale)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {pickName(v.campaign_name_i18n, locale)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {pickName(v.location_name_i18n, locale)}
                    </td>
                    <td className="px-4 py-3 text-end text-sm">
                      <div className="flex items-center justify-end gap-1.5">
                        <span dir="ltr" className="tabular-nums">
                          {v.distance_m} m
                        </span>
                        <StatusPill
                          variant={v.is_within_geofence ? 'success' : 'warning'}
                          label={v.is_within_geofence ? t('within_geofence') : t('outside_geofence')}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <StatusPill
                        variant={
                          v.outcome === 'ok'
                            ? 'success'
                            : v.outcome === 'issue_found'
                              ? 'warning'
                              : 'neutral'
                        }
                        label={t(`outcome_${v.outcome}` as Parameters<typeof t>[0])}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-fg-secondary">
                      {v.notes ? <span className="line-clamp-2 block max-w-md">{v.notes}</span> : '—'}
                    </td>
                    <td className="px-4 py-3 text-end">
                      <VisitPhotoButton
                        path={v.photo_path}
                        label={t('view_photo')}
                        dialogTitle={t('photo_open')}
                        closeLabel={tCommon('cancel')}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
