'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

type SupportedLocale = 'en' | 'ar';
const LOCALES: readonly SupportedLocale[] = ['en', 'ar'] as const;

export interface LocaleSwitcherProps {
  className?: string;
  /** 'dark' flips inactive text to white/70 for use on bg-inverse surfaces. */
  surface?: 'light' | 'dark';
}

/**
 * Two-option segmented control that swaps between the English and Arabic
 * locales. The active option is a non-interactive <span> with aria-current;
 * the inactive option is a next-intl typed <Link> that preserves the current
 * pathname and any query string.
 *
 * Each option renders in its native script (EN / عربي) — a subtle nod to the
 * bilingual audience before they even see their language.
 */
export function LocaleSwitcher({ className, surface = 'light' }: LocaleSwitcherProps) {
  const current = useLocale() as SupportedLocale;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations('LocaleSwitcher');

  const qs = searchParams.toString();
  const href = qs ? `${pathname}?${qs}` : pathname;

  const wrapperClasses = cn(
    'inline-flex h-8 items-stretch overflow-hidden rounded-full border',
    surface === 'dark'
      ? 'border-white/20 bg-white/5'
      : 'border-border bg-white',
    className,
  );

  return (
    <div role="group" aria-label={t('group_label')} className={wrapperClasses}>
      {LOCALES.map((loc) => {
        const isActive = loc === current;
        const fontClass = loc === 'ar' ? 'font-sans-ar' : 'font-sans';
        const label = loc === 'ar' ? t('ar_label') : t('en_label');
        const ariaLabel = loc === 'ar' ? t('switch_to_ar') : t('switch_to_en');

        const baseClasses = cn(
          'inline-flex items-center justify-center px-3 text-xs font-semibold leading-none',
          'transition-colors duration-150',
          fontClass,
        );

        if (isActive) {
          return (
            <span
              key={loc}
              aria-current="true"
              className={cn(baseClasses, 'bg-accent text-white')}
            >
              {label}
            </span>
          );
        }

        const inactiveClasses =
          surface === 'dark'
            ? 'text-white/70 hover:bg-white/10 hover:text-white'
            : 'text-fg-secondary hover:bg-bg-hover hover:text-fg';

        return (
          <Link
            key={loc}
            href={href}
            locale={loc}
            aria-label={ariaLabel}
            className={cn(
              baseClasses,
              inactiveClasses,
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30',
            )}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
