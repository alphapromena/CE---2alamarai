'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Registration failures are non-fatal; the app still works without offline support.
      });
    };

    if (document.readyState === 'complete') {
      onLoad();
    } else {
      window.addEventListener('load', onLoad, { once: true });
      return () => window.removeEventListener('load', onLoad);
    }
  }, []);

  return null;
}
