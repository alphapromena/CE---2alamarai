'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { I18nField, type I18nValue } from '@/components/ui/i18n-field';
import { Link } from '@/i18n/navigation';
import {
  createClientAction,
  updateClientAction,
  type ClientActionState,
} from '@/app/[locale]/admin/clients/actions';
import type { ClientRow } from '@/lib/queries/clients';

export interface ClientFormProps {
  mode: 'create' | 'edit';
  initial?: ClientRow;
}

const initialState: ClientActionState = { error: null };

export function ClientForm({ mode, initial }: ClientFormProps) {
  const t = useTranslations('Admin.clients');
  const tCommon = useTranslations('Admin.common');
  const tI18nField = useTranslations('Admin.i18n_field');

  const action = mode === 'create' ? createClientAction : updateClientAction;
  const [state, formAction, isPending] = useActionState(action, initialState);

  const [name, setName] = useState(initial?.name ?? '');
  const [nameI18n, setNameI18n] = useState<I18nValue>({
    en: initial?.name_i18n?.en ?? '',
    ar: initial?.name_i18n?.ar ?? '',
  });
  const [contactEmail, setContactEmail] = useState(initial?.contact_email ?? '');
  const [contactPhone, setContactPhone] = useState(initial?.contact_phone ?? '');
  const [active, setActive] = useState(initial?.active ?? true);

  const errorKey = state.error;
  const errorMessage = errorKey
    ? tCommon(
        `errors.${errorKey === 'duplicate' || errorKey === 'not_found' ? errorKey : 'unknown'}`,
      )
    : null;

  return (
    <form action={formAction} className="space-y-6">
      {mode === 'edit' && initial ? <input type="hidden" name="id" value={initial.id} /> : null}

      {errorMessage ? <Alert variant="danger">{errorMessage}</Alert> : null}
      {mode === 'edit' && state.error === null && !isPending ? (
        <Alert variant="success">{tCommon('saved')}</Alert>
      ) : null}

      <div>
        <Label htmlFor="name" required>
          {t('form.name_label')}
        </Label>
        <Input
          id="name"
          name="name"
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <p className="mt-1 text-xs text-fg-muted">{t('form.name_help')}</p>
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
          <Label htmlFor="contact_email">{t('form.contact_email_label')}</Label>
          <Input
            id="contact_email"
            name="contact_email"
            type="email"
            dir="ltr"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="contact_phone">{t('form.contact_phone_label')}</Label>
          <Input
            id="contact_phone"
            name="contact_phone"
            type="tel"
            dir="ltr"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
          />
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
          <Link href="/admin/clients">{tCommon('back_to_list')}</Link>
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
