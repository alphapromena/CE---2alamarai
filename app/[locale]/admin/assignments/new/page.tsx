import { setRequestLocale, getTranslations } from 'next-intl/server';
import { AssignmentForm } from '@/components/features/admin/assignment-form';
import { listAssignableLocations, listAssignableUsers } from '@/lib/queries/assignments';

export default async function NewAssignmentPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [users, locations] = await Promise.all([listAssignableUsers(), listAssignableLocations()]);
  const t = await getTranslations('Admin.assignments');

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('new_title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('new_description')}</p>
      </div>
      <div className="mt-6">
        <AssignmentForm mode="create" users={users} locations={locations} locale={locale} />
      </div>
    </div>
  );
}
