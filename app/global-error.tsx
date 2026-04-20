'use client';

// Global error boundary. Catches errors that escape the locale layout
// (e.g., errors thrown in root layout or before NextIntlClientProvider
// mounts). Must render its own <html> + <body> per Next.js contract.
// Intentionally locale-agnostic fallback text (can't access next-intl here).

import { useEffect } from 'react';
import { reportClientError } from '@/lib/observability/report-client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error, { digest: error.digest, scope: 'global' });
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, padding: 0 }}>
        <main
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            backgroundColor: '#fafafa',
          }}
        >
          <div
            style={{
              maxWidth: '32rem',
              width: '100%',
              padding: '2rem',
              border: '1px solid #e5e5e5',
              borderRadius: '0.5rem',
              backgroundColor: '#fff',
              textAlign: 'center',
            }}
          >
            <h1 style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: 0 }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: '0.875rem', color: '#525252' }}>
              An unexpected error occurred. Please try again.
            </p>
            {error.digest ? (
              <p
                style={{ fontSize: '0.75rem', color: '#737373', direction: 'ltr' }}
              >{`Error ID: ${error.digest}`}</p>
            ) : null}
            <button
              type="button"
              onClick={reset}
              style={{
                marginTop: '1rem',
                padding: '0.5rem 1rem',
                backgroundColor: '#4f46e5',
                color: '#fff',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
