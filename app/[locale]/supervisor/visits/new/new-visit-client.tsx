'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  Camera,
  Loader2,
  Navigation,
  RefreshCcw,
} from 'lucide-react';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import type {
  LocationPromoter,
  SupervisorCampaignLocation,
} from '@/lib/queries/supervisor-scope';

type Coords = { lat: number; lng: number; accuracy: number };
type GeoError = 'permission' | 'unavailable' | 'timeout';
type Outcome = 'ok' | 'issue_found' | 'coaching' | 'other';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const GEO_TIMEOUT_MS = 15_000;

function pick(n: { ar?: string; en?: string }, locale: string): string {
  if (locale === 'ar') return n.ar ?? n.en ?? '';
  return n.en ?? n.ar ?? '';
}

function targetKey(t: SupervisorCampaignLocation): string {
  return `${t.campaign_id}__${t.location_id}`;
}

export function NewVisitClient({
  locale,
  targets,
  promoters,
  initialPromoterId,
  initialLocationId,
}: {
  locale: string;
  targets: SupervisorCampaignLocation[];
  promoters: LocationPromoter[];
  initialPromoterId: string | null;
  initialLocationId: string | null;
}) {
  const t = useTranslations('Supervisor.visits');
  const tf = useTranslations('FieldVisits');
  const router = useRouter();

  // If the page was opened with ?location_id=..., pre-select the first target
  // matching that location; otherwise use the first target.
  const defaultTarget =
    (initialLocationId
      ? targets.find((x) => x.location_id === initialLocationId)
      : null) ?? targets[0]!;
  const [selectedKey, setSelectedKey] = useState<string>(targetKey(defaultTarget));
  const selected =
    targets.find((x) => targetKey(x) === selectedKey) ?? targets[0]!;

  // Promoter dropdown: filtered to the selected location; pre-filled from
  // query-string if present. Lock the field when coming from the promoter
  // detail page ("Log visit for Sara").
  const promotersForLocation = useMemo(
    () => promoters.filter((p) => p.location_id === selected.location_id),
    [promoters, selected.location_id],
  );
  const [promoterId, setPromoterId] = useState<string>(
    initialPromoterId &&
      promoters.some(
        (p) => p.id === initialPromoterId && p.location_id === selected.location_id,
      )
      ? initialPromoterId
      : '',
  );
  const lockedPromoter = Boolean(initialPromoterId);

  const [outcome, setOutcome] = useState<Outcome>('ok');
  const [notes, setNotes] = useState('');
  const [coords, setCoords] = useState<Coords | null>(null);
  const [geoError, setGeoError] = useState<GeoError | null>(null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const acquireLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError('unavailable');
      return;
    }
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setGeoError('permission');
        else if (err.code === err.POSITION_UNAVAILABLE) setGeoError('unavailable');
        else setGeoError('timeout');
      },
      { enableHighAccuracy: true, timeout: GEO_TIMEOUT_MS, maximumAge: 0 },
    );
  }, []);

  const onPhotoChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.type !== 'image/jpeg') {
        setError('photo_unsupported');
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setError('photo_too_large');
        return;
      }
      const { compressJpeg } = await import('@/lib/images/compress');
      const compressed = await compressJpeg(file);
      const finalBlob: Blob = compressed.blob;
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      setPhotoBlob(finalBlob);
      setPhotoUrl(URL.createObjectURL(finalBlob));
      setError(null);
    },
    [photoUrl],
  );

  const submit = useCallback(async () => {
    if (!coords || !photoBlob) return;
    setSubmitting(true);
    setError(null);

    const idempotencyKey =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;

    const form = new FormData();
    form.append('image', new File([photoBlob], 'visit.jpg', { type: 'image/jpeg' }));
    form.append(
      'metadata',
      JSON.stringify({
        idempotency_key: idempotencyKey,
        campaign_id: selected.campaign_id,
        location_id: selected.location_id,
        promoter_id: promoterId || null,
        lat: coords.lat,
        lng: coords.lng,
        captured_at: new Date().toISOString(),
        outcome,
        notes: notes.trim() ? notes.trim() : null,
      }),
    );

    try {
      const supabase = createBrowserSupabase();
      const { error: fnErr } = await supabase.functions.invoke(
        'supervisor-visit-create',
        { body: form },
      );
      if (fnErr) throw fnErr;
      router.push(`/${locale}/supervisor/visits`);
    } catch (err: unknown) {
      setError('error_generic');
      setSubmitting(false);
      const msg = typeof err === 'object' && err && 'message' in err ? (err as { message?: string }).message : '';
      if (msg) console.warn('visit create failed', msg);
    }
  }, [coords, photoBlob, selected, outcome, notes, promoterId, router, locale]);

  const canSubmit = coords != null && photoBlob != null && !submitting;

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {/* Campaign + location picker */}
      <div>
        <label
          htmlFor="visit-target"
          className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-fg-secondary"
        >
          {t('campaign_location_label')}
        </label>
        <select
          id="visit-target"
          value={selectedKey}
          onChange={(e) => {
            setSelectedKey(e.target.value);
            // When the supervisor changes target, drop any promoter that no
            // longer belongs to the new location — unless the promoter was
            // locked in via ?promoter_id= (in which case just keep the value;
            // the server will reject mismatches anyway).
            if (!lockedPromoter) setPromoterId('');
          }}
          className="h-8 w-full rounded-md border border-border bg-white px-3 text-sm focus:border-accent focus:ring-2 focus:ring-accent/20"
          disabled={lockedPromoter}
        >
          {targets.map((x) => (
            <option key={targetKey(x)} value={targetKey(x)}>
              {pick(x.campaign_name_i18n, locale)} — {pick(x.location_name_i18n, locale)}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-fg-muted">{t('campaign_location_hint')}</p>
      </div>

      {/* Promoter (Feature 4 / D-041) */}
      <div>
        <label
          htmlFor="visit-promoter"
          className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-fg-secondary"
        >
          {tf('promoter_label')}
        </label>
        <select
          id="visit-promoter"
          value={promoterId}
          onChange={(e) => setPromoterId(e.target.value)}
          disabled={lockedPromoter}
          className="h-8 w-full rounded-md border border-border bg-white px-3 text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:bg-muted"
        >
          <option value="">{tf('promoter_placeholder')}</option>
          {promotersForLocation.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </select>
        {lockedPromoter ? (
          <p className="mt-1 text-xs text-fg-muted">{tf('promoter_locked_hint')}</p>
        ) : (
          <p className="mt-1 text-xs text-fg-muted">{tf('promoter_hint')}</p>
        )}
      </div>

      {/* Outcome */}
      <div>
        <label
          htmlFor="visit-outcome"
          className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-fg-secondary"
        >
          {t('outcome_label')}
        </label>
        <select
          id="visit-outcome"
          value={outcome}
          onChange={(e) => setOutcome(e.target.value as Outcome)}
          className="h-8 w-full rounded-md border border-border bg-white px-3 text-sm focus:border-accent focus:ring-2 focus:ring-accent/20"
        >
          <option value="ok">{t('outcome_ok')}</option>
          <option value="issue_found">{t('outcome_issue_found')}</option>
          <option value="coaching">{t('outcome_coaching')}</option>
          <option value="other">{t('outcome_other')}</option>
        </select>
      </div>

      {/* Notes */}
      <div>
        <label
          htmlFor="visit-notes"
          className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-fg-secondary"
        >
          {t('notes_label')}
        </label>
        <Textarea
          id="visit-notes"
          rows={3}
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {/* GPS */}
      <div>
        <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-secondary">
          {t('campaign_location_label')}
        </div>
        {coords ? (
          <div className="flex items-center gap-2 text-sm">
            <Navigation className="h-4 w-4 text-success" strokeWidth={1.75} aria-hidden />
            <span dir="ltr" className="tabular-nums">
              {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
            </span>
            <Button variant="ghost" size="sm" type="button" onClick={acquireLocation}>
              <RefreshCcw className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            </Button>
          </div>
        ) : (
          <Button variant="secondary" type="button" onClick={acquireLocation}>
            <Navigation className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            {t('campaign_location_label')}
          </Button>
        )}
        {geoError ? (
          <p className="mt-1 flex items-center gap-1 text-xs text-danger">
            <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            {geoError}
          </p>
        ) : null}
      </div>

      {/* Photo */}
      <div>
        <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-secondary">
          {t('view_photo')}
        </div>
        {photoUrl ? (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl}
              alt=""
              className="mx-auto max-h-64 rounded-md border border-border"
            />
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                if (photoUrl) URL.revokeObjectURL(photoUrl);
                setPhotoBlob(null);
                setPhotoUrl(null);
              }}
            >
              <RefreshCcw className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </Button>
          </div>
        ) : (
          <Button variant="secondary" type="button" onClick={() => fileRef.current?.click()}>
            <Camera className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </Button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg"
          capture="environment"
          className="hidden"
          onChange={onPhotoChange}
        />
      </div>

      {error ? <Alert variant="danger" title={error} /> : null}

      <div className="flex justify-end border-t border-border pt-6">
        <Button type="submit" disabled={!canSubmit}>
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {t('submit_cta')}
            </>
          ) : (
            t('submit_cta')
          )}
        </Button>
      </div>
    </form>
  );
}
