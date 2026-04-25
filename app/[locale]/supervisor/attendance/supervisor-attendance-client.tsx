'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Camera,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCcw,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusPill, type StatusPillVariant } from '@/components/ui/status-pill';
import { Dialog } from '@/components/ui/dialog';
import { pickLocalizedName } from '@/lib/i18n/picker';
import { toCsvWithBom, csvFilename } from '@/lib/utils/csv';
import type { LiveAttendanceJoined } from '@/lib/queries/attendance';
import type { AlertRow } from '@/lib/queries/alerts';
import type { CampaignRef, LocationRef } from '@/lib/queries/supervisor-scope';
import { ApproveOverrideForm } from './approve-override-form';
import { ResolveAlertForm } from './resolve-alert-form';
import { LocationTrustDetail } from '@/components/features/alerts/location-trust-detail';

const POLL_INTERVAL_MS = 30_000;

function formatTime(iso: string | null, locale: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString(locale === 'ar' ? 'ar-JO' : 'en-JO', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function statusPillFor(status: LiveAttendanceJoined['status']): {
  variant: StatusPillVariant;
  labelKey: string;
} {
  switch (status) {
    case 'checked_in':
      return { variant: 'success', labelKey: 'status_checked_in' };
    case 'checked_out':
      return { variant: 'neutral', labelKey: 'status_checked_out' };
    case 'late':
      return { variant: 'warning', labelKey: 'status_late' };
    case 'early_leave':
      return { variant: 'warning', labelKey: 'status_early_leave' };
    case 'missing_checkout':
      return { variant: 'danger', labelKey: 'status_missing_checkout' };
    case 'absent':
      return { variant: 'danger', labelKey: 'status_absent' };
    default:
      return { variant: 'neutral', labelKey: 'status_checked_in' };
  }
}

export interface SupervisorAttendanceClientProps {
  locale: string;
  rows: LiveAttendanceJoined[];
  alerts: AlertRow[];
  campaigns: CampaignRef[];
  locations: LocationRef[];
  date: string;
  activeCampaignId: string | null;
  activeLocationId: string | null;
}

export function SupervisorAttendanceClient({
  locale,
  rows,
  alerts,
  campaigns,
  locations,
  date,
  activeCampaignId,
  activeLocationId,
}: SupervisorAttendanceClientProps) {
  const t = useTranslations('Supervisor.attendance');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Polling: every 30 s, re-query the server via router.refresh. Plus a
  // manual Refresh button that does the same thing immediately.
  useEffect(() => {
    const id = window.setInterval(() => {
      startTransition(() => router.refresh());
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [router]);

  const onFilterChange = useCallback(
    (key: 'date' | 'campaign_id' | 'location_id', value: string | null) => {
      const url = new URL(window.location.href);
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
      startTransition(() => {
        router.replace(url.pathname + url.search);
      });
    },
    [router],
  );

  const onExportCsv = useCallback(() => {
    const header = [
      t('columns.promoter'),
      t('columns.campaign'),
      t('columns.location'),
      t('columns.check_in'),
      t('columns.check_out'),
      t('columns.distance'),
      t('columns.status'),
      t('within_geofence'),
      t('override_granted'),
    ];
    const body = rows.map((r) => [
      r.user_full_name ?? '',
      pickLocalizedName(r.campaign_name_i18n, locale),
      pickLocalizedName(r.location_name_i18n, locale),
      r.check_in_time ?? '',
      r.check_out_time ?? '',
      r.check_in_distance_m ?? '',
      t(statusPillFor(r.status).labelKey as Parameters<typeof t>[0]),
      r.is_within_geofence ? t('within_geofence') : t('outside_geofence'),
      r.supervisor_override ? t('override_granted') : '',
    ]);
    const csv = toCsvWithBom([header, ...body]);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = csvFilename(`attendance-${date}`);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [rows, date, locale, t]);

  const [photoPath, setPhotoPath] = useState<string | null>(null);

  return (
    <div className="space-y-6 pt-6">
      <FilterBar
        t={t}
        date={date}
        campaigns={campaigns}
        locations={locations}
        activeCampaignId={activeCampaignId}
        activeLocationId={activeLocationId}
        locale={locale}
        onChange={onFilterChange}
        onExport={onExportCsv}
        onRefresh={() => startTransition(() => router.refresh())}
        isPending={isPending}
      />

      {alerts.length > 0 ? (
        <section className="rounded-lg border border-border bg-white">
          <header className="border-b border-border px-4 py-3">
            <h2 className="text-base font-semibold">{t('open_alerts_title')}</h2>
            <p className="mt-0.5 text-sm text-fg-secondary">{t('open_alerts_description')}</p>
          </header>
          <ul className="divide-y divide-border">
            {alerts.map((a) => (
              <AlertItem key={a.id} alert={a} t={t} locale={locale} />
            ))}
          </ul>
        </section>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title={t('empty_title')}
          description={t('empty_description')}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-white">
          <table className="w-full text-start">
            <thead className="bg-bg-subtle text-xs font-medium uppercase tracking-wide text-fg-secondary">
              <tr>
                <th className="px-4 py-2.5 text-start">{t('columns.promoter')}</th>
                <th className="px-4 py-2.5 text-start">{t('columns.campaign')}</th>
                <th className="px-4 py-2.5 text-start">{t('columns.location')}</th>
                <th className="px-4 py-2.5 text-start">{t('columns.check_in')}</th>
                <th className="px-4 py-2.5 text-start">{t('columns.check_out')}</th>
                <th className="px-4 py-2.5 text-end">{t('columns.distance')}</th>
                <th className="px-4 py-2.5 text-start">{t('columns.status')}</th>
                <th className="px-4 py-2.5 text-end">{t('columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pill = statusPillFor(r.status);
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-bg-subtle/50">
                    <td className="px-4 py-3 text-sm">{r.user_full_name}</td>
                    <td className="px-4 py-3 text-sm">
                      {pickLocalizedName(r.campaign_name_i18n, locale)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {pickLocalizedName(r.location_name_i18n, locale)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span dir="ltr" className="tabular-nums">
                        {formatTime(r.check_in_time, locale)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span dir="ltr" className="tabular-nums">
                        {formatTime(r.check_out_time, locale)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-end text-sm">
                      <span dir="ltr" className="tabular-nums">
                        {r.check_in_distance_m != null ? `${r.check_in_distance_m} m` : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusPill
                          variant={pill.variant}
                          label={t(pill.labelKey as Parameters<typeof t>[0])}
                        />
                        {!r.is_within_geofence ? (
                          <StatusPill
                            variant="warning"
                            label={t('outside_geofence')}
                          />
                        ) : null}
                        {r.supervisor_override ? (
                          <StatusPill
                            variant="success"
                            icon={ShieldCheck}
                            label={t('override_granted')}
                          />
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-end">
                      <div className="flex items-center justify-end gap-1.5">
                        {r.check_in_photo_path ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            onClick={() => setPhotoPath(r.check_in_photo_path)}
                            aria-label={t('view_photo')}
                          >
                            <Camera className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                          </Button>
                        ) : null}
                        {!r.is_within_geofence && !r.supervisor_override ? (
                          <ApproveOverrideForm attendanceId={r.id} />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {photoPath ? (
        <PhotoDialog
          key={photoPath}
          path={photoPath}
          onClose={() => setPhotoPath(null)}
          closeLabel={t('photo_close')}
          openLabel={t('photo_open')}
        />
      ) : null}
    </div>
  );
}

function FilterBar({
  t,
  date,
  campaigns,
  locations,
  activeCampaignId,
  activeLocationId,
  locale,
  onChange,
  onExport,
  onRefresh,
  isPending,
}: {
  t: ReturnType<typeof useTranslations>;
  date: string;
  campaigns: CampaignRef[];
  locations: LocationRef[];
  activeCampaignId: string | null;
  activeLocationId: string | null;
  locale: string;
  onChange: (key: 'date' | 'campaign_id' | 'location_id', value: string | null) => void;
  onExport: () => void;
  onRefresh: () => void;
  isPending: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-bg-subtle p-3">
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-secondary">
          {t('filters_date')}
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => onChange('date', e.target.value || null)}
          className="h-8 rounded-md border border-border bg-white px-3 text-sm focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-secondary">
          {t('filters_campaign')}
        </label>
        <select
          value={activeCampaignId ?? ''}
          onChange={(e) => onChange('campaign_id', e.target.value || null)}
          className="h-8 rounded-md border border-border bg-white px-3 text-sm focus:border-accent focus:ring-2 focus:ring-accent/20"
        >
          <option value="">{t('filters_all')}</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {pickLocalizedName(c.name_i18n, locale)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-secondary">
          {t('filters_location')}
        </label>
        <select
          value={activeLocationId ?? ''}
          onChange={(e) => onChange('location_id', e.target.value || null)}
          className="h-8 rounded-md border border-border bg-white px-3 text-sm focus:border-accent focus:ring-2 focus:ring-accent/20"
        >
          <option value="">{t('filters_all')}</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {pickLocalizedName(l.name_i18n, locale)}
            </option>
          ))}
        </select>
      </div>
      <div className="ms-auto flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs text-fg-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" aria-hidden />
          {t('live_indicator')}
        </span>
        <Button variant="secondary" size="sm" type="button" onClick={onRefresh} disabled={isPending}>
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCcw className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          )}
          {t('refresh_now')}
        </Button>
        <Button variant="secondary" size="sm" type="button" onClick={onExport}>
          <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          {t('export_csv')}
        </Button>
      </div>
    </div>
  );
}

function PhotoDialog({
  path,
  onClose,
  closeLabel,
  openLabel,
}: {
  path: string;
  onClose: () => void;
  closeLabel: string;
  openLabel: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/attendance/photo-url', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { url: string }) => {
        if (!cancelled) setUrl(body.url);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={openLabel}
      closeLabel={closeLabel}
      size="lg"
    >
      {error ? (
        <Alert variant="danger" title={error} />
      ) : url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="mx-auto max-h-[70vh] rounded-md" />
      ) : (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-fg-muted" aria-hidden />
        </div>
      )}
    </Dialog>
  );
}

function AlertItem({
  alert,
  t,
  locale,
}: {
  alert: AlertRow;
  t: ReturnType<typeof useTranslations>;
  locale: string;
}) {
  const tLocationTrust = useTranslations('LocationTrust');

  const typeLabel = useMemo(() => {
    switch (alert.alert_type) {
      case 'late_check_in':
        return t('status_late');
      case 'early_leave':
        return t('status_early_leave');
      case 'missing_check_out':
        return t('status_missing_checkout');
      case 'geofence_violation':
        return t('outside_geofence');
      case 'geofence_override_requested':
        return t('override_pending');
      case 'absent':
        return t('status_absent');
      case 'location_trust_low':
        return tLocationTrust('summary');
      default:
        return alert.alert_type;
    }
  }, [alert.alert_type, t, tLocationTrust]);

  const variant: StatusPillVariant =
    alert.severity === 'critical' ? 'danger' : alert.severity === 'info' ? 'info' : 'warning';

  return (
    <li className="flex flex-col gap-2 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <StatusPill variant={variant} label={typeLabel} />
        <span className="text-fg-secondary">
          {new Date(alert.created_at).toLocaleString(locale === 'ar' ? 'ar-JO' : 'en-JO', {
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: '2-digit',
          })}
        </span>
        <span className="ms-auto flex items-center gap-2">
          {alert.alert_type === 'geofence_override_requested' && alert.attendance_id ? (
            <ApproveOverrideForm
              attendanceId={alert.attendance_id}
              defaultReason={
                typeof alert.message_params?.reason === 'string'
                  ? alert.message_params.reason
                  : undefined
              }
            />
          ) : null}
          <ResolveAlertForm alertId={alert.id} />
        </span>
      </div>
      {alert.alert_type === 'location_trust_low' ? (
        <LocationTrustDetail messageParams={alert.message_params} />
      ) : null}
    </li>
  );
}
