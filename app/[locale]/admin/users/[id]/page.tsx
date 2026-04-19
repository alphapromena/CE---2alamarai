import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Label } from '@/components/ui/label';
import { requireAdmin } from '@/lib/auth/guards';
import { getAdminUser } from '@/lib/auth/users-query';
import { ChangeRoleForm, ToggleActiveForm } from './edit-forms';

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const actor = await requireAdmin();
  const user = await getAdminUser(id);
  if (!user) notFound();

  const t = await getTranslations('Admin.users.edit');
  const isSelf = actor.id === user.id;

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-4">
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1.5 text-sm text-fg-secondary hover:text-fg"
        >
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" strokeWidth={1.75} aria-hidden />
          {t('title')}
        </Link>
      </div>

      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{user.full_name}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('description')}</p>
      </div>

      <div className="mt-8 space-y-8">
        <section>
          <Label>{t('email_label')}</Label>
          <p className="text-sm" dir="ltr">
            {user.email}
          </p>
        </section>

        <section className="rounded-lg border border-border bg-white p-6">
          <ChangeRoleForm userId={user.id} currentRole={user.role} isSelf={isSelf} />
        </section>

        <section className="rounded-lg border border-border bg-white p-6">
          <ToggleActiveForm userId={user.id} active={user.active} isSelf={isSelf} />
        </section>
      </div>
    </div>
  );
}
