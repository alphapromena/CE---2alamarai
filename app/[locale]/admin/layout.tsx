import type { ReactNode } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { requireAdmin } from '@/lib/auth/guards';
import { AppShell } from '@/components/features/app/app-shell';

const NAV = [
  { href: '/admin/dashboard', labelKey: 'Admin.nav.dashboard' },
  { href: '/admin/users', labelKey: 'Admin.nav.users' },
];

export default async function AdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const profile = await requireAdmin();
  return (
    <AppShell role={profile.role} fullName={profile.full_name} nav={NAV}>
      {children}
    </AppShell>
  );
}
