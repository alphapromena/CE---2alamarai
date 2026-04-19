'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { approveReportAction, rejectReportAction } from '../../reports/actions';

export function ReviewPanel({ reportId }: { reportId: string }) {
  const t = useTranslations('Supervisor.reports');
  const [reason, setReason] = useState('');
  const [pending, startTransition] = useTransition();
  const [working, setWorking] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onApprove = () => {
    setError(null);
    setWorking('approve');
    startTransition(async () => {
      const r = await approveReportAction({
        id: reportId,
        idempotency_key: crypto.randomUUID(),
      });
      if (r.error) setError(r.error);
      setWorking(null);
    });
  };

  const onReject = () => {
    setError(null);
    if (!reason.trim()) {
      setError('reason_required');
      return;
    }
    setWorking('reject');
    startTransition(async () => {
      const r = await rejectReportAction({
        id: reportId,
        idempotency_key: crypto.randomUUID(),
        review_reason: reason.trim(),
      });
      if (r.error) setError(r.error);
      setWorking(null);
    });
  };

  return (
    <section className="mt-6 rounded-lg border border-border p-4">
      <h2 className="mb-3 text-sm font-medium">{t('review_heading')}</h2>
      {error ? (
        <Alert variant="danger">{t(`errors.${error}`, { fallback: error })}</Alert>
      ) : null}
      <div className="mt-3 space-y-3">
        <Textarea
          placeholder={t('reject_reason_placeholder')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          disabled={pending}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="destructive"
            onClick={onReject}
            disabled={pending}
          >
            {pending && working === 'reject' ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <XCircle className="size-3" />
            )}
            {t('reject')}
          </Button>
          <Button type="button" variant="primary" onClick={onApprove} disabled={pending}>
            {pending && working === 'approve' ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <CheckCircle2 className="size-3" />
            )}
            {t('approve')}
          </Button>
        </div>
      </div>
    </section>
  );
}
