import { describe, expect, it } from 'vitest';
import { countryFromLatLng, detectLocationTrust, FRAUD_SCORE_HIGH_THRESHOLD } from './detect';
import type { IpReputationResult } from './ipqs';

const AMMAN = { lat: 31.9539, lng: 35.9106 }; // Jordan
const RIYADH = { lat: 24.7136, lng: 46.6753 }; // KSA
const BERLIN = { lat: 52.52, lng: 13.405 };    // outside MENA boxes

function reputation(overrides: Partial<IpReputationResult> = {}): IpReputationResult {
  return {
    ip: '203.0.113.7',
    is_vpn: false,
    is_proxy: false,
    is_tor: false,
    fraud_score: 10,
    reported_country: 'JO',
    reported_region: 'Amman',
    raw_response: {},
    cached: false,
    ...overrides,
  };
}

describe('countryFromLatLng', () => {
  it('resolves Amman coords to JO', () => {
    expect(countryFromLatLng(AMMAN.lat, AMMAN.lng)).toBe('JO');
  });

  it('resolves Riyadh coords to SA', () => {
    expect(countryFromLatLng(RIYADH.lat, RIYADH.lng)).toBe('SA');
  });

  it('returns null for points outside the MENA coverage', () => {
    expect(countryFromLatLng(BERLIN.lat, BERLIN.lng)).toBe(null);
  });

  it('returns null for non-finite or missing inputs', () => {
    expect(countryFromLatLng(null, null)).toBe(null);
    expect(countryFromLatLng(undefined, undefined)).toBe(null);
    expect(countryFromLatLng(NaN, 35)).toBe(null);
    expect(countryFromLatLng(31, Infinity)).toBe(null);
  });
});

describe('detectLocationTrust', () => {
  it('returns no triggers when everything is clean', () => {
    const s = detectLocationTrust({
      ip: '203.0.113.7',
      lat: AMMAN.lat,
      lng: AMMAN.lng,
      reputation: reputation(),
    });
    expect(s.overallSuspicious).toBe(false);
    expect(s.reasons).toEqual([]);
    expect(s.computedCountry).toBe('JO');
  });

  it('flags vpn in isolation', () => {
    const s = detectLocationTrust({
      ip: '203.0.113.7',
      lat: AMMAN.lat,
      lng: AMMAN.lng,
      reputation: reputation({ is_vpn: true }),
    });
    expect(s.isVpn).toBe(true);
    expect(s.reasons).toEqual(['vpn']);
    expect(s.overallSuspicious).toBe(true);
  });

  it('flags proxy in isolation', () => {
    const s = detectLocationTrust({
      ip: '203.0.113.7',
      lat: AMMAN.lat,
      lng: AMMAN.lng,
      reputation: reputation({ is_proxy: true }),
    });
    expect(s.reasons).toEqual(['proxy']);
  });

  it('flags fraud_score_high at the threshold boundary', () => {
    const s = detectLocationTrust({
      ip: '203.0.113.7',
      lat: AMMAN.lat,
      lng: AMMAN.lng,
      reputation: reputation({ fraud_score: FRAUD_SCORE_HIGH_THRESHOLD }),
    });
    expect(s.fraudScoreHigh).toBe(true);
    expect(s.reasons).toEqual(['fraud_score_high']);
  });

  it('does not flag fraud_score just below the threshold', () => {
    const s = detectLocationTrust({
      ip: '203.0.113.7',
      lat: AMMAN.lat,
      lng: AMMAN.lng,
      reputation: reputation({ fraud_score: FRAUD_SCORE_HIGH_THRESHOLD - 1 }),
    });
    expect(s.fraudScoreHigh).toBe(false);
    expect(s.reasons).toEqual([]);
  });

  it('flags country_mismatch when reported vs. computed disagree', () => {
    const s = detectLocationTrust({
      ip: '203.0.113.7',
      lat: AMMAN.lat,
      lng: AMMAN.lng,
      reputation: reputation({ reported_country: 'DE' }),
    });
    expect(s.countryMismatch).toBe(true);
    expect(s.reasons).toEqual(['country_mismatch']);
  });

  it('does not flag country_mismatch when computed country is unknown', () => {
    const s = detectLocationTrust({
      ip: '203.0.113.7',
      lat: BERLIN.lat,
      lng: BERLIN.lng,
      reputation: reputation({ reported_country: 'DE' }),
    });
    expect(s.computedCountry).toBe(null);
    expect(s.countryMismatch).toBe(false);
  });

  it('does not flag country_mismatch when reported country is unknown', () => {
    const s = detectLocationTrust({
      ip: '203.0.113.7',
      lat: AMMAN.lat,
      lng: AMMAN.lng,
      reputation: reputation({ reported_country: null }),
    });
    expect(s.countryMismatch).toBe(false);
  });

  it('returns clean signals when reputation is null (no data, no triggers)', () => {
    const s = detectLocationTrust({
      ip: '203.0.113.7',
      lat: AMMAN.lat,
      lng: AMMAN.lng,
      reputation: null,
    });
    expect(s.overallSuspicious).toBe(false);
    expect(s.reasons).toEqual([]);
  });

  it('flags every trigger simultaneously in order vpn → proxy → fraud → country', () => {
    const s = detectLocationTrust({
      ip: '203.0.113.7',
      lat: AMMAN.lat,
      lng: AMMAN.lng,
      reputation: reputation({
        is_vpn: true,
        is_proxy: true,
        fraud_score: 99,
        reported_country: 'DE',
      }),
    });
    expect(s.reasons).toEqual(['vpn', 'proxy', 'fraud_score_high', 'country_mismatch']);
    expect(s.overallSuspicious).toBe(true);
  });
});
