import { getTranslations, setRequestLocale } from 'next-intl/server';
import { MapPin } from 'lucide-react';
import { requireRole } from '@/lib/auth/guards';
import { countMyPingsForDate } from '@/lib/queries/location-pings';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

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
  const { count, lastPingAt } = await countMyPingsForDate(todayIso());
  const lastPingTime = formatTime(lastPingAt, locale);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('description')}</p>
      </div>

      <section className="mt-8 rounded-md border border-border bg-white p-5">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
            <MapPin className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
          <h2 className="text-base font-semibold">{tTrack('promoter_log_title')}</h2>
        </div>
        <p className="mt-3 text-sm text-fg-secondary">
          {count === 0 ? tTrack('promoter_log_none') : tTrack('promoter_log_count', { count })}
        </p>
        {lastPingTime ? (
          <p className="mt-1 text-xs text-fg-muted">
            {tTrack('promoter_log_last_ping', { time: lastPingTime })}
          </p>
        ) : null}
      </section>
    </div>
  );
}
