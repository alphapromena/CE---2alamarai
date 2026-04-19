'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/datepicker';
import { I18nField, type I18nValue } from '@/components/ui/i18n-field';
import { Link } from '@/i18n/navigation';
import {
  createCampaignAction,
  updateCampaignAction,
  type CampaignActionState,
} from '@/app/[locale]/admin/campaigns/actions';
import type { CampaignRow } from '@/lib/queries/campaigns';

export interface CampaignFormProps {
  mode: 'create' | 'edit';
  initial?: CampaignRow;
  clients: { id: string; name: string }[];
}

const initialState: CampaignActionState = { error: null };

export function CampaignForm({ mode, initial, clients }: CampaignFormProps) {
  const t = useTranslations('Admin.campaigns');
  const tCommon = useTranslations('Admin.common');
  const tI18nField = useTranslations('Admin.i18n_field');
  const tStatus = useTranslations('Admin.campaigns.status');

  const action = mode === 'create' ? createCampaignAction : updateCampaignAction;
  const [state, formAction, isPending] = useActionState(action, initialState);

  const [clientId, setClientId] = useState(initial?.client_id ?? clients[0]?.id ?? '');
  const [nameI18n, setNameI18n] = useState<I18nValue>({
    en: initial?.name_i18n?.en ?? '',
    ar: initial?.name_i18n?.ar ?? '',
  });
  const [startDate, setStartDate] = useState(initial?.start_date ?? '');
  const [endDate, setEndDate] = useState(initial?.end_date ?? '');
  const [objectives, setObjectives] = useState(initial?.objectives ?? '');
  const [denominator, setDenominator] = useState<'contacts' | 'engaged'>(
    initial?.kpi_config?.sampling_rate_denominator ?? 'contacts',
  );
  const [status, setStatus] = useState<CampaignRow['status']>(initial?.status ?? 'planned');

  const errorMessage = state.error
    ? tCommon(`errors.${state.error === 'duplicate' ? 'duplicate' : 'unknown'}`)
    : null;

  if (clients.length === 0) {
    return (
      <Alert variant="warning">
        {t('no_clients_yet')}{' '}
        <Link href="/admin/clients/new" className="underline">
          {t('go_to_clients')}
        </Link>
      </Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      {mode === 'edit' && initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <input type="hidden" name="start_date" value={startDate} />
      <input type="hidden" name="end_date" value={endDate} />

      {errorMessage ? <Alert variant="danger">{errorMessage}</Alert> : null}
      {mode === 'edit' && state.error === null && !isPending ? (
        <Alert variant="success">{tCommon('saved')}</Alert>
      ) : null}

      <div>
        <Label htmlFor="client_id" required>
          {t('form.client_label')}
        </Label>
        <Select
          id="client_id"
          name="client_id"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          required
          options={clients.map((c) => ({ value: c.id, label: c.name }))}
        />
      </div>

      <I18nField
        id="name_i18n"
        labels={{ en: tI18nField('name_en'), ar: tI18nField('name_ar') }}
        value={nameI18n}
        onChange={setNameI18n}
        required
      />
      <input type="hidden" name="name_i18n_en" value={nameI18n.en ?? ''} />
      <input type="hidden" name="name_i18n_ar" value={nameI18n.ar ?? ''} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="start_date_picker" required>
            {t('form.start_date_label')}
          </Label>
          <DatePicker id="start_date_picker" value={startDate} onChange={setStartDate} required />
        </div>
        <div>
          <Label htmlFor="end_date_picker" required>
            {t('form.end_date_label')}
          </Label>
          <DatePicker id="end_date_picker" value={endDate} onChange={setEndDate} required />
        </div>
      </div>

      <div>
        <Label htmlFor="objectives">{t('form.objectives_label')}</Label>
        <Textarea
          id="objectives"
          name="objectives"
          rows={3}
          value={objectives}
          onChange={(e) => setObjectives(e.target.value)}
          maxLength={2000}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="sampling_rate_denominator">{t('form.denominator_label')}</Label>
          <Select
            id="sampling_rate_denominator"
            name="sampling_rate_denominator"
            value={denominator}
            onChange={(e) => setDenominator(e.target.value as 'contacts' | 'engaged')}
            options={[
              { value: 'contacts', label: t('form.denominator_contacts') },
              { value: 'engaged', label: t('form.denominator_engaged') },
            ]}
          />
          <p className="mt-1 text-xs text-fg-muted">{t('form.denominator_help')}</p>
        </div>
        <div>
          <Label htmlFor="status">{t('form.status_label')}</Label>
          <Select
            id="status"
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as CampaignRow['status'])}
            options={(['planned', 'active', 'completed', 'cancelled'] as const).map((s) => ({
              value: s,
              label: tStatus(s),
            }))}
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border pt-6">
        <Button asChild variant="ghost" type="button" disabled={isPending}>
          <Link href="/admin/campaigns">{tCommon('back_to_list')}</Link>
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
