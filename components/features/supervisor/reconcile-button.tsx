'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { runReconcileAction } from '@/app/[locale]/supervisor/stock/actions';

export interface ReconcileButtonProps {
  campaignId: string;
  supervisorId: string;
}

/**
 * Triggers a targeted supervisor-scope reconciliation via the
 * stock-reconcile Edge Function. No declarations here — this is the
 * "what does the ledger say right now?" snapshot.  The Supervisor's
 * declared counts form lives in a separate flow (deferred to Phase 7).
 */
export function ReconcileButton({ campaignId, supervisorId }: ReconcileButtonProps) {
  const t = useTranslations('Supervisor.stock.reconcile');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { status: 'matched' | 'mismatched'; flags: number }>(
    null,
  );
  const [pending, startTransition] = useTransition();

  const run = () => {
    setError(null);
    setDone(null);
    startTransition(async () => {
      const res = await runReconcileAction({ campaign_id: campaignId, supervisor_id: supervisorId });
      if (res.error) {
        setError(res.error);
        return;
      }
      setDone({ status: res.status!, flags: res.flags ?? 0 });
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      {error ? <Alert variant="danger">{t('errors.' + error, { fallback: error })}</Alert> : null}
      {done ? (
        <Alert variant={done.status === 'matched' ? 'success' : 'warning'}>
          {done.status === 'matched' ? t('result_matched') : t('result_mismatched', { count: done.flags })}
        </Alert>
      ) : null}
      <Button type="button" onClick={run} disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} /> : null}
        {pending ? t('submit_loading') : t('submit_cta')}
      </Button>
    </div>
  );
}
