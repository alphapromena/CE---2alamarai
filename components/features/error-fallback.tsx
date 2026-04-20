'use client';

import { AlertCircle, Home, RotateCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Link } from '@/i18n/navigation';
import { reportClientError } from '@/lib/observability/report-client';

export interface ErrorFallbackProps {
  error: Error & { digest?: string };
  reset: () => void;
  showHomeLink?: boolean;
}

export function ErrorFallback({ error, reset, showHomeLink = true }: ErrorFallbackProps) {
  const t = useTranslations('Errors');

  useEffect(() => {
    reportClientError(error, { digest: error.digest });
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center px-6 py-12">
      <div className="w-full rounded-lg border border-border bg-bg-subtle p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-subtle text-danger">
          <AlertCircle className="h-6 w-6" strokeWidth={1.75} aria-hidden />
        </div>
        <h1 className="mt-4 text-xl font-semibold">{t('page_title')}</h1>
        <p className="mt-2 text-sm text-fg-secondary">{t('page_description')}</p>
        {error.digest ? (
          <p className="mt-3 text-xs text-fg-tertiary" dir="ltr">
            {t('error_id', { id: error.digest })}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover"
          >
            <RotateCw className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            {t('retry')}
          </button>
          {showHomeLink ? (
            <Link
              href="/"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-bg px-4 text-sm font-medium hover:bg-bg-subtle"
            >
              <Home className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              {t('go_home')}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
