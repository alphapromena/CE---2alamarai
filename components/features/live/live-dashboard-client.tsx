'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Activity, AlertTriangle, Loader2, Radio, RefreshCcw } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { StatusPill, type StatusPillVariant } from '@/components/ui/status-pill';
import { EmptyState } from '@/components/ui/empty-state';
import { useRealtimeTables } from '@/lib/supabase/realtime';
import type { AlertRow, AlertType } from '@/lib/queries/alerts';
import type { LiveAttendanceJoined } from '@/lib/queries/attendance';

type Scope = 'admin' | 'supervisor' | 'client';

export interface LiveDashboardProps {
  scope: Scope;
  locale: string;
  rows: LiveAttendanceJoined[];
  alerts: AlertRow[];
  /** Admin + supervisor only: show drill-downs. Client gets aggregates only. */
  campaignLinks?: Array<{ id: string; label: string }>;
}

const ALERT_VARIANT: Record<AlertType, StatusPillVariant> = {
  late_check_in: 'warning',
  absent: 'danger',
  early_leave: 'warning',
  missing_check_out: 'danger',
  geofence_violation: 'warning',
  geofence_override_requested: 'info',
  low_stock: 'warning',
  over_consumption: 'danger',
  reconciliation_mismatch: 'danger',
  no_usage: 'warning',
  low_performance: 'warning',
  no_activity: 'warning',
  location_trust_low: 'warning',
};

