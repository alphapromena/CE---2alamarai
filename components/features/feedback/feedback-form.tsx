'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Loader2, Plus, Trash2 } from 'lucide-react';
import { submitFeedbackAction } from '@/lib/feedback/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_SENTIMENTS,
} from '@/lib/validations/feedback';

type Assignment = {
  assignment_id: string;
  campaign_id: string;
  location_id: string;
  campaign_name_i18n: { ar?: string; en?: string } | null;
  location_name_i18n: { ar?: string; en?: string } | null;
};

function pickName(n: { ar?: string; en?: string } | null, locale: string): string {
  if (!n) return '';
  return (locale === 'ar' ? n.ar : n.en) ?? n.en ?? n.ar ?? '';
}

export function FeedbackForm({
  locale,
  assignments,
  landingPath,
}: {
  locale: string;
  assignments: Assignment[];
  landingPath: string;
}) {
  const t = useTranslations('Feedback.form');
  const tCat = useTranslations('Feedback.category');
  const tSent = useTranslations('Feedback.sentiment');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const first = assignments[0];
  const [campaignId, setCampaignId] = useState(first?.campaign_id ?? '');
  const [locationId, setLocationId] = useState(first?.location_id ?? '');
  const [category, setCategory] =
    useState<(typeof FEEDBACK_CATEGORIES)[number]>('product');
  const [sentiment, setSentiment] = useState<
    (typeof FEEDBACK_SENTIMENTS)[number] | ''
  >('');
  const [body, setBody] = useState('');
  const [competitors, setCompetitors] = useState<
    { brand: string; context: string }[]
  >([]);

  function addCompetitor(): void {
    if (competitors.length >= 10) return;
    setCompetitors([...competitors, { brand: '', context: '' }]);
  }
  function removeCompetitor(i: number): void {
    setCompetitors(competitors.filter((_, idx) => idx !== i));
  }
  function updateCompetitor(i: number, field: 'brand' | 'context', value: string): void {
    setCompetitors(
      competitors.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)),
    );
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    if (!campaignId || !locationId) {
      setError('no_assignment');
      return;
    }
    if (body.trim().length === 0) {
      setError('empty_body');
      return;
    }
    const comps = competitors
      .filter((c) => c.brand.trim().length > 0)
      .map((c) => ({
        brand: c.brand.trim(),
        context: c.context.trim() || undefined,
      }));
    startTransition(async () => {
      const res = await submitFeedbackAction({
        campaign_id: campaignId,
        location_id: locationId,
        category,
        sentiment: sentiment || undefined,
        body: body.trim(),
        competitors: comps.length > 0 ? comps : undefined,
        idempotency_key: crypto.randomUUID(),
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setBody('');
      setCompetitors([]);
      router.push(landingPath);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error ? (
        <Alert variant="danger">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          <span>{t(`errors.${error}`)}</span>
        </Alert>
      ) : null}

      <div>
        <Label>{t('assignment')}</Label>
        <select
          value={`${campaignId}|${locationId}`}
          onChange={(e) => {
            const [c, l] = e.target.value.split('|');
            setCampaignId(c ?? '');
            setLocationId(l ?? '');
          }}
          className="mt-1 block w-full rounded border border-border bg-white px-3 py-2 text-sm"
        >
          {assignments.map((a) => (
            <option
              key={a.assignment_id}
              value={`${a.campaign_id}|${a.location_id}`}
            >
              {pickName(a.location_name_i18n, locale)} — {pickName(a.campaign_name_i18n, locale)}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>{t('category')}</Label>
          <select
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as (typeof FEEDBACK_CATEGORIES)[number])
            }
            className="mt-1 block w-full rounded border border-border bg-white px-3 py-2 text-sm"
          >
            {FEEDBACK_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {tCat(c)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>{t('sentiment')}</Label>
          <select
            value={sentiment}
            onChange={(e) =>
              setSentiment(e.target.value as (typeof FEEDBACK_SENTIMENTS)[number] | '')
            }
            className="mt-1 block w-full rounded border border-border bg-white px-3 py-2 text-sm"
          >
            <option value="">{t('sentiment_none')}</option>
            {FEEDBACK_SENTIMENTS.map((s) => (
              <option key={s} value={s}>
                {tSent(s)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <Label>{t('body')}</Label>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder={t('body_placeholder')}
          required
        />
      </div>

      <div className="rounded-md border border-border bg-bg-subtle p-3">
        <div className="flex items-center justify-between">
          <Label className="mb-0">{t('competitors')}</Label>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={addCompetitor}
            disabled={competitors.length >= 10}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            <span>{t('add_competitor')}</span>
          </Button>
        </div>
        {competitors.length === 0 ? (
          <p className="mt-2 text-xs text-fg-muted">{t('competitors_hint')}</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {competitors.map((c, i) => (
              <li key={i} className="grid gap-2 rounded border border-border bg-white p-2 sm:grid-cols-[1fr_1fr_auto]">
                <Input
                  value={c.brand}
                  onChange={(e) => updateCompetitor(i, 'brand', e.target.value)}
                  placeholder={t('competitor_brand')}
                  maxLength={120}
                />
                <Input
                  value={c.context}
                  onChange={(e) => updateCompetitor(i, 'context', e.target.value)}
                  placeholder={t('competitor_context')}
                  maxLength={500}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeCompetitor(i)}
                  aria-label={t('remove_competitor')}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex border-t border-border pt-4">
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          <span>{t('submit')}</span>
        </Button>
      </div>
    </form>
  );
}
