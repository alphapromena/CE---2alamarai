import type { ReactNode } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { requireRole } from '@/lib/auth/guards';
import { AppShell } from '@/components/features/app/app-shell';

const NAV = [
  { href: '/promoter/dashboard', labelKey: 'Promoter.nav.dashboard' },
  { href: '/promoter/attendance', labelKey: 'Promoter.nav.attendance' },
  { href: '/promoter/reports/today', labelKey: 'Promoter.nav.reports_today' },
  { href: '/promoter/tasks', labelKey: 'Promoter.nav.tasks' },
];

export default async function PromoterLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const profile = await requireRole('promoter');
  return (
    <AppShell role={profile.role} fullName={profile.full_name} nav={NAV}>
      {children}
    </AppShell>
  );
}
