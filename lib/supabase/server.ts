import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseServerEnv } from './env';

export async function createServerSupabase() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseServerEnv();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component where cookies() is read-only.
          // Session refresh still happens in middleware, so this is safe.
        }
      },
    },
  });
}
