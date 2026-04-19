import { Plus, Pencil, Building } from 'lucide-react';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { StatusPill } from '@/components/ui/status-pill';
import { EmptyState } from '@/components/ui/empty-state';
import { CityRegionFilter } from '@/components/features/admin/city-region-filter';
import { listCities } from '@/lib/queries/cities';
import { listRegions } from '@/lib/queries/regions';
import { i18n } from '@/lib/validations/i18n';

export default async function AdminCitiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sp = await searchParams;
  const regionFilter =
    typeof sp.region === 'string' && /^[0-9a-f-]{36}$/.test(sp.region) ? sp.region : null;

  const [rows, regions] = await Promise.all([listCities(regionFilter), listRegions()]);
  const t = await getTranslations('Admin.cities');
  const tCommon = await getTranslations('Common');

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="flex items-end justify-between border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="mt-1 text-sm text-fg-secondary">{t('description')}</p>
        </div>
        <Link
          href="/admin/cities/new"
          className="inline-flex h-8 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-white hover:bg-accent-hover"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          {t('new_cta')}
        </Link>
      </div>

      {regions.length > 0 ? (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-bg-subtle p-3">
          <CityRegionFilter
            value={regionFilter}
            regions={regions.map((r) => ({
              id: r.id,
              label: `${i18n(r.name_i18n, locale)} (${r.country_code})`,
            }))}
          />
        </div>
      ) : null}

      <div className="mt-6">
        {rows.length === 0 ? (
          <EmptyState
            icon={Building}
            title={t('empty_title')}
            description={t('empty_description')}
            action={
              regions.length > 0 ? (
                <Link
                  href="/admin/cities/new"
                  className="inline-flex h-8 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-white hover:bg-accent-hover"
                >
                  <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  {t('new_cta')}
                </Link>
              ) : (
                <Link
                  href="/admin/regions/new"
                  className="inline-flex h-8 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-white hover:bg-accent-hover"
                >
                  <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  {t('no_regions_yet')}
                </Link>
              )
            }
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t('columns.name')}</TH>
                <TH>{t('columns.region')}</TH>
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
                  </TD>
                  <TD>
                    <span className="text-fg-secondary">{i18n(row.region_name_i18n, locale)}</span>
                    {row.region_country_code ? (
                      <span className="ms-2 font-mono text-xs text-fg-muted" dir="ltr">
                        {row.region_country_code}
                      </span>
                    ) : null}
                  </TD>
                  <TD>
                    <StatusPill
                      variant={row.active ? 'success' : 'neutral'}
                      label={row.active ? tCommon('active') : tCommon('inactive')}
                    />
                  </TD>
                  <TD numeric>
                    <Link
                      href={`/admin/cities/${row.id}/edit`}
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
