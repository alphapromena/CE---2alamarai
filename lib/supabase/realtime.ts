'use client';

/**
 * Supabase Realtime subscription helper (Phase 7, D-019 item 1 migration).
 *
 * Thin wrapper over supabase.channel(...) that centralises three things every
 * live dashboard needs to get right:
 *
 *   1. One channel per mount, guaranteed cleanup on unmount. Stale
 *      subscriptions left behind during fast re-renders are the #1 source
 *      of Realtime leaks.
 *   2. A stable, collision-resistant channel name that's easy to spot in
 *      the browser devtools and the Supabase dashboard.
 *   3. A single place to flip between per-row event handlers and a single
 *      "something changed, refresh" handler — which is what 80% of live
 *      pages want (delegate to router.refresh() and re-read through RLS).
 *
 * RLS still applies to Realtime payloads — Supabase filters per subscriber
 * using the same policies the SELECT path uses — so no additional auth
 * surface is introduced.
 */

import { useEffect, useRef } from 'react';
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';
import { createBrowserSupabase } from './browser';

export type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

export type PostgresChangesSubscription = {
  schema?: string;
  table: string;
  event?: RealtimeEvent;
  /** Optional PostgREST filter, e.g. `"campaign_id=eq.<uuid>"`. */
  filter?: string;
};

export type RealtimeHandler = (
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
) => void;

/**
 * Subscribe to one or more Postgres-changes streams on a single channel.
 *
 * Returns a cleanup function; typically called from a useEffect return.
 */
export function subscribeToTables(
  channelName: string,
  subs: ReadonlyArray<PostgresChangesSubscription>,
  onEvent: RealtimeHandler,
): () => void {
  const supabase = createBrowserSupabase();
  const channel: RealtimeChannel = supabase.channel(channelName);

  for (const sub of subs) {
    // postgres_changes accepts a nested filter object via the second arg.
    // Cast to any: supabase-js has a strict literal type for the event
    // string that narrows based on a union, and we accept '*' here.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (channel as any).on(
      'postgres_changes',
      {
        event: sub.event ?? '*',
        schema: sub.schema ?? 'public',
        table: sub.table,
        ...(sub.filter ? { filter: sub.filter } : {}),
      },
      onEvent,
    );
  }

  channel.subscribe();

  return () => {
    // removeChannel is idempotent; safe to call in StrictMode double-invocation.
    void supabase.removeChannel(channel);
  };
}

/**
 * React hook: subscribe to a list of tables while mounted. Pass a stable
 * channelName (include a user/campaign id if needed for dashboards that share
 * a browser tab across roles).
 *
 * The handler ref pattern means callers can pass inline functions without
 * re-subscribing on every render.
 */
export function useRealtimeTables(
  channelName: string,
  subs: ReadonlyArray<PostgresChangesSubscription>,
  onEvent: RealtimeHandler,
): void {
  const handlerRef = useRef<RealtimeHandler>(onEvent);
  handlerRef.current = onEvent;

  // Serialise the subscription spec so we re-subscribe only when the shape
  // actually changes, not when an inline array is re-created each render.
  const subsKey = JSON.stringify(subs);

  useEffect(() => {
    const cleanup = subscribeToTables(channelName, subs, (p) => handlerRef.current(p));
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, subsKey]);
}
