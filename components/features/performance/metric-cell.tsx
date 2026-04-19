/**
 * Renders a numeric ratio (0..1) as a percentage with one decimal,
 * or '—' when null. `dir="ltr"` keeps numerals consistent in RTL.
 */
export function PercentCell({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value)) {
    return <span className="text-fg-tertiary">—</span>;
  }
  return (
    <span dir="ltr" className="tabular-nums">
      {(value * 100).toFixed(1)}%
    </span>
  );
}

/** Signed delta for benchmark cards. Positive = green, negative = red. */
export function DeltaCell({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value)) {
    return <span className="text-fg-tertiary">—</span>;
  }
  const pct = value * 100;
  const sign = pct > 0 ? '+' : '';
  const tone = pct > 0 ? 'text-success' : pct < 0 ? 'text-danger' : 'text-fg-secondary';
  return (
    <span dir="ltr" className={`tabular-nums ${tone}`}>
      {sign}
      {pct.toFixed(1)} pp
    </span>
  );
}
