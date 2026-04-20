import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({
  headers: async () => new Map<string, string>([['x-forwarded-for', '10.0.0.1, 172.16.0.1']]),
}));

const mockRpc = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabase: () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

import { RATE_LIMITS, checkRateLimit } from './check';

describe('lib/rate-limit/check', () => {
  afterEach(() => {
    mockRpc.mockReset();
  });

  it('exports a policy for every public Server Action we rate-limit', () => {
    expect(RATE_LIMITS.login).toBeDefined();
    expect(RATE_LIMITS.reset_request).toBeDefined();
    expect(RATE_LIMITS.reset_confirm).toBeDefined();
    expect(RATE_LIMITS.feedback_submit).toBeDefined();
    expect(RATE_LIMITS.export_queue).toBeDefined();

    // Sanity: every policy has positive window/max values so the SQL
    // function won't raise.
    for (const [name, p] of Object.entries(RATE_LIMITS)) {
      expect(p.windowSeconds).toBeGreaterThan(0);
      expect(p.max).toBeGreaterThan(0);
      expect(p.action).toBe(name);
    }
  });

  it('returns allowed=true when the RPC says allowed', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ allowed: true, count: 3, reset_at: '2026-04-20T12:00:00Z' }],
      error: null,
    });
    const r = await checkRateLimit('login');
    expect(r.allowed).toBe(true);
    expect(r.count).toBe(3);
    expect(r.resetAt.toISOString()).toBe('2026-04-20T12:00:00.000Z');
    expect(mockRpc).toHaveBeenCalledTimes(1);
    const args = mockRpc.mock.calls[0]!;
    expect(args[0]).toBe('check_rate_limit');
    expect(args[1].p_key.startsWith('login:ip:10.0.0.1')).toBe(true);
    expect(args[1].p_window_seconds).toBe(RATE_LIMITS.login.windowSeconds);
    expect(args[1].p_max_requests).toBe(RATE_LIMITS.login.max);
  });

  it('includes user id in the key when provided', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ allowed: true, count: 1, reset_at: '2026-04-20T12:00:00Z' }],
      error: null,
    });
    await checkRateLimit('feedback_submit', 'user-abc');
    expect(mockRpc.mock.calls[0]![1].p_key).toBe('feedback_submit:u:user-abc');
  });

  it('returns allowed=false when the RPC says over-limit', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ allowed: false, count: 11, reset_at: '2026-04-20T12:00:00Z' }],
      error: null,
    });
    const r = await checkRateLimit('login');
    expect(r.allowed).toBe(false);
    expect(r.count).toBe(11);
  });

  it('fails open on DB error (never breaks legitimate users during infra glitches)', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'connection refused' },
    });
    const r = await checkRateLimit('login');
    expect(r.allowed).toBe(true);
    expect(r.count).toBe(0);
    expect(r.resetAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('fails open on missing data row', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null });
    const r = await checkRateLimit('export_queue');
    expect(r.allowed).toBe(true);
  });
});
