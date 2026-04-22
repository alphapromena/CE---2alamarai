import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Plus } from 'lucide-react';
import { requireRole } from '@/lib/auth/guards';
import { listSupervisorVisits } from '@/lib/queries/supervisor-visits';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusPill } from '@/components/ui/status-pill';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
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
          <Table>
            <THead>
              <tr>
                <TH>{t('columns.visited_at')}</TH>
                <TH>{t('columns.campaign')}</TH>
                <TH>{t('columns.location')}</TH>
                <TH>{t('columns.promoter')}</TH>
                <TH numeric>{t('columns.distance')}</TH>
                <TH>{t('columns.outcome')}</TH>
                <TH>{t('columns.notes')}</TH>
                <TH numeric>{t('columns.actions')}</TH>
              </tr>
            </THead>
            <TBody>
              {visits.map((v) => (
                <TR key={v.id}>
                  <TD>
                    <span dir="ltr" className="tabular-nums">
                      {formatTs(v.visited_at, locale)}
                    </span>
                  </TD>
                  <TD>{pickName(v.campaign_name_i18n, locale)}</TD>
                  <TD>{pickName(v.location_name_i18n, locale)}</TD>
                  <TD>
                    {v.promoter_id ? (
                      <Link
                        href={`/${locale}/supervisor/promoters/${v.promoter_id}`}
                        className="text-accent transition-colors duration-150 hover:text-accent-hover hover:underline"
                      >
                        {v.promoter_name ?? v.promoter_id.slice(0, 8)}
                      </Link>
                    ) : (
                      <span className="text-fg-muted">—</span>
                    )}
                  </TD>
                  <TD numeric>
                    <div className="flex items-center justify-end gap-1.5">
                      <span dir="ltr" className="tabular-nums">
                        {v.distance_m} m
                      </span>
                      <StatusPill
                        variant={v.is_within_geofence ? 'success' : 'warning'}
                        label={v.is_within_geofence ? t('within_geofence') : t('outside_geofence')}
                      />
                    </div>
                  </TD>
                  <TD>
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
                  </TD>
                  <TD className="text-fg-secondary">
                    {v.notes ? <span className="line-clamp-2 block max-w-md">{v.notes}</span> : '—'}
                  </TD>
                  <TD numeric>
                    <VisitPhotoButton
                      path={v.photo_path}
                      label={t('view_photo')}
                      dialogTitle={t('photo_open')}
                      closeLabel={tCommon('cancel')}
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}
