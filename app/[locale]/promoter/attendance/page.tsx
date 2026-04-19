import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireRole } from '@/lib/auth/guards';
import {
  listMyAttendanceToday,
  listTodaysPromoterAssignments,
  type PromoterShiftAssignment,
} from '@/lib/queries/attendance';
import { AttendanceClient } from './attendance-client';
import { EmptyState } from '@/components/ui/empty-state';
import { CalendarX } from 'lucide-react';

export default async function PromoterAttendancePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const profile = await requireRole('promoter');
  const t = await getTranslations('Promoter.attendance');

  const [assignments, todaysRows] = await Promise.all([
    listTodaysPromoterAssignments(profile.id),
    listMyAttendanceToday(),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('description')}</p>
      </header>

      <div className="pt-6">
        {assignments.length === 0 ? (
          <EmptyState
            icon={CalendarX}
            title={t('no_shift_title')}
            description={t('no_shift_description')}
          />
        ) : (
          <AttendanceClient
            locale={locale}
            userFullName={profile.full_name}
            assignments={assignments as PromoterShiftAssignment[]}
            todaysRows={todaysRows}
          />
        )}
      </div>
    </div>
  );
}
