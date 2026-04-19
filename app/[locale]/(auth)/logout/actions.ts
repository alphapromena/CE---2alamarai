'use server';

import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/auth/audit';

export async function logoutAction() {
  const locale = await getLocale();
  const supabase = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.auth.signOut();

  if (user) {
    await logAuditEvent({
      actor_id: user.id,
      action: 'auth.logout',
      entity: 'auth',
      entity_id: user.id,
    });
  }

  redirect(`/${locale}/login`);
}
