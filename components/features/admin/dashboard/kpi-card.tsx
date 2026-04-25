import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react';
import { useFormatter } from 'next-intl';
import { Link } from '@/i18n/navigation';

export interface KpiDelta {
  /** Absolute percentage delta as a positive integer (e.g. 12 for +12%, 8 for -8%). */
  pct: number;
  /** Direction: true for ↑, false for ↓. */
  positive: boolean;
}

export interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: number;
  /** Shown under the number when no delta is provided. */
  sub?: string;
  delta?: KpiDelta;
  /** Localized "vs yesterday" string, only rendered when delta is shown. */
  deltaSuffix?: string;
  href: string;
  /** Tailwind classes for the icon chip background + text color. */
  tintClass: string;
  /** Optional staggered entrance animation class. */
  animationClass?: string;
}

export function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  delta,
  deltaSuffix,
  href,
  tintClass,
  animationClass,
}: KpiCardProps) {
  const fmt = useFormatter();

  return (
    <Link
      href={href}
      className={`group block rounded-xl bg-white p-5 shadow-card ring-1 ring-black/5 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md focus-visible:-translate-y-0.5 focus-visible:shadow-md md:p-6 ${
        animationClass ?? ''
      }`}
    >
      <div
        className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${tintClass}`}
        aria-hidden
      >
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </div>

      <div className="mt-4 text-xs font-semibold uppercase tracking-wider text-fg-muted">
        {label}
      </div>

      <div
        className="mt-1 text-4xl font-bold tabular-nums tracking-tight text-fg"
        dir="ltr"
      >
        {fmt.number(value)}
      </div>

      {delta ? (
        <div
          className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold ${
            delta.positive ? 'text-success' : 'text-danger'
          }`}
        >
          {delta.positive ? (
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          ) : (
            <ArrowDownRight
              className="h-3.5 w-3.5"
              strokeWidth={2}
              aria-hidden
            />
          )}
          <span dir="ltr">
            {delta.positive ? '+' : '−'}
            {fmt.number(delta.pct)}%
          </span>
          {deltaSuffix ? (
            <span className="font-normal text-fg-muted">{deltaSuffix}</span>
          ) : null}
        </div>
      ) : sub ? (
        <p className="mt-2 text-xs text-fg-muted">{sub}</p>
      ) : null}
    </Link>
  );
}
