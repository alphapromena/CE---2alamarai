'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Link } from '@/i18n/navigation';
import { USER_ROLES } from '@/lib/auth/roles';
import { inviteUserAction, type AdminActionState } from '../actions';

export function InviteForm() {
  const t = useTranslations('Admin.users.invite_dialog');
  const tRoles = useTranslations('Roles');
  const tLangs = useTranslations('Languages');
  const tCommon = useTranslations('Common');
  const tError = useTranslations('Admin.users.invite_dialog.errors');
  const [state, formAction, isPending] = useActionState<AdminActionState, FormData>(
    inviteUserAction,
    { error: null },
  );

  const errorMessage =
    state.error && tError.has(state.error) ? tError(state.error) : null;

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {errorMessage ? <Alert variant="danger">{errorMessage}</Alert> : null}

      <div>
        <Label htmlFor="email" required>
          {t('email_label')}
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="off"
          required
          dir="ltr"
          disabled={isPending}
        />
      </div>

      <div>
        <Label htmlFor="full_name" required>
          {t('full_name_label')}
        </Label>
        <Input
          id="full_name"
          name="full_name"
          type="text"
          autoComplete="off"
          required
          disabled={isPending}
        />
      </div>

      <div>
        <Label htmlFor="role" required>
          {t('role_label')}
        </Label>
        <select
          id="role"
          name="role"
          defaultValue="promoter"
          disabled={isPending}
          required
          className="h-8 w-full rounded-md border border-border bg-white px-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        >
          {USER_ROLES.map((role) => (
            <option key={role} value={role}>
              {tRoles(role)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="preferred_language">{t('preferred_language_label')}</Label>
        <select
          id="preferred_language"
          name="preferred_language"
          defaultValue="en"
          disabled={isPending}
          className="h-8 w-full rounded-md border border-border bg-white px-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        >
          <option value="en">{tLangs('en')}</option>
          <option value="ar">{tLangs('ar')}</option>
        </select>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border pt-6">
        <Link
          href="/admin/users"
          className="inline-flex h-8 items-center rounded-md px-3 text-sm font-medium text-fg hover:bg-bg-hover"
        >
          {tCommon('cancel')}
        </Link>
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
              {t('submit_loading')}
            </>
          ) : (
            t('submit')
          )}
        </Button>
      </div>
    </form>
  );
}
