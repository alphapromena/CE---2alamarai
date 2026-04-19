import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { StatusPill, type StatusPillVariant } from '@/components/ui/status-pill';
import { i18n } from '@/lib/validations/i18n';
import type { ReportListRow } from '@/lib/queries/reports';

function pillFor(status: ReportListRow['status']): {
  variant: StatusPillVariant;
  key: string;
} {
  switch (status) {
    case 'draft':
      return { variant: 'neutral', key: 'status_draft' };
    case 'submitted':
      return { variant: 'info', key: 'status_submitted' };
    case 'approved':
      return { variant: 'success', key: 'status_approved' };
    case 'rejected':
      return { variant: 'danger', key: 'status_rejected' };
  }
}

export interface ReportsTableProps {
  locale: string;
  rows: ReportListRow[];
  detailHrefPrefix: string;
  emptyMessage: string;
}

export async function ReportsTable({
  locale,
  rows,
  detailHrefPrefix,
  emptyMessage,
}: ReportsTableProps) {
  const t = await getTranslations('Promoter.reports');
  if (rows.length === 0) {
    return <div className="rounded-lg border border-border p-6 text-sm text-fg-muted">{emptyMessage}</div>;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-bg-subtle text-xs text-fg-secondary">
          <tr>
            <th className="px-3 py-2 text-start font-medium">{t('cols.date')}</th>
            <th className="px-3 py-2 text-start font-medium">{t('cols.campaign')}</th>
            <th className="px-3 py-2 text-start font-medium">{t('cols.location')}</th>
            <th className="px-3 py-2 text-start font-medium">{t('cols.promoter')}</th>
            <th className="px-3 py-2 text-end font-medium">{t('cols.contacts')}</th>
            <th className="px-3 py-2 text-end font-medium">{t('cols.samples')}</th>
            <th className="px-3 py-2 text-end font-medium">{t('cols.sales')}</th>
            <th className="px-3 py-2 text-start font-medium">{t('cols.status')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-white">
          {rows.map((r) => {
            const p = pillFor(r.status);
            return (
              <tr key={r.id} className="hover:bg-bg-hover">
                <td className="px-3 py-2">
                  <Link href={`${detailHrefPrefix}/${r.id}`} className="text-accent hover:underline">
                    {r.report_date}
                  </Link>
                </td>
                <td className="px-3 py-2">{i18n(r.campaign_name_i18n ?? null, locale)}</td>
                <td className="px-3 py-2">{i18n(r.location_name_i18n ?? null, locale)}</td>
                <td className="px-3 py-2">{r.promoter_name ?? '—'}</td>
                <td className="px-3 py-2 text-end tabular-nums">{r.contacts}</td>
                <td className="px-3 py-2 text-end tabular-nums">{r.samples_total}</td>
                <td className="px-3 py-2 text-end tabular-nums">{r.sales_total}</td>
                <td className="px-3 py-2">
                  <StatusPill variant={p.variant} label={t(p.key)} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
