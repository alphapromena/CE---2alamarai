import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireAdmin } from '@/lib/auth/guards';
import {
  listAttendanceForAdmin,
  type AttendanceRow,
  type LiveAttendanceJoined,
} from '@/lib/queries/attendance';
import { listCampaigns } from '@/lib/queries/campaigns';
import { listLocations } from '@/lib/queries/locations';
import { AdminAttendanceClient } from './admin-attendance-client';

const STATUS_VALUES: AttendanceRow['status'][] = [
  'checked_in',
  'checked_out',
  'late',
  'absent',
  'early_leave',
  'missing_checkout',
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseStatus(raw: string | undefined): AttendanceRow['status'] | undefined {
  if (!raw) return undefined;
  return (STATUS_VALUES as readonly string[]).includes(raw)
    ? (raw as AttendanceRow['status'])
    : undefined;
}

function parseUuid(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return UUID_RE.test(raw) ? raw : undefined;
}

function parseDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return DATE_RE.test(raw) ? raw : undefined;
}

export default async function AdminAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    campaign?: string;
    location?: string;
    status?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin();
  const sp = await searchParams;

  const campaignId = parseUuid(sp.campaign);
  const locationId = parseUuid(sp.location);
  const status = parseStatus(sp.status);
  const fromDate = parseDate(sp.from);
  const toDate = parseDate(sp.to);

  const t = await getTranslations('Admin.attendance');

  const [rows, campaigns, locations] = await Promise.all([
    listAttendanceForAdmin({
      campaignId,
      locationId,
      status,
      fromDate,
      toDate,
    }),
    listCampaigns(null),
    listLocations(null),
  ]);

  const campaignOptions = campaigns.map((c) => ({
    id: c.id,
    name_i18n: c.name_i18n,
  }));
  const locationOptions = locations.map((l) => ({
    id: l.id,
    name_i18n: l.name_i18n,
  }));

  // The query function defaults the date window to today − 29 days → today
  // when fromDate/toDate are omitted. Re-derive that default here so the
  // client-side date inputs reflect the same range the server queried.
  const todayLocal = new Date();
  const tzOffsetMin = 3 * 60; // Asia/Amman, mirrored from lib/attendance/shift-time
  const localToday = new Date(todayLocal.getTime() + tzOffsetMin * 60_000);
  const ld = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  const todayIso = ld(localToday);
  const thirtyAgoMs = localToday.getTime() - 29 * 24 * 60 * 60 * 1000;
  const fromDefault = ld(new Date(thirtyAgoMs));

  const initialFilters = {
    campaign: campaignId ?? '',
    location: locationId ?? '',
    status: status ?? '',
    from: fromDate ?? fromDefault,
    to: toDate ?? todayIso,
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <header className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('description')}</p>
      </header>

      <div className="mt-6">
        <AdminAttendanceClient
          locale={locale}
          rows={rows as LiveAttendanceJoined[]}
          campaigns={campaignOptions}
          locations={locationOptions}
          initialFilters={initialFilters}
        />
      </div>
    </div>
  );
}
