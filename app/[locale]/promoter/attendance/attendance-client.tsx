'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  Navigation,
  RefreshCcw,
  ShieldCheck,
} from 'lucide-react';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { Button } from '@/components/ui/button';
import { StatusPill, type StatusPillVariant } from '@/components/ui/status-pill';
import { Alert } from '@/components/ui/alert';
import type { AttendanceRow } from '@/lib/queries/attendance';
import type { PromoterShiftAssignment } from '@/lib/queries/attendance';
import { OverrideRequestForm } from './override-request-form';

type Phase = 'idle' | 'locating' | 'photo_ready' | 'submitting' | 'done';

type Coords = { lat: number; lng: number; accuracy: number };

type GeoError = 'permission' | 'unavailable' | 'timeout';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const GEO_TIMEOUT_MS = 15_000;

function pickLocalizedName(
  name: { ar?: string; en?: string } | null | undefined,
  locale: string,
): string {
  if (!name) return '';
  if (locale === 'ar') return name.ar ?? name.en ?? '';
  return name.en ?? name.ar ?? '';
}

function trimSec(t: string | null | undefined): string {
  if (!t) return '';
  return t.length >= 5 ? t.slice(0, 5) : t;
}

function formatTime(iso: string, locale: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(locale === 'ar' ? 'ar-JO' : 'en-JO', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function statusToPill(
  status: AttendanceRow['status'],
): { variant: StatusPillVariant; labelKey: string } {
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
      return { variant: 'neutral', labelKey: 'status_not_checked_in' };
  }
}

export interface AttendanceClientProps {
  locale: string;
  userFullName: string;
  assignments: PromoterShiftAssignment[];
  todaysRows: AttendanceRow[];
}

export function AttendanceClient({
  locale,
  assignments,
  todaysRows,
}: AttendanceClientProps) {
  const t = useTranslations('Promoter.attendance');
  const [selectedId, setSelectedId] = useState<string>(
    assignments[0]?.assignment_id ?? '',
  );
  const selected = useMemo(
    () => assignments.find((a) => a.assignment_id === selectedId) ?? assignments[0]!,
    [assignments, selectedId],
  );

  const matchingRow = useMemo(
    () =>
      todaysRows.find(
        (r) =>
          r.campaign_id === selected.campaign_id &&
          r.location_id === selected.location_id,
      ) ?? null,
    [todaysRows, selected],
  );

  const leg: 'in' | 'out' =
    matchingRow && matchingRow.check_in_time && !matchingRow.check_out_time ? 'out' : 'in';
  const isDone =
    matchingRow?.check_in_time != null && matchingRow?.check_out_time != null;

  const [phase, setPhase] = useState<Phase>('idle');
  const [coords, setCoords] = useState<Coords | null>(null);
  const [geoError, setGeoError] = useState<GeoError | null>(null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [successKey, setSuccessKey] = useState<string | null>(null);
  const [lastAttendanceId, setLastAttendanceId] = useState<string | null>(
    matchingRow?.id ?? null,
  );
  const [lastWithinGeofence, setLastWithinGeofence] = useState<boolean>(
    matchingRow?.is_within_geofence ?? true,
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const resetCapture = useCallback(() => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoBlob(null);
    setPhotoUrl(null);
    setCoords(null);
    setGeoError(null);
    setErrorKey(null);
    setPhase('idle');
  }, [photoUrl]);

  const acquireLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError('unavailable');
      return;
    }
    setGeoError(null);
    setPhase('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setPhase((p) => (p === 'locating' ? 'idle' : p));
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setGeoError('permission');
        else if (err.code === err.POSITION_UNAVAILABLE) setGeoError('unavailable');
        else setGeoError('timeout');
        setPhase('idle');
      },
      { enableHighAccuracy: true, timeout: GEO_TIMEOUT_MS, maximumAge: 0 },
    );
  }, []);

  const onPhotoChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] ?? null;
      if (!file) return;
      if (file.type !== 'image/jpeg') {
        setErrorKey('photo_unsupported');
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setErrorKey('photo_too_large');
        return;
      }
      // Feature 4 / D-041: photo is OPTIONAL; a compression failure must NOT
      // block submission. Fall back to the original blob when compressJpeg
      // throws; if attaching still fails, clear and surface a soft error but
      // keep the form submittable.
      try {
        const { compressJpeg } = await import('@/lib/images/compress');
        const compressed = await compressJpeg(file);
        const finalBlob: Blob = compressed.blob;
        if (photoUrl) URL.revokeObjectURL(photoUrl);
        setPhotoBlob(finalBlob);
        setPhotoUrl(URL.createObjectURL(finalBlob));
        setErrorKey(null);
        setPhase('photo_ready');
      } catch {
        if (photoUrl) URL.revokeObjectURL(photoUrl);
        setPhotoBlob(null);
        setPhotoUrl(null);
        setErrorKey('photo_attach_failed');
      }
    },
    [photoUrl],
  );

  const submit = useCallback(async () => {
    if (!coords) {
      setErrorKey('location_required');
      return;
    }
    setPhase('submitting');
    setErrorKey(null);
    setSuccessKey(null);

    const idempotencyKey =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
    const capturedAt = new Date().toISOString();

    const form = new FormData();
    // Feature 4 / D-041: photo is OPTIONAL; only append if the promoter
    // chose to attach one. Edge function accepts a missing image field.
    if (photoBlob) {
      form.append(
        'image',
        new File([photoBlob], 'photo.jpg', { type: 'image/jpeg' }),
      );
    }

    if (leg === 'in') {
      form.append(
        'metadata',
        JSON.stringify({
          idempotency_key: idempotencyKey,
          campaign_id: selected.campaign_id,
          location_id: selected.location_id,
          shift_id: selected.shift_id,
          lat: coords.lat,
          lng: coords.lng,
          captured_at: capturedAt,
        }),
      );
    } else {
      form.append(
        'metadata',
        JSON.stringify({
          idempotency_key: idempotencyKey,
          attendance_id: matchingRow!.id,
          lat: coords.lat,
          lng: coords.lng,
          captured_at: capturedAt,
        }),
      );
    }

    try {
      const supabase = createBrowserSupabase();
      const fnName = leg === 'in' ? 'geo-validate-checkin' : 'geo-validate-checkout';
      const { data, error } = await supabase.functions.invoke(fnName, { body: form });
      if (error) throw error;
      const resp = data as {
        attendance_id: string;
        is_within_geofence: boolean;
        status: string;
      };
      setLastAttendanceId(resp.attendance_id);
      setLastWithinGeofence(resp.is_within_geofence);
      setSuccessKey(leg === 'in' ? 'success_checked_in' : 'success_checked_out');
      setPhase('done');
      resetCapture();
      // Fire-and-forget location-trust signal check. Must never block or slow
      // check-in; errors are silently swallowed. Only fires on check-in.
      if (leg === 'in' && coords) {
        try {
          void fetch('/api/attendance/location-trust', {
            method: 'POST',
            keepalive: true,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              attendance_id: resp.attendance_id,
              lat: coords.lat,
              lng: coords.lng,
            }),
          });
        } catch {
          // swallow — this signal must never affect the check-in flow
        }
      }
      // Reload so the server-rendered status reflects the DB.
      window.setTimeout(() => window.location.reload(), 600);
    } catch (err: unknown) {
      const msg = typeof err === 'object' && err && 'message' in err ? String((err as { message?: string }).message) : '';
      if (/already_checked_in_today/i.test(msg)) setErrorKey('error_already_checked_in');
      else if (/already_checked_out/i.test(msg)) setErrorKey('error_already_checked_out');
      else setErrorKey('error_generic');
      setPhase('idle');
    }
  }, [coords, photoBlob, leg, selected, matchingRow, resetCapture]);

  // Feature 4 / D-041: photo is optional, only coords are required to submit.
  const canSubmit = coords != null && phase !== 'submitting';

  const statusPill = statusToPill(matchingRow?.status ?? 'checked_in');
  const showStatusPill = matchingRow != null;
  const needsOverride =
    matchingRow != null &&
    !matchingRow.is_within_geofence &&
    !matchingRow.supervisor_override;

  return (
    <div className="space-y-6">
      {assignments.length > 1 ? (
        <div>
          <label htmlFor="assignment-select" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-fg-secondary">
            {t('select_assignment')}
          </label>
          <select
            id="assignment-select"
            value={selectedId}
            onChange={(e) => {
              setSelectedId(e.target.value);
              resetCapture();
            }}
            className="h-8 w-full rounded-md border border-border bg-white px-3 text-sm focus:border-accent focus:ring-2 focus:ring-accent/20"
          >
            {assignments.map((a) => (
              <option key={a.assignment_id} value={a.assignment_id}>
                {pickLocalizedName(a.campaign_name_i18n, locale)} —{' '}
                {pickLocalizedName(a.location_name_i18n, locale)}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-fg-muted">{t('select_assignment_hint')}</p>
        </div>
      ) : null}

      <section className="rounded-lg border border-border bg-white p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-fg-muted">
              {t('shift_label')}
            </div>
            <div className="mt-1 text-base font-semibold">
              {pickLocalizedName(selected.campaign_name_i18n, locale)}
            </div>
            <div className="mt-0.5 text-sm text-fg-secondary">
              {pickLocalizedName(selected.location_name_i18n, locale)}
            </div>
          </div>
          {showStatusPill ? (
            <StatusPill
              variant={statusPill.variant}
              icon={CheckCircle2}
              label={t(statusPill.labelKey as Parameters<typeof t>[0])}
            />
          ) : (
            <StatusPill variant="neutral" label={t('status_not_checked_in')} />
          )}
        </div>

        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-fg-muted" strokeWidth={1.75} aria-hidden />
            <span className="text-fg-secondary">{t('time_label')}:</span>
            <span dir="ltr" className="tabular-nums">
              {trimSec(selected.shift_start_time)} – {trimSec(selected.shift_end_time)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-fg-muted" strokeWidth={1.75} aria-hidden />
            <span className="text-fg-secondary">{t('geofence_label')}:</span>
            <span dir="ltr" className="tabular-nums">
              {t('meters_short', { value: selected.geofence_radius_m })}
            </span>
          </div>
          {matchingRow?.check_in_time ? (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-fg-muted" strokeWidth={1.75} aria-hidden />
              <span dir="ltr" className="tabular-nums text-fg-secondary">
                {t('checked_in_at', { time: formatTime(matchingRow.check_in_time, locale) })}
              </span>
            </div>
          ) : null}
          {matchingRow?.check_out_time ? (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-fg-muted" strokeWidth={1.75} aria-hidden />
              <span dir="ltr" className="tabular-nums text-fg-secondary">
                {t('checked_out_at', { time: formatTime(matchingRow.check_out_time, locale) })}
              </span>
            </div>
          ) : null}
          {matchingRow?.check_in_distance_m != null ? (
            <div className="flex items-center gap-2">
              <Navigation className="h-4 w-4 text-fg-muted" strokeWidth={1.75} aria-hidden />
              <span className="text-fg-secondary">{t('distance_label')}:</span>
              <span dir="ltr" className="tabular-nums">
                {t('meters_short', { value: matchingRow.check_in_distance_m })}
              </span>
              <StatusPill
                variant={lastWithinGeofence ? 'success' : 'warning'}
                label={lastWithinGeofence ? t('within_geofence') : t('outside_geofence')}
              />
            </div>
          ) : null}
          {matchingRow?.supervisor_override ? (
            <div className="flex items-center gap-2 text-fg-secondary sm:col-span-2">
              <ShieldCheck className="h-4 w-4 text-success" strokeWidth={1.75} aria-hidden />
              {t('override_granted')}
            </div>
          ) : null}
        </dl>
      </section>

      {errorKey ? (
        <Alert variant="danger" title={t(errorKey as Parameters<typeof t>[0])} />
      ) : null}
      {successKey ? (
        <Alert variant="success" title={t(successKey as Parameters<typeof t>[0])} />
      ) : null}

      {!isDone ? (
        <section className="space-y-4 rounded-lg border border-border bg-white p-6">
          <CaptureBlock
            t={t}
            coords={coords}
            geoError={geoError}
            phase={phase}
            photoUrl={photoUrl}
            onAcquireLocation={acquireLocation}
            onPhotoClick={() => fileInputRef.current?.click()}
            onRetake={() => {
              if (photoUrl) URL.revokeObjectURL(photoUrl);
              setPhotoBlob(null);
              setPhotoUrl(null);
              setPhase('idle');
            }}
          />

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg"
            capture="user"
            className="hidden"
            onChange={onPhotoChange}
          />

          <div className="flex justify-end pt-2">
            <Button type="button" onClick={submit} disabled={!canSubmit}>
              {phase === 'submitting' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {t('submitting')}
                </>
              ) : leg === 'in' ? (
                t('check_in_cta')
              ) : (
                t('check_out_cta')
              )}
            </Button>
          </div>
        </section>
      ) : null}

      {needsOverride && lastAttendanceId ? (
        <OverrideRequestForm attendanceId={lastAttendanceId} />
      ) : null}
    </div>
  );
}

function CaptureBlock({
  t,
  coords,
  geoError,
  phase,
  photoUrl,
  onAcquireLocation,
  onPhotoClick,
  onRetake,
}: {
  t: ReturnType<typeof useTranslations>;
  coords: Coords | null;
  geoError: GeoError | null;
  phase: Phase;
  photoUrl: string | null;
  onAcquireLocation: () => void;
  onPhotoClick: () => void;
  onRetake: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-secondary">
          {t('location_label')}
        </div>
        {coords ? (
          <div className="flex items-center gap-2 text-sm">
            <Navigation className="h-4 w-4 text-success" strokeWidth={1.75} aria-hidden />
            <span dir="ltr" className="tabular-nums">
              {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
            </span>
            <Button variant="ghost" size="sm" type="button" onClick={onAcquireLocation}>
              <RefreshCcw className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            </Button>
          </div>
        ) : (
          <Button variant="secondary" type="button" onClick={onAcquireLocation} disabled={phase === 'locating'}>
            {phase === 'locating' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                {t('location_pending')}
              </>
            ) : (
              <>
                <Navigation className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                {t('get_location')}
              </>
            )}
          </Button>
        )}
        {geoError ? (
          <p className="mt-1 flex items-center gap-1 text-xs text-danger">
            <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            {t(
              geoError === 'permission'
                ? 'location_error_permission'
                : geoError === 'unavailable'
                  ? 'location_error_unavailable'
                  : 'location_error_timeout',
            )}
          </p>
        ) : null}
      </div>

      <div>
        <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-secondary">
          {t('photo_optional_label')}
        </div>
        {photoUrl ? (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl}
              alt={t('photo_preview_alt')}
              className="mx-auto max-h-64 rounded-md border border-border"
            />
            <Button
              variant="secondary"
              type="button"
              onClick={onRetake}
              aria-label={t('retake_photo')}
            >
              <RefreshCcw className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              {t('retake_photo')}
            </Button>
          </div>
        ) : (
          <>
            <Button
              variant="secondary"
              type="button"
              onClick={onPhotoClick}
              aria-label={t('attach_photo_optional')}
            >
              <Camera className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              {t('attach_photo_optional')}
            </Button>
            <p className="mt-1.5 text-xs text-fg-muted">{t('photo_optional_hint')}</p>
          </>
        )}
      </div>
    </div>
  );
}
