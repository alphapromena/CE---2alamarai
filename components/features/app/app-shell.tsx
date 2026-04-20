import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { LogoutButton } from '@/components/features/auth/logout-button';
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
  const tBrand = useTranslations('Auth');
  const tRoles = useTranslations('Roles');
  const tNav = useTranslations();

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-6">
          <p className="text-base font-semibold">{tBrand('brand')}</p>
          <nav className="flex items-center gap-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-1.5 text-sm text-fg-secondary hover:bg-bg-hover hover:text-fg"
              >
                {tNav(item.labelKey)}
              </Link>
            ))}
          </nav>
          <div className="ms-auto flex items-center gap-3">
            {bell}
            <div className="flex flex-col items-end leading-tight">
              <span className="text-sm font-medium">{fullName}</span>
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
