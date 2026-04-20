import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';

export type ConsumerFeedbackListRow = {
  id: string;
  created_at: string;
  updated_at: string;
  campaign_id: string;
  location_id: string;
  promoter_user_id: string;
  daily_report_id: string | null;
  supervisor_visit_id: string | null;
  category: 'service' | 'product' | 'complaint' | 'suggestion' | 'other';
  sentiment: 'positive' | 'neutral' | 'negative' | null;
  body: string;
  campaign_name_i18n: { ar?: string; en?: string } | null;
  location_name_i18n: { ar?: string; en?: string } | null;
  promoter_name: string | null;
  competitor_brands: string[];
};

type RelOne<T> = T | T[] | null;
const pickOne = <T>(v: RelOne<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/**
 * List consumer_feedback rows visible to the caller (RLS-filtered).
 * Admin/supervisor see all visible rows; promoter sees own rows only.
 * Clients cannot see raw feedback (RLS blocks). Use the aggregate export
 * builder for the client-facing roll-up.
 */
export async function listFeedback(filters: {
  campaignId?: string | null;
  locationId?: string | null;
  category?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  limit?: number;
}): Promise<ConsumerFeedbackListRow[]> {
  const supabase = await createServerSupabase();
  let q = supabase
    .from('consumer_feedback')
    .select(
      `id, created_at, updated_at, campaign_id, location_id, promoter_user_id,
       daily_report_id, supervisor_visit_id, category, sentiment, body,
       campaign:campaigns ( name_i18n ),
       location:locations ( name_i18n ),
       promoter:profiles!consumer_feedback_promoter_user_id_fkey ( full_name ),
       competitor_mentions ( brand )`,
    )
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 200);
  if (filters.campaignId) q = q.eq('campaign_id', filters.campaignId);
  if (filters.locationId) q = q.eq('location_id', filters.locationId);
  if (filters.category) q = q.eq('category', filters.category);
  if (filters.fromDate) q = q.gte('created_at', filters.fromDate);
  if (filters.toDate) q = q.lte('created_at', `${filters.toDate}T23:59:59.999Z`);
  const { data } = await q;
  if (!data) return [];
  type Raw = Omit<
    ConsumerFeedbackListRow,
    'campaign_name_i18n' | 'location_name_i18n' | 'promoter_name' | 'competitor_brands'
  > & {
    campaign: RelOne<{ name_i18n: { ar?: string; en?: string } | null }>;
    location: RelOne<{ name_i18n: { ar?: string; en?: string } | null }>;
    promoter: RelOne<{ full_name: string | null }>;
    competitor_mentions: { brand: string }[] | null;
  };
  return (data as unknown as Raw[]).map((r) => ({
    id: r.id,
    created_at: r.created_at,
    updated_at: r.updated_at,
    campaign_id: r.campaign_id,
    location_id: r.location_id,
    promoter_user_id: r.promoter_user_id,
    daily_report_id: r.daily_report_id,
    supervisor_visit_id: r.supervisor_visit_id,
    category: r.category,
    sentiment: r.sentiment,
    body: r.body,
    campaign_name_i18n: pickOne(r.campaign)?.name_i18n ?? null,
    location_name_i18n: pickOne(r.location)?.name_i18n ?? null,
    promoter_name: pickOne(r.promoter)?.full_name ?? null,
    competitor_brands: (r.competitor_mentions ?? []).map((c) => c.brand),
  }));
}
