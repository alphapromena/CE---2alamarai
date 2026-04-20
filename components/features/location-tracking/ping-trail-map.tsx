'use client';

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { LocationPingRow } from '@/lib/queries/location-pings';

// Leaflet ships marker icons as image URLs that Next's bundler doesn't
// rewrite. Rather than shipping broken icons we use a compact inline SVG
// DivIcon so bundlers have nothing to resolve.
const PING_ICON = L.divIcon({
  className: 'ce-ping-icon',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
  html:
    '<span style="display:block;width:14px;height:14px;border-radius:999px;background:#059669;border:2px solid white;box-shadow:0 0 0 1px #05966955"></span>',
});

const CHECKIN_ICON = L.divIcon({
  className: 'ce-checkin-icon',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  html:
    '<span style="display:block;width:22px;height:22px;border-radius:4px;background:#f59e0b;border:2px solid white;box-shadow:0 0 0 1px #f59e0b55;transform:rotate(45deg)"></span>',
});

function formatTime(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleTimeString(locale === 'ar' ? 'ar-JO' : 'en-JO', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export interface PingTrailMapProps {
  pings: LocationPingRow[];
  checkInPoint: { lat: number; lng: number } | null;
}

export function PingTrailMap({ pings, checkInPoint }: PingTrailMapProps) {
  const locale = useLocale();
  const t = useTranslations('LocationTracking');

  const positions = useMemo<[number, number][]>(
    () => pings.map((p) => [p.lat, p.lng]),
    [pings],
  );

  const bounds = useMemo(() => {
    const pts: [number, number][] = [...positions];
    if (checkInPoint) pts.push([checkInPoint.lat, checkInPoint.lng]);
    if (pts.length === 0) return null;
    return L.latLngBounds(pts.map((p) => L.latLng(p[0], p[1])));
  }, [positions, checkInPoint]);

  const center: [number, number] = positions[0] ??
    (checkInPoint ? [checkInPoint.lat, checkInPoint.lng] : [31.95, 35.91]);

  return (
    <div className="h-[420px] w-full overflow-hidden rounded-md border border-border">
      <MapContainer
        center={center}
        zoom={15}
        bounds={bounds ?? undefined}
        boundsOptions={{ padding: [32, 32] }}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {positions.length >= 2 ? (
          <Polyline positions={positions} pathOptions={{ color: '#059669', weight: 3, opacity: 0.75 }} />
        ) : null}
        {pings.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={PING_ICON}>
            <Popup>
              <div className="text-xs">
                <p className="font-semibold">{formatTime(p.captured_at, locale)}</p>
                {typeof p.accuracy_m === 'number' ? (
                  <p>±{Math.round(p.accuracy_m)} m</p>
                ) : null}
                {typeof p.battery_pct === 'number' ? (
                  <p>🔋 {p.battery_pct}%</p>
                ) : null}
              </div>
            </Popup>
            {typeof p.accuracy_m === 'number' && p.accuracy_m > 0 ? (
              <CircleMarker
                center={[p.lat, p.lng]}
                radius={Math.min(60, Math.max(6, p.accuracy_m / 4))}
                pathOptions={{
                  color: '#059669',
                  fillColor: '#05966920',
                  fillOpacity: 0.3,
                  weight: 1,
                }}
              />
            ) : null}
          </Marker>
        ))}
        {checkInPoint ? (
          <Marker position={[checkInPoint.lat, checkInPoint.lng]} icon={CHECKIN_ICON}>
            <Popup>{t('trail_checkin_marker')}</Popup>
          </Marker>
        ) : null}
      </MapContainer>
    </div>
  );
}
