'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { logoutAction } from '@/app/[locale]/(auth)/logout/actions';

/**
 * Auto-logout watcher for the promoter PWA (D-037).
 *
 * Design: pure client-side. We intentionally do NOT enforce this on the
 * server — the actual sign-out call is authoritative (it clears the
 * session cookie), and the watcher is just the trigger. A promoter who
 * leaves the phone unlocked on a shelf gets their session ended without
 * losing in-progress drafts (those are in IndexedDB via D-010, and
 * re-hydrate on next login with the same idempotency keys per D-009).
 *
 * Threshold: 30 minutes of no user activity. Activity = pointer, keyboard,
 * or touch. Tab visibility changes also count as activity (a promoter
 * switching between the app and the camera app shouldn't be logged out).
 *
 * Implementation notes:
 *   - Uses one interval + event listeners; no per-event re-render.
 *   - Activity is stored in a ref so we don't rerender on every mousemove.
 *   - A 60s grace warning gives the user a chance to tap "stay signed in".
 */

const IDLE_THRESHOLD_MS = 30 * 60_000; // 30 min
const WARN_BEFORE_MS = 60_000; // warn 60s before
const CHECK_INTERVAL_MS = 15_000; // poll every 15 s

const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  'mousemove',
  'mousedown',
  'keydown',
  'touchstart',
  'scroll',
];

export function IdleWatcher() {
  const lastActivity = useRef<number>(Date.now());
  const [warning, setWarning] = useState(false);
  const [loggedOut, setLoggedOut] = useState(false);
  const t = useTranslations('IdleWatcher');

  useEffect(() => {
    const bump = () => {
      lastActivity.current = Date.now();
      setWarning(false);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') bump();
    };
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, bump, { passive: true });
    }
    document.addEventListener('visibilitychange', onVisibility);

    const timer = setInterval(() => {
      if (loggedOut) return;
      const idleMs = Date.now() - lastActivity.current;
      if (idleMs >= IDLE_THRESHOLD_MS) {
        setLoggedOut(true);
        void logoutAction();
        return;
      }
      if (idleMs >= IDLE_THRESHOLD_MS - WARN_BEFORE_MS) {
        setWarning(true);
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, bump);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(timer);
    };
  }, [loggedOut]);

  if (!warning || loggedOut) return null;

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-lg border border-warning-border bg-warning-subtle p-4 text-warning shadow-lg"
    >
      <p className="text-sm font-medium">{t('title')}</p>
      <p className="mt-1 text-xs">{t('description')}</p>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            lastActivity.current = Date.now();
            setWarning(false);
          }}
          className="inline-flex h-8 items-center rounded-md bg-accent px-3 text-xs font-medium text-white hover:bg-accent-hover"
        >
          {t('stay')}
        </button>
      </div>
    </div>
  );
}
