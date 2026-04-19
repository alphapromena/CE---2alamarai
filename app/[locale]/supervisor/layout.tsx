import type { ReactNode } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { requireRole } from '@/lib/auth/guards';
import { AppShell } from '@/components/features/app/app-shell';

const NAV = [
  { href: '/supervisor/dashboard', labelKey: 'Supervisor.nav.dashboard' },
  { href: '/supervisor/attendance', labelKey: 'Supervisor.nav.attendance' },
  { href: '/supervisor/visits', labelKey: 'Supervisor.nav.visits' },
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
    <AppShell role={profile.role} fullName={profile.full_name} nav={NAV}>
      {children}
    </AppShell>
  );
}
