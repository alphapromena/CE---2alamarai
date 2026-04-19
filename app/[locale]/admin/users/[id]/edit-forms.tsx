'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, CircleSlash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { StatusPill } from '@/components/ui/status-pill';
import { USER_ROLES, type UserRole } from '@/lib/auth/roles';
import { changeUserRoleAction, setUserActiveAction, type AdminActionState } from '../actions';

function resolveError(
  errorKey: string | null,
  t: (key: string) => string,
  has: (key: string) => boolean,
) {
  if (!errorKey) return null;
  return has(errorKey) ? t(errorKey) : null;
}

export function ChangeRoleForm({
  userId,
  currentRole,
  isSelf,
}: {
  userId: string;
  currentRole: UserRole;
  isSelf: boolean;
}) {
  const t = useTranslations('Admin.users.edit');
  const tRoles = useTranslations('Roles');
  const tErrors = useTranslations('Admin.users.errors');
  const [state, formAction, isPending] = useActionState<AdminActionState, FormData>(
    changeUserRoleAction,
    { error: null },
  );

  const errorMessage = resolveError(state.error, tErrors, tErrors.has);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="user_id" value={userId} />
      <div>
        <Label htmlFor="role" required>
          {t('role_label')}
        </Label>
        <select
          id="role"
          name="role"
          defaultValue={currentRole}
          disabled={isPending || isSelf}
          required
          className="focus:ring-accent/20 h-8 w-full rounded-md border border-border bg-white px-2 text-sm focus:border-accent focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {USER_ROLES.map((role) => (
            <option key={role} value={role}>
              {tRoles(role)}
            </option>
          ))}
        </select>
      </div>

      {errorMessage ? <Alert variant="danger">{errorMessage}</Alert> : null}
      {state.error === null && !isPending ? null : null}

      <Button type="submit" disabled={isPending || isSelf}>
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
            {t('save_role')}
          </>
        ) : (
          t('save_role')
        )}
      </Button>
    </form>
  );
}

export function ToggleActiveForm({
  userId,
  active,
  isSelf,
}: {
  userId: string;
  active: boolean;
  isSelf: boolean;
}) {
  const t = useTranslations('Admin.users');
  const tErrors = useTranslations('Admin.users.errors');
  const [state, formAction, isPending] = useActionState<AdminActionState, FormData>(
    setUserActiveAction,
    { error: null },
  );

  const errorMessage = resolveError(state.error, tErrors, tErrors.has);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="active" value={active ? 'false' : 'true'} />
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-fg-muted">
          {t('edit.status_label')}
        </span>
        {active ? (
          <StatusPill variant="success" icon={CheckCircle2} label={t('status.active')} />
        ) : (
          <StatusPill variant="neutral" icon={CircleSlash2} label={t('status.inactive')} />
        )}
      </div>

      {errorMessage ? <Alert variant="danger">{errorMessage}</Alert> : null}

      <Button
        type="submit"
        variant={active ? 'destructive' : 'secondary'}
        disabled={isPending || isSelf}
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} /> : null}
        {active ? t('row_actions.deactivate') : t('row_actions.activate')}
      </Button>
    </form>
  );
}
