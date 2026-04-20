'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { StatusPill, type StatusPillVariant } from '@/components/ui/status-pill';
import { EmptyState } from '@/components/ui/empty-state';
import { useRealtimeTables } from '@/lib/supabase/realtime';
import { reviewBreakRequestAction } from '@/lib/breaks/actions';
import type { BreakRequestJoined } from '@/lib/queries/breaks';

function pickName(n: { ar?: string; en?: string } | null, locale: string): string {
  if (!n) return '';
  return (locale === 'ar' ? n.ar : n.en) ?? n.en ?? n.ar ?? '';
}

const STATUS_VARIANT: Record<BreakRequestJoined['status'], StatusPillVariant> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  modified: 'info',
};

export function SupervisorBreaksClient({
  locale,
  rows,
}: {
  locale: string;
  rows: BreakRequestJoined[];
}) {
  const t = useTranslations('Breaks.supervisor');
  const tStatus = useTranslations('Breaks.status');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const subs = useMemo(() => [{ table: 'break_requests' }], []);
  useRealtimeTables('supervisor-breaks', subs, () => {
    startTransition(() => router.refresh());
  });

  const pending = rows.filter((r) => r.status === 'pending');
  const resolved = rows.filter((r) => r.status !== 'pending');

  return (
    <div className="space-y-6">
      <section className="rounded border border-border bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">{t('pending')}</h2>
        {pending.length === 0 ? (
          <EmptyState title={t('empty')} description="" />
        ) : (
          <ul className="space-y-3">
            {pending.map((r) => (
              <ReviewCard
                key={r.id}
                row={r}
                locale={locale}
                isPending={isPending}
                onReview={(input) =>
                  startTransition(async () => {
                    await reviewBreakRequestAction(input);
                    router.refresh();
                  })
                }
              />
            ))}
          </ul>
        )}
      </section>

      <section className="rounded border border-border bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">{t('resolved')}</h2>
        {resolved.length === 0 ? (
          <EmptyState title={t('empty')} description="" />
        ) : (
          <ul className="space-y-2">
            {resolved.slice(0, 30).map((r) => (
              <li key={r.id} className="rounded border border-border px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StatusPill variant={STATUS_VARIANT[r.status]} label={tStatus(r.status)} />
                    <span>{r.promoter_full_name ?? '—'}</span>
                  </div>
                  <span className="text-xs text-fg-muted" dir="ltr">
                    {new Date(r.requested_start).toLocaleString(locale === 'ar' ? 'ar-JO' : 'en-JO')}
                  </span>
                </div>
                <div className="mt-1 text-xs text-fg-muted">
                  {pickName(r.location_name_i18n, locale)} — {pickName(r.campaign_name_i18n, locale)}
                </div>
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

function ReviewCard({
  row,
  locale,
  isPending,
  onReview,
}: {
  row: BreakRequestJoined;
  locale: string;
  isPending: boolean;
  onReview: (input: {
    id: string;
    decision: 'approve' | 'reject' | 'modify';
    approved_start?: string;
    approved_duration_minutes?: number;
    reviewer_reason?: string;
  }) => void;
}) {
  const t = useTranslations('Breaks.supervisor');
  const [approvedStart, setApprovedStart] = useState(
    new Date(row.requested_start).toISOString().slice(0, 16),
  );
  const [approvedDuration, setApprovedDuration] = useState(row.duration_minutes);
  const [reason, setReason] = useState('');

  const changed =
    new Date(approvedStart).toISOString() !== new Date(row.requested_start).toISOString()
    || approvedDuration !== row.duration_minutes;

  return (
    <li className="rounded border border-border bg-white p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{row.promoter_full_name ?? '—'}</p>
          <p className="text-xs text-fg-muted">
            {pickName(row.location_name_i18n, locale)} — {pickName(row.campaign_name_i18n, locale)}
          </p>
        </div>
        <div className="text-xs text-fg-muted" dir="ltr">
          {new Date(row.requested_start).toLocaleString(locale === 'ar' ? 'ar-JO' : 'en-JO')}
          {' · '}
          {row.duration_minutes} min
        </div>
      </div>
      {row.reason ? <p className="mt-2 text-sm">{row.reason}</p> : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div>
          <Label>{t('approved_start')}</Label>
          <Input
            type="datetime-local"
            value={approvedStart}
            onChange={(e) => setApprovedStart(e.target.value)}
            dir="ltr"
          />
        </div>
        <div>
          <Label>{t('approved_duration')}</Label>
          <Input
            type="number"
            min={1}
            max={480}
            value={approvedDuration}
            onChange={(e) => setApprovedDuration(Number(e.target.value))}
            dir="ltr"
          />
        </div>
        <div className="sm:col-span-2">
          <Label>{t('reviewer_reason')}</Label>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          disabled={isPending}
          onClick={() =>
            onReview({
              id: row.id,
              decision: changed ? 'modify' : 'approve',
              approved_start: new Date(approvedStart).toISOString(),
              approved_duration_minutes: approvedDuration,
              reviewer_reason: reason.trim() || undefined,
            })
          }
        >
          {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          <span>{changed ? t('modify') : t('approve')}</span>
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={isPending}
          onClick={() =>
            onReview({
              id: row.id,
              decision: 'reject',
              reviewer_reason: reason.trim() || undefined,
            })
          }
        >
          {t('reject')}
        </Button>
      </div>
    </li>
  );
}
