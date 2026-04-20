import { getTranslations } from 'next-intl/server';
import { MessageSquare } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusPill, type StatusPillVariant } from '@/components/ui/status-pill';
import { i18n } from '@/lib/validations/i18n';
import type { ConsumerFeedbackListRow } from '@/lib/queries/feedback';

const SENT_VARIANT: Record<string, StatusPillVariant> = {
  positive: 'success',
  neutral: 'neutral',
  negative: 'danger',
};

export async function FeedbackList({
  rows,
  locale,
  showPromoter,
}: {
  rows: ConsumerFeedbackListRow[];
  locale: string;
  showPromoter: boolean;
}) {
  const t = await getTranslations('Feedback');
  const tCat = await getTranslations('Feedback.category');
  const tSent = await getTranslations('Feedback.sentiment');
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title={t('empty_title')}
        description={t('empty_description')}
      />
    );
  }
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.id} className="rounded-lg border border-border bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <StatusPill variant="info" label={tCat(r.category)} />
              {r.sentiment ? (
                <StatusPill
                  variant={SENT_VARIANT[r.sentiment] ?? 'neutral'}
                  label={tSent(r.sentiment)}
                />
              ) : null}
            </div>
            <span dir="ltr" className="font-mono text-xs tabular-nums text-fg-muted">
              {new Date(r.created_at).toLocaleString(locale === 'ar' ? 'ar-JO' : 'en-JO')}
            </span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm">{r.body}</p>
          <div className="mt-2 text-xs text-fg-secondary">
            {i18n(r.campaign_name_i18n ?? null, locale)} · {i18n(r.location_name_i18n ?? null, locale)}
            {showPromoter && r.promoter_name ? ` · ${r.promoter_name}` : ''}
          </div>
          {r.competitor_brands.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {r.competitor_brands.map((b) => (
                <span
                  key={b}
                  className="rounded border border-border bg-bg-subtle px-2 py-0.5 text-xs"
                >
                  {b}
                </span>
              ))}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
