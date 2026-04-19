# Component Patterns — Copy-Paste Examples

These are canonical examples. When building a component, find the closest match here first and adapt it, rather than starting from scratch.

---

## Page Shell

```tsx
// app/[locale]/(admin)/campaigns/page.tsx
export default function CampaignsPage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Page header */}
      <div className="flex items-end justify-between pb-6 mb-6 border-b border-border">
        <div>
          <h1 className="text-2xl font-semibold">Campaigns</h1>
          <p className="text-sm text-fg-secondary mt-1">
            Plan, configure, and monitor field marketing campaigns.
          </p>
        </div>
        <Button variant="primary">
          <Plus className="h-4 w-4" strokeWidth={1.75} />
          New campaign
        </Button>
      </div>

      {/* Content */}
      <div className="space-y-8">
        {/* ... */}
      </div>
    </div>
  );
}
```

---

## KPI Card

```tsx
interface KpiCardProps {
  label: string;
  value: string;
  delta?: { value: string; direction: 'up' | 'down' | 'flat' };
}

export function KpiCard({ label, value, delta }: KpiCardProps) {
  const TrendIcon = delta?.direction === 'up' ? TrendingUp
    : delta?.direction === 'down' ? TrendingDown
    : Minus;
  const trendColor = delta?.direction === 'up' ? 'text-success'
    : delta?.direction === 'down' ? 'text-danger'
    : 'text-fg-muted';

  return (
    <div className="bg-white border border-border rounded-lg p-6">
      <p className="text-xs font-medium text-fg-muted uppercase tracking-wide">
        {label}
      </p>
      <p className="text-3xl font-semibold tabular-nums mt-3" dir="ltr">
        {value}
      </p>
      {delta && (
        <p className={`text-xs ${trendColor} mt-2 flex items-center gap-1`}>
          <TrendIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
          <span className="tabular-nums" dir="ltr">{delta.value}</span>
          <span className="text-fg-muted">vs last period</span>
        </p>
      )}
    </div>
  );
}
```

---

## Data Table Row

```tsx
<tr className="border-t border-border hover:bg-bg-subtle/50 group">
  <td className="px-4 py-3 text-sm font-medium">Safeway Jubeiha</td>
  <td className="px-4 py-3 text-sm text-fg-secondary">Amman, North</td>
  <td className="px-4 py-3">
    <StatusPill variant="success" icon={CheckCircle2}>Active</StatusPill>
  </td>
  <td className="px-4 py-3 text-sm tabular-nums text-end" dir="ltr">
    46.6%
  </td>
  <td className="px-4 py-3 text-end">
    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <button className="h-7 w-7 p-0 rounded-md hover:bg-bg-hover">
        <Pencil className="h-3.5 w-3.5 mx-auto" strokeWidth={1.75} />
      </button>
      <button className="h-7 w-7 p-0 rounded-md hover:bg-bg-hover">
        <MoreHorizontal className="h-3.5 w-3.5 mx-auto" strokeWidth={1.75} />
      </button>
    </div>
  </td>
</tr>
```

---

## Status Pill

```tsx
type PillVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const variantStyles: Record<PillVariant, string> = {
  success: 'bg-success-subtle text-success border-success-border',
  warning: 'bg-warning-subtle text-warning border-warning-border',
  danger: 'bg-danger-subtle text-danger border-danger-border',
  info: 'bg-info-subtle text-info border-info-border',
  neutral: 'bg-bg-muted text-fg-secondary border-border',
};

export function StatusPill({
  variant, icon: Icon, children
}: {
  variant: PillVariant;
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${variantStyles[variant]}`}
      aria-label={typeof children === 'string' ? children : undefined}
    >
      {Icon && <Icon className="h-3 w-3" strokeWidth={1.75} />}
      {children}
    </span>
  );
}
```

---

## Form Field

```tsx
<div>
  <label
    htmlFor="campaign-name"
    className="text-xs font-medium text-fg-secondary mb-1.5 block"
  >
    Campaign name
    <span className="text-danger ms-0.5" aria-hidden>*</span>
  </label>
  <input
    id="campaign-name"
    type="text"
    className="h-8 w-full px-3 text-sm border border-border rounded-md bg-white
               placeholder:text-fg-muted
               focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20
               disabled:opacity-50 disabled:cursor-not-allowed
               data-[error=true]:border-danger"
    placeholder="e.g. Almarai Ramadan 2026"
  />
  <p className="text-xs text-fg-muted mt-1">
    Shown to supervisors and promoters in the app.
  </p>
  {/* Error state (when applicable) */}
  {/* <p className="text-xs text-danger mt-1 flex items-center gap-1">
    <AlertCircle className="h-3 w-3" /> Name is required.
  </p> */}
