'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { AutoDismissAlert } from '@/components/ui/auto-dismiss-alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { I18nField, type I18nValue } from '@/components/ui/i18n-field';
import { Link } from '@/i18n/navigation';
import {
  createRegionAction,
  updateRegionAction,
  type RegionActionState,
} from '@/app/[locale]/admin/regions/actions';
import type { RegionRow } from '@/lib/queries/regions';

export interface RegionFormProps {
  mode: 'create' | 'edit';
  initial?: RegionRow;
}

const initialState: RegionActionState = { error: null };

export function RegionForm({ mode, initial }: RegionFormProps) {
  const t = useTranslations('Admin.regions');
  const tCommon = useTranslations('Admin.common');
  const tI18nField = useTranslations('Admin.i18n_field');

  const action = mode === 'create' ? createRegionAction : updateRegionAction;
  const [state, formAction, isPending] = useActionState(action, initialState);

  const [nameI18n, setNameI18n] = useState<I18nValue>({
    en: initial?.name_i18n?.en ?? '',
    ar: initial?.name_i18n?.ar ?? '',
  });
  const [countryCode, setCountryCode] = useState(initial?.country_code ?? '');
  const [active, setActive] = useState(initial?.active ?? true);

  const errorMessage = state.error
    ? tCommon(`errors.${state.error === 'duplicate' ? 'duplicate' : 'unknown'}`)
    : null;

  return (
    <form action={formAction} className="space-y-6">
      {mode === 'edit' && initial ? <input type="hidden" name="id" value={initial.id} /> : null}

      {errorMessage ? <Alert variant="danger">{errorMessage}</Alert> : null}
      {mode === 'edit' && state.error === null && !isPending ? (
        <AutoDismissAlert variant="success">{tCommon('saved')}</AutoDismissAlert>
      ) : null}

      <I18nField
        id="name_i18n"
        labels={{ en: tI18nField('name_en'), ar: tI18nField('name_ar') }}
        value={nameI18n}
        onChange={setNameI18n}
        required
      />
      <input type="hidden" name="name_i18n_en" value={nameI18n.en ?? ''} />
      <input type="hidden" name="name_i18n_ar" value={nameI18n.ar ?? ''} />

      <div>
        <Label htmlFor="country_code" required>
          {t('form.country_code_label')}
        </Label>
        <Input
          id="country_code"
          name="country_code"
          dir="ltr"
          maxLength={2}
          value={countryCode}
          onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
          className="w-24 uppercase tracking-widest"
          required
        />
        <p className="mt-1 text-xs text-fg-muted">{t('form.country_code_help')}</p>
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
          <Link href="/admin/regions">{tCommon('back_to_list')}</Link>
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
