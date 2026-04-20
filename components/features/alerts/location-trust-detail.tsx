'use client';

import { useTranslations } from 'next-intl';
import { ShieldAlert } from 'lucide-react';
import { StatusPill } from '@/components/ui/status-pill';

type Reason = 'vpn' | 'proxy' | 'fraud_score_high' | 'country_mismatch';

const REASON_KEYS: readonly Reason[] = [
  'vpn',
  'proxy',
  'fraud_score_high',
  'country_mismatch',
];

function isReason(value: unknown): value is Reason {
  return typeof value === 'string' && (REASON_KEYS as readonly string[]).includes(value);
}

/**
 * Detail block rendered for a `location_trust_low` alert. Shows the trigger
 * icon + summary, the list of triggered reasons as pills, and a footer note
 * clarifying that the check-in was allowed — the alert is a verification
 * signal, not a block.
 *
 * Reads message_params.reasons (string[]), defaulting to an empty list.
 */
export function LocationTrustDetail({
  messageParams,
}: {
  messageParams: Record<string, unknown> | null | undefined;
}) {
  const t = useTranslations('LocationTrust');

  const rawReasons = Array.isArray(messageParams?.reasons) ? messageParams?.reasons : [];
  const reasons: Reason[] = (rawReasons as unknown[]).filter(isReason);

  return (
    <div className="mt-2 w-full rounded border border-warning-border bg-warning-subtle p-3 text-sm text-fg-primary">
      <div className="flex items-center gap-2 font-medium text-warning">
        <ShieldAlert aria-hidden className="h-4 w-4" />
        <span>{t('summary')}</span>
      </div>
      {reasons.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {reasons.map((r) => (
            <StatusPill key={r} variant="warning" label={t(`reasons.${r}`)} />
          ))}
        </div>
      ) : null}
      <p className="mt-2 text-xs text-fg-secondary">{t('footer_note')}</p>
    </div>
  );
}
