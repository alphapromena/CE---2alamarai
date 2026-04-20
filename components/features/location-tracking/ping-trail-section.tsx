'use client';

import dynamic from 'next/dynamic';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { LocationPingRow } from '@/lib/queries/location-pings';

const PingTrailMap = dynamic(
  () => import('./ping-trail-map').then((m) => m.PingTrailMap),
  { ssr: false, loading: () => <MapSkeleton /> },
);

function MapSkeleton() {
  return (
    <div className="h-[420px] w-full animate-pulse rounded-md border border-border bg-bg-subtle" />
  );
}

export interface PingTrailSectionProps {
  pings: LocationPingRow[];
  checkInPoint: { lat: number; lng: number } | null;
  dateYYYYMMDD: string;
  minDate: string;
  maxDate: string;
}

/**
 * Feature 5 D-042: supervisor-facing daily ping trail section. The map is
 * dynamic-imported with ssr:false because Leaflet touches window + document
 * at module load; server rendering it would crash the page.
 */
export function PingTrailSection({
  pings,
  checkInPoint,
  dateYYYYMMDD,
  minDate,
  maxDate,
}: PingTrailSectionProps) {
  const t = useTranslations('LocationTracking');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleDateChange = (next: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('trail_date', next);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t('trail_title')}</h2>
          <p className="text-sm text-fg-muted">
            {t('trail_ping_count', { count: pings.length })}
          </p>
        </div>
        <label className="inline-flex flex-col text-xs text-fg-muted">
          <span>{t('trail_date_label')}</span>
          <input
            type="date"
            value={dateYYYYMMDD}
            min={minDate}
            max={maxDate}
            onChange={(e) => handleDateChange(e.target.value)}
            className="mt-1 rounded-md border border-border bg-white px-2 py-1 text-sm text-fg"
          />
        </label>
      </div>

      {pings.length === 0 && !checkInPoint ? (
        <div className="rounded-md border border-dashed border-border bg-bg-subtle p-6 text-center text-sm text-fg-muted">
          {t('trail_empty')}
        </div>
      ) : (
        <PingTrailMap pings={pings} checkInPoint={checkInPoint} />
      )}
    </section>
  );
}
