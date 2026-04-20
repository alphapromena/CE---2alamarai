/**
 * Feature 5 D-042: pure scheduler that fires a location-ping callback
 * immediately and then every `intervalMs`. Separated from the React hook so
 * the scheduling logic is unit-testable in the node test environment (no DOM
 * or testing-library required).
 *
 * Dependencies are injected so the tests can mock geolocation + dispatch +
 * queue + online check without touching browser globals.
 */

export type PingCoords = {
  lat: number;
  lng: number;
  accuracyM?: number;
  batteryPct?: number;
};

export type CapturePositionResult =
  | { ok: true; coords: PingCoords }
  | { ok: false; error: 'permission' | 'timeout' | 'unavailable' };

export type DispatchPingResult = { ok: true } | { ok: false; error: string };

export type TrackerDeps = {
  /** Reads one GPS fix with timeout. */
  capturePosition: () => Promise<CapturePositionResult>;
  /** Sends the ping to the server. */
  dispatchPing: (payload: PingPayload) => Promise<DispatchPingResult>;
  /** Queues the ping for later retry (called when offline or dispatch fails). */
  enqueuePing: (payload: PingPayload) => Promise<void>;
  /** True if the browser reports a live connection. */
  isOnline: () => boolean;
  /** Fresh UUID v4 for idempotency. */
  genId: () => string;
  /** State-change sink so the React layer can re-render. */
  onStateChange?: (state: TrackerState) => void;
  /** Millisecond cadence between pings (default 15 min). */
  intervalMs?: number;
};

export type PingPayload = {
  attendanceId: string;
  lat: number;
  lng: number;
  accuracyM?: number;
  batteryPct?: number;
  idempotencyKey: string;
};

export type TrackerState = {
  isTracking: boolean;
  lastPingAt: number | null;
  lastError:
    | null
    | 'permission'
    | 'timeout'
    | 'unavailable'
    | 'rate_limited'
    | 'too_far'
    | 'dispatch_failed'
    | 'queued';
  pingCount: number;
};

export const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Starts a tracker. The first ping fires immediately; subsequent pings fire
 * every `intervalMs`. Caller must invoke the returned `stop()` to clear
 * timers and mark the state as inactive.
 */
export function startTracker(
  attendanceId: string,
  deps: TrackerDeps,
): { stop: () => void; getState: () => TrackerState } {
  const interval = deps.intervalMs ?? DEFAULT_INTERVAL_MS;
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const state: TrackerState = {
    isTracking: true,
    lastPingAt: null,
    lastError: null,
    pingCount: 0,
  };

  const emit = () => {
    if (deps.onStateChange) deps.onStateChange({ ...state });
  };

  emit();

  const tick = async () => {
    if (stopped) return;
    const captured = await deps.capturePosition();
    if (stopped) return;
    if (!captured.ok) {
      state.lastError = captured.error;
      emit();
      return;
    }
    const payload: PingPayload = {
      attendanceId,
      lat: captured.coords.lat,
      lng: captured.coords.lng,
      accuracyM: captured.coords.accuracyM,
      batteryPct: captured.coords.batteryPct,
      idempotencyKey: deps.genId(),
    };

    if (!deps.isOnline()) {
      await deps.enqueuePing(payload);
      if (stopped) return;
      state.lastPingAt = Date.now();
      state.pingCount += 1;
      state.lastError = 'queued';
      emit();
      return;
    }

    try {
      const res = await deps.dispatchPing(payload);
      if (stopped) return;
      if (res.ok) {
        state.lastPingAt = Date.now();
        state.pingCount += 1;
        state.lastError = null;
        emit();
        return;
      }
      if (res.error === 'rate_limited' || res.error === 'too_far') {
        state.lastError = res.error;
        emit();
        return;
      }
      await deps.enqueuePing(payload);
      state.lastError = 'queued';
      emit();
    } catch {
      if (stopped) return;
      await deps.enqueuePing(payload);
      state.lastError = 'queued';
      emit();
    }
  };

  // Kick immediately, then interval.
  void tick();
  timer = setInterval(() => {
    void tick();
  }, interval);

  return {
    stop: () => {
      stopped = true;
      state.isTracking = false;
      if (timer) clearInterval(timer);
      emit();
    },
    getState: () => ({ ...state }),
  };
}
