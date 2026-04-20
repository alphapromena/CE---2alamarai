import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireAdmin } from '@/lib/auth/guards';
import { listSupervisorVisits } from '@/lib/queries/supervisor-visits';
import { listAdminUsers } from '@/lib/auth/users-query';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusPill } from '@/components/ui/status-pill';
import { VisitPhotoButton } from '@/app/[locale]/supervisor/visits/visit-photo-button';

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

function normalizeDateParam(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  // Accept YYYY-MM-DD; reject anything else to avoid injection into Supabase's
  // .gte / .lte filters.
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

export default async function AdminFieldVisitsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requireAdmin();
  const t = await getTranslations('FieldVisits');
  const tVisits = await getTranslations('Supervisor.visits');
  const tCommon = await getTranslations('Common');

  const supervisorId = typeof sp['supervisor_id'] === 'string' ? sp['supervisor_id'] : '';
  const promoterId = typeof sp['promoter_id'] === 'string' ? sp['promoter_id'] : '';
  const from = normalizeDateParam(sp['from']);
  const to = normalizeDateParam(sp['to']);

  const [visits, supervisors, promoters] = await Promise.all([
    listSupervisorVisits({
      supervisorId: supervisorId || undefined,
      promoterId: promoterId || undefined,
      fromDate: from ?? undefined,
      toDate: to ? `${to}T23:59:59.999Z` : undefined,
      limit: 200,
    }),
    listAdminUsers('supervisor'),
    listAdminUsers('promoter'),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('admin_title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('admin_description')}</p>
      </header>

      <form
        method="get"
        className="mt-6 grid grid-cols-1 gap-4 rounded-lg border border-border bg-white p-4 sm:grid-cols-5"
      >
        <div>
          <label
            htmlFor="supervisor_id"
            className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-fg-secondary"
          >
            {t('admin_filter_supervisor')}
          </label>
          <select
            id="supervisor_id"
            name="supervisor_id"
            defaultValue={supervisorId}
            className="h-8 w-full rounded-md border border-border bg-white px-3 text-sm"
          >
            <option value="">{t('admin_filter_any')}</option>
            {supervisors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="promoter_id"
            className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-fg-secondary"
          >
            {t('admin_filter_promoter')}
          </label>
          <select
            id="promoter_id"
            name="promoter_id"
            defaultValue={promoterId}
            className="h-8 w-full rounded-md border border-border bg-white px-3 text-sm"
          >
            <option value="">{t('admin_filter_any')}</option>
            {promoters.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="from"
            className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-fg-secondary"
          >
            {t('admin_filter_date_from')}
          </label>
          <input
            id="from"
            name="from"
            type="date"
            defaultValue={from ?? ''}
            className="h-8 w-full rounded-md border border-border bg-white px-3 text-sm"
          />
        </div>

        <div>
          <label
            htmlFor="to"
            className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-fg-secondary"
          >
            {t('admin_filter_date_to')}
          </label>
          <input
            id="to"
            name="to"
            type="date"
            defaultValue={to ?? ''}
            className="h-8 w-full rounded-md border border-border bg-white px-3 text-sm"
          />
        </div>

        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="h-8 rounded-md bg-accent px-3 text-sm font-medium text-white hover:bg-accent-hover"
          >
            {t('admin_filter_cta')}
          </button>
          <Link
            href={`/${locale}/admin/field-visits`}
            className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm hover:bg-bg-subtle"
          >
            {t('admin_filter_reset')}
          </Link>
        </div>
      </form>

      <div className="pt-6">
        {visits.length === 0 ? (
          <EmptyState
            title={tVisits('empty_title')}
            description={tVisits('empty_description')}
          />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-white">
            <table className="w-full">
              <thead className="bg-bg-subtle text-xs font-medium uppercase tracking-wide text-fg-secondary">
                <tr>
                  <th className="px-4 py-2.5 text-start">{t('columns.date')}</th>
                  <th className="px-4 py-2.5 text-start">{t('columns.supervisor')}</th>
                  <th className="px-4 py-2.5 text-start">{t('columns.promoter')}</th>
                  <th className="px-4 py-2.5 text-start">{t('columns.campaign')}</th>
                  <th className="px-4 py-2.5 text-start">{t('columns.location')}</th>
                  <th className="px-4 py-2.5 text-start">{t('columns.outcome')}</th>
                  <th className="px-4 py-2.5 text-start">{t('columns.notes')}</th>
                  <th className="px-4 py-2.5 text-end">{t('columns.photo')}</th>
                </tr>
              </thead>
              <tbody>
                {visits.map((v) => (
                  <tr key={v.id} className="border-t border-border hover:bg-bg-subtle/50">
                    <td className="px-4 py-3 text-sm" dir="ltr">
                      {formatTs(v.visited_at, locale)}
                    </td>
                    <td className="px-4 py-3 text-sm">{v.supervisor_name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm">
                      {v.promoter_id && v.promoter_name ? (
                        v.promoter_name
                      ) : (
                        <span className="text-fg-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">{pickName(v.campaign_name_i18n, locale)}</td>
                    <td className="px-4 py-3 text-sm">{pickName(v.location_name_i18n, locale)}</td>
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
                    <td className="px-4 py-3 text-end">
                      <VisitPhotoButton
                        path={v.photo_path}
                        label={tVisits('view_photo')}
                        dialogTitle={tVisits('photo_open')}
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
