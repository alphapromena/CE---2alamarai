import 'server-only';

import { createAdminSupabase } from '@/lib/supabase/admin';
import { logDebug, logInfo, logWarn, reportError } from '@/lib/observability/logger';

// IPQualityScore (IPQS) free-tier IP reputation lookup with 24h cache.
//
// Contract:
//   - Never throws.
//   - Returns null whenever the feature cannot produce a result — unset API
//     key, missing IP, API error, timeout, non-2xx, unexpected payload.
//   - Writes hits into public.ip_reputation via the service-role client.
//   - Respects cached rows younger than CACHE_TTL_MS.
//
// Graceful degradation is explicit because the caller (the promoter check-in
// trust path) must never be blocked or slowed.

export type IpReputationResult = {
  ip: string;
  is_vpn: boolean | null;
  is_proxy: boolean | null;
  is_tor: boolean | null;
  fraud_score: number | null;
  reported_country: string | null;
  reported_region: string | null;
  raw_response: Record<string, unknown>;
  cached: boolean;
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 3_000;

function normaliseCountry(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toUpperCase();
  if (trimmed.length !== 2) return null;
  return trimmed;
}

function pickBool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function pickNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function pickString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function parsePayload(ip: string, payload: unknown): IpReputationResult | null {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload as Record<string, unknown>;
  // IPQS returns { success: boolean, ... }; treat success=false as not-usable.
  if (raw.success === false) return null;
  return {
    ip,
    is_vpn: pickBool(raw.vpn),
    is_proxy: pickBool(raw.proxy),
    is_tor: pickBool(raw.tor),
    fraud_score: pickNumber(raw.fraud_score),
    reported_country: normaliseCountry(raw.country_code),
    reported_region: pickString(raw.region),
    raw_response: raw,
    cached: false,
  };
}

export async function getIpReputation(ip: string | null | undefined): Promise<IpReputationResult | null> {
  if (!ip) return null;

  const key = process.env.IPQUALITYSCORE_API_KEY;
  if (!key) {
    logDebug('location_trust.ipqs.skipped_no_key');
    return null;
  }

  const admin = createAdminSupabase();

  // 1) Cache read-through: 24h freshness window.
  try {
    const since = new Date(Date.now() - CACHE_TTL_MS).toISOString();
    const { data, error } = await admin
      .from('ip_reputation')
      .select('ip_address, is_vpn, is_proxy, is_tor, fraud_score, reported_country, reported_region, raw_response, checked_at')
      .eq('ip_address', ip)
      .gte('checked_at', since)
      .order('checked_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error && data) {
      logDebug('location_trust.ipqs.cache_hit', { ip });
      return {
        ip,
        is_vpn: (data.is_vpn as boolean | null) ?? null,
        is_proxy: (data.is_proxy as boolean | null) ?? null,
        is_tor: (data.is_tor as boolean | null) ?? null,
        fraud_score: (data.fraud_score as number | null) ?? null,
        reported_country: (data.reported_country as string | null) ?? null,
        reported_region: (data.reported_region as string | null) ?? null,
        raw_response: (data.raw_response as Record<string, unknown> | null) ?? {},
        cached: true,
      };
    }
  } catch (err) {
    // Cache read failure must not block the lookup path.
    reportError(err, { at: 'location_trust.ipqs.cache_read' });
  }

  // 2) Live fetch with 3s timeout. Never throws.
  let result: IpReputationResult | null = null;
  try {
    const url = `https://ipqualityscore.com/api/json/ip/${encodeURIComponent(key)}/${encodeURIComponent(ip)}`;
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      logWarn('location_trust.ipqs.http_error', { status: res.status });
      return null;
    }
    const payload = (await res.json()) as unknown;
    result = parsePayload(ip, payload);
    if (!result) {
      logWarn('location_trust.ipqs.unusable_payload');
      return null;
    }
  } catch (err) {
    // AbortError (timeout), network error, JSON error — all swallowed.
    reportError(err, { at: 'location_trust.ipqs.fetch' });
    return null;
  }

  // 3) Upsert into the cache. Swallow errors — we still return the fresh result.
  try {
    await admin
      .from('ip_reputation')
      .upsert(
        {
          ip_address: result.ip,
          is_vpn: result.is_vpn,
          is_proxy: result.is_proxy,
          is_tor: result.is_tor,
          fraud_score: result.fraud_score,
          reported_country: result.reported_country,
          reported_region: result.reported_region,
          raw_response: result.raw_response,
          checked_at: new Date().toISOString(),
        },
        { onConflict: 'ip_address' },
      );
    logInfo('location_trust.ipqs.cached', { ip: result.ip });
  } catch (err) {
    reportError(err, { at: 'location_trust.ipqs.cache_write' });
  }

  return result;
}
