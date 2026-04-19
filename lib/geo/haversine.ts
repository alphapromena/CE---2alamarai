/**
 * Great-circle distance between two WGS84 points using the Haversine formula.
 *
 * Earth is modelled as a sphere with mean radius 6371 km (standard). The
 * Haversine formula on a sphere is accurate to within ~0.5% vs the true
 * WGS84 ellipsoid — well inside civilian GPS precision and more than enough
 * for geofence thresholds (which range 10 m–5000 m in this product).
 *
 * Returns meters rather than kilometers so callers don't lose precision when
 * comparing small distances (e.g. "am I within a 25-meter fence?").
 *
 * Pure and synchronous; safe to call from any context (server, edge, client).
 *
 * @param lat1 latitude of point A, decimal degrees in [-90, 90]
 * @param lon1 longitude of point A, decimal degrees in [-180, 180]
 * @param lat2 latitude of point B, decimal degrees in [-90, 90]
 * @param lon2 longitude of point B, decimal degrees in [-180, 180]
 * @returns distance in meters (non-negative, finite)
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const EARTH_RADIUS_M = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dPhi = toRad(lat2 - lat1);
  const dLambda = toRad(lon2 - lon1);

  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_M * c;
}
