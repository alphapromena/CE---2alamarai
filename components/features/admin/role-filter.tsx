'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { USER_ROLES, type UserRole } from '@/lib/auth/roles';

export function RoleFilter({ value }: { value: UserRole | null }) {
  const t = useTranslations('Admin.users');
  const tRoles = useTranslations('Roles');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="role-filter"
        className="text-xs font-medium uppercase tracking-wide text-fg-muted"
      >
        {t('role_filter_label')}
      </label>
      <select
        id="role-filter"
        value={value ?? ''}
        disabled={isPending}
        onChange={(e) => {
          const next = e.target.value;
          startTransition(() => {
            router.replace(next ? `/admin/users?role=${encodeURIComponent(next)}` : '/admin/users');
          });
        }}
        className="focus:ring-accent/20 h-8 rounded-md border border-border bg-white px-2 text-sm focus:border-accent focus:outline-none focus:ring-2"
      >
        <option value="">{t('role_filter_all')}</option>
        {USER_ROLES.map((role) => (
          <option key={role} value={role}>
            {tRoles(role)}
          </option>
        ))}
      </select>
    </div>
  );
}
