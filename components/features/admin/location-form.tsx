'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { AutoDismissAlert } from '@/components/ui/auto-dismiss-alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { I18nField, type I18nValue } from '@/components/ui/i18n-field';
import { Link } from '@/i18n/navigation';
import {
  createLocationAction,
  updateLocationAction,
  type LocationActionState,
} from '@/app/[locale]/admin/locations/actions';
import type { LocationRow } from '@/lib/queries/locations';
import { i18n } from '@/lib/validations/i18n';

export interface LocationFormProps {
  mode: 'create' | 'edit';
  initial?: LocationRow;
  cities: { id: string; name_i18n: { ar?: string; en?: string }; country_code: string | null }[];
  locale: string;
}

const initialState: LocationActionState = { error: null };

export function LocationForm({ mode, initial, cities, locale }: LocationFormProps) {
  const t = useTranslations('Admin.locations');
  const tCommon = useTranslations('Admin.common');
  const tI18nField = useTranslations('Admin.i18n_field');

  const action = mode === 'create' ? createLocationAction : updateLocationAction;
  const [state, formAction, isPending] = useActionState(action, initialState);

  const [cityId, setCityId] = useState(initial?.city_id ?? cities[0]?.id ?? '');
  const [nameI18n, setNameI18n] = useState<I18nValue>({
    en: initial?.name_i18n?.en ?? '',
    ar: initial?.name_i18n?.ar ?? '',
  });
  const [address, setAddress] = useState(initial?.address ?? '');
  const [lat, setLat] = useState(initial?.lat?.toString() ?? '');
  const [lng, setLng] = useState(initial?.lng?.toString() ?? '');
  const [radius, setRadius] = useState((initial?.geofence_radius_m ?? 100).toString());
  const [active, setActive] = useState(initial?.active ?? true);

  const errorMessage = state.error
    ? tCommon(`errors.${state.error === 'duplicate' ? 'duplicate' : 'unknown'}`)
    : null;

  if (cities.length === 0) {
    return (
      <Alert variant="warning">
        {t('no_cities_yet')}{' '}
        <Link href="/admin/cities/new" className="underline">
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
        <AutoDismissAlert variant="success">{tCommon('saved')}</AutoDismissAlert>
      ) : null}

      <div>
        <Label htmlFor="city_id" required>
          {t('form.city_label')}
        </Label>
        <Select
          id="city_id"
          name="city_id"
          value={cityId}
          onChange={(e) => setCityId(e.target.value)}
          required
          options={cities.map((c) => ({
            value: c.id,
            label: c.country_code
              ? `${i18n(c.name_i18n, locale)} (${c.country_code})`
              : i18n(c.name_i18n, locale),
          }))}
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

      <div>
        <Label htmlFor="address">{t('form.address_label')}</Label>
        <Textarea
          id="address"
          name="address"
          rows={2}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="lat" required>
            {t('form.lat_label')}
          </Label>
          <Input
            id="lat"
            name="lat"
            type="number"
            inputMode="decimal"
            step="any"
            min={-90}
            max={90}
            dir="ltr"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="lng" required>
            {t('form.lng_label')}
          </Label>
          <Input
            id="lng"
            name="lng"
            type="number"
            inputMode="decimal"
            step="any"
            min={-180}
            max={180}
            dir="ltr"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="geofence_radius_m" required>
            {t('form.geofence_label')}
          </Label>
          <Input
            id="geofence_radius_m"
            name="geofence_radius_m"
            type="number"
            inputMode="numeric"
            min={10}
            max={5000}
            step={10}
            dir="ltr"
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
            required
          />
          <p className="mt-1 text-xs text-fg-muted">{t('form.geofence_help')}</p>
        </div>
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
          <Link href="/admin/locations">{tCommon('back_to_list')}</Link>
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
