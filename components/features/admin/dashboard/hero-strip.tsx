import { useFormatter, useTranslations } from 'next-intl';

export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

export interface HeroStripProps {
  name: string;
  timeOfDay: TimeOfDay;
  miniKpis: {
    promoters: number;
    checkins: number;
    visits: number;
    campaigns: number;
  };
}

export function HeroStrip({ name, timeOfDay, miniKpis }: HeroStripProps) {
  const t = useTranslations('Admin.dashboard.hero');
  const fmt = useFormatter();

  const greeting = t(`greeting_${timeOfDay}`);
  const headline = t('greeting_with_name', { greeting, name });

  const items: ReadonlyArray<{ key: string; value: number; label: string }> = [
    { key: 'promoters', value: miniKpis.promoters, label: t('mini_promoters') },
    { key: 'checkins', value: miniKpis.checkins, label: t('mini_checkins') },
    { key: 'visits', value: miniKpis.visits, label: t('mini_visits') },
    { key: 'campaigns', value: miniKpis.campaigns, label: t('mini_campaigns') },
  ];

  return (
    <section
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-navy via-[#1F3558] to-[#0E5A6D] px-6 py-8 text-white shadow-md motion-safe:animate-fade-up-slow md:px-10 md:py-12"
      data-surface="inverse"
    >
      {/* Decorative gradient orb — adds brand depth without competing with copy */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -end-24 h-64 w-64 rounded-full opacity-25 blur-3xl"
        style={{ background: 'var(--gradient-accent)' }}
      />

      <div className="relative">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-cyan/80">
          {t('kicker')}
        </p>
        <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight md:text-5xl">
          {headline}
        </h1>
        <p className="mt-3 max-w-2xl text-base text-white/70 md:text-lg">
          {t('subtitle')}
        </p>

        <div aria-hidden className="mt-8 h-px w-full bg-white/10" />

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:flex sm:flex-wrap sm:items-center sm:gap-0">
          {items.map((item, idx) => (
            <div
              key={item.key}
              className={
                idx === 0
                  ? 'sm:pe-6'
                  : `sm:border-s sm:border-white/15 sm:ps-6 ${
                      idx < items.length - 1 ? 'sm:pe-6' : ''
                    }`
              }
            >
              <dd
                className="text-2xl font-bold tabular-nums text-white md:text-[1.75rem]"
                dir="ltr"
              >
                {fmt.number(item.value)}
              </dd>
              <dt className="mt-1 text-[11px] font-medium uppercase tracking-wider text-white/60">
                {item.label}
              </dt>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
