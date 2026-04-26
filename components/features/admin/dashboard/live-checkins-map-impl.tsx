'use client';

import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L, { type DivIcon } from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface CheckinPoint {
  id: string;
  lat: number;
  lng: number;
  promoterName: string;
  locationName: string;
  checkInTime: string;
  isWithinGeofence: boolean;
}

export interface LiveCheckinsMapImplProps {
  points: CheckinPoint[];
  locale: 'en' | 'ar';
  pinOkLabel: string;
  pinWarnLabel: string;
}

// Brand cyan (#0ABCD4) for in-geofence; warning amber (#B8950E from --color-warning)
// for out-of-geofence. Inline SVG so we don't ship Leaflet's PNG marker assets.
function buildIcon(fill: string): DivIcon {
  return L.divIcon({
    className: 'ce-checkin-pin',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    html:
      `<span style="display:block;width:16px;height:16px;border-radius:999px;` +
      `background:${fill};border:2px solid white;` +
      `box-shadow:0 0 0 1px ${fill}55, 0 1px 2px rgba(15,27,46,0.25)"></span>`,
  });
}

function FitBounds({ bounds }: { bounds: L.LatLngBoundsExpression }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: 15 });
  }, [map, bounds]);
  return null;
}

export function LiveCheckinsMapImpl({
  points,
  locale,
  pinOkLabel,
  pinWarnLabel,
}: LiveCheckinsMapImplProps) {
  const okIcon = useMemo(() => buildIcon('#0ABCD4'), []);
  const warnIcon = useMemo(() => buildIcon('#B8950E'), []);

  const positions = useMemo<L.LatLngBoundsLiteral>(
    () => points.map((p) => [p.lat, p.lng] as [number, number]),
    [points],
  );

  // Single-point bounds get expanded slightly so the marker isn't pinned to the
  // exact map center at maxZoom — small visual breathing room.
  const bounds = useMemo<L.LatLngBoundsExpression>(() => {
    if (positions.length === 0) return [[31.95, 35.91]];
    if (positions.length === 1) {
      const [lat, lng] = positions[0]!;
      const d = 0.005;
      return [
        [lat - d, lng - d],
        [lat + d, lng + d],
      ];
    }
    return positions;
  }, [positions]);

  const center: L.LatLngExpression = positions[0] ?? [31.95, 35.91];

  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === 'ar' ? 'ar-JO' : 'en-JO', {
        hour: 'numeric',
        minute: '2-digit',
      }),
    [locale],
  );

  return (
    // relative + z-0 creates a stacking context so Leaflet's internal panes
    // (z-index 200-700) cannot paint over the page header / sticky elements.
    <div className="relative z-0 h-full w-full">
      <MapContainer
        center={center}
        zoom={12}
        scrollWheelZoom={true}
        zoomControl={true}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds bounds={bounds} />
        {points.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={p.isWithinGeofence ? okIcon : warnIcon}
          >
            <Popup>
              <div className="text-xs">
                <p className="text-sm font-semibold text-fg">{p.promoterName}</p>
                <p className="mt-0.5 text-fg-muted">{p.locationName}</p>
                <p className="mt-1 font-mono text-fg-muted" dir="ltr">
                  {timeFormatter.format(new Date(p.checkInTime))}
                </p>
                {!p.isWithinGeofence ? (
                  <p className="mt-1 font-semibold text-warning">{pinWarnLabel}</p>
                ) : (
                  <p className="mt-1 font-semibold text-success">{pinOkLabel}</p>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
