import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Plus } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireRole } from '@/lib/auth/guards';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { listAttendanceForUser } from '@/lib/queries/attendance';
import { listSupervisorVisits } from '@/lib/queries/supervisor-visits';
import { listPingsForPromoterOnDate } from '@/lib/queries/location-pings';
import { todayLocalDateString } from '@/lib/attendance/shift-time';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusPill } from '@/components/ui/status-pill';
import { PingTrailSection } from '@/components/features/location-tracking/ping-trail-section';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function formatDate(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleDateString(locale === 'ar' ? 'ar-JO' : 'en-JO', {
      dateStyle: 'medium',
    });
  } catch {
    return iso;
  }
}

function formatTs(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale === 'ar' ? 'ar-JO' : 'en-JO', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export default async function SupervisorPromoterDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ trail_date?: string }>;
}) {
  const { locale, id } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requireRole('supervisor', 'admin');

  if (!UUID_RE.test(id)) notFound();

  const t = await getTranslations('FieldVisits');
  const tAttendance = await getTranslations('Supervisor.attendance');

  const today = todayLocalDateString();
  const minDate = isoDaysAgo(30);
  const rawDate = sp.trail_date;
  const trailDate =
    rawDate && DATE_RE.test(rawDate) && rawDate >= minDate && rawDate <= today ? rawDate : today;

  // Fetch promoter meta via service role; the page is role-guarded so admin-
  // grade read is safe. RLS on attendance + supervisor_visits still filters
  // the user-specific lists below.
  const admin = createAdminSupabase();
  const { data: promoter } = await admin
    .from('profiles')
    .select('id, full_name, role, active, assigned_locations')
    .eq('id', id)
    .eq('role', 'promoter')
    .maybeSingle();

  if (!promoter) notFound();

  const [attendance, visits, trail] = await Promise.all([
    listAttendanceForUser(id, 30),
    listSupervisorVisits({ promoterId: id, limit: 30 }),
    listPingsForPromoterOnDate(id, trailDate),
  ]);

  // Pick a sensible default location for the "Log visit" deep link: the first
  // location the promoter is assigned to. Supervisor visit-new will rewrite
  // it if the locked location doesn't match the selected target.
  const assignedLocs = (promoter.assigned_locations ?? []) as string[];
  const defaultLocation = assignedLocs[0] ?? null;
  const logVisitHref = defaultLocation
    ? `/${locale}/supervisor/visits/new?promoter_id=${id}&location_id=${defaultLocation}`
    : `/${locale}/supervisor/visits/new?promoter_id=${id}`;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-semibold">{promoter.full_name}</h1>
          <p className="mt-1 text-sm text-fg-secondary">
            {t('promoter_detail_subtitle')}
          </p>
        </div>
        <Button asChild>
          <Link href={logVisitHref}>
            <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            {t('log_visit_cta')}
          </Link>
        </Button>
      </header>

      <div className="pt-8">
        <PingTrailSection
          pings={trail.pings}
          checkInPoint={trail.checkInPoint}
          dateYYYYMMDD={trailDate}
          minDate={minDate}
          maxDate={today}
        />
      </div>

      <section className="pt-8">
        <h2 className="mb-3 text-lg font-semibold">{t('attendance_history_heading')}</h2>
        {attendance.length === 0 ? (
          <EmptyState title={t('attendance_history_empty')} />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-white">
            <table className="w-full">
              <thead className="bg-bg-subtle text-xs font-medium uppercase tracking-wide text-fg-secondary">
                <tr>
                  <th className="px-4 py-2.5 text-start">{t('columns.date')}</th>
                  <th className="px-4 py-2.5 text-start">{t('columns.status')}</th>
                  <th className="px-4 py-2.5 text-start">{t('columns.check_in')}</th>
                  <th className="px-4 py-2.5 text-start">{t('columns.check_out')}</th>
                  <th className="px-4 py-2.5 text-start">{t('columns.photos')}</th>
                </tr>
              </thead>
              <tbody>
                {attendance.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-4 py-3 text-sm" dir="ltr">
                      {formatDate(row.attendance_date, locale)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <StatusPill
                        variant={
                          row.status === 'checked_in' || row.status === 'checked_out'
                            ? 'success'
                            : row.status === 'late' || row.status === 'early_leave'
                              ? 'warning'
                              : 'danger'
                        }
                        label={tAttendance(
                          `status_${row.status}` as Parameters<typeof tAttendance>[0],
                        )}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-fg-secondary" dir="ltr">
                      {row.check_in_time ? formatTs(row.check_in_time, locale) : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-fg-secondary" dir="ltr">
                      {row.check_out_time ? formatTs(row.check_out_time, locale) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-fg-muted">
                      {row.check_in_photo_path ? t('photo_in_present') : t('photo_in_missing')}
                      {' · '}
                      {row.check_out_photo_path ? t('photo_out_present') : t('photo_out_missing')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="pt-10">
        <h2 className="mb-3 text-lg font-semibold">{t('visit_history_heading')}</h2>
        {visits.length === 0 ? (
          <EmptyState title={t('visit_history_empty')} />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-white">
            <table className="w-full">
              <thead className="bg-bg-subtle text-xs font-medium uppercase tracking-wide text-fg-secondary">
                <tr>
                  <th className="px-4 py-2.5 text-start">{t('columns.date')}</th>
                  <th className="px-4 py-2.5 text-start">{t('columns.supervisor')}</th>
                  <th className="px-4 py-2.5 text-start">{t('columns.outcome')}</th>
                  <th className="px-4 py-2.5 text-start">{t('columns.notes')}</th>
                </tr>
              </thead>
              <tbody>
                {visits.map((v) => (
                  <tr key={v.id} className="border-t border-border">
                    <td className="px-4 py-3 text-sm" dir="ltr">
                      {formatTs(v.visited_at, locale)}
                    </td>
                    <td className="px-4 py-3 text-sm">{v.supervisor_name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm">
                      {t(`outcome_${v.outcome}` as Parameters<typeof t>[0])}
                    </td>
                    <td className="px-4 py-3 text-sm text-fg-secondary">
                      {v.notes ? (
                        <span className="line-clamp-2 block max-w-md">{v.notes}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
