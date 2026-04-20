'use client';

import { useEffect, useRef, useState } from 'react';
import { enqueue } from '@/lib/offline/queue';
import {
  DEFAULT_INTERVAL_MS,
  startTracker,
  type CapturePositionResult,
  type PingPayload,
  type TrackerState,
} from '@/lib/location-tracking/tracker';
import { recordLocationPingAction } from '@/app/[locale]/promoter/attendance/location-actions';

const GEO_TIMEOUT_MS = 10_000;
const STORAGE_KEY = 'ce-tracker-last-ping-at';

type GetBatteryReturn = Promise<{ level: number } | null | undefined>;

type NavigatorWithBattery = Navigator & {
  getBattery?: () => GetBatteryReturn;
};

function randomUuid(): string {
  // Browser + Node 19+ expose crypto.randomUUID via globalThis.
  const c = (globalThis as unknown as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  (c ?? (globalThis.crypto as Crypto)).getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function capturePosition(): Promise<CapturePositionResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return { ok: false, error: 'unavailable' };
  }
  const coords = await new Promise<CapturePositionResult>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          ok: true,
          coords: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyM:
              typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : undefined,
          },
        }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) resolve({ ok: false, error: 'permission' });
        else if (err.code === err.TIMEOUT) resolve({ ok: false, error: 'timeout' });
        else resolve({ ok: false, error: 'unavailable' });
      },
      { enableHighAccuracy: true, timeout: GEO_TIMEOUT_MS, maximumAge: 0 },
    );
  });
  if (!coords.ok) return coords;

  // Battery is best-effort; some platforms (iOS Safari) don't expose it.
  try {
    const nav = navigator as NavigatorWithBattery;
    if (typeof nav.getBattery === 'function') {
      const batt = await nav.getBattery();
      if (batt && typeof batt.level === 'number') {
        coords.coords.batteryPct = Math.round(batt.level * 100);
      }
    }
  } catch {
    // ignore
  }
  return coords;
}

async function dispatchPing(payload: PingPayload) {
  const res = await recordLocationPingAction(payload);
  if (res.ok) return { ok: true as const };
  return { ok: false as const, error: res.error };
}

async function enqueuePing(payload: PingPayload): Promise<void> {
  await enqueue({
    actionName: 'recordLocationPing',
    payload,
    idempotencyKey: payload.idempotencyKey,
  });
}

export type UseLocationTrackerResult = TrackerState;

/**
 * Feature 5 D-042: React hook that runs a location ping every 15 minutes while
 * `enabled` is true. Fires immediately when enabled; cleans up on disable and
 * unmount. Permission-denied errors surface via state.lastError; iOS tabs get
 * suspended in the background and this hook cannot work around that (see
 * D-042). The privacy badge in AppShell reflects the `isTracking` state.
 */
export function useLocationTracker({
  attendanceId,
  enabled,
  intervalMs = DEFAULT_INTERVAL_MS,
}: {
  attendanceId: string | null;
  enabled: boolean;
  intervalMs?: number;
}): UseLocationTrackerResult {
  const [state, setState] = useState<TrackerState>({
    isTracking: false,
    lastPingAt: null,
    lastError: null,
    pingCount: 0,
  });
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!enabled || !attendanceId) {
      if (stopRef.current) {
        stopRef.current();
        stopRef.current = null;
      }
      return;
    }
    const handle = startTracker(attendanceId, {
      capturePosition,
      dispatchPing,
      enqueuePing,
      isOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
      genId: randomUuid,
      onStateChange: (s) => {
        setState(s);
        if (s.lastPingAt != null && typeof window !== 'undefined') {
          try {
            window.localStorage.setItem(STORAGE_KEY, String(s.lastPingAt));
          } catch {
            // ignore quota/privacy errors
          }
        }
      },
      intervalMs,
    });
    stopRef.current = handle.stop;
    return () => {
      handle.stop();
      stopRef.current = null;
    };
  }, [attendanceId, enabled, intervalMs]);

  return state;
}
