import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/auth/audit';
import { safeNext } from '@/lib/auth/next-path';
import { logError } from '@/lib/observability/logger';

// Supabase emits implicit-flow (`#access_token=...`) redirects for
// admin-issued invite and recovery links because there is no client-side
// PKCE code_verifier to exchange. This route consumes the `token_hash`
// variant instead — the email template links here directly, we call
// `verifyOtp` server-side which writes the session cookies, and the user
// lands on the page named in `next` with a valid SSR session.
const ALLOWED_TYPES = new Set<EmailOtpType>([
  'invite',
  'recovery',
  'email',
  'email_change',
  'signup',
  'magiclink',
]);

function isAllowedType(value: string | null): value is EmailOtpType {
  return value !== null && ALLOWED_TYPES.has(value as EmailOtpType);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  const url = new URL(request.url);
  const origin = url.origin;

  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  const next = safeNext(url.searchParams.get('next'));
  const loginFallback = new URL(`/${locale}/login?error=invite_expired`, origin);

  if (!tokenHash || !isAllowedType(type)) {
    return NextResponse.redirect(loginFallback);
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error || !data.user) {
    logError('auth.verify_otp_failed', {
      type,
      code: error?.code ?? null,
      status: error?.status ?? null,
      message: error?.message ?? null,
    });
    return NextResponse.redirect(loginFallback);
  }

  await logAuditEvent({
    actor_id: data.user.id,
    action: 'auth.otp_verified',
    entity: 'auth',
    entity_id: data.user.id,
    after: { type, next },
  });

  return NextResponse.redirect(new URL(`/${locale}${next}`, origin));
}
