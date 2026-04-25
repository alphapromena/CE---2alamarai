import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireAdmin } from '@/lib/auth/guards';
import { createServerSupabase } from '@/lib/supabase/server';
import {
  SHIFT_TZ_OFFSET_MINUTES,
  localDateString,
  todayLocalDateString,
} from '@/lib/attendance/shift-time';
import {
  HeroStrip,
  type TimeOfDay,
} from '@/components/features/admin/dashboard/hero-strip';
import { KpiGrid } from '@/components/features/admin/dashboard/kpi-grid';
import type { KpiDelta } from '@/components/features/admin/dashboard/kpi-card';

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;

function localHour(now: Date = new Date()): number {
  return new Date(now.getTime() + SHIFT_TZ_OFFSET_MINUTES * 60_000).getUTCHours();
}

function timeOfDayFromHour(hour: number): TimeOfDay {
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

/** UTC ISO instant of midnight at Asia/Amman wall clock for the given YYYY-MM-DD. */
function startOfDateUtcIso(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  const utcMs =
    Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) -
    SHIFT_TZ_OFFSET_MINUTES * 60_000;
  return new Date(utcMs).toISOString();
}

function computeDelta(today: number, yesterday: number): KpiDelta | undefined {
  if (yesterday === 0) return undefined;
  const change = today - yesterday;
  const pct = Math.round(Math.abs(change / yesterday) * 100);
  if (pct === 0) return undefined;
  return { pct, positive: change > 0 };
}

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const profile = await requireAdmin();
  const supabase = await createServerSupabase();
  const t = await getTranslations('Admin.dashboard.hero');

  const now = new Date();
  const today = todayLocalDateString(now);
  const yesterday = localDateString(new Date(now.getTime() - DAY_MS));
  const startOfToday = startOfDateUtcIso(today);
  const startOfYesterday = startOfDateUtcIso(yesterday);

  const [
    promotersRes,
    attendanceTodayRes,
    visitsTodayRes,
    campaignsRes,
    attendanceYesterdayRes,
    visitsYesterdayRes,
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'promoter')
      .eq('active', true),
    supabase
      .from('attendance')
      .select('id', { count: 'exact', head: true })
      .eq('attendance_date', today)
      .not('check_in_time', 'is', null),
    supabase
      .from('supervisor_visits')
      .select('id', { count: 'exact', head: true })
      .gte('visited_at', startOfToday),
    supabase
      .from('campaigns')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active'),
    supabase
      .from('attendance')
      .select('id', { count: 'exact', head: true })
      .eq('attendance_date', yesterday)
      .not('check_in_time', 'is', null),
    supabase
      .from('supervisor_visits')
      .select('id', { count: 'exact', head: true })
      .gte('visited_at', startOfYesterday)
      .lt('visited_at', startOfToday),
  ]);

  const promoters = promotersRes.count ?? 0;
  const attendanceToday = attendanceTodayRes.count ?? 0;
  const visitsToday = visitsTodayRes.count ?? 0;
  const campaigns = campaignsRes.count ?? 0;

  const miniKpis = {
    promoters,
    checkins: attendanceToday,
    visits: visitsToday,
    campaigns,
  };

  const attendanceDelta = computeDelta(
    attendanceToday,
    attendanceYesterdayRes.count ?? 0,
  );
  const visitsDelta = computeDelta(
    visitsToday,
    visitsYesterdayRes.count ?? 0,
  );

  const firstName =
    profile.full_name.trim().split(/\s+/)[0] || t('fallback_name');
  const timeOfDay = timeOfDayFromHour(localHour(now));

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:space-y-8 md:px-6 md:py-8 lg:px-8">
      <HeroStrip name={firstName} timeOfDay={timeOfDay} miniKpis={miniKpis} />

      <KpiGrid
        promoters={promoters}
        attendance={attendanceToday}
        visits={visitsToday}
        campaigns={campaigns}
        attendanceDelta={attendanceDelta}
        visitsDelta={visitsDelta}
      />
    </div>
  );
}
