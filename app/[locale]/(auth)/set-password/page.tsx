import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { SetPasswordForm } from './set-password-form';

export default async function SetPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/${locale}/login?error=invite_expired`);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('must_change_password')
    .eq('id', user.id)
    .maybeSingle();

  return <SetPasswordForm mustChange={profile?.must_change_password === true} />;
}
