import type { ReactNode } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { requireRole } from '@/lib/auth/guards';
import { AppShell } from '@/components/features/app/app-shell';
import { NotificationBellServer } from '@/components/features/notifications/notification-bell-server';

const NAV = [
  { href: '/supervisor/dashboard', labelKey: 'Supervisor.nav.dashboard' },
  { href: '/supervisor/attendance', labelKey: 'Supervisor.nav.attendance' },
  { href: '/supervisor/visits', labelKey: 'Supervisor.nav.visits' },
  { href: '/supervisor/reports', labelKey: 'Supervisor.nav.reports' },
  { href: '/supervisor/tasks', labelKey: 'Supervisor.nav.tasks' },
  { href: '/supervisor/stock', labelKey: 'Supervisor.nav.stock' },
  { href: '/supervisor/performance', labelKey: 'Supervisor.nav.performance' },
  { href: '/supervisor/live', labelKey: 'Supervisor.nav.live' },
];

export default async function SupervisorLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const profile = await requireRole('supervisor');
  return (
    <AppShell
      role={profile.role}
      fullName={profile.full_name}
      nav={NAV}
      bell={<NotificationBellServer />}
    >
      {children}
    </AppShell>
  );
}
