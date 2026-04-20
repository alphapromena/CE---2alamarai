'use client';

import type { TrackerState } from './tracker';

/**
 * Module-level pub/sub so the promoter-side tracker hook (mounted inside the
 * attendance page) can feed its live state into the TrackingIndicator badge
 * (mounted in the app-wide AppShell header). Both modules import this file,
 * so they share the same in-memory store.
 *
 * No persistence here — on a hard navigation the badge re-hydrates from the
 * attendance SSR read on the next mount of the hook.
 */

const INITIAL: TrackerState = {
  isTracking: false,
  lastPingAt: null,
  lastError: null,
  pingCount: 0,
};

let current: TrackerState = INITIAL;
const listeners = new Set<() => void>();

export function publishTrackerState(next: TrackerState): void {
  current = next;
  for (const l of listeners) l();
}

export function subscribeTrackerState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getTrackerState(): TrackerState {
  return current;
}

export function resetTrackerState(): void {
  current = INITIAL;
  for (const l of listeners) l();
}