function pickLocalizedName(
  n: { ar?: string; en?: string } | null | undefined,
  locale: string,
): string {
  if (!n) return '';
  if (locale === 'ar') return n.ar ?? n.en ?? '';
  return n.en ?? n.ar ?? '';
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

export function LiveDashboardClient({ scope, locale, rows, alerts, campaignLinks }: LiveDashboardProps) {
  const t = useTranslations('Live');
  const tAlerts = useTranslations('alerts');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [channelStatus, setChannelStatus] = useState<'connecting' | 'live'>('connecting');

  const subs = useMemo(
    () => [
      { table: 'attendance' },
      { table: 'alerts' },
      { table: 'break_requests' },
      { table: 'kpi_snapshots' },
    ],
    [],
  );

  useRealtimeTables(`live-${scope}`, subs, () => {
    setChannelStatus('live');
    // Debounced router.refresh via useTransition; coalesces bursts into a
    // single re-render even if many rows change in a second.
    startTransition(() => router.refresh());
  });

  // Once the first event arrives we know the channel is active; the initial
  // status animates in. This keeps the pill from flashing "live" before the
  // server has actually acknowledged the subscribe.
  useEffect(() => {
    const id = window.setTimeout(() => setChannelStatus('live'), 1200);
    return () => window.clearTimeout(id);
  }, []);

  // ---- aggregates -----------------------------------------------------------
  const summary = useMemo(() => {
    const active = rows.filter((r) => r.status === 'checked_in' || r.status === 'late').length;
    const late = rows.filter((r) => r.status === 'late').length;
    const absent = rows.filter((r) => r.status === 'absent').length;
    const checkedOut = rows.filter((r) => r.status === 'checked_out').length;
    const missingCheckout = rows.filter((r) => r.status === 'missing_checkout').length;
    const locationSet = new Set(rows.map((r) => r.location_id));
    const byAlertType = new Map<AlertType, number>();
    for (const a of alerts) byAlertType.set(a.alert_type, (byAlertType.get(a.alert_type) ?? 0) + 1);
    return {
      active,
      late,
      absent,
      checkedOut,
      missingCheckout,
      locations: locationSet.size,
      total: rows.length,
      alerts: alerts.length,
      byAlertType,
    };
  }, [rows, alerts]);

  const isClient = scope === 'client';

  return (
    <div className="space-y-6">
      {/* status bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm">
          <StatusPill
            variant={channelStatus === 'live' ? 'success' : 'neutral'}
            icon={Radio}
            label={channelStatus === 'live' ? t('live') : t('connecting')}
          />
          <span className="text-fg-muted">{t('auto_refresh_hint')}</span>
          {isPending ? (
            <span className="inline-flex items-center gap-1 text-fg-muted">
              <Loader2 className="h-3 w-3 animate-spin" /> {t('refreshing')}
            </span>
          ) : null}
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => startTransition(() => router.refresh())}
        >
          <RefreshCcw className="h-3.5 w-3.5" />
          <span>{t('refresh')}</span>
        </Button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tally label={t('active')} value={summary.active} variant="success" />
        <Tally label={t('late')} value={summary.late} variant="warning" />
        <Tally label={t('absent')} value={summary.absent} variant="danger" />
        <Tally label={t('checked_out')} value={summary.checkedOut} variant="neutral" />
        <Tally label={t('missing_check_out')} value={summary.missingCheckout} variant="danger" />
        <Tally label={t('open_alerts')} value={summary.alerts} variant={summary.alerts > 0 ? 'warning' : 'neutral'} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Alerts feed */}
        <section className="rounded border border-border bg-white p-4 lg:col-span-1">
          <header className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t('alert_feed')}</h2>
            <span className="text-xs text-fg-muted" dir="ltr">
              {summary.alerts}
            </span>
          </header>
          {alerts.length === 0 ? (
            <EmptyState
              icon={AlertTriangle}
              title={t('empty_alerts_title')}
              description={t('empty_alerts_description')}
            />
          ) : (
            <ul className="space-y-2">
              {alerts.slice(0, 30).map((a) => (
                <li key={a.id} className="rounded border border-border px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <StatusPill
                      variant={ALERT_VARIANT[a.alert_type]}
                      label={tAlertLabel(tAlerts, a)}
                    />
                    <span className="text-xs text-fg-muted" dir="ltr">
                      {formatTime(a.created_at, locale)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Live promoter list (admin + supervisor only) */}
        {!isClient ? (
          <section className="rounded border border-border bg-white p-4 lg:col-span-2">
            <header className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">{t('active_promoters')}</h2>
              <span className="text-xs text-fg-muted" dir="ltr">
                {summary.active}/{summary.total}
              </span>
            </header>
            {rows.length === 0 ? (
              <EmptyState
                icon={Activity}
                title={t('empty_active_title')}
                description={t('empty_active_description')}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-start text-xs text-fg-muted">
                    <tr>
                      <th className="py-1 text-start">{t('promoter')}</th>
                      <th className="py-1 text-start">{t('location')}</th>
                      <th className="py-1 text-start">{t('status_col')}</th>
                      <th className="py-1 text-start">{t('check_in')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-t border-border">
                        <td className="py-2">{r.user_full_name ?? '—'}</td>
                        <td className="py-2">{pickLocalizedName(r.location_name_i18n, locale)}</td>
                        <td className="py-2">
                          <StatusPill
                            variant={statusVariant(r.status)}
                            label={t(`status.${r.status}`)}
                          />
                        </td>
                        <td className="py-2" dir="ltr">
                          {formatTime(r.check_in_time, locale)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}

        {/* Client variant: aggregate card grid */}
        {isClient ? (
          <section className="rounded border border-border bg-white p-4 lg:col-span-2">
            <header className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">{t('aggregates')}</h2>
            </header>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Aggregate label={t('locations_active')} value={summary.locations} />
              <Aggregate label={t('active')} value={summary.active} />
              <Aggregate label={t('open_alerts')} value={summary.alerts} />
            </dl>
          </section>
        ) : null}
      </div>

      {/* Drill-downs */}
      {!isClient && campaignLinks && campaignLinks.length > 0 ? (
        <section className="rounded border border-border bg-white p-4">
          <header className="mb-3 text-sm font-semibold">{t('drill_down')}</header>
          <ul className="flex flex-wrap gap-2">
            {campaignLinks.map((c) => (
              <li key={c.id}>
                <Link
                  href={
                    scope === 'admin'
                      ? `/admin/performance/campaign/${c.id}`
                      : `/supervisor/performance`
                  }
                  className="inline-flex items-center rounded border border-border px-3 py-1 text-sm hover:bg-bg-hover"
                >
                  {c.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

// ----------------------------------------------------------------------------

function Tally({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: StatusPillVariant;
}) {
  const VARIANT_TEXT: Record<StatusPillVariant, string> = {
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
    info: 'text-info',
    neutral: 'text-fg',
  };
  return (
    <div className="rounded border border-border bg-white px-4 py-3">
      <div className="text-xs text-fg-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${VARIANT_TEXT[variant]}`} dir="ltr">
        {value}
      </div>
    </div>
  );
}

function Aggregate({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="mt-0.5 text-xl font-semibold tabular-nums" dir="ltr">
        {value}
      </dd>
    </div>
  );
}

function statusVariant(status: LiveAttendanceJoined['status']): StatusPillVariant {
  switch (status) {
    case 'checked_in':
      return 'success';
    case 'late':
      return 'warning';
    case 'checked_out':
      return 'neutral';
    case 'early_leave':
      return 'warning';
    case 'missing_checkout':
    case 'absent':
      return 'danger';
    default:
      return 'neutral';
  }
}

function tAlertLabel(
  t: (k: string, v?: Record<string, string | number | Date>) => string,
  a: AlertRow,
): string {
  try {
    const k = a.message_key.startsWith('alerts.') ? a.message_key.slice('alerts.'.length) : a.alert_type;
    const params: Record<string, string | number | Date> = {};
    for (const [pk, pv] of Object.entries(a.message_params ?? {})) {
      if (typeof pv === 'string' || typeof pv === 'number') params[pk] = pv;
      else if (pv instanceof Date) params[pk] = pv;
      else params[pk] = JSON.stringify(pv);
    }
    return t(k, params);
  } catch {
    return a.alert_type;
  }
}
