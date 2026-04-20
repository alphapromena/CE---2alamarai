import 'server-only';
import { logError, logInfo, logWarn } from '@/lib/observability/logger';

// Minimal Resend client. Uses their REST API directly — no new npm dep
// (same posture as D-032 for the XLSX writer). Env-gated: if RESEND_API_KEY
// is unset, every send() no-ops with a "skipped" log. This keeps the whole
// email workstream optional for ops who prefer to wire a different
// provider (Postmark/SES) by swapping just this module.
//
// D-034 records the provider choice + opt-in posture.

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

export type SendEmailResult =
  | { status: 'sent'; id: string }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; error: string };

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

function envFrom(): string | null {
  return process.env.RESEND_FROM_EMAIL?.trim() || null;
}
function envKey(): string | null {
  return process.env.RESEND_API_KEY?.trim() || null;
}

/**
 * Send an email. Returns a tagged union; callers should handle 'skipped' as
 * a soft failure (email is best-effort, not load-bearing). Never throws.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const key = envKey();
  const from = envFrom();

  if (!key || !from) {
    logInfo('email.skipped', {
      reason: !key ? 'no_api_key' : 'no_from_address',
      to_domain: input.to.split('@')[1] ?? '(invalid)',
      subject: input.subject,
    });
    return { status: 'skipped', reason: !key ? 'no_api_key' : 'no_from_address' };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logWarn('email.failed', {
        status: res.status,
        to_domain: input.to.split('@')[1] ?? '(invalid)',
        subject: input.subject,
        body: body.slice(0, 500),
      });
      return { status: 'failed', error: `http_${res.status}` };
    }
    const json = (await res.json()) as { id?: string };
    logInfo('email.sent', {
      id: json.id,
      to_domain: input.to.split('@')[1] ?? '(invalid)',
      subject: input.subject,
    });
    return { status: 'sent', id: json.id ?? 'unknown' };
  } catch (err) {
    logError('email.exception', {
      to_domain: input.to.split('@')[1] ?? '(invalid)',
      subject: input.subject,
      message: err instanceof Error ? err.message : String(err),
    });
    return { status: 'failed', error: err instanceof Error ? err.message : 'unknown' };
  }
}

export function isEmailConfigured(): boolean {
  return !!envKey() && !!envFrom();
}
