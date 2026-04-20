import { WifiOff } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { OfflineRetryButton } from './retry-button';

// Static render so the service worker can precache the fully-rendered HTML and
// serve it as the navigation fallback without needing a server round-trip.
export const dynamic = 'force-static';

export default async function OfflinePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const tErrors = await getTranslations('Errors');
  const tPwa = await getTranslations('Pwa');

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center px-6 py-12">
      <div className="w-full rounded-lg border border-border bg-bg-subtle p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warning-subtle text-warning">
          <WifiOff className="h-6 w-6" strokeWidth={1.75} aria-hidden />
        </div>
        <h1 className="mt-4 text-xl font-semibold">{tErrors('offline_title')}</h1>
        <p className="mt-2 text-sm text-fg-secondary">{tErrors('offline_description')}</p>
        <p className="mt-3 text-xs text-fg-muted">{tPwa('offline_queued_hint')}</p>
        <div className="mt-6 flex items-center justify-center">
          <OfflineRetryButton label={tPwa('offline_retry')} />
        </div>
      </div>
    </div>
  );
}
