'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Share, X } from 'lucide-react';

// In-app install banner — two paths:
//   Android/desktop Chrome: capture `beforeinstallprompt`, defer it, expose a
//     CTA that triggers the saved prompt.
//   iOS Safari: no API exposed by WebKit. Detect iOS + non-standalone, show
//     instructions referencing the share button.
// Dismissal persists for the browser session only (sessionStorage), so a full
// restart re-prompts. Banner is hidden when already installed (standalone
// display-mode) and when dismissed.

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISS_KEY = 'pwa-install-dismissed';

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !/MSStream/.test(ua);
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  // iOS Safari exposes navigator.standalone (non-standard).
  const nav = navigator as Navigator & { standalone?: boolean };
  return Boolean(nav.standalone);
}

export function InstallPrompt() {
  const t = useTranslations('Pwa');
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [mode, setMode] = useState<'android' | 'ios' | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isStandalone()) return;
    if (sessionStorage.getItem(DISMISS_KEY) === '1') return;

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setMode('android');
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    // iOS Safari exposes no install event; detection has to run once on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isIos()) setMode('ios');

    const onInstalled = () => {
      setDeferred(null);
      setMode(null);
    };
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!mode) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Safari private-mode may throw; ignore.
    }
    setMode(null);
    setDeferred(null);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => undefined);
    setDeferred(null);
    setMode(null);
  };

  return (
    <div
      role="complementary"
      className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-md items-start gap-3 rounded-lg border border-border bg-white p-3 shadow-lg"
    >
      {mode === 'android' ? (
        <Download className="mt-0.5 h-5 w-5 shrink-0 text-accent" strokeWidth={1.75} aria-hidden />
      ) : (
        <Share className="mt-0.5 h-5 w-5 shrink-0 text-accent" strokeWidth={1.75} aria-hidden />
      )}
      <div className="flex-1 text-sm">
        <p className="font-medium text-fg">
          {mode === 'ios' ? t('install_ios_title') : t('install_title')}
        </p>
        <p className="mt-0.5 text-xs text-fg-secondary">
          {mode === 'ios' ? t('install_ios_description') : t('install_description')}
        </p>
        {mode === 'android' && deferred ? (
          <button
            type="button"
            onClick={install}
            className="mt-2 inline-flex h-8 items-center rounded-md bg-accent px-3 text-xs font-medium text-white hover:bg-accent-hover"
          >
            {t('install_cta')}
          </button>
        ) : null}
      </div>
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
