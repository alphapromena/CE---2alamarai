'use client';

import dynamic from 'next/dynamic';
import { MapPin } from 'lucide-react';
import type { CheckinPoint } from './live-checkins-map-impl';

export type { CheckinPoint } from './live-checkins-map-impl';

// Leaflet touches `window`/`document` at module load, so the entire react-leaflet
// subtree is dynamic-imported with ssr:false. This mirrors the established
// codebase pattern in `components/features/location-tracking/ping-trail-section.tsx`
// which gates `ping-trail-map` behind the same boundary.
const LiveCheckinsMapImpl = dynamic(
  () => import('./live-checkins-map-impl').then((m) => m.LiveCheckinsMapImpl),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full animate-pulse bg-bg-subtle" aria-hidden />
    ),
  },
);

export interface LiveCheckinsMapProps {
  points: CheckinPoint[];
  locale: 'en' | 'ar';
  emptyLabel: string;
  pinOkLabel: string;
  pinWarnLabel: string;
}

export function LiveCheckinsMap({
  points,
  locale,
  emptyLabel,
  pinOkLabel,
  pinWarnLabel,
}: LiveCheckinsMapProps) {
  if (points.length === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-subtle"
          aria-hidden
        >
          <MapPin className="h-5 w-5 text-accent" strokeWidth={1.75} />
        </div>
        <p className="text-sm text-fg-secondary">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <LiveCheckinsMapImpl
      points={points}
      locale={locale}
      pinOkLabel={pinOkLabel}
      pinWarnLabel={pinWarnLabel}
    />
  );
}
