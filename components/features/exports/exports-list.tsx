'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Download, Loader2, AlertTriangle } from 'lucide-react';
import { getExportDownloadUrlAction } from '@/lib/exports/actions';
import { StatusPill, type StatusPillVariant } from '@/components/ui/status-pill';
import { EmptyState } from '@/components/ui/empty-state';
import type { ExportJobRow } from '@/lib/queries/exports';

const STATUS_VARIANT: Record<ExportJobRow['status'], StatusPillVariant> = {
  queued: 'neutral',
  running: 'info',
  done: 'success',
  failed: 'danger',
};

function formatBytes(n: number | null): string {
  if (n === null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function ExportsList({
  rows,
  locale,
}: {
  rows: ExportJobRow[];
  locale: string;
}) {
  const t = useTranslations('Exports');
  const tStatus = useTranslations('Exports.status');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  async function handleDownload(id: string): Promise<void> {
    setError(null);
    setActiveId(id);
    startTransition(async () => {
      const res = await getExportDownloadUrlAction({ id });
      setActiveId(null);
      if (res.error || !res.url) {
        setError(res.error ?? 'download_failed');
        return;
      }
      window.open(res.url, '_blank', 'noopener,noreferrer');
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return <EmptyState icon={Download} title={t('empty_title')} description={t('empty_description')} />;
  }

  return (
    <div className="space-y-3">
      {error ? (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-md border border-danger-border bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          <AlertTriangle className="h-4 w-4" aria-hidden />
          <span>{t(`errors.${error}`)}</span>
        </div>
      ) : null}
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-bg-subtle text-xs text-fg-secondary">
            <tr>
              <th className="px-3 py-2 text-start font-medium">{t('cols.created_at')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('cols.scope')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('cols.format')}</th>
              <th className="px-3 py-2 text-end font-medium">{t('cols.size')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('cols.status')}</th>
              <th className="px-3 py-2 text-end font-medium">
                <span className="sr-only">{t('download')}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-white">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2">
                  <span dir="ltr" className="font-mono text-xs tabular-nums">
                    {new Date(r.created_at).toLocaleString(locale === 'ar' ? 'ar-JO' : 'en-JO')}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-col">
                    <span dir="ltr" className="text-xs text-fg-secondary tabular-nums">
                      {r.scope.from_date} → {r.scope.to_date}
                    </span>
                    <span className="text-xs text-fg-muted">
                      {r.scope.domains.join(', ')}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2 uppercase text-xs tabular-nums" dir="ltr">
                  {r.format === 'csv_zip' ? 'CSV' : 'XLSX'}
                </td>
                <td className="px-3 py-2 text-end tabular-nums" dir="ltr">
                  {formatBytes(r.result_size_bytes)}
                </td>
                <td className="px-3 py-2">
                  <StatusPill variant={STATUS_VARIANT[r.status]} label={tStatus(r.status)} />
                  {r.error_message ? (
                    <p className="mt-1 text-xs text-danger">{r.error_message}</p>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-end">
                  {r.status === 'done' ? (
                    <button
                      type="button"
                      onClick={() => handleDownload(r.id)}
                      disabled={isPending && activeId === r.id}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-bg-hover disabled:opacity-50"
                    >
                      {isPending && activeId === r.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Download className="h-3.5 w-3.5" aria-hidden />
                      )}
                      <span>{t('download')}</span>
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
