import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PROMOTER_ID = '00000000-0000-4000-8000-0000000005c0';
const ATTENDANCE_ID = '11111111-1111-4111-8111-111111115051';
const IDEMPOTENCY = '22222222-2222-4222-8222-222222225052';

vi.mock('@/lib/auth/guards', () => ({
  requireRole: vi.fn(async () => ({ id: PROMOTER_ID, role: 'promoter', active: true })),
}));

type AttendanceRow = {
  id: string;
  user_id: string;
  check_out_time: string | null;
  check_in_lat: number | null;
  check_in_lng: number | null;
};

let attendanceRow: AttendanceRow | null = null;
let insertShouldFail = false;
let lastInsertPayload: unknown = null;
const rpcSpy = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabase: () => ({
    from: (table: string) => {
      if (table === 'attendance') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: attendanceRow, error: null }),
            }),
          }),
        };
      }
      if (table === 'location_pings') {
        return {
          insert: (payload: unknown) => {
            lastInsertPayload = payload;
            return {
              select: () => ({
                single: async () =>
                  insertShouldFail
                    ? { data: null, error: { message: 'boom' } }
                    : { data: { id: 'ping-id-1' }, error: null },
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    rpc: (...args: unknown[]) => rpcSpy(...args),
  }),
}));

import { recordLocationPingAction } from './location-actions';

function ok() {
  rpcSpy.mockResolvedValue({
    data: [{ allowed: true, count: 1, reset_at: '2026-04-20T12:00:00Z' }],
    error: null,
  });
}

describe('recordLocationPingAction', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    attendanceRow = {
      id: ATTENDANCE_ID,
      user_id: PROMOTER_ID,
      check_out_time: null,
      check_in_lat: 31.9530,
      check_in_lng: 35.9100,
    };
    insertShouldFail = false;
    lastInsertPayload = null;
    rpcSpy.mockReset();
    ok();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('happy path: inserts a ping and returns ok+pingId', async () => {
    const r = await recordLocationPingAction({
      attendanceId: ATTENDANCE_ID,
      lat: 31.9531,
      lng: 35.9101,
      accuracyM: 12,
      batteryPct: 80,
      idempotencyKey: IDEMPOTENCY,
    });
    expect(r).toEqual({ ok: true, pingId: 'ping-id-1' });
    expect(rpcSpy).toHaveBeenCalledTimes(1);
    expect(rpcSpy.mock.calls[0]![0]).toBe('check_rate_limit');
    expect(rpcSpy.mock.calls[0]![1].p_key).toBe(`ping:${ATTENDANCE_ID}`);
    expect(rpcSpy.mock.calls[0]![1].p_window_seconds).toBe(600);
    expect(rpcSpy.mock.calls[0]![1].p_max_requests).toBe(1);
    expect(lastInsertPayload).toMatchObject({
      attendance_id: ATTENDANCE_ID,
      promoter_id: PROMOTER_ID,
      lat: 31.9531,
      lng: 35.9101,
      accuracy_m: 12,
      battery_pct: 80,
    });
  });

  it('rejects invalid input shape', async () => {
    const r = await recordLocationPingAction({
      // Missing attendanceId on purpose.
      lat: 10,
      lng: 10,
      idempotencyKey: IDEMPOTENCY,
    } as unknown as Parameters<typeof recordLocationPingAction>[0]);
    expect(r).toEqual({ ok: false, error: 'invalid_input' });
  });

  it('rejects 0,0 coordinates as invalid (common no-fix stub)', async () => {
    const r = await recordLocationPingAction({
      attendanceId: ATTENDANCE_ID,
      lat: 0,
      lng: 0,
      idempotencyKey: IDEMPOTENCY,
    });
    expect(r).toEqual({ ok: false, error: 'invalid_coords' });
  });

  it('rejects when attendance does not exist', async () => {
    attendanceRow = null;
    const r = await recordLocationPingAction({
      attendanceId: ATTENDANCE_ID,
      lat: 31.95,
      lng: 35.91,
      idempotencyKey: IDEMPOTENCY,
    });
    expect(r).toEqual({ ok: false, error: 'no_open_attendance' });
  });

  it('rejects when attendance belongs to another user', async () => {
    attendanceRow = {
      id: ATTENDANCE_ID,
      user_id: 'somebody-else',
      check_out_time: null,
      check_in_lat: 31.95,
      check_in_lng: 35.91,
    };
    const r = await recordLocationPingAction({
      attendanceId: ATTENDANCE_ID,
      lat: 31.95,
      lng: 35.91,
      idempotencyKey: IDEMPOTENCY,
    });
    expect(r).toEqual({ ok: false, error: 'no_open_attendance' });
  });

  it('rejects when attendance is already checked out', async () => {
    attendanceRow = {
      id: ATTENDANCE_ID,
      user_id: PROMOTER_ID,
      check_out_time: '2026-04-20T18:00:00Z',
      check_in_lat: 31.95,
      check_in_lng: 35.91,
    };
    const r = await recordLocationPingAction({
      attendanceId: ATTENDANCE_ID,
      lat: 31.95,
      lng: 35.91,
      idempotencyKey: IDEMPOTENCY,
    });
    expect(r).toEqual({ ok: false, error: 'no_open_attendance' });
  });

  it('rejects when rate-limit RPC denies', async () => {
    rpcSpy.mockReset();
    rpcSpy.mockResolvedValueOnce({
      data: [{ allowed: false, count: 2, reset_at: '2026-04-20T12:00:00Z' }],
      error: null,
    });
    const r = await recordLocationPingAction({
      attendanceId: ATTENDANCE_ID,
      lat: 31.9531,
      lng: 35.9101,
      idempotencyKey: IDEMPOTENCY,
    });
    expect(r).toEqual({ ok: false, error: 'rate_limited' });
  });

  it('rejects when ping is more than 5 km from check-in', async () => {
    // 0.1 degree of latitude ~= 11 km.
    const r = await recordLocationPingAction({
      attendanceId: ATTENDANCE_ID,
      lat: 31.9530 + 0.1,
      lng: 35.9100,
      idempotencyKey: IDEMPOTENCY,
    });
    expect(r).toEqual({ ok: false, error: 'too_far' });
  });

  it('bubbles unknown error on insert failure', async () => {
    insertShouldFail = true;
    const r = await recordLocationPingAction({
      attendanceId: ATTENDANCE_ID,
      lat: 31.9531,
      lng: 35.9101,
      idempotencyKey: IDEMPOTENCY,
    });
    expect(r).toEqual({ ok: false, error: 'unknown' });
  });
});
