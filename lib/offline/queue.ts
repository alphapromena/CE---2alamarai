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
const DB_VERSION = 2;
const STORE = 'queue';

// Retry policy: exponential backoff with jitter, capped. After
// MAX_ATTEMPTS failures, the item is moved to dead-letter (stays visible
// in the UI, no auto-retry). The promoter can manually retry a dead-letter
// item from the offline-status panel.
const BASE_BACKOFF_MS = 15_000; // first retry at ~15s
const MAX_BACKOFF_MS = 15 * 60_000; // cap at 15 min
const MAX_ATTEMPTS = 10;

export type QueuedAction = {
  id?: number; // auto-incremented; undefined before insert
  actionName: string;
  payload: unknown;
  idempotencyKey: string;
  createdAt: number; // epoch ms
  attemptCount: number;
  lastError: string | null;
  // Phase 9 hardening — present on v2+ rows; undefined on legacy v1 rows
  // (treated as "retry now" + "not dead").
  nextRetryAt?: number | null;
  deadLetter?: boolean;
};

interface QueueSchema extends DBSchema {
  [STORE]: {
    key: number;
    value: QueuedAction;
    indexes: { 'by-createdAt': number };
  };
}

/**
 * Exponential backoff with ±20% jitter, capped at MAX_BACKOFF_MS.
 * attemptCount is the number of failed attempts BEFORE this call — so the
 * first retry (after 1 failure) waits ~BASE_BACKOFF_MS.
 */
export function computeNextRetryAt(
  attemptCount: number,
  now: number = Date.now(),
): number {
  const exp = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, attemptCount - 1));
  const jitter = exp * (0.8 + Math.random() * 0.4); // 80% .. 120%
  return now + Math.floor(jitter);
}

export type DispatchFn = (
  actionName: string,
  payload: unknown,
) => Promise<{ error: string | null } | { error?: never }>;

let dbPromise: Promise<IDBPDatabase<QueueSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<QueueSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<QueueSchema>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, {
            keyPath: 'id',
            autoIncrement: true,
          });
          store.createIndex('by-createdAt', 'createdAt');
        }
        // v1 → v2: no structural change; new rows carry nextRetryAt +
        // deadLetter fields, legacy rows are treated as "retry now / not
        // dead" when the fields are absent.
        if (oldVersion < 2) {
          // No-op — TypeScript schema change only.
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
  item: Omit<
    QueuedAction,
    'id' | 'createdAt' | 'attemptCount' | 'lastError' | 'nextRetryAt' | 'deadLetter'
  >,
): Promise<number> {
  const db = await getDb();
  const id = await db.add(STORE, {
    ...item,
    createdAt: Date.now(),
    attemptCount: 0,
    lastError: null,
    nextRetryAt: null,
    deadLetter: false,
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
 * Mark a failed attempt — increments attemptCount, stores the last error,
 * schedules the next retry via computeNextRetryAt, and flips the item to
 * dead-letter if it has now failed MAX_ATTEMPTS times. Dead-letter items
 * remain in the store so the UI can show them, but flush() skips them.
 */
export async function markFailed(id: number, error: string): Promise<void> {
  const db = await getDb();
  const existing = await db.get(STORE, id);
  if (!existing) return;
  const attemptCount = existing.attemptCount + 1;
  const deadLetter = attemptCount >= MAX_ATTEMPTS;
  await db.put(STORE, {
    ...existing,
    attemptCount,
    lastError: error,
    nextRetryAt: deadLetter ? null : computeNextRetryAt(attemptCount),
    deadLetter,
  });
}

/**
 * Manually clear the dead-letter flag and retry-timer so an item gets
 * picked up by the next flush. Useful for a "Retry failed item" button.
 */
export async function retryNow(id: number): Promise<void> {
  const db = await getDb();
  const existing = await db.get(STORE, id);
  if (!existing) return;
  await db.put(STORE, {
    ...existing,
    nextRetryAt: null,
    deadLetter: false,
  });
}

/**
 * Count items whose exponential backoff hasn't yet elapsed AND who are
 * not dead-letter. Exposed for UI ("2 queued, 1 retrying").
 */
export async function countReady(now: number = Date.now()): Promise<number> {
  const items = await list();
  return items.filter((i) => isReady(i, now)).length;
}

function isReady(item: QueuedAction, now: number): boolean {
  if (item.deadLetter) return false;
  if (item.nextRetryAt != null && item.nextRetryAt > now) return false;
  return true;
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
): Promise<{ sent: number; failed: number; remaining: number; skipped: number }> {
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  const now = Date.now();
  const items = await list();
  for (const item of items) {
    if (typeof item.id !== 'number') continue;
    if (!isReady(item, now)) {
      skipped += 1;
      continue;
    }
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
  return { sent, failed, remaining, skipped };
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
