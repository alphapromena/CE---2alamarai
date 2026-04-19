/**
 * Tiny pure-SVG sparkline. Avoids pulling in recharts as a new dep for
 * Phase 6 — the charts the spec calls for are simple ratio time-series.
 * Switch to recharts later if richer interactivity is needed.
 *
 * Renders nothing if there are < 2 numeric points.
 */
type Point = { period_start: string; value: number | null };

export function Sparkline({
  data,
  width = 240,
  height = 56,
  ariaLabel,
}: {
  data: ReadonlyArray<Point>;
  width?: number;
  height?: number;
  ariaLabel: string;
}) {
  const numeric = data
    .map((d) => ({ x: d.period_start, y: d.value }))
    .filter((d): d is { x: string; y: number } => typeof d.y === 'number' && Number.isFinite(d.y));

  if (numeric.length < 2) {
    return (
      <div
        className="flex h-14 w-full items-center justify-center rounded border border-border bg-bg-muted text-xs text-fg-secondary"
        role="img"
        aria-label={ariaLabel}
      >
        —
      </div>
    );
  }

  const min = 0;
  const max = 1; // ratios in [0,1]
  const range = max - min;
  const stepX = numeric.length > 1 ? width / (numeric.length - 1) : 0;

  const path = numeric
    .map((p, i) => {
      const x = i * stepX;
      const y = height - ((p.y - min) / range) * height;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');

  const last = numeric[numeric.length - 1]!;
  const lastX = (numeric.length - 1) * stepX;
  const lastY = height - ((last.y - min) / range) * height;

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${width} ${height}`}
      className="h-14 w-full"
      preserveAspectRatio="none"
    >
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent" />
      <circle cx={lastX} cy={lastY} r="2.5" className="fill-accent" />
    </svg>
  );
}
