// Pure location-trust signal detection. No I/O, no side effects, no server-only
// imports — safe to unit test and reuse.

import type { IpReputationResult } from './ipqs';

export type TrustReason = 'vpn' | 'proxy' | 'fraud_score_high' | 'country_mismatch';

export type TrustSignals = {
  isVpn: boolean;
  isProxy: boolean;
  fraudScoreHigh: boolean;
  countryMismatch: boolean;
  overallSuspicious: boolean;
  reasons: TrustReason[];
  computedCountry: string | null;
};

export const FRAUD_SCORE_HIGH_THRESHOLD = 85;

// MENA-focused country rectangles. Accuracy goal: distinguish Jordan from
// Germany — NOT resolve border towns or disputed regions. If a point falls
// outside every rectangle we return null (unknown) and a mismatch will NOT
// be flagged, to avoid false-positives at coverage edges.
type CountryBox = {
  code: string;
  // [minLat, maxLat, minLng, maxLng]
  bbox: [number, number, number, number];
};

const MENA_BOXES: CountryBox[] = [
  { code: 'JO', bbox: [29.18, 33.38, 34.95, 39.30] }, // Jordan
  { code: 'SA', bbox: [16.00, 32.16, 34.50, 55.67] }, // Saudi Arabia
  { code: 'AE', bbox: [22.63, 26.08, 51.58, 56.40] }, // United Arab Emirates
  { code: 'EG', bbox: [22.00, 31.67, 24.70, 36.90] }, // Egypt
  { code: 'BH', bbox: [25.53, 26.32, 50.30, 50.83] }, // Bahrain
  { code: 'QA', bbox: [24.55, 26.16, 50.75, 51.64] }, // Qatar
  { code: 'KW', bbox: [28.53, 30.10, 46.55, 48.43] }, // Kuwait
  { code: 'OM', bbox: [16.65, 26.39, 52.00, 59.84] }, // Oman
  { code: 'LB', bbox: [33.05, 34.69, 35.10, 36.63] }, // Lebanon
  { code: 'IQ', bbox: [29.06, 37.38, 38.79, 48.58] }, // Iraq
  { code: 'SY', bbox: [32.31, 37.32, 35.72, 42.38] }, // Syria
  { code: 'YE', bbox: [12.11, 18.99, 41.81, 54.48] }, // Yemen
  { code: 'PS', bbox: [31.22, 32.55, 34.22, 35.57] }, // Palestine
];

export function countryFromLatLng(lat: number | null | undefined, lng: number | null | undefined): string | null {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  for (const { code, bbox } of MENA_BOXES) {
    const [minLat, maxLat, minLng, maxLng] = bbox;
    if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) {
      return code;
    }
  }
  return null;
}

export type DetectInput = {
  ip: string | null;
  lat: number | null;
  lng: number | null;
  reputation: IpReputationResult | null;
};

export function detectLocationTrust(input: DetectInput): TrustSignals {
  const { reputation, lat, lng } = input;

  const isVpn = reputation?.is_vpn === true;
  const isProxy = reputation?.is_proxy === true;
  const fraudScoreHigh =
    typeof reputation?.fraud_score === 'number' && reputation.fraud_score >= FRAUD_SCORE_HIGH_THRESHOLD;

  const computedCountry = countryFromLatLng(lat, lng);
  const reportedCountry = reputation?.reported_country ?? null;
  const countryMismatch =
    computedCountry !== null && reportedCountry !== null && computedCountry !== reportedCountry;

  const reasons: TrustReason[] = [];
  if (isVpn) reasons.push('vpn');
  if (isProxy) reasons.push('proxy');
  if (fraudScoreHigh) reasons.push('fraud_score_high');
  if (countryMismatch) reasons.push('country_mismatch');

  return {
    isVpn,
    isProxy,
    fraudScoreHigh,
    countryMismatch,
    overallSuspicious: reasons.length > 0,
    reasons,
    computedCountry,
  };
}
