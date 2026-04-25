import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireAdmin } from '@/lib/auth/guards';
import { createServerSupabase } from '@/lib/supabase/server';
import {
  SHIFT_TZ_OFFSET_MINUTES,
  todayLocalDateString,
} from '@/lib/attendance/shift-time';
import {
  HeroStrip,
  type TimeOfDay,
} from '@/components/features/admin/dashboard/hero-strip';

export const dynamic = 'force-dynamic';

function localHour(now: Date = new Date()): number {
  return new Date(now.getTime() + SHIFT_TZ_OFFSET_MINUTES * 60_000).getUTCHours();
}

function timeOfDayFromHour(hour: number): TimeOfDay {
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

/** UTC ISO instant of today's midnight at Asia/Amman wall clock. */
function startOfTodayUtcIso(): string {
  const today = todayLocalDateString();
  const [y, m, d] = today.split('-').map(Number);
  const utcMs =
    Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) -
    SHIFT_TZ_OFFSET_MINUTES * 60_000;
  return new Date(utcMs).toISOString();
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

  const today = todayLocalDateString();
  const startOfToday = startOfTodayUtcIso();

  const [promotersRes, attendanceRes, visitsRes, campaignsRes] =
    await Promise.all([
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
    ]);

  const miniKpis = {
    promoters: promotersRes.count ?? 0,
    checkins: attendanceRes.count ?? 0,
    visits: visitsRes.count ?? 0,
    campaigns: campaignsRes.count ?? 0,
  };

  const firstName =
    profile.full_name.trim().split(/\s+/)[0] || t('fallback_name');
  const timeOfDay = timeOfDayFromHour(localHour());

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:space-y-8 md:px-6 md:py-8 lg:px-8">
      <HeroStrip
        name={firstName}
        timeOfDay={timeOfDay}
        miniKpis={miniKpis}
      />
    </div>
  );
}
