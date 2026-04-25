import { ClipboardCheck, Megaphone, MapPin, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { KpiCard, type KpiDelta } from './kpi-card';

export interface KpiGridProps {
  promoters: number;
  attendance: number;
  visits: number;
  campaigns: number;
  /** Optional yesterday-comparison deltas — only attendance + visits are flow metrics. */
  attendanceDelta?: KpiDelta;
  visitsDelta?: KpiDelta;
}

export function KpiGrid({
  promoters,
  attendance,
  visits,
  campaigns,
  attendanceDelta,
  visitsDelta,
}: KpiGridProps) {
  const t = useTranslations('Admin.dashboard.kpi');
  const deltaSuffix = t('delta.vsYesterday');

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 lg:grid-cols-4">
      <KpiCard
        icon={Users}
        label={t('promoters.label')}
        value={promoters}
        sub={t('promoters.sub')}
        href="/admin/users?role=promoter"
        tintClass="bg-brand-cyan/10 text-brand-cyan"
        animationClass="motion-safe:animate-fade-up"
      />
      <KpiCard
        icon={ClipboardCheck}
        label={t('attendance.label')}
        value={attendance}
        sub={attendanceDelta ? undefined : t('attendance.sub')}
        delta={attendanceDelta}
        deltaSuffix={deltaSuffix}
        href="/admin/live"
        tintClass="bg-brand-teal/10 text-brand-teal"
        animationClass="motion-safe:animate-fade-up-delay-60"
      />
      <KpiCard
        icon={MapPin}
        label={t('visits.label')}
        value={visits}
        sub={visitsDelta ? undefined : t('visits.sub')}
        delta={visitsDelta}
        deltaSuffix={deltaSuffix}
        href="/admin/field-visits"
        tintClass="bg-warning-subtle text-warning"
        animationClass="motion-safe:animate-fade-up-delay-100"
      />
      <KpiCard
        icon={Megaphone}
        label={t('campaigns.label')}
        value={campaigns}
        sub={t('campaigns.sub')}
        href="/admin/campaigns?status=active"
        tintClass="bg-brand-navy/10 text-brand-navy"
        animationClass="motion-safe:animate-fade-up-delay-200"
      />
    </div>
  );
}
