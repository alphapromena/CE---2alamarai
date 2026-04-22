import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireRole } from '@/lib/auth/guards';
import { listSupervisorTasks } from '@/lib/queries/tasks';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { i18n } from '@/lib/validations/i18n';
import { StatusPill, type StatusPillVariant } from '@/components/ui/status-pill';
import { SupervisorTasksClient } from './tasks-client';
import type { TaskRow } from '@/lib/queries/tasks';

function pillFor(status: TaskRow['status']): { variant: StatusPillVariant; key: string } {
  switch (status) {
    case 'open':
      return { variant: 'neutral', key: 'status_open' };
    case 'in_progress':
      return { variant: 'info', key: 'status_in_progress' };
    case 'done':
      return { variant: 'success', key: 'status_done' };
    case 'cancelled':
      return { variant: 'danger', key: 'status_cancelled' };
  }
}

export default async function SupervisorTasksPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const actor = await requireRole('supervisor', 'admin');
  const t = await getTranslations('Supervisor.tasks');
  const tp = await getTranslations('Promoter.tasks');

  const tasks = await listSupervisorTasks({ limit: 200 });

  // Lookup data for the create form: supervisor's assigned locations, their
  // campaigns, active promoters at those locations.
  const admin = createAdminSupabase();
  const [locationsRes, promotersRes, campaignsRes] = await Promise.all([
    admin
      .from('locations')
      .select('id, name_i18n')
      .in('id', actor.assigned_locations.length > 0 ? actor.assigned_locations : ['00000000-0000-0000-0000-000000000000']),
    admin
      .from('profiles')
      .select('id, full_name, assigned_locations, active')
      .eq('role', 'promoter')
      .eq('active', true),
    admin.from('campaigns').select('id, name_i18n, status').in('status', ['active', 'planned']),
  ]);

  const locations = (locationsRes.data ?? []) as { id: string; name_i18n: { ar?: string; en?: string } }[];
  const promoters = ((promotersRes.data ?? []) as {
    id: string;
    full_name: string;
    assigned_locations: string[];
    active: boolean;
  }[]).filter((p) =>
    actor.role === 'admin'
      ? true
      : p.assigned_locations.some((l) => actor.assigned_locations.includes(l)),
  );
  const campaigns = (campaignsRes.data ?? []) as {
    id: string;
    name_i18n: { ar?: string; en?: string };
    status: string;
  }[];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('subtitle')}</p>
      </header>

      <section className="pt-6">
        <h2 className="mb-3 text-sm font-medium text-fg-secondary">{t('create_heading')}</h2>
        <SupervisorTasksClient
          locale={locale}
          locations={locations}
          campaigns={campaigns}
          promoters={promoters}
        />
      </section>

      <section className="pt-8">
        <h2 className="mb-3 text-sm font-medium text-fg-secondary">{t('list_heading')}</h2>
        {tasks.length === 0 ? (
          <div className="rounded-lg border border-border p-6 text-sm text-fg-muted">
            {t('empty')}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-bg-subtle text-xs text-fg-secondary">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">{t('col.title')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('col.assignee')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('col.location')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('col.campaign')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('col.due')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('col.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-white">
                {tasks.map((row) => {
                  const p = pillFor(row.status);
                  return (
                    <tr key={row.id} className="hover:bg-bg-hover">
                      <td className="px-3 py-2">{i18n(row.title_i18n, locale)}</td>
                      <td className="px-3 py-2">{row.assignee_name ?? '—'}</td>
                      <td className="px-3 py-2">{i18n(row.location_name_i18n ?? null, locale)}</td>
                      <td className="px-3 py-2">{i18n(row.campaign_name_i18n ?? null, locale)}</td>
                      <td className="px-3 py-2 tabular-nums">{row.due_date ?? '—'}</td>
                      <td className="px-3 py-2">
                        <StatusPill variant={p.variant} label={tp(p.key)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
