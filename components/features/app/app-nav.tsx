'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import type { NavItem } from './app-shell';

const VISIBLE_COUNT = 10;

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav({ items }: { items: NavItem[] }) {
  const t = useTranslations();
  const tCommon = useTranslations('Common');
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const visible = items.slice(0, VISIBLE_COUNT);
  const overflow = items.slice(VISIBLE_COUNT);
  const overflowHasActive = overflow.some((item) => isActive(pathname, item.href));

  return (
    <nav className="flex min-w-0 flex-1 items-center gap-0.5">
      {visible.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={
              active
                ? 'shrink-0 rounded-md bg-accent-subtle px-2.5 py-1.5 text-sm font-semibold text-accent-strong transition-colors duration-150'
                : 'shrink-0 rounded-md px-2.5 py-1.5 text-sm text-fg-secondary transition-colors duration-150 hover:bg-bg-hover hover:text-fg'
            }
          >
            {t(item.labelKey)}
          </Link>
        );
      })}
      {overflow.length > 0 ? (
        <div className="relative shrink-0" ref={ref}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={
              overflowHasActive
                ? 'inline-flex items-center gap-1 rounded-md bg-accent-subtle px-2.5 py-1.5 text-sm font-semibold text-accent-strong transition-colors duration-150'
                : 'inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm text-fg-secondary transition-colors duration-150 hover:bg-bg-hover hover:text-fg'
            }
            aria-haspopup="menu"
            aria-expanded={open}
          >
            {tCommon('more')}
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
          {open ? (
            <div
              role="menu"
              className="absolute end-0 top-full z-50 mt-2 w-48 origin-top rounded-md border border-border bg-white p-1 shadow-md motion-safe:animate-scale-in"
            >
              {overflow.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setOpen(false)}
                    className={
                      active
                        ? 'block rounded bg-accent-subtle px-3 py-1.5 text-sm font-semibold text-accent-strong'
                        : 'block rounded px-3 py-1.5 text-sm text-fg-secondary transition-colors duration-150 hover:bg-bg-hover hover:text-fg'
                    }
                  >
                    {t(item.labelKey)}
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </nav>
  );
}
