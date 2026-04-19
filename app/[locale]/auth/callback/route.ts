import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/auth/audit';

function safeNext(raw: string | null): string {
  // Only allow internal same-origin paths.
  if (!raw) return '/';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeNext(url.searchParams.get('next'));
  const origin = url.origin;

  if (!code) {
    return NextResponse.redirect(
      new URL(`/${locale}/login?error=invite_expired`, origin),
    );
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(
      new URL(`/${locale}/login?error=invite_expired`, origin),
    );
  }

  await logAuditEvent({
    actor_id: data.user.id,
    action: 'auth.code_exchanged',
    entity: 'auth',
    entity_id: data.user.id,
    after: { next },
  });

  return NextResponse.redirect(new URL(`/${locale}${next}`, origin));
}
