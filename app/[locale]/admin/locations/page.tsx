import { Plus, Pencil, MapPinned } from 'lucide-react';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { StatusPill } from '@/components/ui/status-pill';
import { EmptyState } from '@/components/ui/empty-state';
import { listLocations } from '@/lib/queries/locations';
import { i18n } from '@/lib/validations/i18n';

export default async function AdminLocationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const rows = await listLocations(null);
  const t = await getTranslations('Admin.locations');
  const tCommon = await getTranslations('Common');

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="flex items-end justify-between border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="mt-1 text-sm text-fg-secondary">{t('description')}</p>
        </div>
        <Link
          href="/admin/locations/new"
          className="inline-flex h-8 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-white hover:bg-accent-hover"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          {t('new_cta')}
        </Link>
      </div>

      <div className="mt-6">
        {rows.length === 0 ? (
          <EmptyState
            icon={MapPinned}
            title={t('empty_title')}
            description={t('empty_description')}
            action={
              <Link
                href="/admin/locations/new"
                className="inline-flex h-8 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-white hover:bg-accent-hover"
              >
                <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                {t('new_cta')}
              </Link>
            }
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t('columns.name')}</TH>
                <TH>{t('columns.city')}</TH>
                <TH>{t('columns.coordinates')}</TH>
                <TH>{t('columns.geofence')}</TH>
                <TH>{t('columns.status')}</TH>
                <TH numeric>
                  <span className="sr-only">{tCommon('edit')}</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={row.id}>
                  <TD>
                    <p className="font-medium">{i18n(row.name_i18n, locale)}</p>
                    {row.address ? (
                      <p className="mt-0.5 text-xs text-fg-muted">{row.address}</p>
                    ) : null}
                  </TD>
                  <TD>
                    <span className="text-fg-secondary">{i18n(row.city_name_i18n, locale)}</span>
                    {row.region_country_code ? (
                      <span className="ms-2 font-mono text-xs text-fg-muted" dir="ltr">
                        {row.region_country_code}
                      </span>
                    ) : null}
                  </TD>
                  <TD>
                    <span className="font-mono text-xs tabular-nums text-fg-secondary" dir="ltr">
                      {row.lat.toFixed(5)}, {row.lng.toFixed(5)}
                    </span>
                  </TD>
                  <TD>
                    <span className="tabular-nums text-fg-secondary" dir="ltr">
                      {row.geofence_radius_m} m
                    </span>
                  </TD>
                  <TD>
                    <StatusPill
                      variant={row.active ? 'success' : 'neutral'}
                      label={row.active ? tCommon('active') : tCommon('inactive')}
                    />
                  </TD>
                  <TD numeric>
                    <Link
                      href={`/admin/locations/${row.id}/edit`}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-secondary hover:bg-bg-hover hover:text-fg"
                      aria-label={tCommon('edit')}
                    >
                      <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                    </Link>
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
