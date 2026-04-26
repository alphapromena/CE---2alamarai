import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseServerEnv } from './env';
import type { Database } from './database.types';

export function createAdminSupabase() {
  if (typeof window !== 'undefined') {
    throw new Error('createAdminSupabase must never run on the client');
  }
  const { url, serviceRoleKey } = getSupabaseServerEnv();
  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}