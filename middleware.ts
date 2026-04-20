import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { attachSupabaseSession } from './lib/supabase/middleware';

const intlMiddleware = createMiddleware(routing);

const isDev = process.env.NODE_ENV !== 'production';

// Paths that require an authenticated session. Wrong-role checks happen in
// layouts via requireRole(); middleware only gates unauthenticated access.
const PROTECTED_PREFIX = /^\/(?:ar|en)\/(?:admin|supervisor|promoter|client)(?:\/|$)/;

// Phase 10: paths a temp-password user is allowed to visit before rotating.
// /set-password is the destination; logout + auth callback must keep working.
const TEMP_PASSWORD_ALLOWED = /^\/(?:ar|en)\/(?:set-password|logout|auth\/)/;

// Phase 9 CSP + security header hardening.
//
// 'unsafe-inline' on script-src is retained because Next.js 15's streaming
// and hydration pipeline injects inline scripts; removing it requires a
// per-request nonce wired through every RSC payload. Tracked as a future
// tightening — not in scope for the final phase, since a mis-configured CSP
// is strictly worse than unsafe-inline (white-screened app). 'unsafe-inline'
// is retained on style-src for the same reason (Next.js inlines critical CSS
// for preload). Everything else is tight.
const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob: https://*.supabase.co`,
  `font-src 'self' data:`,
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co${isDev ? ' ws: http://localhost:* http://127.0.0.1:*' : ''}`,
  `media-src 'self' blob:`,
  `worker-src 'self' blob:`,
  `manifest-src 'self'`,
  `frame-src 'none'`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `object-src 'none'`,
  ...(isDev ? [] : [`upgrade-insecure-requests`]),
].join('; ');

const PERMISSIONS_POLICY = [
  'accelerometer=()',
  'ambient-light-sensor=()',
  'autoplay=()',
  'battery=()',
  'bluetooth=()',
  'camera=(self)',
  'display-capture=()',
  'encrypted-media=()',
  'fullscreen=(self)',
  'geolocation=(self)',
  'gyroscope=()',
  'keyboard-map=()',
  'magnetometer=()',
  'microphone=()',
  'midi=()',
  'payment=()',
  'picture-in-picture=()',
  'publickey-credentials-get=()',
  'screen-wake-lock=()',
  'sync-xhr=()',
  'usb=()',
  'web-share=()',
  'xr-spatial-tracking=()',
].join(', ');

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': csp,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': PERMISSIONS_POLICY,
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-DNS-Prefetch-Control': 'off',
  ...(isDev ? {} : { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload' }),
};

function applySecurityHeaders(response: NextResponse) {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

function localeFromPath(pathname: string): 'ar' | 'en' {
  const seg = pathname.split('/')[1];
  return seg === 'ar' ? 'ar' : 'en';
}

export default async function middleware(request: NextRequest) {
  // 1. Let next-intl produce its response (may redirect for locale handling).
  const intlResponse = intlMiddleware(request);

  // 2. Refresh / attach the Supabase session on that response so cookies roll
  //    forward even on redirects. @supabase/ssr mutates both request.cookies
  //    (so downstream reads see the refreshed session) and response.cookies.
  const { user, mustChangePassword } = await attachSupabaseSession(request, intlResponse);

  // 3. Gate protected subtrees: unauthenticated -> /login
  const { pathname, search } = request.nextUrl;
  if (!user && PROTECTED_PREFIX.test(pathname)) {
    const locale = localeFromPath(pathname);
    const loginUrl = new URL(`/${locale}/login`, request.url);
    // Preserve the intended destination so we can redirect back post-login in
    // a later phase. For Phase 1 we just drop the user on the role landing.
    loginUrl.searchParams.set('from', pathname + (search ?? ''));
    return applySecurityHeaders(NextResponse.redirect(loginUrl));
  }

  // 4. Phase 10: force temp-password users onto /set-password until they rotate.
  if (user && mustChangePassword && !TEMP_PASSWORD_ALLOWED.test(pathname)) {
    const locale = localeFromPath(pathname);
    return applySecurityHeaders(
      NextResponse.redirect(new URL(`/${locale}/set-password`, request.url)),
    );
  }

  return applySecurityHeaders(intlResponse);
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|sw.js|manifest.json|icons).*)',
  ],
};
