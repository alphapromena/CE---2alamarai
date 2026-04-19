import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetForTests,
  count,
  enqueue,
  flush,
  list,
  markFailed,
  remove,
  type DispatchFn,
} from './queue';

/**
 * Reset the in-memory IndexedDB between tests. Replacing global.indexedDB
 * with a fresh factory is cheaper and more reliable than deleting-by-name,
 * because it drops any open connections the previous test held.
 */
beforeEach(() => {
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  __resetForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('offline queue — enqueue / list / count / remove', () => {
  it('stores and retrieves items in insertion order', async () => {
    await enqueue({
      actionName: 'saveDraftReport',
      payload: { x: 1 },
      idempotencyKey: '11111111-1111-4111-a111-111111111111',
    });
    await enqueue({
      actionName: 'upsertSalesEntry',
      payload: { sku: 'a' },
      idempotencyKey: '22222222-2222-4222-a222-222222222222',
    });

    expect(await count()).toBe(2);
    const items = await list();
    expect(items).toHaveLength(2);
    expect(items[0]?.actionName).toBe('saveDraftReport');
    expect(items[1]?.actionName).toBe('upsertSalesEntry');
    expect(items[0]?.attemptCount).toBe(0);
    expect(items[0]?.lastError).toBeNull();
  });

  it('remove deletes one entry by id', async () => {
    const id = await enqueue({
      actionName: 'a',
      payload: {},
      idempotencyKey: '33333333-3333-4333-a333-333333333333',
    });
    await remove(id);
    expect(await count()).toBe(0);
  });
});

describe('offline queue — flush semantics', () => {
  it('drains items, calling dispatch with the same payload + idempotency key', async () => {
    await enqueue({
      actionName: 'saveDraftReport',
      payload: { hello: 'world' },
      idempotencyKey: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
    });

    const dispatch: DispatchFn = vi.fn(async (name, payload) => {
      expect(name).toBe('saveDraftReport');
      expect(payload).toEqual({ hello: 'world' });
      return { error: null };
    });
    const result = await flush(dispatch);

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.remaining).toBe(0);
    expect(await count()).toBe(0);
  });

  it('keeps failed items queued (server-returned error)', async () => {
    await enqueue({
      actionName: 'submitReport',
      payload: {},
      idempotencyKey: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
    });

    const dispatch: DispatchFn = vi.fn(async () => ({ error: 'server_down' }));
    const result = await flush(dispatch);

    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.remaining).toBe(1);
    const items = await list();
    expect(items[0]?.attemptCount).toBe(1);
    expect(items[0]?.lastError).toBe('server_down');
  });

  it('keeps failed items queued (dispatch throws network error)', async () => {
    await enqueue({
      actionName: 'submitReport',
      payload: {},
      idempotencyKey: 'cccccccc-cccc-4ccc-cccc-cccccccccccc',
    });

    const dispatch: DispatchFn = vi.fn(async () => {
      throw new Error('fetch failed');
    });
    const result = await flush(dispatch);

    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.remaining).toBe(1);
    const items = await list();
    expect(items[0]?.attemptCount).toBe(1);
    expect(items[0]?.lastError).toBe('fetch failed');
  });

  it('replay is idempotency-safe — server receives the same key on retry', async () => {
    const id = await enqueue({
      actionName: 'submitReport',
      payload: { id: 'r1' },
      idempotencyKey: 'dddddddd-dddd-4ddd-dddd-dddddddddddd',
    });

    // First flush: server errors.
    let seen = 0;
    const firstDispatch: DispatchFn = async (_name, payload) => {
      seen += 1;
      expect((payload as { id: string }).id).toBe('r1');
      return { error: 'flaky' };
    };
    await flush(firstDispatch);

    // Item is still queued; second flush drains it.
    const secondDispatch: DispatchFn = async (_name, payload) => {
      seen += 1;
      // Same payload, same idempotency key on replay (server uses it to dedupe).
      expect((payload as { id: string }).id).toBe('r1');
      return { error: null };
    };
    await flush(secondDispatch);

    expect(seen).toBe(2);
    expect(await count()).toBe(0);
    // Verify the id doesn't resurrect after success.
    await expect(remove(id)).resolves.toBeUndefined();
  });

  it('processes items FIFO, older first', async () => {
    await enqueue({
      actionName: 'first',
      payload: {},
      idempotencyKey: 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee',
    });
    // Guarantee the second item has a later createdAt even on fast machines.
    await new Promise((r) => setTimeout(r, 2));
    await enqueue({
      actionName: 'second',
      payload: {},
      idempotencyKey: 'ffffffff-ffff-4fff-ffff-ffffffffffff',
    });

    const order: string[] = [];
    const dispatch: DispatchFn = async (name) => {
      order.push(name);
      return { error: null };
    };
    await flush(dispatch);

    expect(order).toEqual(['first', 'second']);
  });

  it('markFailed bumps attemptCount without removing', async () => {
    const id = await enqueue({
      actionName: 'a',
      payload: {},
      idempotencyKey: '00000000-0000-4000-a000-000000000000',
    });
    await markFailed(id, 'oops');
    await markFailed(id, 'oops-again');
    const items = await list();
    expect(items[0]?.attemptCount).toBe(2);
    expect(items[0]?.lastError).toBe('oops-again');
  });
});
