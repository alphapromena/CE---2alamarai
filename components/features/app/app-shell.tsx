import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { LogoutButton } from '@/components/features/auth/logout-button';
import { TrackingIndicator } from '@/components/features/location-tracking/tracking-indicator';
import { AppNav } from '@/components/features/app/app-nav';
import { PerceptionLogo } from '@/components/brand/perception-logo';
import type { UserRole } from '@/lib/auth/roles';

export interface NavItem {
  href: string;
  labelKey: string;
}

export function AppShell({
  role,
  fullName,
  nav,
  bell,
  children,
}: {
  role: UserRole;
  fullName: string;
  nav: NavItem[];
  /** Optional server-rendered bell component injected by the per-role layout. */
  bell?: ReactNode;
  children: ReactNode;
}) {
  const tRoles = useTranslations('Roles');

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-6">
          <Link href="/" className="inline-flex shrink-0 items-center" aria-label="Perception">
            <PerceptionLogo variant="horizontal" surface="light" />
          </Link>
          <AppNav items={nav} />
          <div className="flex shrink-0 items-center gap-3">
            <TrackingIndicator />
            {bell}
            <div className="flex flex-col items-end leading-tight">
              <span className="max-w-[10rem] truncate text-sm font-medium">{fullName}</span>
              <span className="text-xs text-fg-muted">{tRoles(role)}</span>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
