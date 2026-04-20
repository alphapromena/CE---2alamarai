'use client';

import { useActionState, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Loader2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { bulkImportAction } from '@/app/[locale]/admin/imports/actions';
import { initialBulkImportState, type BulkImportState } from '@/app/[locale]/admin/imports/state';
import type { ImportTarget } from '@/lib/imports/templates';

const MAX_FILE_BYTES = 2 * 1024 * 1024;

export interface BulkImportFormProps {
  target: ImportTarget;
}

export function BulkImportForm({ target }: BulkImportFormProps) {
  const t = useTranslations('Admin.imports');
  const tErr = useTranslations('Admin.imports.errors');
  const [state, formAction, isPending] = useActionState<BulkImportState, FormData>(
    bulkImportAction,
    initialBulkImportState,
  );
  const [clientError, setClientError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setClientError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setClientError('file_too_large');
      e.target.value = '';
      return;
    }
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setClientError('invalid_type');
      e.target.value = '';
      return;
    }
  }

  const serverError = state.kind === 'error' ? state.error : null;
  const errorKey = clientError ?? serverError;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button asChild variant="secondary" size="sm">
          <a href={`/admin/imports/${target}/template`} download>
            <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            {t('download_template')}
          </a>
        </Button>
      </div>

      <form action={formAction} className="space-y-4" noValidate>
        <input type="hidden" name="target" value={target} />

        {errorKey ? (
          <Alert variant="danger">{tErr.has(errorKey) ? tErr(errorKey) : errorKey}</Alert>
        ) : null}

        <div>
          <Label htmlFor="file" required>
            {t('file_label')}
          </Label>
          <input
            ref={fileInputRef}
            id="file"
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            disabled={isPending}
            onChange={handleFileChange}
            className="block w-full text-sm file:me-3 file:rounded-md file:border file:border-border file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-fg hover:file:bg-bg-hover"
          />
          <p className="mt-1 text-xs text-fg-muted">{t('file_help')}</p>
        </div>

        <div className="flex justify-end border-t border-border pt-6">
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
                {t('submit_loading')}
              </>
            ) : (
              t('submit')
            )}
          </Button>
        </div>
      </form>

      {state.kind === 'done' ? (
        <ImportResults
          successCount={state.successCount}
          failedRows={state.failedRows}
        />
      ) : null}
    </div>
  );
}

function ImportResults({
  successCount,
  failedRows,
}: {
  successCount: number;
  failedRows: { row: number; error: string }[];
}) {
  const t = useTranslations('Admin.imports');
  return (
    <section className="rounded-lg border border-border bg-white p-5">
      <h2 className="text-base font-semibold">{t('results_title')}</h2>
      <div className="mt-2 space-y-1 text-sm">
        <p className="text-success">{t('success_summary', { count: successCount })}</p>
        <p className={failedRows.length > 0 ? 'text-danger' : 'text-fg-secondary'}>
          {t('fail_summary', { count: failedRows.length })}
        </p>
      </div>

      {failedRows.length > 0 ? (
        <div className="mt-4">
          <Table>
            <THead>
              <tr>
                <TH>{t('row_column')}</TH>
                <TH>{t('error_column')}</TH>
              </tr>
            </THead>
            <TBody>
              {failedRows.map((f) => (
                <TR key={f.row}>
                  <TD>
                    <span className="font-mono tabular-nums" dir="ltr">
                      {f.row}
                    </span>
                  </TD>
                  <TD>
                    <span className="text-fg-secondary">{f.error}</span>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      ) : null}
    </section>
  );
}
