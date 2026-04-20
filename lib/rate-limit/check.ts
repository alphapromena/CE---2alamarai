import 'server-only';
import { headers } from 'next/headers';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { logWarn } from '@/lib/observability/logger';

export type RateLimitPolicy = {
  /** Logical action name — becomes part of the key, e.g. "login", "feedback". */
  action: string;
  /** Fixed window length in seconds. */
  windowSeconds: number;
  /** Max allowed calls per window. */
  max: number;
};

export type RateLimitResult = {
  allowed: boolean;
  count: number;
  resetAt: Date;
};

/**
 * Central rate-limit policies. Tuned for abuse-prone Server Actions; benign
 * ones (CRUD) don't need this and wouldn't benefit from the round-trip.
 *
 * Numbers are per-subject (user id if authed, IP if anon), per window.
 */
export const RATE_LIMITS = {
  login: { action: 'login', windowSeconds: 60, max: 10 } satisfies RateLimitPolicy,
  reset_request: { action: 'reset_request', windowSeconds: 300, max: 5 } satisfies RateLimitPolicy,
  reset_confirm: { action: 'reset_confirm', windowSeconds: 300, max: 10 } satisfies RateLimitPolicy,
  feedback_submit: {
    action: 'feedback_submit',
    windowSeconds: 60,
    max: 20,
  } satisfies RateLimitPolicy,
  export_queue: { action: 'export_queue', windowSeconds: 60, max: 10 } satisfies RateLimitPolicy,
} as const;

export type RateLimitKey = keyof typeof RATE_LIMITS;

function firstForwardedIp(value: string | null | undefined): string | null {
  if (!value) return null;
  const first = value.split(',')[0]?.trim();
  return first || null;
}

async function callerIdentifier(userId?: string | null): Promise<string> {
  if (userId) return `u:${userId}`;
  const h = await headers();
  const ip = firstForwardedIp(h.get('x-forwarded-for')) ?? h.get('x-real-ip') ?? null;
  return ip ? `ip:${ip}` : 'anon';
}

/**
 * Check + increment the rate-limit counter for this caller.
 *
 * On DB error (e.g. the migration hasn't been applied yet): fail-open with a
 * warn log. Rate-limit failures should never break login/reset/feedback for
 * legitimate users; the tradeoff is that a genuine attacker gets one free
 * window during an infrastructure glitch. Acceptable because every other
 * auth primitive (Supabase rate limits, audit logs) still catches them.
 */
export async function checkRateLimit(
  keyName: RateLimitKey,
  userId?: string | null,
): Promise<RateLimitResult> {
  const policy = RATE_LIMITS[keyName];
  const subject = await callerIdentifier(userId);
  const key = `${policy.action}:${subject}`;

  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc('check_rate_limit', {
    p_key: key,
    p_window_seconds: policy.windowSeconds,
    p_max_requests: policy.max,
  });

  if (error || !data || !Array.isArray(data) || data.length === 0) {
    logWarn('rate_limit check failed (fail-open)', {
      key: policy.action,
      subject_kind: subject.split(':')[0],
      db_error: error?.message,
    });
    return {
      allowed: true,
      count: 0,
      resetAt: new Date(Date.now() + policy.windowSeconds * 1000),
    };
  }

  const row = data[0] as { allowed: boolean; count: number; reset_at: string };
  return {
    allowed: row.allowed,
    count: row.count,
    resetAt: new Date(row.reset_at),
  };
}
