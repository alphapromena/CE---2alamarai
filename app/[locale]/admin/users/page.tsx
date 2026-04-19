import { Plus } from 'lucide-react';
import { setRequestLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Alert } from '@/components/ui/alert';
import { RoleFilter } from '@/components/features/admin/role-filter';
import { UsersTable } from '@/components/features/admin/users-table';
import { isUserRole, type UserRole } from '@/lib/auth/roles';
import { listAdminUsers } from '@/lib/auth/users-query';

export default async function AdminUsersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sp = await searchParams;
  const rawRole = typeof sp.role === 'string' ? sp.role : null;
  const roleFilter: UserRole | null = rawRole && isUserRole(rawRole) ? rawRole : null;
  const invited = typeof sp.invited === 'string' ? sp.invited : null;

  const rows = await listAdminUsers(roleFilter);
  const t = await getTranslations('Admin.users');
  const tDialog = await getTranslations('Admin.users.invite_dialog');

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="flex items-end justify-between border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="mt-1 text-sm text-fg-secondary">{t('description')}</p>
        </div>
        <Link
          href="/admin/users/new"
          className="inline-flex h-8 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-white hover:bg-accent-hover"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          {t('invite_cta')}
        </Link>
      </div>

      {invited ? (
        <div className="mt-6">
          <Alert variant="success" title={tDialog('success')}>
            <span dir="ltr">{invited}</span>
          </Alert>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-bg-subtle p-3">
        <RoleFilter value={roleFilter} />
      </div>

      <div className="mt-6">
        <UsersTable rows={rows} />
      </div>
    </div>
  );
}
