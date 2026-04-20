-- Feature 2 — VPN / Location Trust Detection.
--
-- Adds:
--   1. alert_type enum value: location_trust_low
--      Raised at check-in when the promoter's source IP looks like a VPN,
--      proxy, or disagrees with the reported lat/lng country. The signal is
--      surfaced to the supervisor; check-in itself is never blocked.
--
--   2. public.ip_reputation — 24h-cache of IPQualityScore lookups, keyed on
--      ip_address. Writes happen from the server-only orchestrator with the
--      service-role client. RLS is enabled with no policies so no
--      authenticated role can read or write — the table is service-role only.
--
-- Additive-only, IF NOT EXISTS everywhere, safe to re-apply.
--
-- Notes on COMMENT statements: single-line only, no `||` concatenation
-- across lines (mirrors the Feature 2 task guidance).

-- ============================================================================
-- 1. alert_type enum extension
-- ============================================================================
alter type public.alert_type add value if not exists 'location_trust_low';

-- ============================================================================
-- 2. ip_reputation cache table
-- ============================================================================
create table if not exists public.ip_reputation (
  id                uuid primary key default gen_random_uuid(),
  ip_address        inet not null unique,
  is_vpn            boolean,
  is_proxy          boolean,
  is_tor            boolean,
  fraud_score       integer,
  reported_country  text,
  reported_region   text,
  checked_at        timestamptz not null default now(),
  raw_response      jsonb
);

comment on table public.ip_reputation is 'Feature 2: cached IPQualityScore lookups keyed on ip_address; 24h freshness window checked at read time.';
comment on column public.ip_reputation.ip_address is 'Client source IP (x-forwarded-for first hop, fallback x-real-ip).';
comment on column public.ip_reputation.fraud_score is 'IPQS 0-100 fraud score; higher = more suspicious.';
comment on column public.ip_reputation.reported_country is 'ISO-3166-1 alpha-2 country code as reported by IPQS for this IP.';
comment on column public.ip_reputation.raw_response is 'Full IPQS JSON response for audit.';

create index if not exists ip_reputation_ip_checked_idx
  on public.ip_reputation (ip_address, checked_at desc);

-- ============================================================================
-- 3. RLS — enabled with no policies = service-role only
-- ============================================================================
alter table public.ip_reputation enable row level security;
