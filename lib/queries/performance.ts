import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';
import type { PeriodKind, ScopeKind } from '@/lib/performance/rollups';
import type { Tier, TierMetric } from '@/lib/performance/tiering';

export type PerformanceRow = {
  id: string;
  scope_kind: ScopeKind;
  scope_id: string;
  campaign_id: string;
  period_kind: PeriodKind;
  period_start: string;
  period_end: string;
  reports_count: number;
  total_traffic: number | null;
  contacts: number;
  engaged: number;
  samples_total: number;
  sales_total: number;
  interaction_rate: number | null;
  engagement_rate: number | null;
  sampling_rate: number | null;
  conversion_rate: number | null;
  sample_to_conversion_rate: number | null;
  sku_contributions: Record<string, number>;
  sampling_rate_denominator: 'contacts' | 'engaged' | null;
  tier: Tier | null;
  tier_metric: TierMetric;
  tier_metric_value: number | null;
  tier_high_threshold: number | null;
  tier_medium_threshold: number | null;
  rank_in_scope: number | null;
  scope_size: number | null;
  computed_at: string;
};

const SELECT_COLUMNS =
  'id, scope_kind, scope_id, campaign_id, period_kind, period_start, period_end, ' +
  'reports_count, total_traffic, contacts, engaged, samples_total, sales_total, ' +
  'interaction_rate, engagement_rate, sampling_rate, conversion_rate, ' +
  'sample_to_conversion_rate, sku_contributions, sampling_rate_denominator, ' +
  'tier, tier_metric, tier_metric_value, tier_high_threshold, tier_medium_threshold, ' +
  'rank_in_scope, scope_size, computed_at';

/**
 * Latest snapshot per (scope, campaign, period_kind), filtered.
 * RLS scopes results to the caller automatically.
 */
export async function listLatestPerformance(filter: {
  campaign_id?: string;
  scope_kind?: ScopeKind;
  period_kind?: PeriodKind;
}): Promise<PerformanceRow[]> {
  const supabase = await createServerSupabase();
  let q = supabase.from('performance_latest').select(SELECT_COLUMNS);
  if (filter.campaign_id) q = q.eq('campaign_id', filter.campaign_id);
  if (filter.scope_kind) q = q.eq('scope_kind', filter.scope_kind);
  if (filter.period_kind) q = q.eq('period_kind', filter.period_kind);
  const { data, error } = await q.order('rank_in_scope', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as unknown as PerformanceRow[];
}

/**
 * History (time-series) for a single scope, ordered ascending by period_start.
 * Used by the promoter / location / campaign drill-down trend charts.
 */
export async function listPerformanceHistory(args: {
  scope_kind: ScopeKind;
  scope_id: string;
  campaign_id: string;
  period_kind: PeriodKind;
  limit?: number;
}): Promise<PerformanceRow[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('performance_snapshots')
    .select(SELECT_COLUMNS)
    .eq('scope_kind', args.scope_kind)
    .eq('scope_id', args.scope_id)
    .eq('campaign_id', args.campaign_id)
    .eq('period_kind', args.period_kind)
    .order('period_start', { ascending: true })
    .limit(args.limit ?? 60);
  if (error) throw error;
  return (data ?? []) as unknown as PerformanceRow[];
}

/**
 * Single latest row for a scope. Returns null when no snapshot exists yet.
 */
export async function getLatestPerformance(args: {
  scope_kind: ScopeKind;
  scope_id: string;
  campaign_id: string;
  period_kind: PeriodKind;
}): Promise<PerformanceRow | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('performance_latest')
    .select(SELECT_COLUMNS)
    .eq('scope_kind', args.scope_kind)
    .eq('scope_id', args.scope_id)
    .eq('campaign_id', args.campaign_id)
    .eq('period_kind', args.period_kind)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as PerformanceRow | null;
}

/**
 * Tier distribution for a campaign across a scope (typically promoter or
 * location). Used by aggregate cards (admin/supervisor/client).
 */
export async function tierDistributionForCampaign(args: {
  campaign_id: string;
  scope_kind: ScopeKind;
  period_kind: PeriodKind;
}): Promise<{ top: number; medium: number; low: number; unclassified: number; total: number }> {
  const rows = await listLatestPerformance({
    campaign_id: args.campaign_id,
    scope_kind: args.scope_kind,
    period_kind: args.period_kind,
  });
  let top = 0;
  let medium = 0;
  let low = 0;
  let unclassified = 0;
  for (const r of rows) {
    if (r.tier === 'top') top += 1;
    else if (r.tier === 'medium') medium += 1;
    else if (r.tier === 'low') low += 1;
    else unclassified += 1;
  }
  return { top, medium, low, unclassified, total: rows.length };
}
