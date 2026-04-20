'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Loader2, FileSpreadsheet } from 'lucide-react';
import { queueExportAction } from '@/lib/exports/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import type { ExportDomain, ExportFormat } from '@/lib/exports/types';
import type { ExportRole } from '@/lib/exports/types';

type Option = { id: string; label: string };

export function NewExportForm({
  locale,
  role,
  campaigns,
  locations,
  skus,
  landingPath,
}: {
  locale: 'ar' | 'en';
  role: ExportRole;
  campaigns: Option[];
  locations: Option[];
  skus: Option[];
  landingPath: string;
}) {
  const t = useTranslations('Exports.new');
  const tCommon = useTranslations('Common');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Date.now() would trip react-hooks/purity if read during render; lazy
  // state initializer defers the call to mount time.
  const [dateDefaults] = useState(() => {
    const now = new Date();
    return {
      today: now.toISOString().slice(0, 10),
      thirtyAgo: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    };
  });
  const { today, thirtyAgo } = dateDefaults;

  const [campaignIds, setCampaignIds] = useState<string[]>([]);
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [skuIds, setSkuIds] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState(thirtyAgo);
  const [toDate, setToDate] = useState(today);
  const [format, setFormat] = useState<ExportFormat>('xlsx');

  const baseDomains: ExportDomain[] =
    role === 'client'
      ? ['attendance', 'activity', 'stock', 'performance', 'feedback']
      : ['attendance', 'activity', 'stock', 'performance', 'supervisor_actions', 'feedback'];
  const [domains, setDomains] = useState<ExportDomain[]>([...baseDomains]);

  function toggleInArray(arr: string[], value: string): string[] {
    return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    if (domains.length === 0) {
      setError('no_domain');
      return;
    }
    if (fromDate > toDate) {
      setError('date_range');
      return;
    }
    startTransition(async () => {
      const res = await queueExportAction(
        {
          scope: {
            campaign_ids: campaignIds,
            location_ids: locationIds,
            sku_ids: skuIds,
            from_date: fromDate,
            to_date: toDate,
            domains,
          },
          format,
          idempotency_key: crypto.randomUUID(),
        },
        locale,
      );
      if (res.error) {
        setError(res.error);
        return;
      }
      router.push(landingPath);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error ? (
        <Alert variant="danger">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          <span>{t(`errors.${error}`)}</span>
        </Alert>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>{t('from_date')}</Label>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            required
            dir="ltr"
          />
        </div>
        <div>
          <Label>{t('to_date')}</Label>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            required
            dir="ltr"
          />
        </div>
      </section>

      <section>
        <Label>{t('domains')}</Label>
        <div className="mt-1 flex flex-wrap gap-2">
          {baseDomains.map((d) => (
            <label
              key={d}
              className={`inline-flex items-center gap-2 rounded-md border px-3 py-1 text-sm ${
                domains.includes(d)
                  ? 'border-accent bg-accent-subtle'
                  : 'border-border bg-white hover:bg-bg-hover'
              }`}
            >
              <input
                type="checkbox"
                checked={domains.includes(d)}
                onChange={() => setDomains(toggleInArray(domains, d) as ExportDomain[])}
                className="h-3.5 w-3.5"
              />
              <span>{t(`domain.${d}`)}</span>
            </label>
          ))}
        </div>
      </section>

      <section>
        <Label>{t('campaigns')}</Label>
        <p className="mb-1 text-xs text-fg-muted">{t('all_hint')}</p>
        <div className="max-h-40 overflow-y-auto rounded-md border border-border p-2">
          {campaigns.length === 0 ? (
            <p className="text-xs text-fg-muted">{tCommon('none')}</p>
          ) : (
            campaigns.map((c) => (
              <label key={c.id} className="flex items-center gap-2 px-1 py-0.5 text-sm">
                <input
                  type="checkbox"
                  checked={campaignIds.includes(c.id)}
                  onChange={() => setCampaignIds(toggleInArray(campaignIds, c.id))}
                />
                <span>{c.label}</span>
              </label>
            ))
          )}
        </div>
      </section>

      {role !== 'client' ? (
        <section>
          <Label>{t('locations')}</Label>
          <p className="mb-1 text-xs text-fg-muted">{t('all_hint')}</p>
          <div className="max-h-40 overflow-y-auto rounded-md border border-border p-2">
            {locations.length === 0 ? (
              <p className="text-xs text-fg-muted">{tCommon('none')}</p>
            ) : (
              locations.map((l) => (
                <label key={l.id} className="flex items-center gap-2 px-1 py-0.5 text-sm">
                  <input
                    type="checkbox"
                    checked={locationIds.includes(l.id)}
                    onChange={() => setLocationIds(toggleInArray(locationIds, l.id))}
                  />
                  <span>{l.label}</span>
                </label>
              ))
            )}
          </div>
        </section>
      ) : null}

      {skus.length > 0 ? (
        <section>
          <Label>{t('skus')}</Label>
          <div className="max-h-32 overflow-y-auto rounded-md border border-border p-2">
            {skus.map((s) => (
              <label key={s.id} className="flex items-center gap-2 px-1 py-0.5 text-sm">
                <input
                  type="checkbox"
                  checked={skuIds.includes(s.id)}
                  onChange={() => setSkuIds(toggleInArray(skuIds, s.id))}
                />
                <span>{s.label}</span>
              </label>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <Label>{t('format')}</Label>
        <div className="mt-1 flex gap-2">
          <label
            className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${
              format === 'xlsx'
                ? 'border-accent bg-accent-subtle'
                : 'border-border bg-white hover:bg-bg-hover'
            }`}
          >
            <input
              type="radio"
              name="format"
              value="xlsx"
              checked={format === 'xlsx'}
              onChange={() => setFormat('xlsx')}
            />
            <span>XLSX</span>
          </label>
          <label
            className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${
              format === 'csv_zip'
                ? 'border-accent bg-accent-subtle'
                : 'border-border bg-white hover:bg-bg-hover'
            }`}
          >
            <input
              type="radio"
              name="format"
              value="csv_zip"
              checked={format === 'csv_zip'}
              onChange={() => setFormat('csv_zip')}
            />
            <span>{t('csv_zip')}</span>
          </label>
        </div>
      </section>

      <div className="flex items-center gap-3 border-t border-border pt-4">
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <FileSpreadsheet className="h-4 w-4" aria-hidden />
          )}
          <span>{t('submit')}</span>
        </Button>
      </div>
    </form>
  );
}
