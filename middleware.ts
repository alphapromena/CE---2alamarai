import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Match everything except: api, _next/static, _next/image, favicon, sw.js, manifest.json, icons
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|sw.js|manifest.json|icons).*)'],
};
