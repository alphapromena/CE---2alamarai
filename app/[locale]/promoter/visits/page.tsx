import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireRole } from '@/lib/auth/guards';
import { listMyReceivedVisits } from '@/lib/queries/supervisor-visits';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusPill } from '@/components/ui/status-pill';

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

function pickName(n: { ar?: string; en?: string } | null, locale: string): string {
  if (!n) return '';
  if (locale === 'ar') return n.ar ?? n.en ?? '';
  return n.en ?? n.ar ?? '';
}

export default async function PromoterVisitsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole('promoter');
  const t = await getTranslations('FieldVisits');

  const visits = await listMyReceivedVisits(50);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('promoter_visits_heading')}</h1>
      </header>

      <div className="pt-6">
        {visits.length === 0 ? (
          <EmptyState title={t('promoter_visits_empty')} />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-white">
            <table className="w-full">
              <thead className="bg-bg-subtle text-xs font-medium uppercase tracking-wide text-fg-secondary">
                <tr>
                  <th className="px-4 py-2.5 text-start">{t('columns.date')}</th>
                  <th className="px-4 py-2.5 text-start">{t('columns.supervisor')}</th>
                  <th className="px-4 py-2.5 text-start">{t('columns.location')}</th>
                  <th className="px-4 py-2.5 text-start">{t('columns.outcome')}</th>
                  <th className="px-4 py-2.5 text-start">{t('columns.notes')}</th>
                </tr>
              </thead>
              <tbody>
                {visits.map((v) => (
                  <tr key={v.id} className="border-t border-border">
                    <td className="px-4 py-3 text-sm" dir="ltr">
                      {formatTs(v.visited_at, locale)}
                    </td>
                    <td className="px-4 py-3 text-sm">{v.supervisor_name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm">
                      {pickName(v.location_name_i18n, locale)}
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
                      {v.notes ? (
                        <span className="line-clamp-2 block max-w-md">{v.notes}</span>
                      ) : (
                        '—'
                      )}
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
