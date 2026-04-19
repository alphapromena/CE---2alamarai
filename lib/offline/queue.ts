/**
 * Offline queue for promoter write actions (D-010).
 *
 * Rationale: retail stores often have poor cellular signal. A promoter
 * hitting "Submit" must not lose their report because the network flaked.
 * Every mutation carries a client-generated UUID idempotency key (D-009),
 * so replay is safe.
 *
 * Storage: IndexedDB via `idb` (typed wrapper). One object store,
 * auto-incrementing id, with createdAt for FIFO replay.
 *
 * Flush model: on page load + on `online` events + on a periodic interval.
 * NOT Background Sync — iOS Safari's support is patchy, and most promoters
 * use iPhones. The page needs to be open for the flush to run; that's
 * acceptable because the promoter opens the app to interact with the form.
 *
 * Action dispatch: the queue stores `{ actionName, payload }`. The consumer
 * provides a `dispatch(actionName, payload)` callback at `start()` time so
 * this file doesn't import Server Actions directly (server-only boundary).
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

const DB_NAME = 'ce-offline';
const DB_VERSION = 1;
const STORE = 'queue';

export type QueuedAction = {
  id?: number; // auto-incremented; undefined before insert
  actionName: string;
  payload: unknown;
  idempotencyKey: string;
  createdAt: number; // epoch ms
  attemptCount: number;
  lastError: string | null;
};

interface QueueSchema extends DBSchema {
  [STORE]: {
    key: number;
    value: QueuedAction;
    indexes: { 'by-createdAt': number };
  };
}

export type DispatchFn = (
  actionName: string,
  payload: unknown,
) => Promise<{ error: string | null } | { error?: never }>;

let dbPromise: Promise<IDBPDatabase<QueueSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<QueueSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<QueueSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, {
            keyPath: 'id',
            autoIncrement: true,
          });
          store.createIndex('by-createdAt', 'createdAt');
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Only exposed for tests — resets the module-level DB handle so that a new
 * openDB call happens after fake-indexeddb resets itself between tests.
 */
export function __resetForTests(): void {
  dbPromise = null;
}

/**
 * Add a mutation to the queue. Returns the assigned id.
 */
export async function enqueue(
  item: Omit<QueuedAction, 'id' | 'createdAt' | 'attemptCount' | 'lastError'>,
): Promise<number> {
  const db = await getDb();
  const id = await db.add(STORE, {
    ...item,
    createdAt: Date.now(),
    attemptCount: 0,
    lastError: null,
  });
  return id as number;
}

/**
 * List everything in the queue, oldest first.
 */
export async function list(): Promise<QueuedAction[]> {
  const db = await getDb();
  return db.getAllFromIndex(STORE, 'by-createdAt');
}

/**
 * Count queued items. Useful for UI badges ("3 queued").
 */
export async function count(): Promise<number> {
  const db = await getDb();
  return db.count(STORE);
}

/**
 * Remove one entry (after a successful dispatch).
 */
export async function remove(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(STORE, id);
}

/**
 * Mark a failed attempt — increments attemptCount, stores the last error.
 * The item stays queued for a later retry.
 */
export async function markFailed(id: number, error: string): Promise<void> {
  const db = await getDb();
  const existing = await db.get(STORE, id);
  if (!existing) return;
  await db.put(STORE, {
    ...existing,
    attemptCount: existing.attemptCount + 1,
    lastError: error,
  });
}

/**
 * Drain the queue once. Calls `dispatch` on each item in FIFO order; on a
 * resolved-ok result (no `error` or `error: null`), removes the item; on
 * rejection or a non-null `error`, records it and moves to the next item.
 *
 * Returns counts so callers can show a toast.
 */
export async function flush(
  dispatch: DispatchFn,
): Promise<{ sent: number; failed: number; remaining: number }> {
  let sent = 0;
  let failed = 0;

  const items = await list();
  for (const item of items) {
    if (typeof item.id !== 'number') continue;
    try {
      const result = await dispatch(item.actionName, item.payload);
      const err = 'error' in result ? result.error : null;
      if (err == null) {
        await remove(item.id);
        sent += 1;
      } else {
        await markFailed(item.id, err);
        failed += 1;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await markFailed(item.id, msg);
      failed += 1;
    }
  }

  const remaining = await count();
  return { sent, failed, remaining };
}

/**
 * Start a flusher that runs now, on every `online` event, and every
 * `intervalMs`. Returns a cleanup function. Safe to call multiple times
 * (the caller must only hold one active subscription at a time).
 */
export function startFlusher(
  dispatch: DispatchFn,
  intervalMs = 30_000,
): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const run = () => {
    if (stopped) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    void flush(dispatch);
  };

  const onOnline = () => run();
  if (typeof window !== 'undefined') {
    window.addEventListener('online', onOnline);
  }
  timer = setInterval(run, intervalMs);
  // Kick once right away.
  run();

  return () => {
    stopped = true;
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', onOnline);
    }
    if (timer) clearInterval(timer);
  };
}
