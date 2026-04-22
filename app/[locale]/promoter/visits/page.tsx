import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireRole } from '@/lib/auth/guards';
import { listMyReceivedVisits } from '@/lib/queries/supervisor-visits';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusPill } from '@/components/ui/status-pill';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';

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
          <Table>
            <THead>
              <tr>
                <TH>{t('columns.date')}</TH>
                <TH>{t('columns.supervisor')}</TH>
                <TH>{t('columns.location')}</TH>
                <TH>{t('columns.outcome')}</TH>
                <TH>{t('columns.notes')}</TH>
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
                  <TD>{v.supervisor_name ?? '—'}</TD>
                  <TD>{pickName(v.location_name_i18n, locale)}</TD>
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
                    {v.notes ? (
                      <span className="line-clamp-2 block max-w-md">{v.notes}</span>
                    ) : (
                      '—'
                    )}
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
