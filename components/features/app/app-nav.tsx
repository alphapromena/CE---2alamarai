'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import type { NavItem } from './app-shell';

const VISIBLE_COUNT = 10;

export function AppNav({ items }: { items: NavItem[] }) {
  const t = useTranslations();
  const tCommon = useTranslations('Common');
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

  return (
    <nav className="flex min-w-0 flex-1 items-center gap-0.5">
      {visible.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="shrink-0 rounded-md px-2.5 py-1.5 text-sm text-fg-secondary hover:bg-bg-hover hover:text-fg"
        >
          {t(item.labelKey)}
        </Link>
      ))}
      {overflow.length > 0 ? (
        <div className="relative shrink-0" ref={ref}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm text-fg-secondary hover:bg-bg-hover hover:text-fg"
            aria-haspopup="menu"
            aria-expanded={open}
          >
            {tCommon('more')}
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          {open ? (
            <div
              role="menu"
              className="absolute end-0 top-full z-50 mt-2 w-48 rounded-md border border-border bg-white p-1 shadow-sm"
            >
              {overflow.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="block rounded px-3 py-1.5 text-sm text-fg-secondary hover:bg-bg-hover hover:text-fg"
                >
                  {t(item.labelKey)}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </nav>
  );
}
