import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const alertInsertSpy = vi.fn();
const attendanceSelectResp = {
  current: {
    data: { id: 'att-1', user_id: 'u-1', campaign_id: 'c-1', location_id: 'l-1' } as Record<string, unknown> | null,
    error: null as { message: string } | null,
  },
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabase: () => ({
    from: (table: string) => {
      if (table === 'attendance') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => attendanceSelectResp.current,
        };
        return chain;
      }
      if (table === 'alerts') {
        return {
          insert: async (payload: unknown) => {
            alertInsertSpy(payload);
            return { data: null, error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

const getIpReputationMock = vi.fn();
vi.mock('./ipqs', () => ({
  getIpReputation: (...args: unknown[]) => getIpReputationMock(...args),
}));

import { recordLocationTrustCheck } from './record';

const AMMAN = { lat: 31.9539, lng: 35.9106 };

describe('lib/location-trust/record', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    alertInsertSpy.mockReset();
    getIpReputationMock.mockReset();
    attendanceSelectResp.current = {
      data: { id: 'att-1', user_id: 'u-1', campaign_id: 'c-1', location_id: 'l-1' },
      error: null,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not insert an alert when signals are clean', async () => {
    getIpReputationMock.mockResolvedValueOnce({
      ip: '203.0.113.7',
      is_vpn: false,
      is_proxy: false,
      is_tor: false,
      fraud_score: 5,
      reported_country: 'JO',
      reported_region: 'Amman',
      raw_response: {},
      cached: false,
    });
    await recordLocationTrustCheck({
      attendanceId: 'att-1',
      ip: '203.0.113.7',
      lat: AMMAN.lat,
      lng: AMMAN.lng,
    });
    expect(alertInsertSpy).not.toHaveBeenCalled();
  });

  it('inserts a location_trust_low alert with reasons + signals when suspicious', async () => {
    getIpReputationMock.mockResolvedValueOnce({
      ip: '203.0.113.7',
      is_vpn: true,
      is_proxy: false,
      is_tor: false,
      fraud_score: 95,
      reported_country: 'DE',
      reported_region: 'Berlin',
      raw_response: {},
      cached: false,
    });
    await recordLocationTrustCheck({
      attendanceId: 'att-1',
      ip: '203.0.113.7',
      lat: AMMAN.lat,
      lng: AMMAN.lng,
    });
    expect(alertInsertSpy).toHaveBeenCalledTimes(1);
    const payload = alertInsertSpy.mock.calls[0]![0] as {
      alert_type: string;
      status: string;
      user_id: string;
      attendance_id: string;
      campaign_id: string;
      location_id: string;
      message_key: string;
      message_params: {
        trust_signals: Record<string, unknown>;
        reasons: string[];
      };
    };
    expect(payload.alert_type).toBe('location_trust_low');
    expect(payload.status).toBe('open');
    expect(payload.user_id).toBe('u-1');
    expect(payload.attendance_id).toBe('att-1');
    expect(payload.message_key).toBe('alerts.location_trust_low');
    expect(payload.message_params.reasons).toContain('vpn');
    expect(payload.message_params.reasons).toContain('fraud_score_high');
    expect(payload.message_params.reasons).toContain('country_mismatch');
    expect(payload.message_params.trust_signals.reported_country).toBe('DE');
    expect(payload.message_params.trust_signals.computed_country).toBe('JO');
  });

  it('does not insert when the attendance row is missing', async () => {
    getIpReputationMock.mockResolvedValueOnce({
      ip: '203.0.113.7',
      is_vpn: true,
      is_proxy: false,
      is_tor: false,
      fraud_score: 90,
      reported_country: 'DE',
      reported_region: null,
      raw_response: {},
      cached: false,
    });
    attendanceSelectResp.current = { data: null, error: null };
    await recordLocationTrustCheck({
      attendanceId: 'att-1',
      ip: '203.0.113.7',
      lat: AMMAN.lat,
      lng: AMMAN.lng,
    });
    expect(alertInsertSpy).not.toHaveBeenCalled();
  });

  it('never throws when IPQS returns null (missing key / API down)', async () => {
    getIpReputationMock.mockResolvedValueOnce(null);
    await expect(
      recordLocationTrustCheck({
        attendanceId: 'att-1',
        ip: '203.0.113.7',
        lat: AMMAN.lat,
        lng: AMMAN.lng,
      }),
    ).resolves.toBeUndefined();
    expect(alertInsertSpy).not.toHaveBeenCalled();
  });

  it('never throws when an underlying call blows up', async () => {
    getIpReputationMock.mockRejectedValueOnce(new Error('boom'));
    await expect(
      recordLocationTrustCheck({
        attendanceId: 'att-1',
        ip: '203.0.113.7',
        lat: AMMAN.lat,
        lng: AMMAN.lng,
      }),
    ).resolves.toBeUndefined();
  });
});
