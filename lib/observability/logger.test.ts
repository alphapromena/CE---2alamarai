import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logDebug, logError, logInfo, logWarn, reportError } from './logger';

describe('lib/observability/logger', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  const origLevel = process.env.LOG_LEVEL;
  const origDsn = process.env.SENTRY_DSN;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    process.env.LOG_LEVEL = origLevel;
    process.env.SENTRY_DSN = origDsn;
    delete (globalThis as { Sentry?: unknown }).Sentry;
  });

  it('emits JSON lines with ts, level, msg fields', () => {
    logInfo('hello', { user_id: 'u-1' });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(line.level).toBe('info');
    expect(line.msg).toBe('hello');
    expect(line.user_id).toBe('u-1');
    expect(typeof line.ts).toBe('string');
    expect(new Date(line.ts).toString()).not.toBe('Invalid Date');
  });

  it('routes warn/error to the right console methods', () => {
    logWarn('oops');
    logError('boom');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('redacts sensitive keys recursively and case-insensitively', () => {
    logInfo('context', {
      password: 'hunter2',
      Token: 'abc',
      inner: { access_token: 'xyz', ok: 'keep' },
      list: [{ refresh_token: 'r1' }],
    });
    const line = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(line.password).toBe('[redacted]');
    expect(line.Token).toBe('[redacted]');
    expect(line.inner.access_token).toBe('[redacted]');
    expect(line.inner.ok).toBe('keep');
    expect(line.list[0].refresh_token).toBe('[redacted]');
  });

  it('respects LOG_LEVEL=warn (info and debug dropped)', () => {
    process.env.LOG_LEVEL = 'warn';
    logDebug('d');
    logInfo('i');
    logWarn('w');
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('reportError serializes Error objects and forwards to Sentry when DSN set', () => {
    const capture = vi.fn();
    process.env.SENTRY_DSN = 'https://example@o0.ingest.sentry.io/0';
    (globalThis as { Sentry?: unknown }).Sentry = { captureException: capture };

    const err = new Error('kaboom');
    reportError(err, { password: 'secret', scope: 'test' });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(line.msg).toBe('kaboom');
    expect(line.error.name).toBe('Error');
    expect(line.error.message).toBe('kaboom');
    expect(line.password).toBe('[redacted]');

    expect(capture).toHaveBeenCalledTimes(1);
    const call = capture.mock.calls[0]!;
    expect(call[0]).toBe(err);
    const ctx = call[1] as { extra: { password: string; scope: string } };
    expect(ctx.extra.password).toBe('[redacted]');
    expect(ctx.extra.scope).toBe('test');
  });

  it('reportError does not call Sentry when SENTRY_DSN is unset', () => {
    delete process.env.SENTRY_DSN;
    const capture = vi.fn();
    (globalThis as { Sentry?: unknown }).Sentry = { captureException: capture };
    reportError(new Error('x'));
    expect(capture).not.toHaveBeenCalled();
  });

  it('reportError is safe when Sentry.captureException throws', () => {
    process.env.SENTRY_DSN = 'x';
    (globalThis as { Sentry?: unknown }).Sentry = {
      captureException: () => {
        throw new Error('sentry down');
      },
    };
    expect(() => reportError(new Error('y'))).not.toThrow();
  });
});
