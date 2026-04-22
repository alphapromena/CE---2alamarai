'use client';

import { useSyncExternalStore, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { MapPin } from 'lucide-react';
import {
  getTrackerState,
  subscribeTrackerState,
} from '@/lib/location-tracking/state-signal';
import type { TrackerState } from '@/lib/location-tracking/tracker';
import { Link } from '@/i18n/navigation';

// Stable reference returned by useSyncExternalStore's getServerSnapshot — must
// be the same object on every call, otherwise React warns and re-renders
// forever ("The result of getServerSnapshot should be cached").
const SERVER_SNAPSHOT: TrackerState = Object.freeze({
  isTracking: false,
  lastPingAt: null,
  lastError: null,
  pingCount: 0,
});

function getServerSnapshot(): TrackerState {
  return SERVER_SNAPSHOT;
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
        className="inline-flex items-center gap-1.5 rounded-full border border-accent-2-border bg-accent-2-subtle px-2.5 py-1 text-xs font-semibold text-accent-2-strong transition-colors duration-150 hover:bg-accent-2/15"
        aria-label={t('indicator_active')}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="relative inline-flex h-2 w-2" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-2 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-2" />
        </span>
        <MapPin className="h-3.5 w-3.5" strokeWidth={1.75} />
        <span className="hidden sm:inline">{t('indicator_active')}</span>
      </button>
      {open ? (
        <div
          role="dialog"
          className="absolute end-0 top-full z-50 mt-2 w-72 origin-top rounded-xl border border-border bg-white p-3 text-sm shadow-md motion-safe:animate-scale-in"
        >
          <p className="font-semibold text-fg">{t('indicator_tooltip_title')}</p>
          <p className="mt-1 text-fg-secondary">{t('indicator_tooltip_body')}</p>
          {state.lastPingAt != null ? (
            <p className="mt-2 text-xs text-fg-muted">
              {t('last_ping_at', { time: formatTime(state.lastPingAt, locale) })}
            </p>
          ) : null}
          <div className="mt-3">
            <Link
              href="/privacy/location-tracking"
              className="text-xs font-semibold text-accent-2-strong hover:underline"
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
