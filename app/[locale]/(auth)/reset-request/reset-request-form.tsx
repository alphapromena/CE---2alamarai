'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { resetRequestAction, type ResetRequestState } from './actions';

export function ResetRequestForm() {
  const t = useTranslations('Auth.reset_request');
  const [state, formAction, isPending] = useActionState<ResetRequestState, FormData>(
    resetRequestAction,
    { ok: false, error: null },
  );

  if (state.ok) {
    return (
      <div className="rounded-lg border border-border bg-white p-6">
        <h1 className="text-xl font-semibold">{t('success_title')}</h1>
        <p className="mt-2 text-sm text-fg-secondary">{t('success_body')}</p>
        <div className="mt-6">
          <Link href="/login" className="text-sm text-accent hover:underline">
            {t('back_to_login')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-white p-6">
      <h1 className="text-xl font-semibold">{t('title')}</h1>
      <p className="mt-1 text-sm text-fg-secondary">{t('description')}</p>

      <form action={formAction} className="mt-6 space-y-4" noValidate>
        {state.error ? <Alert variant="danger">{state.error}</Alert> : null}

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
          <Link href="/login" className="text-accent hover:underline">
            {t('back_to_login')}
          </Link>
        </p>
      </form>
    </div>
  );
}
