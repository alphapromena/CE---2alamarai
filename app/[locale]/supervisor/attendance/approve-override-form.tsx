'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import {
  approveGeofenceOverrideAction,
  type ActionState,
} from './actions';

const INITIAL: ActionState = { error: null };

export function ApproveOverrideForm({
  attendanceId,
  defaultReason,
}: {
  attendanceId: string;
  defaultReason?: string;
}) {
  const t = useTranslations('Supervisor.attendance');
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    approveGeofenceOverrideAction,
    INITIAL,
  );

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        type="button"
        onClick={() => setOpen(true)}
      >
        <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
        {t('approve_override_cta')}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t('approve_override_title')}
        description={t('approve_override_description')}
        closeLabel={t('photo_close')}
      >
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="attendance_id" value={attendanceId} />
          <div>
            <label
              htmlFor={`override-reason-${attendanceId}`}
              className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-fg-secondary"
            >
              {t('approve_override_reason_label')}
            </label>
            <Textarea
              id={`override-reason-${attendanceId}`}
              name="reason"
              defaultValue={defaultReason}
              required
              minLength={3}
              maxLength={500}
              rows={3}
            />
          </div>
          {state.error ? (
            <Alert variant="danger" title={state.error} />
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              type="button"
              onClick={() => setOpen(false)}
            >
              {t('photo_close')}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? t('approve_override_submit') + '…' : t('approve_override_submit')}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
