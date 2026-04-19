import 'server-only';
import { headers } from 'next/headers';
import { createAdminSupabase } from '@/lib/supabase/admin';

export type AuditEventInput = {
  action: string;
  entity: string;
  entity_id?: string | null;
  actor_id?: string | null;
  before?: unknown;
  after?: unknown;
};

const REDACT_KEYS = new Set([
  'password',
  'new_password',
  'current_password',
  'token',
  'access_token',
  'refresh_token',
  'api_key',
  'secret',
]);

function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v));
  if (typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACT_KEYS.has(k.toLowerCase()) ? '[redacted]' : redact(v);
  }
  return out;
}

function firstForwardedIp(value: string | null | undefined): string | null {
  if (!value) return null;
  const first = value.split(',')[0]?.trim();
  return first || null;
}

export async function logAuditEvent(input: AuditEventInput): Promise<void> {
  if (typeof window !== 'undefined') {
    throw new Error('logAuditEvent must never run on the client');
  }

  const h = await headers();
  const ip = firstForwardedIp(h.get('x-forwarded-for')) ?? h.get('x-real-ip') ?? null;
  const userAgent = h.get('user-agent');

  const admin = createAdminSupabase();
  const { error } = await admin.from('audit_log').insert({
    actor_id: input.actor_id ?? null,
    action: input.action,
    entity: input.entity,
    entity_id: input.entity_id ?? null,
    before_json: input.before === undefined ? null : redact(input.before),
    after_json: input.after === undefined ? null : redact(input.after),
    ip,
    user_agent: userAgent,
  });

  if (error) {
    // Never throw from audit — we don't want audit failure to break an auth flow.
    console.error('audit_log insert failed', {
      action: input.action,
      entity: input.entity,
      message: error.message,
    });
  }
}
