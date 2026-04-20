/**
 * Phase 8 export types — shared by builders, compose, Server Actions, and
 * the generate-report Edge Function.
 *
 * These are the shapes that flow through the pure builder layer. The queries
 * layer is responsible for producing them from Supabase; the builders are
 * role-agnostic once called — role scoping happens at query time AND by
 * choosing the right builder variant (aggregate vs raw) per D-019 / D-033.
 */

export type ExportDomain =
  | 'attendance'
  | 'activity'
  | 'stock'
  | 'performance'
  | 'supervisor_actions'
  | 'feedback';

export const ALL_EXPORT_DOMAINS: readonly ExportDomain[] = [
  'attendance',
  'activity',
  'stock',
  'performance',
  'supervisor_actions',
  'feedback',
] as const;

export type ExportFormat = 'csv_zip' | 'xlsx';

export type ExportScope = {
  campaign_ids: string[];
  location_ids: string[];
  sku_ids: string[];
  /** YYYY-MM-DD inclusive */
  from_date: string;
  /** YYYY-MM-DD inclusive */
  to_date: string;
  domains: ExportDomain[];
};

export type ExportRole = 'admin' | 'supervisor' | 'client';

/** A generic rectangular table; builders produce one or more of these. */
export type Sheet = {
  /** ≤ 31 chars (Excel limit). Trimmed by writer if longer. */
  name: string;
  columns: string[];
  /** cells are primitives; null / undefined render as empty */
  rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>;
};

// ---------------------------------------------------------------------------
// Raw input shapes — what the queries layer hands to the builders.
// ---------------------------------------------------------------------------

export type I18nName = { ar?: string; en?: string } | null;

export type AttendanceRaw = {
  id: string;
  promoter_user_id: string;
  promoter_name: string | null;
  campaign_id: string;
  campaign_name: I18nName;
  location_id: string;
  location_name: I18nName;
  check_in_ts: string | null;
  check_out_ts: string | null;
  status: string;
  check_in_distance_m: number | null;
  check_out_distance_m: number | null;
  late_minutes: number | null;
};

export type DailyReportRaw = {
  id: string;
  report_date: string;
  promoter_user_id: string;
  promoter_name: string | null;
  campaign_id: string;
  campaign_name: I18nName;
  location_id: string;
  location_name: I18nName;
  status: string;
  contacts: number;
  engaged: number;
  samples_total: number;
  sales_total: number;
  total_traffic: number | null;
  interaction_rate: number | null;
  engagement_rate: number | null;
  sampling_rate: number | null;
  conversion_rate: number | null;
};

export type SalesEntryRaw = {
  daily_report_id: string;
  sku_id: string;
  sku_name: I18nName;
  samples: number;
  sales: number;
};

export type StockMovementRaw = {
  id: string;
  created_at: string;
  campaign_id: string;
  campaign_name: I18nName;
  sku_id: string;
  sku_name: I18nName;
  movement_kind: string;
  from_entity_type: string;
  from_entity_id: string | null;
  to_entity_type: string;
  to_entity_id: string | null;
  quantity: number;
  reason: string | null;
};

export type PerformanceRaw = {
  scope_kind: 'promoter' | 'location' | 'campaign';
  scope_id: string;
  scope_name: string | null;
  campaign_id: string;
  campaign_name: I18nName;
  period_kind: string;
  period_start: string;
  period_end: string;
  contacts: number;
  engaged: number;
  samples_total: number;
  sales_total: number;
  interaction_rate: number | null;
  engagement_rate: number | null;
  sampling_rate: number | null;
  conversion_rate: number | null;
  tier: string | null;
  rank: number | null;
};

export type SupervisorVisitRaw = {
  id: string;
  created_at: string;
  supervisor_user_id: string;
  supervisor_name: string | null;
  campaign_id: string;
  campaign_name: I18nName;
  location_id: string;
  location_name: I18nName;
  distance_m: number | null;
  notes: string | null;
};

export type FeedbackRaw = {
  id: string;
  created_at: string;
  campaign_id: string;
  campaign_name: I18nName;
  location_id: string;
  location_name: I18nName;
  promoter_user_id: string;
  promoter_name: string | null;
  category: string;
  sentiment: string | null;
  body: string;
  competitor_brands: string[];
};

/** Per-tenant promoter-visibility toggles threaded into the builders so the
 *  client role can be widened on a per-client basis (D-040). See
 *  `lib/auth/client-visibility.ts`. All-false preserves D-033 exactly. */
export type ExportClientVisibility = {
  show_promoter_names: boolean;
  show_promoter_photos: boolean;
  show_promoter_alerts: boolean;
  show_promoter_full_profile: boolean;
};

/** Full bundle the builders consume (partial — only the requested domains
 *  need be populated). */
export type ExportInput = {
  scope: ExportScope;
  role: ExportRole;
  locale: 'ar' | 'en';
  /** Optional. Only consulted when role === 'client'. Omitted ⇒ all-false. */
  clientVisibility?: ExportClientVisibility;
  attendance?: AttendanceRaw[];
  daily_reports?: DailyReportRaw[];
  sales_entries?: SalesEntryRaw[];
  stock?: StockMovementRaw[];
  performance?: PerformanceRaw[];
  supervisor_visits?: SupervisorVisitRaw[];
  feedback?: FeedbackRaw[];
};
