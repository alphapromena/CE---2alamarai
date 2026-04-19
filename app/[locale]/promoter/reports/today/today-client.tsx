'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Camera, CloudOff, Loader2, Save, Send, Trash2, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { StatusPill, type StatusPillVariant } from '@/components/ui/status-pill';
import { i18n } from '@/lib/validations/i18n';
import type {
  ActivityPhotoRow,
  DailyReportRow,
  SalesEntryRow,
  SkuLite,
} from '@/lib/queries/reports';
import { enqueue, flush, startFlusher, count as queueCount, type DispatchFn } from '@/lib/offline/queue';
import {
  saveDraftReportAction,
  submitReportAction,
  upsertSalesEntryAction,
  deleteSalesEntryAction,
  deleteActivityPhotoAction,
} from '../actions';

type AssignmentForm = {
  locationId: string;
  locationName: { ar?: string; en?: string };
  campaignId: string;
  campaignName: { ar?: string; en?: string };
  skus: SkuLite[];
  report: DailyReportRow | null;
  entries: SalesEntryRow[];
  photos: ActivityPhotoRow[];
};

type PhotoKind = 'setup' | 'during' | 'end_of_shift';
const PHOTO_KINDS: PhotoKind[] = ['setup', 'during', 'end_of_shift'];

const AUTOSAVE_MS = 30_000;

function statusToPill(
  status: DailyReportRow['status'] | 'new',
): { variant: StatusPillVariant; key: string } {
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
      return { variant: 'neutral', key: 'status_new' };
  }
}

// Dispatch table bridging the offline queue to Server Actions.
const DISPATCH: DispatchFn = async (name, payload) => {
  switch (name) {
    case 'saveDraftReport':
      return saveDraftReportAction(payload);
    case 'submitReport':
      return submitReportAction(payload);
    case 'upsertSalesEntry':
      return upsertSalesEntryAction(payload);
    case 'deleteSalesEntry':
      return deleteSalesEntryAction(payload);
    case 'deleteActivityPhoto':
      return deleteActivityPhotoAction(payload);
    default:
      return { error: 'unknown_action' };
  }
};

export interface TodayReportClientProps {
  locale: string;
  reportDate: string;
  assignments: AssignmentForm[];
}

export function TodayReportClient({ locale, reportDate, assignments }: TodayReportClientProps) {
  const [activeId, setActiveId] = useState<string>(assignments[0]?.locationId ?? '');
  const active = useMemo(
    () => assignments.find((a) => a.locationId === activeId) ?? assignments[0]!,
    [assignments, activeId],
  );

  if (!active) return null;

  return (
    <div className="space-y-6">
      {assignments.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {assignments.map((a) => (
            <Button
              key={a.locationId}
              type="button"
              variant={a.locationId === activeId ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setActiveId(a.locationId)}
            >
              {i18n(a.locationName, locale)}
            </Button>
          ))}
        </div>
      ) : null}

      <ReportForm
        key={active.locationId}
        locale={locale}
        reportDate={reportDate}
        assignment={active}
      />
    </div>
  );
}

