# Component Patterns — Perception Brand

Copy-paste ready component examples that follow the Perception design system. Always read `SKILL.md` first; this file is patterns only.

---

## Button (all variants)

```tsx
// Primary
<button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg
  bg-accent text-white text-sm font-semibold shadow-sm
  hover:bg-accent-hover active:bg-accent-active
  focus-visible:outline-none
  disabled:opacity-50 disabled:cursor-not-allowed
  transition-colors duration-150">
  <Plus className="h-4 w-4" strokeWidth={1.75} />
  New Campaign
</button>

// Secondary
<button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg
  bg-white border border-border text-fg text-sm font-semibold
  hover:bg-bg-hover
  disabled:opacity-50">
  Cancel
</button>

// Ghost
<button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg
  text-fg text-sm font-medium
  hover:bg-bg-hover">
  <Download className="h-4 w-4" strokeWidth={1.75} />
  Export
</button>

// Destructive
<button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg
  bg-danger text-white text-sm font-semibold
  hover:opacity-90">
  Delete
</button>

// Hero CTA — rare, one per page maximum, marketing/auth only
<button className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg
  bg-gradient-accent text-white text-sm font-semibold shadow-md
  hover:opacity-95 active:opacity-90">
  Get Started
  <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
</button>
```

---

## Top Accent Strip (page-level)

Put this at the very top of the app layout (before the sidebar/header), gives the page a Perception brand signature:

```tsx
<div aria-hidden className="h-1 w-full bg-gradient-strip" />
```

---

## KPI Card (standard)

```tsx
<div className="relative overflow-hidden rounded-xl bg-white border border-border p-5 shadow-card">
  <div className="absolute top-0 start-0 h-full w-1 bg-accent" />
  <div className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
    Active Promoters
  </div>
  <div className="mt-2 text-3xl font-bold tabular-nums text-fg">
    247
  </div>
  <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-accent-2-strong">
    <TrendingUp className="h-3 w-3" strokeWidth={2} />
    12% vs last week
  </div>
</div>
```

Color-code the left strip by category:
- `bg-accent` — primary metrics (users, traffic, sales)
- `bg-accent-2` — success/positive metrics (conversion, retention)
- `bg-warning` — attention metrics (pending, late)
- `bg-brand-sun` — alerts/urgency

## KPI Card (featured — one per page max)

```tsx
<div className="rounded-xl bg-inverse text-fg-inverse p-5 shadow-md">
  <div className="text-xs font-semibold uppercase tracking-wide text-fg-inverse-secondary">
    Units Sold Today
  </div>
  <div className="mt-2 text-3xl font-bold tabular-nums">
    12,847
  </div>
  <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-brand-mint">
    <TrendingUp className="h-3 w-3" strokeWidth={2} />
    8.4% vs target
  </div>
</div>
```

---

## Status Pill

```tsx
// Success
<span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5
  text-xs font-semibold
  bg-success-subtle text-success border border-success-border"
  aria-label="Status: Approved">
  <CheckCircle2 className="h-3 w-3" strokeWidth={2} />
  Approved
</span>

// Warning
<span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5
  text-xs font-semibold
  bg-warning-subtle text-warning border border-warning-border">
  <Clock className="h-3 w-3" strokeWidth={2} />
  Late
</span>

// Danger
<span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5
  text-xs font-semibold
  bg-danger-subtle text-danger border border-danger-border">
  <XCircle className="h-3 w-3" strokeWidth={2} />
  Absent
</span>

// Info
<span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5
  text-xs font-semibold
  bg-info-subtle text-info border border-info-border">
  <Activity className="h-3 w-3" strokeWidth={2} />
  Active
</span>

// Neutral
<span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5
  text-xs font-semibold
  bg-bg-muted text-fg-secondary border border-border">
  Draft
</span>
```

---

## Form Field

```tsx
<div>
  <label
    htmlFor="campaign-name"
    className="mb-1.5 block text-xs font-semibold text-fg-secondary uppercase tracking-wide"
  >
    Campaign name
    <span className="ms-0.5 text-danger" aria-hidden>*</span>
  </label>
  <input
    id="campaign-name"
    type="text"
    className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm
               placeholder:text-fg-muted
               focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20
               disabled:opacity-50 disabled:cursor-not-allowed
               data-[error=true]:border-danger data-[error=true]:ring-danger/20"
    placeholder="e.g. Almarai Ramadan 2026"
  />
  <p className="mt-1 text-xs text-fg-muted">
    Shown to supervisors and promoters in the app.
  </p>
  {/* Error state example:
  <p className="mt-1 flex items-center gap-1 text-xs text-danger">
    <AlertCircle className="h-3 w-3" /> Name is required.
  </p>
  */}
</div>
```

