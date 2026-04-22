import { CheckCircle2, CircleSlash2, Pencil, UsersRound } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { StatusPill } from '@/components/ui/status-pill';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import type { AdminUserRow } from '@/lib/auth/users-query';

export function UsersTable({ rows }: { rows: AdminUserRow[] }) {
  const t = useTranslations('Admin.users');
  const tRoles = useTranslations('Roles');
  const format = useFormatter();

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={UsersRound}
        title={t('empty.title')}
        description={t('empty.description')}
        action={
          <Link
            href="/admin/users/new"
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-accent-hover active:bg-accent-active motion-safe:active:scale-[0.98]"
          >
            {t('empty.cta')}
          </Link>
        }
      />
    );
  }

  return (
    <Table>
      <THead>
        <tr>
          <TH>{t('columns.name')}</TH>
          <TH>{t('columns.email')}</TH>
          <TH>{t('columns.role')}</TH>
          <TH>{t('columns.status')}</TH>
          <TH>{t('columns.locations')}</TH>
          <TH>{t('columns.created_at')}</TH>
          <TH numeric>
            <span className="sr-only">{t('columns.actions')}</span>
          </TH>
        </tr>
      </THead>
      <TBody>
        {rows.map((u) => (
          <TR key={u.id}>
            <TD className="font-medium">{u.full_name}</TD>
            <TD className="text-fg-secondary">
              <span dir="ltr">{u.email}</span>
            </TD>
            <TD>
              <StatusPill variant="neutral" label={tRoles(u.role)} />
            </TD>
            <TD>
              {u.active ? (
                <StatusPill variant="success" icon={CheckCircle2} label={t('status.active')} />
              ) : (
                <StatusPill variant="neutral" icon={CircleSlash2} label={t('status.inactive')} />
              )}
            </TD>
            <TD numeric>
              {t('locations_count', { count: u.assigned_locations.length })}
            </TD>
            <TD className="text-fg-secondary">
              <span dir="ltr">
                {format.dateTime(new Date(u.created_at), { dateStyle: 'medium' })}
              </span>
            </TD>
            <TD numeric>
              <Link
                href={`/admin/users/${u.id}`}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-secondary opacity-0 transition-opacity duration-150 hover:bg-bg-hover hover:text-fg focus-visible:opacity-100 group-hover:opacity-100"
                aria-label={t('row_actions.change_role')}
              >
                <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
              </Link>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
