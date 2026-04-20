import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MaybeSingleResp = { data: Record<string, unknown> | null; error: { message: string } | null };

const cacheResult = { current: { data: null, error: null } as MaybeSingleResp };
const upsertSpy = vi.fn();
const maybeSingleSpy = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabase: () => ({
    from: () => {
      const selectChain = {
        select: () => selectChain,
        eq: () => selectChain,
        gte: () => selectChain,
        order: () => selectChain,
        limit: () => selectChain,
        maybeSingle: async () => {
          maybeSingleSpy();
          return cacheResult.current;
        },
        upsert: async (...args: unknown[]) => {
          upsertSpy(...args);
          return { data: null, error: null };
        },
      };
      return selectChain;
    },
  }),
}));

import { getIpReputation } from './ipqs';

describe('lib/location-trust/ipqs', () => {
  const origKey = process.env.IPQUALITYSCORE_API_KEY;
  const fetchSpy = vi.fn();

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    fetchSpy.mockReset();
    maybeSingleSpy.mockReset();
    upsertSpy.mockReset();
    cacheResult.current = { data: null, error: null };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.IPQUALITYSCORE_API_KEY = origKey;
  });

  it('returns null and does not fetch when no API key is set', async () => {
    delete process.env.IPQUALITYSCORE_API_KEY;
    const res = await getIpReputation('203.0.113.7');
    expect(res).toBe(null);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(maybeSingleSpy).not.toHaveBeenCalled();
  });

  it('returns null for missing ip without calling anything', async () => {
    process.env.IPQUALITYSCORE_API_KEY = 'key';
    const res = await getIpReputation(null);
    expect(res).toBe(null);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns a cached row when one exists within 24h', async () => {
    process.env.IPQUALITYSCORE_API_KEY = 'key';
    cacheResult.current = {
      data: {
        ip_address: '203.0.113.7',
        is_vpn: true,
        is_proxy: false,
        is_tor: false,
        fraud_score: 42,
        reported_country: 'JO',
        reported_region: 'Amman',
        raw_response: { cached: 'yes' },
        checked_at: new Date().toISOString(),
      },
      error: null,
    };
    const res = await getIpReputation('203.0.113.7');
    expect(res?.cached).toBe(true);
    expect(res?.is_vpn).toBe(true);
    expect(res?.reported_country).toBe('JO');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('fetches, normalises, and writes through on cache miss (happy path)', async () => {
    process.env.IPQUALITYSCORE_API_KEY = 'test-key';
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        vpn: true,
        proxy: false,
        tor: false,
        fraud_score: 90,
        country_code: 'sa',
        region: 'Riyadh',
      }),
    });

    const res = await getIpReputation('203.0.113.7');
    expect(res).not.toBe(null);
    expect(res?.cached).toBe(false);
    expect(res?.is_vpn).toBe(true);
    expect(res?.fraud_score).toBe(90);
    expect(res?.reported_country).toBe('SA'); // uppercased
    expect(res?.reported_region).toBe('Riyadh');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain('ipqualityscore.com/api/json/ip/test-key/203.0.113.7');
    expect(upsertSpy).toHaveBeenCalledTimes(1);
  });

  it('returns null on HTTP non-2xx without throwing', async () => {
    process.env.IPQUALITYSCORE_API_KEY = 'test-key';
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) });
    const res = await getIpReputation('203.0.113.7');
    expect(res).toBe(null);
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('returns null when fetch throws (timeout / network)', async () => {
    process.env.IPQUALITYSCORE_API_KEY = 'test-key';
    fetchSpy.mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError'));
    const res = await getIpReputation('203.0.113.7');
    expect(res).toBe(null);
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('returns null when IPQS replies success=false', async () => {
    process.env.IPQUALITYSCORE_API_KEY = 'test-key';
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: false, message: 'bad key' }),
    });
    const res = await getIpReputation('203.0.113.7');
    expect(res).toBe(null);
  });
});
