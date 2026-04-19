'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { I18nField, type I18nValue } from '@/components/ui/i18n-field';
import { Link } from '@/i18n/navigation';
import {
  createCityAction,
  updateCityAction,
  type CityActionState,
} from '@/app/[locale]/admin/cities/actions';
import type { CityRow } from '@/lib/queries/cities';
import type { RegionRow } from '@/lib/queries/regions';
import { i18n } from '@/lib/validations/i18n';

export interface CityFormProps {
  mode: 'create' | 'edit';
  initial?: CityRow;
  regions: RegionRow[];
  locale: string;
}

const initialState: CityActionState = { error: null };

export function CityForm({ mode, initial, regions, locale }: CityFormProps) {
  const t = useTranslations('Admin.cities');
  const tCommon = useTranslations('Admin.common');
  const tI18nField = useTranslations('Admin.i18n_field');

  const action = mode === 'create' ? createCityAction : updateCityAction;
  const [state, formAction, isPending] = useActionState(action, initialState);

  const [regionId, setRegionId] = useState(initial?.region_id ?? regions[0]?.id ?? '');
  const [nameI18n, setNameI18n] = useState<I18nValue>({
    en: initial?.name_i18n?.en ?? '',
    ar: initial?.name_i18n?.ar ?? '',
  });
  const [active, setActive] = useState(initial?.active ?? true);

  const errorMessage = state.error
    ? tCommon(`errors.${state.error === 'duplicate' ? 'duplicate' : 'unknown'}`)
    : null;

  if (regions.length === 0) {
    return (
      <Alert variant="warning">
        {t('no_regions_yet')}{' '}
        <Link href="/admin/regions/new" className="underline">
          {t('new_cta')}
        </Link>
      </Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      {mode === 'edit' && initial ? <input type="hidden" name="id" value={initial.id} /> : null}

      {errorMessage ? <Alert variant="danger">{errorMessage}</Alert> : null}
      {mode === 'edit' && state.error === null && !isPending ? (
        <Alert variant="success">{tCommon('saved')}</Alert>
      ) : null}

      <div>
        <Label htmlFor="region_id" required>
          {t('form.region_label')}
        </Label>
        <Select
          id="region_id"
          name="region_id"
          value={regionId}
          onChange={(e) => setRegionId(e.target.value)}
          required
          options={regions.map((r) => ({
            value: r.id,
            label: `${i18n(r.name_i18n, locale)} (${r.country_code})`,
          }))}
          placeholder={t('form.region_placeholder')}
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
          <Link href="/admin/cities">{tCommon('back_to_list')}</Link>
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
