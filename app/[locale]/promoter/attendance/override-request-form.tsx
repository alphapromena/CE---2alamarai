'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import {
  requestGeofenceOverrideAction,
  type ActionState,
} from './actions';

const INITIAL: ActionState = { error: null };

export function OverrideRequestForm({ attendanceId }: { attendanceId: string }) {
  const t = useTranslations('Promoter.attendance');
  const [state, formAction, pending] = useActionState(
    requestGeofenceOverrideAction,
    INITIAL,
  );

  const sent = state.error === null && pending === false && state !== INITIAL;

  return (
    <section className="space-y-3 rounded-lg border border-warning-border bg-warning-subtle p-6">
      <div className="flex items-start gap-2 text-warning">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden />
        <div>
          <h2 className="text-base font-semibold">{t('override_request_title')}</h2>
          <p className="mt-0.5 text-sm">{t('override_request_description')}</p>
        </div>
      </div>

      {sent ? (
        <Alert variant="success" title={t('override_request_sent')} />
      ) : (
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="attendance_id" value={attendanceId} />
          <div>
            <label
              htmlFor="override-reason"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-fg-secondary"
            >
              {t('override_request_reason')}
            </label>
            <Textarea
              id="override-reason"
              name="reason"
              required
              minLength={3}
              maxLength={500}
              rows={3}
              className="w-full"
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? t('submitting') : t('override_request_submit')}
            </Button>
          </div>
          {state.error ? (
            <Alert variant="danger" title={t('error_generic')} />
          ) : null}
        </form>
      )}
    </section>
  );
}
