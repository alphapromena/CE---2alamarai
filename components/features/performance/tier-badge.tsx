import { useTranslations } from 'next-intl';
import { StatusPill } from '@/components/ui/status-pill';
import type { Tier } from '@/lib/performance/tiering';

export function TierBadge({ tier }: { tier: Tier | null }) {
  const t = useTranslations('Performance.tier');
  if (tier === 'top') return <StatusPill variant="success" label={t('top')} />;
  if (tier === 'medium') return <StatusPill variant="warning" label={t('medium')} />;
  if (tier === 'low') return <StatusPill variant="danger" label={t('low')} />;
  return <StatusPill variant="neutral" label={t('unclassified')} />;
}