---

## Empty State

```tsx
<div className="py-12 text-center">
  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-subtle">
    <Inbox className="h-6 w-6 text-accent" strokeWidth={1.75} />
  </div>
  <h3 className="text-base font-semibold">No campaigns yet</h3>
  <p className="mx-auto mt-1 max-w-sm text-sm text-fg-secondary">
    Create your first campaign to start tracking field operations.
  </p>
  <div className="mt-6">
    <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg
      bg-accent text-white text-sm font-semibold shadow-sm
      hover:bg-accent-hover">
      <Plus className="h-4 w-4" strokeWidth={1.75} />
      New campaign
    </button>
  </div>
</div>
```

---

## Skeleton (loading)

```tsx
export function TableRowSkeleton() {
  return (
    <tr className="border-t border-border">
      <td className="px-4 py-3">
        <div className="h-4 w-32 animate-pulse rounded bg-bg-muted" />
      </td>
      <td className="px-4 py-3">
        <div className="h-4 w-24 animate-pulse rounded bg-bg-muted" />
      </td>
      <td className="px-4 py-3">
        <div className="h-5 w-16 animate-pulse rounded bg-bg-muted" />
      </td>
      <td className="px-4 py-3 text-end">
        <div className="ms-auto h-4 w-12 animate-pulse rounded bg-bg-muted" />
      </td>
    </tr>
  );
}
```

---

## Sidebar (dark, brand-signature)

```tsx
export function Sidebar() {
  return (
    <aside className="flex h-screen w-60 flex-col bg-inverse text-fg-inverse">
      {/* Logo/brand */}
      <div className="flex items-center gap-2.5 border-b border-border-inverse p-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-accent
          text-white font-bold text-sm">
          P
        </div>
        <span className="text-sm font-bold tracking-wider">PERCEPTION</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4">
        <div className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide
          text-fg-inverse-secondary">
          Operations
        </div>

        <NavItem href="/client/dashboard" icon={LayoutDashboard} active>
          Dashboard
        </NavItem>
        <NavItem href="/client/campaigns" icon={Megaphone}>
          Campaigns
        </NavItem>
        <NavItem href="/client/promoters" icon={Users}>
          Promoters
        </NavItem>
        <NavItem href="/client/attendance" icon={ClipboardCheck}>
          Attendance
        </NavItem>
        <NavItem href="/client/stock" icon={Package}>
          Stock
        </NavItem>

        <div className="px-3 pb-1 pt-5 text-xs font-semibold uppercase tracking-wide
          text-fg-inverse-secondary">
          Insights
        </div>

        <NavItem href="/client/reports" icon={BarChart3}>
          Reports
        </NavItem>
        <NavItem href="/client/live" icon={Activity}>
          Live monitor
        </NavItem>
      </nav>

      {/* User area */}
      <div className="border-t border-border-inverse p-3">
        <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2
          text-sm text-fg-inverse-secondary hover:bg-bg-inverse-hover hover:text-white">
          <div className="h-7 w-7 rounded-full bg-accent/20 flex items-center justify-center
            text-xs font-bold text-accent">AM</div>
          <span className="flex-1 text-start">Ahmad M.</span>
          <ChevronUp className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>
    </aside>
  );
}

function NavItem({
  href,
  icon: Icon,
  children,
  active,
}: {
  href: string;
  icon: LucideIcon;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`
        mx-2 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm
        transition-colors duration-150
        ${active
          ? 'bg-accent/12 text-accent font-semibold'
          : 'text-fg-inverse-secondary hover:bg-bg-inverse-hover hover:text-white'}
      `}
    >
      <Icon className="h-4 w-4" strokeWidth={1.75} />
      {children}
    </Link>
  );
}
```

---

## Live Indicator

```tsx
<span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg-secondary">
  <span className="relative flex h-2 w-2">
    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-2 opacity-75" />
    <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-2" />
  </span>
  Live
</span>
```

---

## Filter Bar

