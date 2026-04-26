'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Camera, Loader2 } from 'lucide-react';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { StatusPill, type StatusPillVariant } from '@/components/ui/status-pill';
import { EmptyState } from '@/components/ui/empty-state';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { i18n } from '@/lib/validations/i18n';
import type { AttendanceRow, LiveAttendanceJoined } from '@/lib/queries/attendance';

type StatusValue = AttendanceRow['status'];
type FilterKey = 'campaign' | 'location' | 'status' | 'from' | 'to';

const STATUS_VALUES: StatusValue[] = [
  'checked_in',
  'checked_out',
  'late',
  'absent',
  'early_leave',
  'missing_checkout',
];

function statusVariant(s: StatusValue): StatusPillVariant {
  switch (s) {
    case 'checked_in':
      return 'success';
    case 'checked_out':
      return 'neutral';
    case 'late':
    case 'early_leave':
      return 'warning';
    case 'absent':
    case 'missing_checkout':
      return 'danger';
  }
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

function formatDate(yyyymmdd: string, locale: string): string {
  try {
    // attendance_date is a YYYY-MM-DD string already; render via Intl for the
    // locale-appropriate ordering / Arabic numerals when available.
    return new Date(`${yyyymmdd}T00:00:00Z`).toLocaleDateString(
      locale === 'ar' ? 'ar-JO' : 'en-JO',
      { dateStyle: 'medium', timeZone: 'UTC' },
    );
  } catch {
    return yyyymmdd;
  }
}

export interface AdminAttendanceClientProps {
  locale: string;
  rows: LiveAttendanceJoined[];
  campaigns: { id: string; name_i18n: { ar?: string; en?: string } }[];
  locations: { id: string; name_i18n: { ar?: string; en?: string } }[];
  initialFilters: {
    campaign: string;
    location: string;
    status: string;
    from: string;
    to: string;
  };
}

export function AdminAttendanceClient({
  locale,
  rows,
  campaigns,
  locations,
  initialFilters,
}: AdminAttendanceClientProps) {
  const t = useTranslations('Admin.attendance');
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [photoDialog, setPhotoDialog] = useState<LiveAttendanceJoined | null>(null);

  function setFilter(key: FilterKey, value: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (value) params.set(key, value);
    else params.delete(key);
    startTransition(() => {
      router.push(`?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="space-y-4">
      <FilterBar
        t={t}
        locale={locale}
        campaigns={campaigns}
        locations={locations}
        values={initialFilters}
        onChange={setFilter}
        isPending={isPending}
      />

      {rows.length === 0 ? (
        <EmptyState title={t('empty_title')} description={t('empty_description')} />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>{t('columns.date')}</TH>
              <TH>{t('columns.promoter')}</TH>
              <TH>{t('columns.campaign')}</TH>
              <TH>{t('columns.location')}</TH>
              <TH>{t('columns.check_in')}</TH>
              <TH>{t('columns.check_out')}</TH>
              <TH>{t('columns.status')}</TH>
              <TH numeric>
                <span className="sr-only">{t('columns.photos')}</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((r) => {
              const hasPhoto = Boolean(r.check_in_photo_path) || Boolean(r.check_out_photo_path);
              return (
                <TR key={r.id}>
                  <TD>
                    <span className="tabular-nums">{formatDate(r.attendance_date, locale)}</span>
                  </TD>
                  <TD>
                    <span className="font-medium">{r.user_full_name ?? '—'}</span>
                  </TD>
                  <TD>
                    <span className="text-fg-secondary">{i18n(r.campaign_name_i18n, locale)}</span>
                  </TD>
                  <TD>
                    <span className="text-fg-secondary">{i18n(r.location_name_i18n, locale)}</span>
                  </TD>
                  <TD>
                    <span className="font-mono text-xs tabular-nums" dir="ltr">
                      {formatTime(r.check_in_time, locale)}
                    </span>
                  </TD>
                  <TD>
                    <span className="font-mono text-xs tabular-nums" dir="ltr">
                      {formatTime(r.check_out_time, locale)}
                    </span>
                  </TD>
                  <TD>
                    <StatusPill
                      variant={statusVariant(r.status)}
                      label={t(`status.${r.status}`)}
                    />
                  </TD>
                  <TD numeric>
                    {hasPhoto ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        onClick={() => setPhotoDialog(r)}
                        aria-label={t('view_photos')}
                      >
                        <Camera className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                      </Button>
                    ) : (
                      <span className="text-xs text-fg-muted">—</span>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}

      {photoDialog ? (
        <PhotoDialog
          key={photoDialog.id}
          row={photoDialog}
          onClose={() => setPhotoDialog(null)}
          t={t}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function FilterBar({
  t,
  locale,
  campaigns,
  locations,
  values,
  onChange,
  isPending,
}: {
  t: ReturnType<typeof useTranslations>;
  locale: string;
  campaigns: { id: string; name_i18n: { ar?: string; en?: string } }[];
  locations: { id: string; name_i18n: { ar?: string; en?: string } }[];
  values: {
    campaign: string;
    location: string;
    status: string;
    from: string;
    to: string;
  };
  onChange: (key: FilterKey, value: string) => void;
  isPending: boolean;
}) {
  const inputClass =
    'h-9 rounded-md border border-border bg-white px-3 text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none';

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-bg-subtle p-3">
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-secondary">
          {t('filters.from')}
        </label>
        <input
          type="date"
          value={values.from}
          onChange={(e) => onChange('from', e.target.value)}
          className={inputClass}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-secondary">
          {t('filters.to')}
        </label>
        <input
          type="date"
          value={values.to}
          onChange={(e) => onChange('to', e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="min-w-[10rem]">
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-secondary">
          {t('filters.campaign')}
        </label>
        <select
          value={values.campaign}
          onChange={(e) => onChange('campaign', e.target.value)}
          className={inputClass}
        >
          <option value="">{t('filters.campaign_all')}</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {i18n(c.name_i18n, locale)}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-[10rem]">
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-secondary">
          {t('filters.location')}
        </label>
        <select
          value={values.location}
          onChange={(e) => onChange('location', e.target.value)}
          className={inputClass}
        >
          <option value="">{t('filters.location_all')}</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {i18n(l.name_i18n, locale)}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-[10rem]">
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-secondary">
          {t('filters.status')}
        </label>
        <select
          value={values.status}
          onChange={(e) => onChange('status', e.target.value)}
          className={inputClass}
        >
          <option value="">{t('filters.status_all')}</option>
          {STATUS_VALUES.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </select>
      </div>
      {isPending ? (
        <span className="ms-auto inline-flex items-center gap-1.5 text-xs text-fg-muted">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        </span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function PhotoDialog({
  row,
  onClose,
  t,
}: {
  row: LiveAttendanceJoined;
  onClose: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const title = t('dialog.title', { name: row.user_full_name ?? '' });

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={title}
      closeLabel={t('dialog.close')}
      size="lg"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <PhotoCell path={row.check_in_photo_path} label={t('dialog.check_in_label')} noPhoto={t('dialog.no_photo')} />
        <PhotoCell path={row.check_out_photo_path} label={t('dialog.check_out_label')} noPhoto={t('dialog.no_photo')} />
      </div>
    </Dialog>
  );
}

function PhotoCell({
  path,
  label,
  noPhoto,
}: {
  path: string | null;
  label: string;
  noPhoto: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // The fetch is intentionally co-located with the cell so each side fails
  // independently — a missing check-out photo doesn't blank the whole dialog.
  // The PhotoDialog is keyed by row.id at the parent, so this cell mounts
  // fresh each time and the reset-on-path-change pattern isn't needed.
  useEffect(() => {
    if (!path) return;
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
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-fg-secondary">{label}</p>
      <div className="relative flex min-h-[180px] items-center justify-center rounded-md border border-border bg-bg-subtle p-2">
        {!path ? (
          <span className="text-sm text-fg-muted">{noPhoto}</span>
        ) : error ? (
          <Alert variant="danger" title={error} className="w-full" />
        ) : !url ? (
          <Loader2 className="h-5 w-5 animate-spin text-fg-muted" aria-hidden />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={label}
            onLoad={() => setLoaded(true)}
            className="max-h-[60vh] rounded-md object-contain"
            style={{ opacity: loaded ? 1 : 0, transition: 'opacity 150ms' }}
          />
        )}
      </div>
    </div>
  );
}

