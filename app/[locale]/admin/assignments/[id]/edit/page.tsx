import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { AssignmentForm } from '@/components/features/admin/assignment-form';
import {
  getAssignment,
  listAssignableLocations,
  listAssignableUsers,
  listShiftsForLocation,
} from '@/lib/queries/assignments';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
function trimSec(t: string) {
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export default async function EditAssignmentPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const row = await getAssignment(id);
  if (!row) notFound();

  const [users, locations, shiftsForLoc] = await Promise.all([
    listAssignableUsers(),
    listAssignableLocations(),
    listShiftsForLocation(row.location_id),
  ]);

  const initialShifts = shiftsForLoc.map((s) => {
    const days = s.days_of_week
      .slice()
      .sort((a, b) => a - b)
      .map((d) => DAY_NAMES[d] ?? '?')
      .join('·');
    return {
      id: s.id,
      summary: `${trimSec(s.start_time)}–${trimSec(s.end_time)} · ${days}`,
    };
  });

  const t = await getTranslations('Admin.assignments');

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('edit_title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('edit_description')}</p>
      </div>
      <div className="mt-6">
        <AssignmentForm
          mode="edit"
          initial={row}
          users={users}
          locations={locations}
          initialShifts={initialShifts}
          locale={locale}
        />
      </div>
    </div>
  );
}
