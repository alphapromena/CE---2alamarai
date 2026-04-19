'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { loginAction, type LoginActionState } from './actions';

export function LoginForm({ deactivatedNotice }: { deactivatedNotice?: boolean }) {
  const t = useTranslations('Auth.login');
  const tError = useTranslations('Auth.errors');
  const [state, formAction, isPending] = useActionState<LoginActionState, FormData>(loginAction, {
    error: null,
  });

  const errorMessage = state.error && tError.has(state.error) ? tError(state.error) : null;

  return (
    <div className="rounded-lg border border-border bg-white p-6">
      <h1 className="text-xl font-semibold">{t('title')}</h1>
      <p className="mt-1 text-sm text-fg-secondary">{t('description')}</p>

      <form action={formAction} className="mt-6 space-y-4" noValidate>
        {deactivatedNotice ? <Alert variant="warning">{t('deactivated_notice')}</Alert> : null}
        {errorMessage ? <Alert variant="danger">{errorMessage}</Alert> : null}

        <div>
          <Label htmlFor="email" required>
            {t('email_label')}
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            dir="ltr"
            placeholder={t('email_placeholder')}
            disabled={isPending}
          />
        </div>

        <div>
          <Label htmlFor="password" required>
            {t('password_label')}
          </Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            dir="ltr"
            placeholder={t('password_placeholder')}
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

        <p className="text-center text-xs">
          <Link href="/reset-request" className="text-accent hover:underline">
            {t('forgot_password')}
          </Link>
        </p>
      </form>
    </div>
  );
}
