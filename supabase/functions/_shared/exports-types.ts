// Mirror of lib/exports/types.ts — kept byte-equivalent so Edge Functions
// produce identical output to the on-demand Server Action path.

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
  from_date: string;
  to_date: string;
  domains: ExportDomain[];
};

export type ExportRole = 'admin' | 'supervisor' | 'client';

export type Sheet = {
  name: string;
  columns: string[];
  rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>;
};

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

export type ExportInput = {
  scope: ExportScope;
  role: ExportRole;
  locale: 'ar' | 'en';
  attendance?: AttendanceRaw[];
  daily_reports?: DailyReportRaw[];
  sales_entries?: SalesEntryRaw[];
  stock?: StockMovementRaw[];
  performance?: PerformanceRaw[];
  supervisor_visits?: SupervisorVisitRaw[];
  feedback?: FeedbackRaw[];
};
