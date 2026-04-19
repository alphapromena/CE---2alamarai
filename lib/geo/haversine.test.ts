import { describe, it, expect } from 'vitest';
import { haversineDistance } from './haversine';

// Known reference: 1° at the equator = R * π/180 ≈ 111,194.93 m with R = 6371 km.
const ONE_DEGREE_AT_EQUATOR_M = 111_194.92664455873;

describe('haversineDistance', () => {
  it('returns 0 for identical points', () => {
    expect(haversineDistance(31.95, 35.91, 31.95, 35.91)).toBe(0);
    expect(haversineDistance(0, 0, 0, 0)).toBe(0);
    expect(haversineDistance(-45.2, -170.1, -45.2, -170.1)).toBe(0);
  });

  it('returns half the Earth circumference for antipodal points (0,0 ↔ 0,180)', () => {
    // Half-circumference with R = 6371 km is 20,015,086.8 m.
    const d = haversineDistance(0, 0, 0, 180);
    expect(d).toBeCloseTo(20_015_086.8, 0);
  });

  it('computes 1° of longitude at the equator ≈ 111.195 km', () => {
    const d = haversineDistance(0, 0, 0, 1);
    expect(d).toBeCloseTo(ONE_DEGREE_AT_EQUATOR_M, 1);
  });

  it('computes 1° of latitude ≈ 111.195 km (constant across longitudes)', () => {
    const d = haversineDistance(0, 0, 1, 0);
    expect(d).toBeCloseTo(ONE_DEGREE_AT_EQUATOR_M, 1);
  });

  it('handles sub-10 m separations without precision loss', () => {
    // ~1 m north-south near Amman. 1/ONE_DEGREE_AT_EQUATOR_M degrees latitude.
    const oneMeterInDegLat = 1 / ONE_DEGREE_AT_EQUATOR_M;
    const d = haversineDistance(31.95, 35.91, 31.95 + oneMeterInDegLat, 35.91);
    expect(d).toBeCloseTo(1, 3);
  });

  it('returns finite positive values for sub-meter separations', () => {
    // ~0.5 m east-west near Amman.
    const halfMeterInDegLon =
      0.5 / (ONE_DEGREE_AT_EQUATOR_M * Math.cos((31.95 * Math.PI) / 180));
    const d = haversineDistance(31.95, 35.91, 31.95, 35.91 + halfMeterInDegLon);
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(1);
  });

  it('is symmetric: d(a,b) === d(b,a)', () => {
    const d1 = haversineDistance(31.95, 35.91, 31.5, 35.0);
    const d2 = haversineDistance(31.5, 35.0, 31.95, 35.91);
    expect(d1).toBeCloseTo(d2, 6);
  });

  it('handles southern-hemisphere (negative latitude) pairs', () => {
    // Sydney (-33.8688, 151.2093) ↔ Melbourne (-37.8136, 144.9631) ≈ 713 km.
    const d = haversineDistance(-33.8688, 151.2093, -37.8136, 144.9631);
    expect(d).toBeGreaterThan(710_000);
    expect(d).toBeLessThan(720_000);
  });

  it('handles western-hemisphere (negative longitude) pairs', () => {
    // New York (40.7128, -74.0060) ↔ Los Angeles (34.0522, -118.2437) ≈ 3936 km.
    const d = haversineDistance(40.7128, -74.006, 34.0522, -118.2437);
    expect(d).toBeGreaterThan(3_920_000);
    expect(d).toBeLessThan(3_960_000);
  });

  it('Amman ↔ Irbid sanity check (≈ 70 km)', () => {
    // Amman downtown (31.9539, 35.9106) ↔ Irbid city centre (32.5556, 35.8500).
    const d = haversineDistance(31.9539, 35.9106, 32.5556, 35.85);
    expect(d).toBeGreaterThan(65_000);
    expect(d).toBeLessThan(75_000);
  });
});
