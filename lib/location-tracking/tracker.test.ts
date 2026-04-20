import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  startTracker,
  type CapturePositionResult,
  type DispatchPingResult,
  type PingPayload,
  type TrackerDeps,
  type TrackerState,
} from './tracker';

const ATTENDANCE_ID = '11111111-1111-4111-8111-111111115051';

function buildDeps(
  overrides: Partial<TrackerDeps> = {},
): {
  deps: TrackerDeps;
  captureSpy: ReturnType<typeof vi.fn>;
  dispatchSpy: ReturnType<typeof vi.fn>;
  enqueueSpy: ReturnType<typeof vi.fn>;
  stateLog: TrackerState[];
} {
  const captureSpy = vi.fn(
    async (): Promise<CapturePositionResult> => ({
      ok: true,
      coords: { lat: 31.95, lng: 35.91, accuracyM: 10, batteryPct: 80 },
    }),
  );
  const dispatchSpy = vi.fn(async (): Promise<DispatchPingResult> => ({ ok: true }));
  const enqueueSpy = vi.fn(async (_p: PingPayload) => {});
  const stateLog: TrackerState[] = [];

  const deps: TrackerDeps = {
    capturePosition: captureSpy,
    dispatchPing: dispatchSpy,
    enqueuePing: enqueueSpy,
    isOnline: () => true,
    genId: () => '22222222-2222-4222-8222-222222225052',
    onStateChange: (s) => stateLog.push(s),
    intervalMs: 100,
    ...overrides,
  };
  return { deps, captureSpy, dispatchSpy, enqueueSpy, stateLog };
}

describe('startTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('dispatches one ping immediately on start and increments pingCount', async () => {
    const { deps, captureSpy, dispatchSpy } = buildDeps({ intervalMs: 60_000 });
    const handle = startTracker(ATTENDANCE_ID, deps);
    await vi.waitFor(() => expect(dispatchSpy).toHaveBeenCalledTimes(1));
    expect(captureSpy).toHaveBeenCalledTimes(1);
    const payload = dispatchSpy.mock.calls[0]![0] as PingPayload;
    expect(payload.attendanceId).toBe(ATTENDANCE_ID);
    expect(payload.lat).toBe(31.95);
    expect(payload.idempotencyKey).toBeDefined();
    expect(handle.getState().pingCount).toBe(1);
    expect(handle.getState().lastError).toBeNull();
    handle.stop();
  });

  it('fires again after intervalMs', async () => {
    const { deps, dispatchSpy } = buildDeps({ intervalMs: 1000 });
    const handle = startTracker(ATTENDANCE_ID, deps);
    await vi.waitFor(() => expect(dispatchSpy).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => expect(dispatchSpy).toHaveBeenCalledTimes(2));
    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => expect(dispatchSpy).toHaveBeenCalledTimes(3));
    handle.stop();
  });

  it('stops firing after stop()', async () => {
    const { deps, dispatchSpy } = buildDeps({ intervalMs: 1000 });
    const handle = startTracker(ATTENDANCE_ID, deps);
    await vi.waitFor(() => expect(dispatchSpy).toHaveBeenCalledTimes(1));
    handle.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(handle.getState().isTracking).toBe(false);
  });

  it('enqueues instead of dispatching when offline', async () => {
    const { deps, dispatchSpy, enqueueSpy } = buildDeps({ isOnline: () => false });
    const handle = startTracker(ATTENDANCE_ID, deps);
    await vi.waitFor(() => expect(enqueueSpy).toHaveBeenCalledTimes(1));
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(handle.getState().lastError).toBe('queued');
    expect(handle.getState().pingCount).toBe(1);
    handle.stop();
  });

  it('surfaces permission error without dispatching', async () => {
    const { deps, dispatchSpy, enqueueSpy } = buildDeps({
      capturePosition: async () => ({ ok: false, error: 'permission' }),
    });
    const handle = startTracker(ATTENDANCE_ID, deps);
    await vi.waitFor(() => expect(handle.getState().lastError).toBe('permission'));
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(enqueueSpy).not.toHaveBeenCalled();
    expect(handle.getState().pingCount).toBe(0);
    handle.stop();
  });

  it('surfaces rate_limited error from server without queuing', async () => {
    const { deps, enqueueSpy } = buildDeps({
      dispatchPing: async () => ({ ok: false, error: 'rate_limited' }),
    });
    const handle = startTracker(ATTENDANCE_ID, deps);
    await vi.waitFor(() => expect(handle.getState().lastError).toBe('rate_limited'));
    expect(enqueueSpy).not.toHaveBeenCalled();
    expect(handle.getState().pingCount).toBe(0);
    handle.stop();
  });

  it('surfaces too_far error without queuing', async () => {
    const { deps, enqueueSpy } = buildDeps({
      dispatchPing: async () => ({ ok: false, error: 'too_far' }),
    });
    const handle = startTracker(ATTENDANCE_ID, deps);
    await vi.waitFor(() => expect(handle.getState().lastError).toBe('too_far'));
    expect(enqueueSpy).not.toHaveBeenCalled();
    handle.stop();
  });

  it('queues on transient dispatch failure', async () => {
    const { deps, enqueueSpy } = buildDeps({
      dispatchPing: async () => ({ ok: false, error: 'unknown' }),
    });
    const handle = startTracker(ATTENDANCE_ID, deps);
    await vi.waitFor(() => expect(enqueueSpy).toHaveBeenCalledTimes(1));
    expect(handle.getState().lastError).toBe('queued');
    handle.stop();
  });

  it('queues when dispatch throws', async () => {
    const { deps, enqueueSpy } = buildDeps({
      dispatchPing: async () => {
        throw new Error('network');
      },
    });
    const handle = startTracker(ATTENDANCE_ID, deps);
    await vi.waitFor(() => expect(enqueueSpy).toHaveBeenCalledTimes(1));
    expect(handle.getState().lastError).toBe('queued');
    handle.stop();
  });
});
