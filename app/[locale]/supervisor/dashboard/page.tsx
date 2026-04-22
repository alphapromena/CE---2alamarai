import { ClipboardCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function SupervisorDashboardPage() {
  const t = useTranslations('Supervisor.dashboard');
  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <section className="motion-safe:animate-fade-up-slow">
        <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
          {t('eyebrow')}
        </p>
        <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight text-fg">
          {t('hero_headline')}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-fg-secondary">
          {t('hero_context')}
        </p>
      </section>

      <div aria-hidden className="mt-8 h-px w-full bg-border" />

      <section className="mt-10 rounded-2xl border border-border bg-white p-10 text-center shadow-card motion-safe:animate-fade-up-delay-60">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-subtle">
          <ClipboardCheck className="h-6 w-6 text-accent" strokeWidth={1.75} />
        </div>
        <h2 className="text-base font-semibold text-fg">{t('placeholder_title')}</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-fg-secondary">
          {t('placeholder_description')}
        </p>
      </section>
    </div>
  );
}
