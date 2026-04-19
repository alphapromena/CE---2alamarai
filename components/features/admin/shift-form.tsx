'use client';

import { useActionState, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Link } from '@/i18n/navigation';
import { DaysPicker } from '@/components/features/admin/days-picker';
import {
  createShiftAction,
  updateShiftAction,
  type ShiftActionState,
} from '@/app/[locale]/admin/shifts/actions';
import type { ShiftRow } from '@/lib/queries/shifts';
import { i18n } from '@/lib/validations/i18n';

export interface ShiftFormProps {
  mode: 'create' | 'edit';
  initial?: ShiftRow;
  pairs: {
    campaign_id: string;
    campaign_name_i18n: { ar?: string; en?: string };
    location_id: string;
    location_name_i18n: { ar?: string; en?: string };
  }[];
  locale: string;
  /** Sun..Sat short labels for the day picker. */
  dayLabels: [string, string, string, string, string, string, string];
}

const initialState: ShiftActionState = { error: null };

function trimSeconds(t: string | null | undefined): string {
  if (!t) return '';
  // 'HH:MM:SS' → 'HH:MM'
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export function ShiftForm({ mode, initial, pairs, locale, dayLabels }: ShiftFormProps) {
  const t = useTranslations('Admin.shifts');
  const tCommon = useTranslations('Admin.common');

  const action = mode === 'create' ? createShiftAction : updateShiftAction;
  const [state, formAction, isPending] = useActionState(action, initialState);

  const initialPairKey =
    initial &&
    pairs.find(
      (p) => p.campaign_id === initial.campaign_id && p.location_id === initial.location_id,
    )
      ? `${initial.campaign_id}:${initial.location_id}`
      : pairs[0]
        ? `${pairs[0].campaign_id}:${pairs[0].location_id}`
        : '';

  const [pairKey, setPairKey] = useState(initialPairKey);
  const [startTime, setStartTime] = useState(trimSeconds(initial?.start_time));
  const [endTime, setEndTime] = useState(trimSeconds(initial?.end_time));
  const [days, setDays] = useState<number[]>(initial?.days_of_week ?? []);
  const [active, setActive] = useState(initial?.active ?? true);

  const errorMessage = state.error ? tCommon('errors.unknown') : null;

  const [campaignId, locationId] = useMemo(() => pairKey.split(':'), [pairKey]);

  if (pairs.length === 0) {
    return (
      <Alert variant="warning">
        {t('no_pairs_yet')}{' '}
        <Link href="/admin/campaigns" className="underline">
          {t('go_to_campaigns')}
        </Link>
      </Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      {mode === 'edit' && initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <input type="hidden" name="campaign_id" value={campaignId ?? ''} />
      <input type="hidden" name="location_id" value={locationId ?? ''} />
      <input type="hidden" name="days_of_week" value={days.join(',')} />

      {errorMessage ? <Alert variant="danger">{errorMessage}</Alert> : null}
      {mode === 'edit' && state.error === null && !isPending ? (
        <Alert variant="success">{tCommon('saved')}</Alert>
      ) : null}

      <div>
        <Label htmlFor="pair_key" required>
          {t('form.pair_label')}
        </Label>
        <Select
          id="pair_key"
          value={pairKey}
          onChange={(e) => setPairKey(e.target.value)}
          required
          options={pairs.map((p) => ({
            value: `${p.campaign_id}:${p.location_id}`,
            label: `${i18n(p.campaign_name_i18n, locale)} — ${i18n(p.location_name_i18n, locale)}`,
          }))}
        />
        <p className="mt-1 text-xs text-fg-muted">{t('form.pair_help')}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="start_time" required>
            {t('form.start_time_label')}
          </Label>
          <Input
            id="start_time"
            name="start_time"
            type="time"
            dir="ltr"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="end_time" required>
            {t('form.end_time_label')}
          </Label>
          <Input
            id="end_time"
            name="end_time"
            type="time"
            dir="ltr"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            required
          />
        </div>
      </div>

      <div>
        <Label required>{t('form.days_label')}</Label>
        <DaysPicker value={days} onChange={setDays} labels={dayLabels} />
        <p className="mt-1 text-xs text-fg-muted">{t('form.days_help')}</p>
      </div>

      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="active"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="focus:ring-accent/20 h-4 w-4 rounded border-border text-accent focus:ring-2"
        />
        <span>{t('form.active_label')}</span>
      </label>

      <div className="flex items-center justify-end gap-2 border-t border-border pt-6">
        <Button asChild variant="ghost" type="button" disabled={isPending}>
          <Link href="/admin/shifts">{tCommon('back_to_list')}</Link>
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} /> : null}
          {mode === 'create'
            ? isPending
              ? tCommon('create_loading')
              : tCommon('create_cta')
            : isPending
              ? tCommon('save_loading')
              : tCommon('save_cta')}
        </Button>
      </div>
    </form>
  );
}
