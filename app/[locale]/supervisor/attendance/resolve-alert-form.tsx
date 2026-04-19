'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { resolveAlertAction, type ActionState } from './actions';

const INITIAL: ActionState = { error: null };

export function ResolveAlertForm({ alertId }: { alertId: string }) {
  const t = useTranslations('Supervisor.attendance');
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(resolveAlertAction, INITIAL);

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        type="button"
        onClick={() => setOpen(true)}
      >
        <Check className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
        {t('resolve_alert_cta')}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t('resolve_alert_title')}
        closeLabel={t('photo_close')}
      >
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="alert_id" value={alertId} />
          <div>
            <label
              htmlFor={`resolve-note-${alertId}`}
              className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-fg-secondary"
            >
              {t('resolve_alert_note_label')}
            </label>
            <Textarea
              id={`resolve-note-${alertId}`}
              name="resolution_note"
              maxLength={500}
              rows={3}
            />
          </div>
          {state.error ? <Alert variant="danger" title={state.error} /> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
              {t('photo_close')}
            </Button>
            <Button
              variant="secondary"
              type="submit"
              name="dismiss"
              value="true"
              disabled={pending}
            >
              {t('dismiss_alert_submit')}
            </Button>
            <Button type="submit" name="dismiss" value="false" disabled={pending}>
              {pending ? t('resolve_alert_submit') + '…' : t('resolve_alert_submit')}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
