import createMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

const isDev = process.env.NODE_ENV !== 'production';

// Phase 0 stub — values appropriate for the foundation. Production tightening
// (Supabase URLs in connect-src, removing 'unsafe-eval' once webpack HMR is
// no longer needed) happens in a later phase alongside real auth and storage.
const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob:`,
  `font-src 'self' data:`,
  `connect-src 'self'${isDev ? ' ws: http://localhost:* http://127.0.0.1:*' : ''}`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `object-src 'none'`,
].join('; ');

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': csp,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), geolocation=(self), microphone=()',
  ...(isDev ? {} : { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload' }),
};

export default function middleware(request: NextRequest) {
  const response = intlMiddleware(request);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|sw.js|manifest.json|offline.html|icons).*)',
  ],
};
