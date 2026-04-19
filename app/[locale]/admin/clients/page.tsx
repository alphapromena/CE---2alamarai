import { Plus, Pencil } from 'lucide-react';
import { setRequestLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { StatusPill } from '@/components/ui/status-pill';
import { EmptyState } from '@/components/ui/empty-state';
import { Building2 } from 'lucide-react';
import { listClients } from '@/lib/queries/clients';
import { i18n } from '@/lib/validations/i18n';

export default async function AdminClientsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const rows = await listClients();
  const t = await getTranslations('Admin.clients');
  const tCommon = await getTranslations('Common');

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="flex items-end justify-between border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="mt-1 text-sm text-fg-secondary">{t('description')}</p>
        </div>
        <Link
          href="/admin/clients/new"
          className="inline-flex h-8 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-white hover:bg-accent-hover"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          {t('new_cta')}
        </Link>
      </div>

      <div className="mt-6">
        {rows.length === 0 ? (
          <EmptyState
            icon={Building2}
            title={t('empty_title')}
            description={t('empty_description')}
            action={
              <Link
                href="/admin/clients/new"
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
                <TH>{t('columns.contact_email')}</TH>
                <TH>{t('columns.contact_phone')}</TH>
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
                    <p className="font-medium">{row.name}</p>
                    <p className="text-xs text-fg-muted">{i18n(row.name_i18n, locale)}</p>
                  </TD>
                  <TD>
                    {row.contact_email ? (
                      <span dir="ltr" className="text-fg-secondary">
                        {row.contact_email}
                      </span>
                    ) : (
                      <span className="text-fg-muted">—</span>
                    )}
                  </TD>
                  <TD>
                    {row.contact_phone ? (
                      <span dir="ltr" className="text-fg-secondary">
                        {row.contact_phone}
                      </span>
                    ) : (
                      <span className="text-fg-muted">—</span>
                    )}
                  </TD>
                  <TD>
                    <StatusPill
                      variant={row.active ? 'success' : 'neutral'}
                      label={row.active ? tCommon('active') : tCommon('inactive')}
                    />
                  </TD>
                  <TD numeric>
                    <Link
                      href={`/admin/clients/${row.id}/edit`}
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
