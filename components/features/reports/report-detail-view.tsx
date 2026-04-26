import { getTranslations } from 'next-intl/server';
import { StatusPill, type StatusPillVariant } from '@/components/ui/status-pill';
import { Alert } from '@/components/ui/alert';
import { i18n } from '@/lib/validations/i18n';
import type { DailyReportRow, KpiSnapshotRow, SalesEntryRow, ActivityPhotoRow } from '@/lib/queries/reports';
import type { CampaignSkuRow } from '@/lib/queries/campaigns';
import type { AttendanceRow } from '@/lib/queries/attendance';
import type { SupervisorVisitRow } from '@/lib/queries/supervisor-visits';
import type { ConsumerFeedbackListRow } from '@/lib/queries/feedback';
import { PhotoThumb } from './photo-thumb';
import { AttendancePhotoThumb } from './attendance-photo-thumb';

function pillFor(status: string): { variant: StatusPillVariant; key: string } {
  switch (status) {
    case 'draft':
      return { variant: 'neutral', key: 'status_draft' };
    case 'submitted':
      return { variant: 'info', key: 'status_submitted' };
    case 'approved':
      return { variant: 'success', key: 'status_approved' };
    case 'rejected':
      return { variant: 'danger', key: 'status_rejected' };
    default:
      return { variant: 'neutral', key: 'status_draft' };
  }
}

function attendancePillFor(status: AttendanceRow['status']): {
  variant: StatusPillVariant;
} {
  switch (status) {
    case 'checked_in':
      return { variant: 'success' };
    case 'checked_out':
      return { variant: 'neutral' };
    case 'late':
    case 'early_leave':
      return { variant: 'warning' };
    case 'absent':
    case 'missing_checkout':
      return { variant: 'danger' };
  }
}

function pct(n: number | null): string {
  if (n == null) return '—';
  return `${Math.round(n * 1000) / 10}%`;
}

