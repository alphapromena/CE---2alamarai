'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { setPasswordAction, type SetPasswordState } from './actions';

export function SetPasswordForm() {
  const t = useTranslations('Auth.set_password');
  const tError = useTranslations('Auth.errors');
  const [state, formAction, isPending] = useActionState<SetPasswordState, FormData>(
    setPasswordAction,
    { error: null },
  );

  const errorMessage = state.error && tError.has(state.error) ? tError(state.error) : state.error;

  return (
    <div className="rounded-lg border border-border bg-white p-6">
      <h1 className="text-xl font-semibold">{t('title')}</h1>
      <p className="mt-1 text-sm text-fg-secondary">{t('description')}</p>

      <form action={formAction} className="mt-6 space-y-4" noValidate>
        {errorMessage ? <Alert variant="danger">{errorMessage}</Alert> : null}

        <div>
          <Label htmlFor="password" required>
            {t('password_label')}
          </Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            dir="ltr"
            disabled={isPending}
          />
        </div>

        <div>
          <Label htmlFor="confirm_password" required>
            {t('confirm_password_label')}
          </Label>
          <Input
            id="confirm_password"
            name="confirm_password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            dir="ltr"
            disabled={isPending}
          />
        </div>

        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
              {t('submit_loading')}
            </>
          ) : (
            t('submit')
          )}
        </Button>
      </form>
    </div>
  );
}
