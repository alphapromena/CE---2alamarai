'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logoutAction } from '@/app/[locale]/(auth)/logout/actions';

export function LogoutButton({ variant = 'ghost' }: { variant?: 'ghost' | 'secondary' }) {
  const t = useTranslations('Auth.logout');
  const [isPending, startTransition] = useTransition();

  return (
    <form action={() => startTransition(() => logoutAction())}>
      <Button type="submit" variant={variant} size="sm" disabled={isPending}>
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
        ) : (
          <LogOut className="h-4 w-4" strokeWidth={1.75} />
        )}
        <span>{t('cta')}</span>
      </Button>
    </form>
  );
}
