import { createServerClient } from '@supabase/ssr';
import type { NextRequest, NextResponse } from 'next/server';

export async function attachSupabaseSession(request: NextRequest, response: NextResponse) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('Missing Supabase public env vars for middleware');
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let mustChangePassword = false;
  if (user) {
    // Phase 10: bulk-imported promoters log in with a temp password and must
    // rotate it on next session. The middleware uses this flag to redirect
    // them to /set-password until cleared. Failures are swallowed — gating
    // login on a profiles read would deadlock first-time invitees whose row
    // hasn't been materialised by the auth.users trigger yet.
    const { data } = await supabase
      .from('profiles')
      .select('must_change_password')
      .eq('id', user.id)
      .maybeSingle();
    mustChangePassword = data?.must_change_password === true;
  }

  return { supabase, user, mustChangePassword };
}
