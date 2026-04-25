import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
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
import {
  LiveCheckinsMap,
  type CheckinPoint,
} from '@/components/features/admin/dashboard/live-checkins-map';
import {
  ActivityFeed,
  type ActivityEvent,
} from '@/components/features/admin/dashboard/activity-feed';
import {
  AttendanceTrendChart,
  type TrendDay,
} from '@/components/features/admin/dashboard/attendance-trend-chart';

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;

type LocalizedName = { en?: string; ar?: string } | null;

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

function pickLocalized(name: LocalizedName, locale: string): string | null {
  if (!name) return null;
  const ar = name.ar?.trim();
  const en = name.en?.trim();
  if (locale === 'ar') return ar ?? en ?? null;
  return en ?? ar ?? null;
}

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isAr = locale === 'ar';
  const narrowLocale: 'en' | 'ar' = isAr ? 'ar' : 'en';

  const profile = await requireAdmin();
  const supabase = await createServerSupabase();
  const tHero = await getTranslations('Admin.dashboard.hero');
  const tField = await getTranslations('Admin.dashboard.fieldActivity');
  const tActivity = await getTranslations('Admin.dashboard.activity');
  const tTrend = await getTranslations('Admin.dashboard.trend');

  const now = new Date();
  const nowMs = now.getTime();
  const today = todayLocalDateString(now);
  const yesterday = localDateString(new Date(nowMs - DAY_MS));
  const startOfToday = startOfDateUtcIso(today);
  const startOfYesterday = startOfDateUtcIso(yesterday);

  // 7 days inclusive of today, oldest → newest.
  const trendDateIsos: string[] = Array.from({ length: 7 }, (_, i) =>
    localDateString(new Date(nowMs - (6 - i) * DAY_MS)),
  );
  const trendStartDate = trendDateIsos[0]!;

  const [
    promotersRes,
    attendanceTodayRes,
    visitsTodayRes,
    campaignsRes,
    attendanceYesterdayRes,
    visitsYesterdayRes,
    mapPointsRes,
    feedAttendanceRes,
    feedVisitsRes,
    feedReportsRes,
    trendRowsRes,
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
    supabase
      .from('attendance')
      .select(
        'id, check_in_time, check_in_lat, check_in_lng, is_within_geofence,' +
          ' user:profiles!user_id ( full_name ),' +
          ' location:locations ( name_i18n )',
      )
      .eq('attendance_date', today)
      .not('check_in_lat', 'is', null)
      .not('check_in_time', 'is', null),
    supabase
      .from('attendance')
      .select(
        'id, check_in_time,' +
          ' user:profiles!user_id ( full_name ),' +
          ' location:locations ( name_i18n )',
      )
      .not('check_in_time', 'is', null)
      .order('check_in_time', { ascending: false })
      .limit(10),
    supabase
      .from('supervisor_visits')
      .select(
        'id, visited_at,' +
          ' supervisor:profiles!supervisor_id ( full_name ),' +
          ' location:locations ( name_i18n )',
      )
      .order('visited_at', { ascending: false })
      .limit(10),
    supabase
      .from('daily_reports')
      .select(
        'id, submitted_at,' +
          ' promoter:profiles!promoter_user_id ( full_name )',
      )
      .not('submitted_at', 'is', null)
      .order('submitted_at', { ascending: false })
      .limit(10),
    supabase
      .from('attendance')
      .select('attendance_date')
      .gte('attendance_date', trendStartDate)
      .lte('attendance_date', today)
      .not('check_in_time', 'is', null),
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

  const unknownPromoter = tField('mapUnknownPromoter');
  const unknownLocationMap = tField('mapUnknownLocation');

  type RawMapRow = {
    id: string;
    check_in_time: string;
    check_in_lat: number;
    check_in_lng: number;
    is_within_geofence: boolean;
    user: { full_name: string } | null;
    location: { name_i18n: LocalizedName } | null;
  };
  const mapPoints: CheckinPoint[] = (
    (mapPointsRes.data as unknown as RawMapRow[] | null) ?? []
  ).map((r) => ({
    id: r.id,
    lat: r.check_in_lat,
    lng: r.check_in_lng,
    promoterName: r.user?.full_name ?? unknownPromoter,
    locationName:
      pickLocalized(r.location?.name_i18n ?? null, locale) ?? unknownLocationMap,
    checkInTime: r.check_in_time,
    isWithinGeofence: r.is_within_geofence,
  }));

  type RawFeedAttendance = {
    id: string;
    check_in_time: string;
    user: { full_name: string } | null;
    location: { name_i18n: LocalizedName } | null;
  };
  type RawFeedVisit = {
    id: string;
    visited_at: string;
    supervisor: { full_name: string } | null;
    location: { name_i18n: LocalizedName } | null;
  };
  type RawFeedReport = {
    id: string;
    submitted_at: string;
    promoter: { full_name: string } | null;
  };

  const events: ActivityEvent[] = [
    ...((feedAttendanceRes.data as unknown as RawFeedAttendance[] | null) ?? []).map(
      (r): ActivityEvent => ({
        id: r.id,
        type: 'check-in',
        timestamp: r.check_in_time,
        actorName: r.user?.full_name ?? null,
        locationName: pickLocalized(r.location?.name_i18n ?? null, locale),
      }),
    ),
    ...((feedVisitsRes.data as unknown as RawFeedVisit[] | null) ?? []).map(
      (r): ActivityEvent => ({
        id: r.id,
        type: 'visit',
        timestamp: r.visited_at,
        actorName: r.supervisor?.full_name ?? null,
        locationName: pickLocalized(r.location?.name_i18n ?? null, locale),
      }),
    ),
    ...((feedReportsRes.data as unknown as RawFeedReport[] | null) ?? []).map(
      (r): ActivityEvent => ({
        id: r.id,
        type: 'report',
        timestamp: r.submitted_at,
        actorName: r.promoter?.full_name ?? null,
        locationName: null,
      }),
    ),
  ]
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
    .slice(0, 10);

  // Build the 7-day attendance trend. The query returns one row per check-in
  // (we filtered out absent rows); reduce by date into a count map, then walk
  // the date sequence so missing days get explicit zeros.
  const trendCountByDate = new Map<string, number>();
  for (const row of (trendRowsRes.data as { attendance_date: string }[] | null) ??
    []) {
    trendCountByDate.set(
      row.attendance_date,
      (trendCountByDate.get(row.attendance_date) ?? 0) + 1,
    );
  }
  const weekdayFmt = new Intl.DateTimeFormat(isAr ? 'ar-JO' : 'en', {
    weekday: 'short',
    timeZone: 'UTC',
  });
  const trendDays: TrendDay[] = trendDateIsos.map((dateIso) => ({
    dateIso,
    dayLabel: weekdayFmt.format(new Date(`${dateIso}T00:00:00Z`)),
    count: trendCountByDate.get(dateIso) ?? 0,
  }));

  const firstName =
    profile.full_name.trim().split(/\s+/)[0] || tHero('fallback_name');
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

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionHeader
            kicker={tField('kicker')}
            title={tField('title')}
            linkLabel={tField('viewFull')}
            linkHref="/admin/live"
            live
          />
          <div className="h-[420px] overflow-hidden rounded-xl bg-white shadow-card ring-1 ring-black/5 md:h-[520px]">
            <LiveCheckinsMap
              points={mapPoints}
              locale={narrowLocale}
              emptyLabel={tField('mapEmpty')}
              pinOkLabel={tField('pinOk')}
              pinWarnLabel={tField('pinWarn')}
            />
          </div>
        </div>

        <div className="lg:col-span-1">
          <SectionHeader
            kicker={tField('kicker')}
            title={tActivity('title')}
          />
          <div className="h-[420px] overflow-hidden rounded-xl bg-white shadow-card ring-1 ring-black/5 md:h-[520px]">
            <ActivityFeed
              events={events}
              locale={narrowLocale}
              nowMs={nowMs}
            />
          </div>
        </div>
      </section>

      <section>
        <SectionHeader kicker={tTrend('kicker')} title={tTrend('title')} />
        <div className="h-[280px] rounded-xl bg-white p-5 shadow-card ring-1 ring-black/5 md:h-[320px] md:p-6">
          <AttendanceTrendChart days={trendDays} />
        </div>
      </section>
    </div>
  );
}

function SectionHeader({
  kicker,
  title,
  linkLabel,
  linkHref,
  live = false,
}: {
  kicker: string;
  title: string;
  linkLabel?: string;
  linkHref?: string;
  live?: boolean;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-brand-cyan">
          {live ? (
            <span className="relative inline-flex h-2 w-2" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-2 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-2" />
            </span>
          ) : null}
          {kicker}
        </p>
        <h2 className="mt-1 text-xl font-bold tracking-tight text-fg">
          {title}
        </h2>
      </div>
      {linkLabel && linkHref ? (
        <Link
          href={linkHref}
          className="text-sm font-medium text-brand-navy transition-colors hover:text-brand-cyan"
        >
          {linkLabel}
        </Link>
      ) : null}
    </div>
  );
}