```tsx
<div className="flex flex-wrap items-center gap-2 rounded-xl border border-border
  bg-bg-subtle p-3">
  <Select size="sm" placeholder="Campaign" options={campaigns} />
  <Select size="sm" placeholder="Location" options={locations} />
  <Select size="sm" placeholder="Status" options={statuses} />
  <div className="ms-auto flex items-center gap-2">
    <button className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5
      text-xs font-semibold text-fg-secondary hover:bg-bg-hover">
      <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
      Export
    </button>
  </div>
</div>
```

---

## Recharts Config (on-brand)

```tsx
<LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
  <CartesianGrid
    stroke="var(--color-border)"
    strokeDasharray="3 3"
    vertical={false}
  />
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
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-md)',
      fontSize: '13px',
      padding: '8px 12px',
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
  <Line
    type="monotone"
    dataKey="retention"
    stroke="var(--color-accent-2)"
    strokeWidth={2}
    dot={false}
  />
</LineChart>
```

---

## Toast

```tsx
// Success toast
<div
  role="status"
  className="fixed bottom-4 end-4 flex items-start gap-3 rounded-xl
    border border-border bg-white p-4 shadow-lg max-w-sm
    before:absolute before:inset-y-0 before:start-0 before:w-1
    before:rounded-s-xl before:bg-accent-2"
>
  <CheckCircle2 className="h-5 w-5 text-accent-2-strong flex-shrink-0" strokeWidth={1.75} />
  <div className="flex-1">
    <p className="text-sm font-semibold text-fg">Campaign created</p>
    <p className="mt-0.5 text-xs text-fg-secondary">
      Almarai Ramadan 2026 is now live.
    </p>
  </div>
  <button
    className="text-fg-muted hover:text-fg"
    aria-label="Dismiss"
  >
    <X className="h-4 w-4" strokeWidth={1.75} />
  </button>
</div>
```

---

## Modal

```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
  {/* Overlay */}
  <div
    aria-hidden
    className="absolute inset-0 bg-ink/60 backdrop-blur-sm"
    onClick={onClose}
  />

  {/* Panel */}
  <div
    role="dialog"
    aria-labelledby="modal-title"
    className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-lg"
  >
    <button
      onClick={onClose}
      aria-label="Close"
      className="absolute top-4 end-4 rounded-lg p-1 text-fg-muted hover:bg-bg-hover"
    >
      <X className="h-4 w-4" strokeWidth={1.75} />
    </button>

    <h2 id="modal-title" className="text-lg font-semibold">
      Delete campaign?
    </h2>
    <p className="mt-1 text-sm text-fg-secondary">
      This will permanently delete the campaign and all associated data.
      This action cannot be undone.
    </p>

    <div className="mt-6 flex justify-end gap-2">
      <button className="px-4 py-2 rounded-lg text-sm font-semibold text-fg hover:bg-bg-hover">
        Cancel
      </button>
      <button className="px-4 py-2 rounded-lg bg-danger text-white text-sm font-semibold hover:opacity-90">
        Delete
      </button>
    </div>
  </div>
</div>
```

---

## Hero Section (marketing/auth only)

```tsx
<section className="relative overflow-hidden rounded-2xl bg-inverse p-10 text-fg-inverse">
  {/* Decorative gradient orb */}
  <div
    aria-hidden
    className="absolute -top-24 -end-24 h-64 w-64 rounded-full opacity-30 blur-3xl"
    style={{ background: 'var(--gradient-accent)' }}
  />

  <div className="relative max-w-2xl">
    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1
      bg-white/10 text-xs font-semibold text-brand-mint">
      <Sparkles className="h-3 w-3" />
      New
    </span>
    <h1 className="mt-4 text-4xl font-bold leading-tight">
      Operations, reimagined for the field.
    </h1>
    <p className="mt-3 text-base text-fg-inverse-secondary">
      Real-time promoter monitoring, GPS-validated attendance, and SKU-level
      sales tracking — all in one bilingual platform.
    </p>
    <div className="mt-6 flex items-center gap-3">
      <button className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg
        bg-gradient-accent text-white text-sm font-semibold shadow-md hover:opacity-95">
        Start free trial
        <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
      </button>
      <button className="px-4 py-2 rounded-lg text-sm font-semibold
        text-white/90 hover:bg-white/10">
        See demo
      </button>
    </div>
  </div>
</section>
```
