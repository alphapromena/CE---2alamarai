'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { RefreshCw, X } from 'lucide-react';

// Registers /sw.js in production and watches the registration for a waiting
// worker. When one is installed (i.e. a new version is ready and the current
// page is still controlled by the previous version), surface a non-blocking
// toast. Tapping it messages the waiting worker to skip-waiting, then reloads
// once `controllerchange` fires so the page starts using the new bundle.

export function ServiceWorkerRegister() {
  const t = useTranslations('Pwa');
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    let cancelled = false;

    const onLoad = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        if (cancelled) return;

        // Already-waiting worker (e.g. a reload after a new build landed).
        if (registration.waiting && navigator.serviceWorker.controller) {
          setWaiting(registration.waiting);
        }

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              setWaiting(installing);
            }
          });
        });

        // After skip-waiting completes, the controller swaps — reload to pick
        // up the fresh bundle.
        let reloading = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (reloading) return;
          reloading = true;
          window.location.reload();
        });
      } catch {
        // Registration failures are non-fatal; the app still works without offline support.
      }
    };

    if (document.readyState === 'complete') {
      onLoad();
    } else {
      window.addEventListener('load', onLoad, { once: true });
    }

    return () => {
      cancelled = true;
    };
  }, []);

  if (!waiting) return null;

  const activate = () => {
    waiting.postMessage({ type: 'SKIP_WAITING' });
  };
  const dismiss = () => {
    setWaiting(null);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-lg border border-border bg-white p-3 shadow-lg"
    >
      <RefreshCw className="h-5 w-5 shrink-0 text-accent" strokeWidth={1.75} aria-hidden />
      <p className="flex-1 text-sm text-fg">{t('update_available')}</p>
      <button
        type="button"
        onClick={activate}
        className="inline-flex h-8 items-center rounded-md bg-accent px-3 text-xs font-medium text-white hover:bg-accent-hover"
      >
        {t('update_cta')}
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('dismiss')}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted hover:bg-bg-hover"
      >
        <X className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  );
}
