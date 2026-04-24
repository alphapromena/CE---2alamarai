'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
// Note: `useEffect` is used only for the Esc/scroll-lock side effects and the
// SSR-safe portal mount flag, not for closing the drawer — see the openedAt
// derived-state pattern below.
import { useTranslations } from 'next-intl';
import { Menu, X } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { LogoutButton } from '@/components/features/auth/logout-button';
import { cn } from '@/lib/utils';
import type { NavItem } from './app-shell';

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export interface AppNavMobileProps {
  items: NavItem[];
  fullName: string;
  roleLabel: string;
  className?: string;
}

/**
 * Hamburger menu rendered only below md. Opens a slide-in drawer from the
 * inline-start edge (left in LTR, right in RTL) with the nav items, the
 * current user summary, and the logout button. The desktop AppNav stays
 * mounted in parallel but hidden via md:flex; they never compete.
 */
export function AppNavMobile({ items, fullName, roleLabel, className }: AppNavMobileProps) {
  const t = useTranslations();
  const tCommon = useTranslations('Common');
  const pathname = usePathname();
  // Derived open state keyed to the pathname the drawer was opened for.
  // When the user taps a link and the route changes, openedAt no longer
  // matches and the drawer is effectively closed — no useEffect/setState
  // pattern needed (which React 19 / next-lint now flags).
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === pathname;
  const setOpen = (next: boolean) => setOpenedAt(next ? pathname : null);

  // Portal target is the document body so the drawer escapes any ancestor
  // containing block (the app-shell header sets backdrop-blur, which would
  // otherwise re-anchor `position: fixed` to the header strip). The
  // `typeof document` guard keeps SSR safe; in practice `open` is always
  // false on the server because it can only flip via a client tap.
  const canPortal = typeof document !== 'undefined';

  // Esc to close; lock body scroll while open so the page behind doesn't
  // rubber-band on iOS Safari when the promoter drags inside the drawer.
  // Calls setOpenedAt(null) directly rather than the setOpen helper so the
  // effect's dep array only lists primitives (satisfies react-hooks/
  // exhaustive-deps without wrapping setOpen in useCallback).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenedAt(null);
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={tCommon('menu')}
        aria-expanded={open}
        aria-controls="app-nav-mobile-drawer"
        className={cn(
          'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-fg transition-colors duration-150 hover:bg-bg-hover md:hidden',
          className,
        )}
      >
        <Menu className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      </button>

      {open && canPortal
        ? createPortal(
            <>
              <div
                aria-hidden
                onClick={() => setOpen(false)}
                className="fixed inset-0 z-50 bg-brand-ink/60 backdrop-blur-sm motion-safe:animate-fade-in"
              />
              <div
                id="app-nav-mobile-drawer"
                role="dialog"
                aria-modal="true"
                aria-label={tCommon('menu')}
                className="fixed inset-y-0 start-0 z-50 flex w-[85vw] max-w-xs flex-col bg-white shadow-lg motion-safe:animate-fade-in"
              >
                <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
                    {tCommon('menu')}
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label={tCommon('close')}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-secondary transition-colors duration-150 hover:bg-bg-hover hover:text-fg"
                  >
                    <X className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  </button>
                </div>

                <nav className="flex-1 overflow-y-auto overscroll-contain p-2">
                  {items.map((item) => {
                    const active = isActive(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={
                          active
                            ? 'block rounded-lg bg-accent-subtle px-3 py-3 text-sm font-semibold text-accent-strong'
                            : 'block rounded-lg px-3 py-3 text-sm text-fg transition-colors duration-150 hover:bg-bg-hover'
                        }
                      >
                        {t(item.labelKey)}
                      </Link>
                    );
                  })}
                </nav>

                <div className="shrink-0 border-t border-border p-4">
                  <div className="mb-3">
                    <p className="truncate text-sm font-semibold text-fg">{fullName}</p>
                    <p className="text-xs text-fg-muted">{roleLabel}</p>
                  </div>
                  <LogoutButton variant="secondary" />
                </div>
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}
