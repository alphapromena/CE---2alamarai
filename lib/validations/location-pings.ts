import { z } from 'zod';

/**
 * Feature 5 D-042: payload sent by the client-side location tracker when it
 * pushes a GPS reading for an open attendance. Server re-validates and
 * additionally rate-limits + range-checks against the check-in coordinates
 * before inserting.
 */
export const recordLocationPingSchema = z
  .object({
    attendanceId: z.string().uuid(),
    lat: z.number().gte(-90).lte(90),
    lng: z.number().gte(-180).lte(180),
    accuracyM: z.number().nonnegative().optional(),
    batteryPct: z.number().int().min(0).max(100).optional(),
    idempotencyKey: z.string().uuid(),
  })
  .strict();

export type RecordLocationPingInput = z.infer<typeof recordLocationPingSchema>;

/**
 * Hard server-side ceiling on how far a ping may drift from the check-in pin
 * before we treat it as a GPS glitch or spoof and drop it. The geofence
 * ceiling in the product is 5000 m (see locations.geofence_radius_m caps),
 * so anything beyond that is definitely outside the intended work area.
 */
export const MAX_PING_DISTANCE_FROM_CHECKIN_M = 5_000;

/**
 * Fixed-window rate-limit configuration for the ping insert path. The client
 * polls every 15 minutes; this floor blocks any burst or replay that would
 * violate the privacy promise.
 */
export const PING_RATE_LIMIT_WINDOW_SECONDS = 600;
export const PING_RATE_LIMIT_MAX = 1;
