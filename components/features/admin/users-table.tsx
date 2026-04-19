import { CheckCircle2, CircleSlash2, Inbox, Pencil } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { StatusPill } from '@/components/ui/status-pill';
import type { AdminUserRow } from '@/lib/auth/users-query';

export function UsersTable({ rows }: { rows: AdminUserRow[] }) {
  const t = useTranslations('Admin.users');
  const tRoles = useTranslations('Roles');
  const format = useFormatter();

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-white py-12 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-bg-muted">
          <Inbox className="h-6 w-6 text-fg-muted" strokeWidth={1.5} aria-hidden />
        </div>
        <h3 className="text-base font-semibold">{t('empty.title')}</h3>
        <p className="mx-auto mt-1 max-w-sm text-sm text-fg-secondary">{t('empty.description')}</p>
        <div className="mt-6">
          <Link
            href="/admin/users/new"
            className="inline-flex h-8 items-center rounded-md bg-accent px-3 text-sm font-medium text-white hover:bg-accent-hover"
          >
            {t('empty.cta')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-bg-subtle text-xs font-medium uppercase tracking-wide text-fg-secondary">
          <tr>
            <th className="px-4 py-2.5 text-start">{t('columns.name')}</th>
            <th className="px-4 py-2.5 text-start">{t('columns.email')}</th>
            <th className="px-4 py-2.5 text-start">{t('columns.role')}</th>
            <th className="px-4 py-2.5 text-start">{t('columns.status')}</th>
            <th className="px-4 py-2.5 text-start">{t('columns.locations')}</th>
            <th className="px-4 py-2.5 text-start">{t('columns.created_at')}</th>
            <th className="px-4 py-2.5 text-end">
              <span className="sr-only">{t('columns.actions')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id} className="hover:bg-bg-subtle/50 group border-t border-border">
              <td className="px-4 py-3 font-medium">{u.full_name}</td>
              <td className="px-4 py-3 text-fg-secondary">
                <span dir="ltr">{u.email}</span>
              </td>
              <td className="px-4 py-3">
                <StatusPill variant="neutral" label={tRoles(u.role)} />
              </td>
              <td className="px-4 py-3">
                {u.active ? (
                  <StatusPill variant="success" icon={CheckCircle2} label={t('status.active')} />
                ) : (
                  <StatusPill variant="neutral" icon={CircleSlash2} label={t('status.inactive')} />
                )}
              </td>
              <td className="px-4 py-3 tabular-nums">
                {t('locations_count', { count: u.assigned_locations.length })}
              </td>
              <td className="px-4 py-3 text-fg-secondary">
                <span dir="ltr">
                  {format.dateTime(new Date(u.created_at), { dateStyle: 'medium' })}
                </span>
              </td>
              <td className="px-4 py-3 text-end">
                <Link
                  href={`/admin/users/${u.id}`}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-secondary opacity-0 transition-opacity hover:bg-bg-hover hover:text-fg focus-visible:opacity-100 group-hover:opacity-100"
                  aria-label={t('row_actions.change_role')}
                >
                  <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
