// Client-side error reporting stub.
// Replaced with a real provider (e.g. Sentry) via env toggle in step 4.
// Kept as a separate module so client components import it without pulling
// server-only logger code into the browser bundle.

export type ClientErrorContext = {
  digest?: string;
  [key: string]: unknown;
};

export function reportClientError(error: unknown, context: ClientErrorContext = {}): void {
  if (typeof window === 'undefined') return;

  const payload = {
    name: error instanceof Error ? error.name : 'UnknownError',
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    ...context,
  };

  // Always log so local dev + production browser consoles see it.
  console.error('[client-error]', payload);

  // Optional Sentry pass-through (only if the global was mounted via
  // a provider script configured at build/runtime).
  const g = window as typeof window & {
    Sentry?: {
      captureException: (err: unknown, ctx?: unknown) => void;
    };
  };
  if (g.Sentry && typeof g.Sentry.captureException === 'function') {
    try {
      g.Sentry.captureException(error, { extra: context });
    } catch {
      // never let error reporting throw
    }
  }
}
