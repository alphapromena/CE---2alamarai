import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isEmailConfigured, sendEmail } from './send';

describe('lib/email/send', () => {
  const origKey = process.env.RESEND_API_KEY;
  const origFrom = process.env.RESEND_FROM_EMAIL;
  const fetchSpy = vi.fn();

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    fetchSpy.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.RESEND_API_KEY = origKey;
    process.env.RESEND_FROM_EMAIL = origFrom;
  });

  it('skips with reason=no_api_key when RESEND_API_KEY is unset', async () => {
    delete process.env.RESEND_API_KEY;
    process.env.RESEND_FROM_EMAIL = 'from@example.com';
    const res = await sendEmail({ to: 'x@y.com', subject: 'S', html: '<p/>' });
    expect(res).toEqual({ status: 'skipped', reason: 'no_api_key' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(isEmailConfigured()).toBe(false);
  });

  it('skips with reason=no_from_address when RESEND_FROM_EMAIL is unset', async () => {
    process.env.RESEND_API_KEY = 'k';
    delete process.env.RESEND_FROM_EMAIL;
    const res = await sendEmail({ to: 'x@y.com', subject: 'S', html: '<p/>' });
    expect(res).toEqual({ status: 'skipped', reason: 'no_from_address' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(isEmailConfigured()).toBe(false);
  });

  it('calls Resend with the expected payload when configured', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.RESEND_FROM_EMAIL = 'noreply@promoter.test';
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'email-abc' }),
    });

    const res = await sendEmail({
      to: 'user@example.com',
      subject: 'Export ready',
      html: '<p>hi</p>',
      text: 'hi',
    });
    expect(res).toEqual({ status: 'sent', id: 'email-abc' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect((init as RequestInit).method).toBe('POST');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-key');
    const body = JSON.parse((init as RequestInit).body as string) as {
      from: string;
      to: string[];
      subject: string;
    };
    expect(body.from).toBe('noreply@promoter.test');
    expect(body.to).toEqual(['user@example.com']);
    expect(body.subject).toBe('Export ready');
  });

  it('returns status=failed on non-2xx response without throwing', async () => {
    process.env.RESEND_API_KEY = 'k';
    process.env.RESEND_FROM_EMAIL = 'f@x';
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: async () => 'bad address',
    });
    const res = await sendEmail({ to: 'x@y.com', subject: 'S', html: '' });
    expect(res).toEqual({ status: 'failed', error: 'http_422' });
  });

  it('returns status=failed when fetch throws', async () => {
    process.env.RESEND_API_KEY = 'k';
    process.env.RESEND_FROM_EMAIL = 'f@x';
    fetchSpy.mockRejectedValueOnce(new Error('network down'));
    const res = await sendEmail({ to: 'x@y.com', subject: 'S', html: '' });
    expect(res.status).toBe('failed');
  });
});
