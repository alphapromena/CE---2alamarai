import type { ReactNode } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { requireRole } from '@/lib/auth/guards';
import { AppShell } from '@/components/features/app/app-shell';

const NAV = [
  { href: '/client/dashboard', labelKey: 'Client.nav.dashboard' },
  { href: '/client/campaigns', labelKey: 'Client.nav.campaigns' },
  { href: '/client/performance', labelKey: 'Client.nav.performance' },
];

export default async function ClientLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const profile = await requireRole('client');
  return (
    <AppShell role={profile.role} fullName={profile.full_name} nav={NAV}>
      {children}
    </AppShell>
  );
}
