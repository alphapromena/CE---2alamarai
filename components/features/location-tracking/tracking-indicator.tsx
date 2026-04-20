'use client';

import { useSyncExternalStore, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { MapPin } from 'lucide-react';
import {
  getTrackerState,
  subscribeTrackerState,
} from '@/lib/location-tracking/state-signal';
import { Link } from '@/i18n/navigation';

function getServerSnapshot() {
  return {
    isTracking: false,
    lastPingAt: null,
    lastError: null,
    pingCount: 0,
  };
}

function formatTime(ts: number, locale: string): string {
  try {
    return new Date(ts).toLocaleTimeString(locale === 'ar' ? 'ar-JO' : 'en-JO', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/**
 * Feature 5 D-042: persistent privacy indicator shown in AppShell header while
 * the location tracker is active. Tap to reveal a small popover explaining
 * when tracking runs and linking to the privacy page.
 */
export function TrackingIndicator() {
  const state = useSyncExternalStore(subscribeTrackerState, getTrackerState, getServerSnapshot);
  const [open, setOpen] = useState(false);
  const t = useTranslations('LocationTracking');
  const locale = useLocale();

  if (!state.isTracking) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
        aria-label={t('indicator_active')}
      >
        <span className="relative inline-flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <MapPin className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{t('indicator_active')}</span>
      </button>
      {open ? (
        <div
          role="dialog"
          className="absolute end-0 top-full z-50 mt-2 w-72 rounded-md border border-border bg-white p-3 text-sm shadow-lg"
        >
          <p className="font-medium">{t('indicator_tooltip_title')}</p>
          <p className="mt-1 text-fg-secondary">{t('indicator_tooltip_body')}</p>
          {state.lastPingAt != null ? (
            <p className="mt-2 text-xs text-fg-muted">
              {t('last_ping_at', { time: formatTime(state.lastPingAt, locale) })}
            </p>
          ) : null}
          <div className="mt-3">
            <Link
              href="/privacy/location-tracking"
              className="text-xs font-medium text-emerald-700 hover:underline"
              onClick={() => setOpen(false)}
            >
              {t('privacy_page_link')}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
