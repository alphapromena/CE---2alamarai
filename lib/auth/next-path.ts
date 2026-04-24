import 'server-only';

/**
 * Accept only same-origin, absolute paths for post-auth redirects. Any value
 * that starts with `//` (protocol-relative), is empty, or is a full URL is
 * rejected in favour of `/` so that attacker-controlled `next` query params
 * can't bounce the user off to another origin after sign-in.
 */
export function safeNext(raw: string | null): string {
  if (!raw) return '/';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}
