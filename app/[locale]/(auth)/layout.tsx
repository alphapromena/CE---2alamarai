import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { PerceptionLogo } from '@/components/brand/perception-logo';

export default function AuthLayout({ children }: { children: ReactNode }) {
  const t = useTranslations('Auth.hero');

  return (
    <div className="min-h-screen bg-white md:grid md:grid-cols-5">
      {/* Mobile strip — compact brand bar shown above the form on narrow screens. */}
      <header className="flex items-center justify-center border-b border-border bg-white px-6 py-4 md:hidden">
        <Link href="/" className="inline-flex items-center" aria-label="Perception">
          <PerceptionLogo variant="horizontal" surface="light" />
        </Link>
      </header>

      {/* Left brand panel — dark hero (desktop only) */}
      <aside
        className="relative hidden overflow-hidden bg-inverse p-10 text-fg-inverse md:col-span-3 md:flex md:flex-col md:justify-between lg:p-14"
        data-surface="inverse"
      >
        {/* Decorative radial glow — brand gradient, sits behind content. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -end-24 h-96 w-96 rounded-full opacity-20 blur-3xl"
          style={{ background: 'var(--gradient-accent)' }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -start-16 h-80 w-80 rounded-full opacity-10 blur-3xl"
          style={{ background: 'var(--gradient-brand)' }}
        />

        {/* Top: brand logo */}
        <div className="relative motion-safe:animate-fade-in-slow">
          <Link href="/" className="inline-flex items-center" aria-label="Perception">
            <PerceptionLogo variant="horizontal" surface="dark" className="scale-110 origin-start" />
          </Link>
        </div>

        {/* Middle: hero message */}
        <div className="relative max-w-xl">
          <div
            aria-hidden
            className="h-0.5 w-12 bg-accent motion-safe:animate-fade-in-slow"
          />
          <h1 className="mt-6 text-4xl font-bold leading-[1.1] tracking-tight text-white motion-safe:animate-fade-up-delay-100 lg:text-5xl">
            {t('headline')}
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-fg-inverse-secondary motion-safe:animate-fade-up-delay-200">
            {t('subhead')}
          </p>
        </div>

        {/* Bottom: trust line */}
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-wider text-fg-inverse-secondary motion-safe:animate-fade-in-slow-delay-300">
            {t('trust_line')}
          </p>
        </div>
      </aside>

      {/* Right form panel */}
      <main className="flex items-center justify-center bg-white px-6 py-12 md:col-span-2 md:py-8">
        <div className="w-full max-w-sm motion-safe:animate-fade-up">{children}</div>
      </main>
    </div>
  );
}