</div>
```

---

## Empty State

```tsx
<div className="py-12 text-center">
  <div className="mx-auto mb-4 h-12 w-12 rounded-lg bg-bg-muted flex items-center justify-center">
    <Inbox className="h-6 w-6 text-fg-muted" strokeWidth={1.5} />
  </div>
  <h3 className="text-base font-semibold">No campaigns yet</h3>
  <p className="text-sm text-fg-secondary mt-1 max-w-sm mx-auto">
    Create your first campaign to start tracking field operations.
  </p>
  <div className="mt-6">
    <Button variant="primary">
      <Plus className="h-4 w-4" strokeWidth={1.75} />
      New campaign
    </Button>
  </div>
</div>
```

---

## Skeleton (loading)

```tsx
export function TableRowSkeleton() {
  return (
    <tr className="border-t border-border">
      <td className="px-4 py-3"><div className="h-4 w-32 bg-bg-muted animate-pulse rounded-sm" /></td>
      <td className="px-4 py-3"><div className="h-4 w-24 bg-bg-muted animate-pulse rounded-sm" /></td>
      <td className="px-4 py-3"><div className="h-5 w-16 bg-bg-muted animate-pulse rounded-sm" /></td>
      <td className="px-4 py-3 text-end"><div className="h-4 w-12 bg-bg-muted animate-pulse rounded-sm ms-auto" /></td>
    </tr>
  );
}
```

---

## Sidebar Nav Item

```tsx
function NavItem({ href, icon: Icon, children, active }: NavItemProps) {
  return (
    <Link
      href={href}
      className={`
        flex items-center gap-2.5 mx-2 px-3 py-1.5 rounded-md text-sm
        ${active
          ? 'bg-white text-fg font-medium shadow-sm'
          : 'text-fg-secondary hover:bg-bg-hover hover:text-fg'}
      `}
    >
      <Icon className="h-4 w-4" strokeWidth={1.75} />
      {children}
    </Link>
  );
}
```

---

## Live Indicator (for Module 8 dashboard)

```tsx
<span className="inline-flex items-center gap-1.5 text-xs font-medium text-fg-secondary">
  <span className="relative flex h-1.5 w-1.5">
    <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-75 animate-ping" />
    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
  </span>
  Live
</span>
```

---

## Filter Bar

```tsx
<div className="bg-bg-subtle border border-border rounded-lg p-3 flex items-center gap-2 flex-wrap">
  <Select size="sm" placeholder="Campaign" options={campaigns} />
  <Select size="sm" placeholder="Location" options={locations} />
  <Select size="sm" placeholder="Status" options={statuses} />
  <div className="ms-auto flex items-center gap-2">
    <Button variant="ghost" size="sm">
      <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
      Export
    </Button>
  </div>
</div>
```

---

## Recharts Config (minimal, on-brand)

```tsx
<LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
  <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
  <XAxis
    dataKey="date"
    stroke="var(--color-text-muted)"
    fontSize={11}
    tickLine={false}
    axisLine={false}
  />
  <YAxis
    stroke="var(--color-text-muted)"
    fontSize={11}
    tickLine={false}
    axisLine={false}
  />
  <Tooltip
    contentStyle={{
      background: 'white',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-md)',
      fontSize: '13px',
    }}
    cursor={{ stroke: 'var(--color-border)', strokeWidth: 1 }}
  />
  <Line
    type="monotone"
    dataKey="conversion"
    stroke="var(--color-accent)"
    strokeWidth={2}
    dot={false}
    activeDot={{ r: 4, fill: 'var(--color-accent)' }}
  />
</LineChart>
```