function ReportForm({
  locale,
  reportDate,
  assignment,
}: {
  locale: string;
  reportDate: string;
  assignment: AssignmentForm;
}) {
  const t = useTranslations('Promoter.reports');
  const tc = useTranslations('Common');
  type LocalStatus = DailyReportRow['status'] | 'new';
  const [reportId, setReportId] = useState<string | null>(assignment.report?.id ?? null);
  const [status, setStatus] = useState<LocalStatus>(
    (assignment.report?.status as LocalStatus) ?? 'new',
  );
  const [traffic, setTraffic] = useState<string>(
    assignment.report?.total_traffic == null ? '' : String(assignment.report.total_traffic),
  );
  const [contacts, setContacts] = useState<string>(String(assignment.report?.contacts ?? 0));
  const [engaged, setEngaged] = useState<string>(String(assignment.report?.engaged ?? 0));
  const [notes, setNotes] = useState<string>(assignment.report?.notes ?? '');
  const [entries, setEntries] = useState<Record<string, { samples: number; sales: number }>>(() => {
    const m: Record<string, { samples: number; sales: number }> = {};
    for (const e of assignment.entries) m[e.sku_id] = { samples: e.samples, sales: e.sales };
    return m;
  });
  const [photos, setPhotos] = useState<Record<PhotoKind, string | null>>(() => {
    const m: Record<PhotoKind, string | null> = { setup: null, during: null, end_of_shift: null };
    for (const p of assignment.photos) m[p.photo_kind] = p.storage_path;
    return m;
  });

  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingKind, setUploadingKind] = useState<PhotoKind | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [queuedCount, setQueuedCount] = useState<number>(0);
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  const lastAutosaveRef = useRef<number>(0);

  const totalsFromEntries = useMemo(() => {
    let samples = 0;
    let sales = 0;
    for (const key of Object.keys(entries)) {
      samples += entries[key]?.samples ?? 0;
      sales += entries[key]?.sales ?? 0;
    }
    return { samples, sales };
  }, [entries]);

  const frozen = status === 'approved' || status === 'rejected';
  const pill = statusToPill(status);

  // Offline queue lifecycle.
  useEffect(() => {
    const stop = startFlusher(DISPATCH, 30_000);
    const update = () => {
      setOnline(navigator.onLine);
      void queueCount().then(setQueuedCount);
    };
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    const int = setInterval(update, 5_000);
    return () => {
      stop();
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      clearInterval(int);
    };
  }, []);

  const saveDraft = useCallback(
    async (silent = false): Promise<string | null> => {
      if (frozen) return reportId;
      if (!silent) setSaving(true);
      setFormError(null);
      const payload = {
        id: reportId ?? undefined,
        idempotency_key: crypto.randomUUID(),
        campaign_id: assignment.campaignId,
        location_id: assignment.locationId,
        report_date: reportDate,
        total_traffic: traffic === '' ? null : Number(traffic),
        contacts: Number(contacts || 0),
        engaged: Number(engaged || 0),
        notes: notes || undefined,
      };

      try {
        const result = await saveDraftReportAction(payload);
        if (!silent) setSaving(false);
        if (result.error) {
          setFormError(result.error);
          return null;
        }
        if (result.reportId) {
          setReportId(result.reportId);
          if ((status as DailyReportRow['status'] | 'new') === 'rejected') setStatus('draft');
          return result.reportId;
        }
        return null;
      } catch (err) {
        if (!silent) setSaving(false);
        // Queue on failure.
        await enqueue({
          actionName: 'saveDraftReport',
          payload,
          idempotencyKey: payload.idempotency_key,
        });
        setQueuedCount(await queueCount());
        setFormError(err instanceof Error ? err.message : 'offline_queued');
        return null;
      }
    },
    [
      frozen,
      reportId,
      assignment.campaignId,
      assignment.locationId,
      reportDate,
      traffic,
      contacts,
      engaged,
      notes,
      status,
    ],
  );

  // Autosave on blur (handler below) + every AUTOSAVE_MS.
  useEffect(() => {
    if (frozen) return;
    const id = setInterval(() => {
      if (!reportId) return;
      const since = Date.now() - lastAutosaveRef.current;
      if (since < AUTOSAVE_MS) return;
      lastAutosaveRef.current = Date.now();
      void saveDraft(true);
    }, AUTOSAVE_MS);
    return () => clearInterval(id);
  }, [frozen, reportId, saveDraft]);

  const onSkuChange = useCallback(
    async (skuId: string, field: 'samples' | 'sales', value: number) => {
      const current = entries[skuId] ?? { samples: 0, sales: 0 };
      const next = { ...current, [field]: Math.max(0, value) };
      setEntries((prev) => ({ ...prev, [skuId]: next }));

      // Need a reportId to persist sales entries. Create the draft first.
      let rid = reportId;
      if (!rid) rid = await saveDraft(true);
      if (!rid) return;

      const payload = {
        daily_report_id: rid,
        sku_id: skuId,
        samples: next.samples,
        sales: next.sales,
      };
      try {
        await upsertSalesEntryAction(payload);
      } catch {
        await enqueue({
          actionName: 'upsertSalesEntry',
          payload,
          idempotencyKey: crypto.randomUUID(),
        });
        setQueuedCount(await queueCount());
      }
    },
    [entries, reportId, saveDraft],
  );

  const onDeleteSku = useCallback(
    async (skuId: string) => {
      if (!reportId) return;
      setEntries((prev) => {
        const copy = { ...prev };
        delete copy[skuId];
        return copy;
      });
      const payload = { daily_report_id: reportId, sku_id: skuId };
      try {
        await deleteSalesEntryAction(payload);
      } catch {
        await enqueue({
          actionName: 'deleteSalesEntry',
          payload,
          idempotencyKey: crypto.randomUUID(),
        });
        setQueuedCount(await queueCount());
      }
    },
    [reportId],
  );

  const onPhotoPick = useCallback(
    async (kind: PhotoKind, file: File | null) => {
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) {
        setFormError('photo_too_large');
        return;
      }
      if (file.type && file.type !== 'image/jpeg') {
        setFormError('photo_not_jpeg');
        return;
      }
      let rid = reportId;
      if (!rid) rid = await saveDraft(true);
      if (!rid) {
        setFormError('save_first');
        return;
      }
      setUploadingKind(kind);
      setFormError(null);
      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('daily_report_id', rid);
        fd.append('photo_kind', kind);
        const res = await fetch('/api/activity-photos/upload', { method: 'POST', body: fd });
        if (!res.ok) throw new Error(`upload_failed_${res.status}`);
        const body = (await res.json()) as { storage_path?: string };
        if (body.storage_path) {
          setPhotos((p) => ({ ...p, [kind]: body.storage_path! }));
        }
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'upload_failed');
      } finally {
        setUploadingKind(null);
      }
    },
    [reportId, saveDraft],
  );

  const onPhotoDelete = useCallback(
    async (kind: PhotoKind) => {
      if (!reportId) return;
      const payload = { daily_report_id: reportId, photo_kind: kind };
      try {
        await deleteActivityPhotoAction(payload);
      } catch {
        await enqueue({
          actionName: 'deleteActivityPhoto',
          payload,
          idempotencyKey: crypto.randomUUID(),
        });
        setQueuedCount(await queueCount());
      }
      setPhotos((p) => ({ ...p, [kind]: null }));
    },
    [reportId],
  );

  const onSubmit = useCallback(async () => {
    setSubmitting(true);
    setFormError(null);
    const rid = reportId ?? (await saveDraft(true));
    if (!rid) {
      setSubmitting(false);
      setFormError('save_first');
      return;
    }
    const payload = { id: rid, idempotency_key: crypto.randomUUID() };
    try {
      const result = await submitReportAction(payload);
      if (result.error) {
        setFormError(result.error);
      } else {
        setStatus('submitted');
      }
    } catch {
      await enqueue({ actionName: 'submitReport', payload, idempotencyKey: payload.idempotency_key });
      setQueuedCount(await queueCount());
      setFormError('offline_queued');
    } finally {
      setSubmitting(false);
    }
  }, [reportId, saveDraft]);

  const onFlushNow = useCallback(async () => {
    const out = await flush(DISPATCH);
    setQueuedCount(out.remaining);
  }, []);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="text-sm text-fg-secondary">{i18n(assignment.locationName, locale)}</div>
          <div className="text-xs text-fg-muted">·</div>
          <div className="text-xs text-fg-muted">{i18n(assignment.campaignName, locale)}</div>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill variant={pill.variant} label={t(pill.key)} />
          {!online ? <StatusPill variant="warning" icon={WifiOff} label={t('offline')} /> : null}
          {queuedCount > 0 ? (
            <button
              type="button"
              onClick={onFlushNow}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-2 py-0.5 text-xs hover:bg-bg-hover"
            >
              <CloudOff className="size-3" />
              {t('queued_count', { count: queuedCount })}
            </button>
          ) : null}
        </div>
      </div>

      {formError ? <Alert variant="danger">{t(`errors.${formError}`, { fallback: formError })}</Alert> : null}
      {status === 'rejected' && assignment.report?.review_reason ? (
        <Alert variant="warning">
          <div className="font-medium">{t('rejected_heading')}</div>
          <div className="text-sm">{assignment.report.review_reason}</div>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <NumberField
          label={t('fields.traffic')}
          value={traffic}
          onChange={setTraffic}
          onBlur={() => void saveDraft(true)}
          disabled={frozen}
        />
        <NumberField
          label={t('fields.contacts')}
          value={contacts}
          onChange={setContacts}
          onBlur={() => void saveDraft(true)}
          disabled={frozen}
        />
        <NumberField
          label={t('fields.engaged')}
          value={engaged}
          onChange={setEngaged}
          onBlur={() => void saveDraft(true)}
          disabled={frozen}
        />
      </div>

      <div className="rounded-lg border border-border">
        <div className="border-b border-border bg-bg-subtle px-3 py-2 text-sm font-medium">
          {t('skus_heading')}
        </div>
        {assignment.skus.length === 0 ? (
          <div className="p-4 text-sm text-fg-muted">{t('no_skus')}</div>
        ) : (
          <div className="divide-y divide-border">
            {assignment.skus.map((sku) => {
              const row = entries[sku.id] ?? { samples: 0, sales: 0 };
              return (
                <div
                  key={sku.id}
                  className="grid grid-cols-1 items-end gap-3 p-3 sm:grid-cols-[1fr_120px_120px_auto]"
                >
                  <div className="text-sm">
                    <div className="font-medium">{i18n(sku.name_i18n, locale)}</div>
                    <div className="text-xs text-fg-muted">{i18n(sku.unit_i18n, locale)}</div>
                  </div>
                  <NumberField
                    label={t('fields.samples')}
                    value={String(row.samples)}
                    onChange={(v) => void onSkuChange(sku.id, 'samples', Number(v || 0))}
                    disabled={frozen}
                  />
                  <NumberField
                    label={t('fields.sales')}
                    value={String(row.sales)}
                    onChange={(v) => void onSkuChange(sku.id, 'sales', Number(v || 0))}
                    disabled={frozen}
                  />
                  {!frozen && entries[sku.id] ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => void onDeleteSku(sku.id)}
                      aria-label={tc('delete')}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  ) : (
                    <div />
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="border-t border-border px-3 py-2 text-xs text-fg-secondary">
          {t('totals_summary', {
            samples: totalsFromEntries.samples,
            sales: totalsFromEntries.sales,
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {PHOTO_KINDS.map((kind) => (
          <PhotoSlot
            key={kind}
            kind={kind}
            label={t(`photo.${kind}`)}
            storagePath={photos[kind]}
            disabled={frozen}
            uploading={uploadingKind === kind}
            onPick={(file) => void onPhotoPick(kind, file)}
            onDelete={() => void onPhotoDelete(kind)}
          />
        ))}
      </div>

      <div>
        <Label htmlFor="notes">{t('fields.notes')}</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => void saveDraft(true)}
          rows={4}
          disabled={frozen}
        />
      </div>

      {!frozen ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="secondary" onClick={() => void saveDraft(false)} disabled={saving || submitting}>
            {saving ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
            {saving ? tc('saving') : t('save_draft')}
          </Button>
          <Button type="button" variant="primary" onClick={onSubmit} disabled={submitting || saving}>
            {submitting ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
            {submitting ? tc('submitting') : t('submit')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function NumberField({
  label,
  value,
  onChange,
  onBlur,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        disabled={disabled}
      />
    </div>
  );
}

function PhotoSlot({
  kind,
  label,
  storagePath,
  disabled,
  uploading,
  onPick,
  onDelete,
}: {
  kind: PhotoKind;
  label: string;
  storagePath: string | null;
  disabled?: boolean;
  uploading?: boolean;
  onPick: (file: File | null) => void;
  onDelete: () => void;
}) {
  const t = useTranslations('Promoter.reports');
  const [signed, setSigned] = useState<string | null>(null);

  useEffect(() => {
    if (!storagePath) return;
    let aborted = false;
    (async () => {
      const res = await fetch('/api/activity-photos/photo-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: storagePath }),
      });
      if (!aborted && res.ok) {
        const body = (await res.json()) as { url?: string };
        setSigned(body.url ?? null);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [storagePath]);

  const showImage = Boolean(storagePath && signed);

  const inputId = `photo-${kind}`;
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">{label}</div>
        {storagePath && !disabled ? (
          <Button type="button" variant="ghost" size="sm" onClick={onDelete}>
            <Trash2 className="size-3" />
          </Button>
        ) : null}
      </div>
      {showImage && signed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={signed}
          alt={label}
          className="mt-2 aspect-square w-full rounded-md border border-border object-cover"
        />
      ) : (
        <label
          htmlFor={inputId}
          className={`mt-2 flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-xs text-fg-muted ${
            disabled ? 'pointer-events-none opacity-50' : 'hover:bg-bg-hover'
          }`}
        >
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
          <span>{uploading ? t('uploading') : t('tap_to_capture')}</span>
        </label>
      )}
      <input
        id={inputId}
        type="file"
        accept="image/jpeg"
        capture="environment"
        className="sr-only"
        disabled={disabled || uploading}
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}
