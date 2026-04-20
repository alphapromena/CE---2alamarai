'use client';

import { ErrorFallback } from '@/components/features/error-fallback';

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorFallback error={error} reset={reset} showHomeLink={false} />;
}
