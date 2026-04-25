import { getTranslations, setRequestLocale } from 'next-intl/server';
import { MapPin } from 'lucide-react';
import { requireRole } from '@/lib/auth/guards';
import { countMyPingsForDate } from '@/lib/queries/location-pings';
import { todayLocalDateString } from '@/lib/attendance/shift-time';

function formatTime(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleTimeString(locale === 'ar' ? 'ar-JO' : 'en-JO', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
}

export default async function PromoterDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole('promoter');

  const t = await getTranslations('Promoter.dashboard');
  const tTrack = await getTranslations('LocationTracking');
  const { count, lastPingAt } = await countMyPingsForDate(todayLocalDateString());
  const lastPingTime = formatTime(lastPingAt, locale);

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

      <section className="relative mt-10 overflow-hidden rounded-2xl border border-border bg-white p-6 shadow-card motion-safe:animate-fade-up-delay-60">
        <div
          aria-hidden
          className="absolute top-0 start-0 h-full w-1 bg-accent-2"
        />
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent-2-subtle text-accent-2-strong">
            <MapPin className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
          <div>
            <h2 className="text-base font-semibold text-fg">
              {tTrack('promoter_log_title')}
            </h2>
            <p className="mt-0.5 text-sm text-fg-secondary">
              {count === 0
                ? tTrack('promoter_log_none')
                : tTrack('promoter_log_count', { count })}
            </p>
          </div>
        </div>
        {lastPingTime ? (
          <p className="mt-3 text-xs text-fg-muted">
            {tTrack('promoter_log_last_ping', { time: lastPingTime })}
          </p>
        ) : null}
      </section>
    </div>
  );
}
