import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { LogoutButton } from '@/components/features/auth/logout-button';
import { TrackingIndicator } from '@/components/features/location-tracking/tracking-indicator';
import { AppNav } from '@/components/features/app/app-nav';
import { AppNavMobile } from '@/components/features/app/app-nav-mobile';
import { AppShellHeader } from '@/components/features/app/app-shell-header';
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
      <AppShellHeader>
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:gap-4 sm:px-6">
          {/* Mobile-only hamburger — closes itself on route change. */}
          <AppNavMobile items={nav} fullName={fullName} roleLabel={tRoles(role)} />

          <Link
            href="/"
            className="inline-flex shrink-0 items-center rounded-md transition-opacity duration-150 hover:opacity-90 motion-safe:hover:scale-[1.02] active:scale-[0.99]"
            aria-label="Perception"
          >
            <PerceptionLogo variant="horizontal" surface="light" />
          </Link>

          {/* Desktop nav — hidden on mobile, AppNavMobile takes over. */}
          <div className="hidden min-w-0 flex-1 md:flex">
            <AppNav items={nav} />
          </div>

          <div className="ms-auto flex shrink-0 items-center gap-2 sm:gap-3 md:ms-0">
            <TrackingIndicator />
            {bell}
            {/* Name + role label is noise on mobile; drawer surfaces it there. */}
            <div className="hidden flex-col items-end leading-tight md:flex">
              <span className="max-w-[10rem] truncate text-sm font-medium">{fullName}</span>
              <span className="text-xs text-fg-muted">{tRoles(role)}</span>
            </div>
            {/* Logout also lives in the drawer on mobile. */}
            <div className="hidden md:block">
              <LogoutButton />
            </div>
          </div>
        </div>
      </AppShellHeader>
      <main>{children}</main>
    </div>
  );
}