function formatTime(iso: string | null, locale: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString(locale === 'ar' ? 'ar-JO' : 'en-JO', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale === 'ar' ? 'ar-JO' : 'en-JO', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export interface ReportDetailViewProps {
  locale: string;
  report: DailyReportRow;
  meta: {
    campaign_name_i18n: { ar?: string; en?: string } | null;
    location_name_i18n: { ar?: string; en?: string } | null;
    promoter_name: string | null;
  };
  entries: SalesEntryRow[];
  photos: ActivityPhotoRow[];
  kpis: KpiSnapshotRow | null;
  skus: CampaignSkuRow[];
  attendance: AttendanceRow | null;
  visits: SupervisorVisitRow[];
  feedback: ConsumerFeedbackListRow[];
  /** Optional review-action panel rendered after the main content (supervisor only). */
  reviewSlot?: React.ReactNode;
}

/**
 * Read-only daily-report detail view shared by /admin/reports/[id] and
 * /supervisor/reports/[id]. The supervisor page passes a `reviewSlot` for
 * the approve/reject panel; admin omits it (admin doesn't review reports
 * at this surface — admin actions live on /admin/reports/[id]/edit-style
 * routes if added later).
 *
 * Renders, in order: header + status, optional rejection reason, attendance
 * summary with photos (Feature 4 / D-041 — photo paths are nullable),
 * funnel + KPI cards, SKU breakdown, activity photos, supervisor-visit
 * summary, consumer-feedback list, optional review slot.
 */
export async function ReportDetailView({
  locale,
  report,
  meta,
  entries,
  photos,
  kpis,
  skus,
  attendance,
  visits,
  feedback,
  reviewSlot,
}: ReportDetailViewProps) {
  const t = await getTranslations('Supervisor.reports');
  const td = await getTranslations('Supervisor.reports.detail');
  const tp = await getTranslations('Promoter.reports');

  const p = pillFor(report.status);
  const skuMap = new Map(skus.map((s) => [s.id, s]));

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-semibold">
            {i18n(meta.location_name_i18n, locale)} · {report.report_date}
          </h1>
          <p className="mt-1 text-sm text-fg-secondary">
            {i18n(meta.campaign_name_i18n, locale)} · {meta.promoter_name ?? '—'}
          </p>
        </div>
        <StatusPill variant={p.variant} label={tp(p.key)} />
      </header>

      {report.status === 'rejected' && report.review_reason ? (
        <Alert variant="warning" className="mt-4">
          <div className="font-medium">{t('rejected_heading')}</div>
          <div className="text-sm">{report.review_reason}</div>
        </Alert>
      ) : null}

      {/* Attendance — new section. Reads attendance for the report's
          (promoter, location, date) triple; shows time + geofence outcome
          + photos. */}
      <section className="mt-6 rounded-lg border border-border">
        <div className="border-b border-border bg-bg-subtle px-4 py-2 text-sm font-medium">
          {td('attendance_heading')}
        </div>
        {!attendance ? (
          <div className="p-4 text-sm text-fg-muted">{td('attendance_none')}</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
            <AttendanceSlot
              label={td('attendance_check_in')}
              time={formatTime(attendance.check_in_time, locale)}
              path={attendance.check_in_photo_path}
              distance={attendance.check_in_distance_m}
              geofenceLabel={
                attendance.is_within_geofence
                  ? td('attendance_within_geofence')
                  : td('attendance_outside_geofence')
              }
              geofenceVariant={attendance.is_within_geofence ? 'success' : 'warning'}
              statusVariant={attendancePillFor(attendance.status).variant}
              statusLabel={td(`attendance_status.${attendance.status}`)}
              distanceLabel={td('attendance_distance')}
              metresUnit={td('attendance_metres')}
              noPhotoLabel={td('attendance_no_photo')}
              statusOnSlot="check_in"
            />
            <AttendanceSlot
              label={td('attendance_check_out')}
              time={formatTime(attendance.check_out_time, locale)}
              path={attendance.check_out_photo_path}
              distance={attendance.check_out_distance_m}
              geofenceLabel={null}
              geofenceVariant={null}
              statusVariant={attendancePillFor(attendance.status).variant}
              statusLabel={td(`attendance_status.${attendance.status}`)}
              distanceLabel={td('attendance_distance')}
              metresUnit={td('attendance_metres')}
              noPhotoLabel={td('attendance_no_photo')}
              statusOnSlot="check_out"
            />
            {attendance.supervisor_override ? (
              <div className="md:col-span-2">
                <Alert variant="info">
                  <div className="font-medium">{td('attendance_override_heading')}</div>
                  {attendance.override_reason ? (
                    <div className="text-sm">{attendance.override_reason}</div>
                  ) : null}
                </Alert>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-border p-4">
          <h2 className="mb-3 text-sm font-medium">{t('funnel_heading')}</h2>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-fg-secondary">{tp('fields.traffic')}</dt>
            <dd className="tabular-nums">{report.total_traffic ?? '—'}</dd>
            <dt className="text-fg-secondary">{tp('fields.contacts')}</dt>
            <dd className="tabular-nums">{report.contacts}</dd>
            <dt className="text-fg-secondary">{tp('fields.engaged')}</dt>
            <dd className="tabular-nums">{report.engaged}</dd>
            <dt className="text-fg-secondary">{tp('fields.samples')}</dt>
            <dd className="tabular-nums">{report.samples_total}</dd>
            <dt className="text-fg-secondary">{tp('fields.sales')}</dt>
            <dd className="tabular-nums">{report.sales_total}</dd>
          </dl>
        </div>

        <div className="rounded-lg border border-border p-4">
          <h2 className="mb-3 text-sm font-medium">{t('kpis_heading')}</h2>
          {!kpis ? (
            <p className="text-sm text-fg-muted">{t('kpis_pending')}</p>
          ) : (
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-fg-secondary">{t('kpi.interaction')}</dt>
              <dd className="tabular-nums">{pct(kpis.interaction_rate)}</dd>
              <dt className="text-fg-secondary">{t('kpi.engagement')}</dt>
              <dd className="tabular-nums">{pct(kpis.engagement_rate)}</dd>
              <dt className="text-fg-secondary">
                {t('kpi.sampling')} ({kpis.sampling_rate_denominator ?? '—'})
              </dt>
              <dd className="tabular-nums">{pct(kpis.sampling_rate)}</dd>
              <dt className="text-fg-secondary">{t('kpi.conversion')}</dt>
              <dd className="tabular-nums">{pct(kpis.conversion_rate)}</dd>
              <dt className="text-fg-secondary">{t('kpi.sample_to_conversion')}</dt>
              <dd className="tabular-nums">{pct(kpis.sample_to_conversion_rate)}</dd>
            </dl>
          )}
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-border">
        <div className="border-b border-border bg-bg-subtle px-4 py-2 text-sm font-medium">
          {t('sku_breakdown')}
        </div>
        {entries.length === 0 ? (
          <div className="p-4 text-sm text-fg-muted">{t('no_sku_entries')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-fg-secondary">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">{t('sku_col')}</th>
                  <th className="px-3 py-2 text-end font-medium">{tp('fields.samples')}</th>
                  <th className="px-3 py-2 text-end font-medium">{tp('fields.sales')}</th>
                  <th className="px-3 py-2 text-end font-medium">{t('contribution_col')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((e) => {
                  const sku = skuMap.get(e.sku_id);
                  const contrib =
                    (kpis?.sku_contributions as Record<string, number> | undefined)?.[e.sku_id] ??
                    null;
                  return (
                    <tr key={e.sku_id}>
                      <td className="px-3 py-2">{i18n(sku?.name_i18n ?? null, locale)}</td>
                      <td className="px-3 py-2 text-end tabular-nums">{e.samples}</td>
                      <td className="px-3 py-2 text-end tabular-nums">{e.sales}</td>
                      <td className="px-3 py-2 text-end tabular-nums">{pct(contrib)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {photos.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-medium">{t('photos_heading')}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {photos.map((ph) => (
              <PhotoThumb key={ph.photo_kind} path={ph.storage_path} kind={ph.photo_kind} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Supervisor visit — new section. Visits at this location on this date,
          either targeting this promoter or untargeted (legacy). */}
      <section className="mt-6 rounded-lg border border-border">
        <div className="border-b border-border bg-bg-subtle px-4 py-2 text-sm font-medium">
          {td('visit_heading')}
        </div>
        {visits.length === 0 ? (
          <div className="p-4 text-sm text-fg-muted">{td('visit_none')}</div>
        ) : (
          <ul className="divide-y divide-border">
            {visits.map((v) => (
              <li key={v.id} className="flex flex-col gap-1 p-4 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{v.supervisor_name ?? '—'}</span>
                  <span className="font-mono text-xs text-fg-muted" dir="ltr">
                    {formatDateTime(v.visited_at, locale)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-fg-secondary">
                  <StatusPill
                    variant={v.is_within_geofence ? 'success' : 'warning'}
                    label={
                      v.is_within_geofence
                        ? td('attendance_within_geofence')
                        : td('attendance_outside_geofence')
                    }
                  />
                  <span>{td(`visit_outcome.${v.outcome}`)}</span>
                  <span className="tabular-nums" dir="ltr">
                    {v.distance_m} {td('attendance_metres')}
                  </span>
                </div>
                {v.notes ? (
                  <p className="mt-1 text-fg-secondary">{v.notes}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Consumer feedback — new section. Rows attached to this report. */}
      <section className="mt-6 rounded-lg border border-border">
        <div className="border-b border-border bg-bg-subtle px-4 py-2 text-sm font-medium">
          {td('feedback_heading')}
        </div>
        {feedback.length === 0 ? (
          <div className="p-4 text-sm text-fg-muted">{td('feedback_none')}</div>
        ) : (
          <ul className="divide-y divide-border">
            {feedback.map((f) => (
              <li key={f.id} className="flex flex-col gap-1 p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                  <StatusPill
                    variant={
                      f.sentiment === 'positive'
                        ? 'success'
                        : f.sentiment === 'negative'
                          ? 'danger'
                          : 'neutral'
                    }
                    label={td(`feedback_category.${f.category}`)}
                  />
                  {f.sentiment ? (
                    <span className="text-fg-secondary">
                      {td(`feedback_sentiment.${f.sentiment}`)}
                    </span>
                  ) : null}
                  <span className="ms-auto font-mono" dir="ltr">
                    {formatDateTime(f.created_at, locale)}
                  </span>
                </div>
                <p className="text-fg">{f.body}</p>
                {f.competitor_brands.length > 0 ? (
                  <p className="text-xs text-fg-secondary">
                    {td('feedback_competitors')}: {f.competitor_brands.join(', ')}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {reviewSlot}
    </div>
  );
}

// ---------------------------------------------------------------------------

function AttendanceSlot({
  label,
  time,
  path,
  distance,
  geofenceLabel,
  geofenceVariant,
  statusVariant,
  statusLabel,
  distanceLabel,
  metresUnit,
  noPhotoLabel,
  statusOnSlot,
}: {
  label: string;
  time: string;
  path: string | null;
  distance: number | null;
  geofenceLabel: string | null;
  geofenceVariant: StatusPillVariant | null;
  statusVariant: StatusPillVariant;
  statusLabel: string;
  distanceLabel: string;
  metresUnit: string;
  noPhotoLabel: string;
  statusOnSlot: 'check_in' | 'check_out';
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{label}</h3>
        <span className="font-mono text-xs tabular-nums text-fg-muted" dir="ltr">
          {time}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {statusOnSlot === 'check_in' ? (
          <StatusPill variant={statusVariant} label={statusLabel} />
        ) : null}
        {geofenceLabel && geofenceVariant ? (
          <StatusPill variant={geofenceVariant} label={geofenceLabel} />
        ) : null}
        {distance != null ? (
          <span className="text-fg-secondary tabular-nums" dir="ltr">
            {distanceLabel}: {distance} {metresUnit}
          </span>
        ) : null}
      </div>
      {path ? (
        <AttendancePhotoThumb path={path} alt={label} />
      ) : (
        <div className="flex aspect-square w-full items-center justify-center rounded-md border border-dashed border-border bg-bg-subtle text-xs text-fg-muted">
          {noPhotoLabel}
        </div>
      )}
    </div>
  );
}
