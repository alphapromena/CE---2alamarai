import 'server-only';

// Server-side structured logger. Writes one JSON object per line to stdout,
// which Vercel + Supabase Edge Runtime both capture automatically. Dropping
// into a log aggregator (Logtail, Axiom, Datadog, etc.) is a destination
// change, not a code change.
//
// Env toggles:
//   LOG_LEVEL         — 'debug' | 'info' | 'warn' | 'error' (default: 'info')
//   SENTRY_DSN        — if set AND the @sentry/node (or similar) SDK has been
//                       mounted on globalThis via instrumentation.ts,
//                       captureException is called for error-level logs.
//                       No hard dep; safe to leave unset.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function currentThreshold(): number {
  const raw = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  if (raw in LEVEL_RANK) return LEVEL_RANK[raw as LogLevel];
  return LEVEL_RANK.info;
}

const REDACT_KEYS = new Set([
  'password',
  'new_password',
  'current_password',
  'token',
  'access_token',
  'refresh_token',
  'api_key',
  'apikey',
  'authorization',
  'cookie',
  'secret',
  'service_role_key',
]);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]';
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACT_KEYS.has(k.toLowerCase()) ? '[redacted]' : redact(v, depth + 1);
  }
  return out;
}

function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      ...(err as unknown as Record<string, unknown>),
    };
  }
  return { value: err };
}

export type LogContext = Record<string, unknown>;

function emit(level: LogLevel, message: string, context: LogContext = {}): void {
  if (LEVEL_RANK[level] < currentThreshold()) return;

  const line = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(redact(context) as Record<string, unknown>),
  };

  const serialized = JSON.stringify(line);
  if (level === 'error') {
    // eslint-disable-next-line no-console
    console.error(serialized);
  } else if (level === 'warn') {
    // eslint-disable-next-line no-console
    console.warn(serialized);
  } else {
    // eslint-disable-next-line no-console
    console.log(serialized);
  }
}

export function logDebug(message: string, context?: LogContext): void {
  emit('debug', message, context);
}
export function logInfo(message: string, context?: LogContext): void {
  emit('info', message, context);
}
export function logWarn(message: string, context?: LogContext): void {
  emit('warn', message, context);
}
export function logError(message: string, context?: LogContext): void {
  emit('error', message, context);
}

type SentryLike = {
  captureException: (error: unknown, ctx?: unknown) => void;
};

function sentryGlobal(): SentryLike | null {
  if (!process.env.SENTRY_DSN) return null;
  const g = globalThis as typeof globalThis & { Sentry?: SentryLike };
  return g.Sentry && typeof g.Sentry.captureException === 'function' ? g.Sentry : null;
}

/**
 * Report an unhandled or semantically-important error. Always writes a
 * structured error log; additionally forwards to Sentry if SENTRY_DSN is set
 * AND a Sentry SDK has mounted on globalThis (e.g. from instrumentation.ts).
 */
export function reportError(error: unknown, context: LogContext = {}): void {
  const errObj = serializeError(error);
  logError(typeof errObj.message === 'string' ? errObj.message : 'error', {
    error: errObj,
    ...context,
  });

  const sentry = sentryGlobal();
  if (sentry) {
    try {
      sentry.captureException(error, { extra: redact(context) });
    } catch {
      // never let error reporting throw
    }
  }
}
