import { useTranslations } from 'next-intl';
import {
  Plus,
  TrendingUp,
  TrendingDown,
  Users,
  ClipboardCheck,
  AlertTriangle,
  Package,
  Activity,
  Clock,
  CheckCircle2,
  Minus,
  Download,
  Filter,
  MapPin,
} from 'lucide-react';
import { LiveIndicator } from '@/components/ui/live-indicator';

/**
 * Client Dashboard — Perception brand proof of concept.
 *
 * This page demonstrates the rebranded design system:
 *  - Navy/Cyan/Teal palette applied to a real SaaS layout
 *  - Tasteful gradient usage (logo only; no gradient cards)
 *  - KPI cards with category-coded accent strips
 *  - One featured inverse card per page
 *  - Status pills with brand-aligned colors
 *
 * All classes reference semantic tokens defined in globals.css.
 */
export default function ClientDashboardPage() {
  const t = useTranslations('Client.dashboard');

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
            {t('overview')}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{t('title')}</h1>
          <p className="mt-1 text-sm text-fg-secondary">{t('description')}</p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-accent-hover active:bg-accent-active"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} />
          {t('newCampaign')}
        </button>
      </div>

      {/* Filter bar */}
      <div className="mt-6 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-bg-subtle p-3">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-fg hover:bg-bg-hover"
        >
          <Filter className="h-3.5 w-3.5" strokeWidth={1.75} />
          {t('filters')}
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-fg hover:bg-bg-hover"
        >
          {t('campaign')}: Almarai Ramadan
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-fg-secondary hover:bg-bg-hover"
        >
          {t('location')}: {t('allLocations')}
        </button>

        <LiveIndicator label={t('live')} />

        <div className="ms-auto">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-fg-secondary hover:bg-bg-hover"
          >
            <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
            {t('export')}
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={t('kpi.activePromoters')}
          value="247"
          delta={{ value: '12%', direction: 'up', label: t('kpi.vsLastWeek') }}
          accent="accent"
          icon={Users}
        />
        <KpiCard
          label={t('kpi.checkInRate')}
          value="94.2%"
          delta={{
            value: '3.1%',
            direction: 'up',
            label: t('kpi.improvement'),
          }}
          accent="accent-2"
          icon={ClipboardCheck}
        />
        <KpiCard
          label={t('kpi.pendingAlerts')}
          value="8"
          delta={{ value: '', direction: 'neutral', label: t('kpi.needsAttention') }}
          accent="warning"
          icon={AlertTriangle}
        />

        {/* Featured inverse KPI — headline metric, max one per page */}
        <FeaturedKpiCard
          label={t('kpi.unitsSoldToday')}
          value="12,847"
          delta="8.4%"
          deltaLabel={t('kpi.vsTarget')}
          icon={Package}
        />
      </div>

      {/* Chart + Activity grid */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SalesChartPlaceholder />
        <LiveStatusPanel />
      </div>

      {/* Recent activity table */}
      <div className="mt-6 overflow-hidden rounded-xl border border-border bg-white shadow-card">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold">{t('recentActivity')}</h2>
          <button className="text-xs font-semibold text-accent hover:text-accent-hover">
            {t('viewAll')}
          </button>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-bg-subtle">
              <Th>{t('table.promoter')}</Th>
              <Th>{t('table.location')}</Th>
              <Th>{t('table.campaign')}</Th>
              <Th>{t('table.checkIn')}</Th>
              <Th>{t('table.status')}</Th>
              <Th className="text-end">{t('table.sales')}</Th>
            </tr>
          </thead>
          <tbody>
            <Tr
              name="Sarah Al-Haddad"
              location="Safeway Jubeiha"
              campaign="Almarai Ramadan"
              checkIn="09:02 AM"
              status="active"
              sales="342"
            />
            <Tr
              name="Ahmed Mansour"
              location="C-Town Abdoun"
              campaign="Almarai Ramadan"
              checkIn="08:58 AM"
              status="active"
              sales="287"
            />
            <Tr
              name="Layla Khoury"
              location="Cozmo Shmeisani"
              campaign="Almarai Ramadan"
              checkIn="09:31 AM"
              status="late"
              sales="198"
            />
            <Tr
              name="Omar Saleh"
              location="Safeway Khalda"
              campaign="Almarai Ramadan"
              checkIn="—"
              status="absent"
              sales="0"
            />
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- Subcomponents ---------------- */

type AccentKind = 'accent' | 'accent-2' | 'warning' | 'danger';

const accentStripClasses: Record<AccentKind, string> = {
  accent: 'bg-accent',
  'accent-2': 'bg-accent-2',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

function KpiCard({
  label,
  value,
  delta,
  accent,
  icon: Icon,
}: {
  label: string;
  value: string;
  delta: { value: string; direction: 'up' | 'down' | 'neutral'; label: string };
  accent: AccentKind;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  const DeltaIcon =
    delta.direction === 'up'
      ? TrendingUp
      : delta.direction === 'down'
        ? TrendingDown
        : Minus;
  const deltaColor =
    delta.direction === 'up'
      ? 'text-accent-2-strong'
      : delta.direction === 'down'
        ? 'text-danger'
        : 'text-fg-muted';

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-white p-5 shadow-card">
      <div
        className={`absolute top-0 start-0 h-full w-1 ${accentStripClasses[accent]}`}
        aria-hidden
      />
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
          {label}
        </div>
        <Icon className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />
      </div>
      <div className="mt-2 text-3xl font-bold tabular-nums text-fg">
        {value}
      </div>
      <div
        className={`mt-1 flex items-center gap-1 text-xs font-semibold ${deltaColor}`}
      >
        <DeltaIcon className="h-3 w-3" strokeWidth={2} />
        {delta.value && <span>{delta.value}</span>}
        <span className={delta.value ? '' : 'font-medium'}>{delta.label}</span>
      </div>
    </div>
  );
}

function FeaturedKpiCard({
  label,
  value,
  delta,
  deltaLabel,
  icon: Icon,
}: {
  label: string;
  value: string;
  delta: string;
  deltaLabel: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-inverse p-5 text-fg-inverse shadow-md">
      {/* Subtle brand gradient orb in the corner */}
      <div
        aria-hidden
        className="absolute -end-8 -top-8 h-32 w-32 rounded-full opacity-20 blur-2xl"
        style={{ background: 'var(--gradient-accent)' }}
      />
      <div className="relative flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-fg-inverse-secondary">
          {label}
        </div>
        <Icon
          className="h-4 w-4 text-fg-inverse-secondary"
          strokeWidth={1.75}
        />
      </div>
      <div className="relative mt-2 text-3xl font-bold tabular-nums">
        {value}
      </div>
      <div className="relative mt-1 flex items-center gap-1 text-xs font-semibold text-brand-mint">
        <TrendingUp className="h-3 w-3" strokeWidth={2} />
        <span>{delta}</span>
        <span>{deltaLabel}</span>
      </div>
    </div>
  );
}

function SalesChartPlaceholder() {
  // Decorative bars — in the real app this is a Recharts component.
  const bars = [
    [35, 42, 48],
    [28, 38, 62],
    [45, 32, 55],
    [52, 48, 40],
    [38, 45, 58],
    [48, 52, 68],
    [42, 58, 72],
  ];
  return (
    <div className="lg:col-span-2 rounded-xl border border-border bg-white p-6 shadow-card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Sales by location</h2>
        <div className="flex items-center gap-4 text-xs text-fg-secondary">
          <LegendDot color="bg-accent" label="Safeway" />
          <LegendDot color="bg-accent-2" label="C-Town" />
          <LegendDot color="bg-brand-mint" label="Cozmo" />
        </div>
      </div>
      <div className="flex h-44 items-end gap-3 px-2">
        {bars.map((col, i) => (
          <div key={i} className="flex flex-1 flex-col gap-0.5">
            <div
              style={{ height: `${col[2]}%` }}
              className="rounded-t-md bg-accent"
            />
            <div style={{ height: `${col[1]}%` }} className="bg-accent-2" />
            <div
              style={{ height: `${col[0]}%` }}
              className="rounded-b-md bg-brand-mint"
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-between text-xs text-fg-muted">
        <span>Mon</span>
        <span>Tue</span>
        <span>Wed</span>
        <span>Thu</span>
        <span>Fri</span>
        <span>Sat</span>
        <span>Sun</span>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-sm ${color}`} />
      {label}
    </span>
  );
}

function LiveStatusPanel() {
  return (
    <div className="rounded-xl border border-border bg-white p-6 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">Live status</h2>
        <Activity className="h-4 w-4 text-fg-muted" strokeWidth={1.75} />
      </div>
      <ul className="space-y-2">
        <StatusRow
          name="Sarah — Safeway"
          status="active"
          statusLabel="LIVE"
        />
        <StatusRow
          name="Ahmed — C-Town"
          status="active"
          statusLabel="ACTIVE"
        />
        <StatusRow name="Layla — Cozmo" status="late" statusLabel="LATE" />
        <StatusRow
          name="Omar — Safeway"
          status="absent"
          statusLabel="ABSENT"
        />
      </ul>
    </div>
  );
}

function StatusRow({
  name,
  status,
  statusLabel,
}: {
  name: string;
  status: 'active' | 'late' | 'absent';
  statusLabel: string;
}) {
  const bg =
    status === 'active'
      ? 'bg-accent-2-subtle'
      : status === 'late'
        ? 'bg-warning-subtle'
        : 'bg-bg-muted';

  const dot =
    status === 'active'
      ? 'bg-accent-2'
      : status === 'late'
        ? 'bg-warning'
        : 'bg-fg-muted';

  const textColor =
    status === 'active'
      ? 'text-accent-2-strong'
      : status === 'late'
        ? 'text-warning'
        : 'text-fg-muted';

  return (
    <li
      className={`flex items-center gap-2.5 rounded-lg ${bg} px-3 py-2`}
    >
      <MapPin className="h-3.5 w-3.5 text-fg-muted" strokeWidth={1.75} />
      <span className="flex-1 text-xs font-medium text-fg">{name}</span>
      <span className={`flex items-center gap-1.5 text-[10px] font-bold tracking-wider ${textColor}`}>
        {status === 'active' && (
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} />
        )}
        {statusLabel}
      </span>
    </li>
  );
}

/* Table helpers */

function Th({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-6 py-3 text-start text-xs font-semibold uppercase tracking-wide text-fg-muted ${className}`}
    >
      {children}
    </th>
  );
}

function Tr({
  name,
  location,
  campaign,
  checkIn,
  status,
  sales,
}: {
  name: string;
  location: string;
  campaign: string;
  checkIn: string;
  status: 'active' | 'late' | 'absent';
  sales: string;
}) {
  return (
    <tr className="border-b border-border last:border-0 hover:bg-bg-subtle">
      <td className="px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
            {name
              .split(' ')
              .map((w) => w[0])
              .join('')
              .slice(0, 2)}
          </div>
          <span className="text-sm font-medium text-fg">{name}</span>
        </div>
      </td>
      <td className="px-6 py-3 text-sm text-fg-secondary">{location}</td>
      <td className="px-6 py-3 text-sm text-fg-secondary">{campaign}</td>
      <td className="px-6 py-3 text-sm tabular-nums text-fg-secondary">
        {checkIn}
      </td>
      <td className="px-6 py-3">
        <StatusPill status={status} />
      </td>
      <td className="px-6 py-3 text-end text-sm font-semibold tabular-nums text-fg">
        {sales}
      </td>
    </tr>
  );
}

function StatusPill({ status }: { status: 'active' | 'late' | 'absent' }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-success-border bg-success-subtle px-2 py-0.5 text-xs font-semibold text-success">
        <CheckCircle2 className="h-3 w-3" strokeWidth={2} />
        Active
      </span>
    );
  }
  if (status === 'late') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-warning-border bg-warning-subtle px-2 py-0.5 text-xs font-semibold text-warning">
        <Clock className="h-3 w-3" strokeWidth={2} />
        Late
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-danger-border bg-danger-subtle px-2 py-0.5 text-xs font-semibold text-danger">
      <AlertTriangle className="h-3 w-3" strokeWidth={2} />
      Absent
    </span>
  );
}
