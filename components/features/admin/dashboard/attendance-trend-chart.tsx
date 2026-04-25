/**
 * 7-day attendance trend — hand-rolled SVG area chart in the spirit of
 * components/features/performance/sparkline.tsx (no recharts; honors D-028).
 *
 * Layout: SVG renders the chart area only and is allowed to stretch
 * non-uniformly via preserveAspectRatio="none" so the curve fills the card
 * edge-to-edge regardless of width. The "today" dot would distort to an oval
 * under that stretch, so it's rendered as an absolutely-positioned HTML
 * element using percentage coordinates derived from the same viewBox math.
 * Day labels live in an HTML row beneath the SVG, force-LTR so the time axis
 * always reads oldest → newest in both en and ar (the conventional time-
 * series convention; the rest of the page still mirrors).
 */
import { TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';

export interface TrendDay {
  /** YYYY-MM-DD (Asia/Amman wall clock). */
  dateIso: string;
  /** Pre-localized short weekday label, e.g. "Mon" / "الإثنين". */
  dayLabel: string;
  count: number;
}

export interface AttendanceTrendChartProps {
  days: TrendDay[];
  /** Stable id per chart instance — only need one on this page, but keep
   *  it overrideable in case a future page renders two side-by-side. */
  gradientId?: string;
}

const VIEW_W = 700;
const VIEW_H = 156;
const PAD_X = 8;

type Pt = { x: number; y: number };

/** Catmull-Rom → cubic-bezier smoothing. Six lines of math, no library. */
function buildSmoothPath(pts: ReadonlyArray<Pt>): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0]!.x},${pts[0]!.y}`;
  let d = `M ${pts[0]!.x},${pts[0]!.y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? pts[i + 1]!;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return d;
}

export function AttendanceTrendChart({
  days,
  gradientId = 'ce-attendance-trend-fill',
}: AttendanceTrendChartProps) {
  const t = useTranslations('Admin.dashboard.trend');

  const counts = days.map((d) => d.count);
  const total = counts.reduce((a, b) => a + b, 0);

  if (days.length === 0 || total === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-subtle"
          aria-hidden
        >
          <TrendingUp className="h-5 w-5 text-accent" strokeWidth={1.75} />
        </div>
        <p className="text-sm text-fg-secondary">{t('empty')}</p>
      </div>
    );
  }

  const max = Math.max(1, ...counts);
  const innerW = VIEW_W - PAD_X * 2;
  const denom = days.length > 1 ? days.length - 1 : 1;
  const points: Pt[] = counts.map((c, i) => ({
    x: PAD_X + (i / denom) * innerW,
    y: VIEW_H - (c / max) * VIEW_H,
  }));

  const linePath = buildSmoothPath(points);
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const areaPath = `${linePath} L ${last.x.toFixed(2)},${VIEW_H} L ${first.x.toFixed(2)},${VIEW_H} Z`;

  // Dot anchor in container percentage units (preserveAspectRatio="none" stretches
  // the SVG, so the dot is rendered as HTML to stay round).
  const dotLeftPct = (last.x / VIEW_W) * 100;
  const dotTopPct = (last.y / VIEW_H) * 100;

  const avg = Math.round(total / days.length);

  return (
    <div className="flex h-full w-full flex-col">
      <p className="text-sm text-fg-muted">
        {t('summary', { total, avg })}
      </p>

      <div className="relative mt-3 flex-1" dir="ltr">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label={t('title')}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--color-cyan-wave)"
                stopOpacity="0.30"
              />
              <stop
                offset="100%"
                stopColor="var(--color-cyan-wave)"
                stopOpacity="0"
              />
            </linearGradient>
          </defs>

          {/* Subtle horizontal gridlines at 25/50/75% of chart height. */}
          {[0.25, 0.5, 0.75].map((frac) => (
            <line
              key={frac}
              x1={PAD_X}
              x2={VIEW_W - PAD_X}
              y1={VIEW_H * frac}
              y2={VIEW_H * frac}
              stroke="rgb(0 0 0 / 0.05)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <path d={areaPath} fill={`url(#${gradientId})`} />
          <path
            d={linePath}
            fill="none"
            stroke="var(--color-cyan-wave)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* Today's dot — kept circular by living outside the stretched SVG. */}
        <span
          className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-white"
          style={{ left: `${dotLeftPct}%`, top: `${dotTopPct}%` }}
          aria-hidden
        />
      </div>

      <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[11px] text-fg-muted">
        {days.map((d) => (
          <span key={d.dateIso}>{d.dayLabel}</span>
        ))}
      </div>
    </div>
  );
}
