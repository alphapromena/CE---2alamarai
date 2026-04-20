import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';
import { logWarn } from '@/lib/observability/logger';

/**
 * Trigger the compute-kpis Edge Function for one daily_report. Called from
 * the submit/approve Server Actions (D-020).
 *
 * Deliberately fire-and-forget on error: if the Edge Function fails here, the
 * hourly sweep will pick the report up and (re)write the snapshot. We never
 * block the user's submit on snapshot compute, but we do attempt it inline so
 * the user sees their KPIs immediately 99% of the time.
 */
export async function invokeComputeKpis(dailyReportId: string): Promise<void> {
  try {
    const supabase = await createServerSupabase();
    await supabase.functions.invoke('compute-kpis', {
      body: { daily_report_id: dailyReportId },
    });
  } catch (err) {
    logWarn('compute-kpis invoke failed (sweep will retry)', {
      daily_report_id: dailyReportId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
