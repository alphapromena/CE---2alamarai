'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  endBreakAction,
  startBreakAction,
  submitBreakRequestAction,
} from '@/lib/breaks/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusPill, type StatusPillVariant } from '@/components/ui/status-pill';
import type { BreakRequestRow } from '@/lib/queries/breaks';
import type { PromoterShiftAssignment } from '@/lib/queries/attendance';

function pickName(n: { ar?: string; en?: string } | null, locale: string): string {
  if (!n) return '';
  return (locale === 'ar' ? n.ar : n.en) ?? n.en ?? n.ar ?? '';
}

const STATUS_VARIANT: Record<BreakRequestRow['status'], StatusPillVariant> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  modified: 'info',
};

export function PromoterBreaksClient({
  locale,
  rows,
  assignments,
}: {
  locale: string;
  rows: BreakRequestRow[];
  assignments: PromoterShiftAssignment[];
}) {
  const t = useTranslations('Breaks.promoter');
  const tStatus = useTranslations('Breaks.status');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  // Default to the first assignment we have.
  const [campaignId, setCampaignId] = useState(assignments[0]?.campaign_id ?? '');
  const [locationId, setLocationId] = useState(assignments[0]?.location_id ?? '');
  const [duration, setDuration] = useState(30);
  const [reason, setReason] = useState('');
  const defaultStart = useMemo(() => {
    const d = new Date();
    d.setSeconds(0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  }, []);
  const [requestedStart, setRequestedStart] = useState(defaultStart);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!campaignId) {
      setFormError('no_campaign');
      return;
    }
    const startIso = new Date(requestedStart).toISOString();
    startTransition(async () => {
      const res = await submitBreakRequestAction({
        campaign_id: campaignId,
        location_id: locationId || undefined,
        requested_start: startIso,
        duration_minutes: duration,
        reason: reason.trim() || undefined,
        idempotency_key: crypto.randomUUID(),
      });
      if (res.error) {
        setFormError(res.error);
      } else {
        setReason('');
        router.refresh();
      }
    });
  }

  async function handleStart(id: string) {
    startTransition(async () => {
      await startBreakAction({ id });
      router.refresh();
    });
  }
  async function handleEnd(id: string) {
    startTransition(async () => {
      await endBreakAction({ id });
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* submit form */}
      <section className="rounded border border-border bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">{t('new')}</h2>
        {formError ? (
          <Alert variant="danger" className="mb-3">
            <AlertTriangle className="h-4 w-4" />
            <span>{formError}</span>
          </Alert>
        ) : null}
        <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>{t('requested_start')}</Label>
            <Input
              type="datetime-local"
              value={requestedStart}
              onChange={(e) => setRequestedStart(e.target.value)}
              required
              dir="ltr"
            />
          </div>
          <div>
            <Label>{t('duration_minutes')}</Label>
            <Input
              type="number"
              min={1}
              max={480}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              required
              dir="ltr"
            />
          </div>
          <div>
            <Label>{t('location')}</Label>
            <select
              value={locationId}
              onChange={(e) => {
                const sel = assignments.find((a) => a.location_id === e.target.value);
                setLocationId(e.target.value);
                if (sel) setCampaignId(sel.campaign_id);
              }}
              className="mt-1 block w-full rounded border border-border bg-white px-3 py-2 text-sm"
            >
              {assignments.map((a) => (
                <option key={a.assignment_id} value={a.location_id}>
                  {pickName(a.location_name_i18n, locale)} — {pickName(a.campaign_name_i18n, locale)}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label>{t('reason')}</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span>{t('submit')}</span>
            </Button>
          </div>
        </form>
      </section>

      {/* history */}
      <section className="rounded border border-border bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">{t('history')}</h2>
        {rows.length === 0 ? (
          <EmptyState title={t('empty')} description="" />
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="rounded border border-border px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <StatusPill variant={STATUS_VARIANT[r.status]} label={tStatus(r.status)} />
                  <span className="text-xs text-fg-muted" dir="ltr">
                    {r.duration_minutes} min
                  </span>
                </div>
                <div className="mt-1 text-xs text-fg-muted" dir="ltr">
                  {new Date(r.requested_start).toLocaleString(locale === 'ar' ? 'ar-JO' : 'en-JO')}
                </div>
                {r.status === 'approved' || r.status === 'modified' ? (
                  <div className="mt-2 flex gap-2">
                    {!r.actual_start ? (
                      <Button size="sm" variant="secondary" onClick={() => handleStart(r.id)} disabled={isPending}>
                        {t('start_break')}
                      </Button>
                    ) : !r.actual_end ? (
                      <Button size="sm" variant="secondary" onClick={() => handleEnd(r.id)} disabled={isPending}>
                        {t('end_break')}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                {r.reviewer_reason ? (
                  <p className="mt-1 text-xs text-fg-secondary">{r.reviewer_reason}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
