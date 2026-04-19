---
name: design-system
description: Use this skill whenever creating, modifying, or reviewing any UI component, page, layout, form, table, dashboard, chart, or visual element in this project. This is a Stripe/Notion-inspired minimalist SaaS design system — light-mode only, neutral palette (black/white/gray) with a single accent color, strong typography hierarchy, generous whitespace, and a refined calm aesthetic. Trigger on ANY frontend work: new components, styling tweaks, new pages, shadcn/ui additions, Tailwind classes, Arabic RTL layouts, mobile views, loading states, empty states, error states, toasts, modals, tables, forms. Do NOT use the AI default "colorful gradient dashboard" look — follow this skill's rules instead.
---

# Design System — Promoter Monitoring Platform

**The aesthetic**: Stripe × Notion × Linear. Clean, calm, confident. Light mode only. Neutral grayscale with a single accent. Typography does the heavy lifting, not color. Whitespace is a feature, not a bug.

**Core principle**: A SaaS UI is a tool professionals use for hours a day. It must be readable, fast to scan, unsurprising, and never decorative at the expense of clarity.

---

## The Non-Negotiables (read before writing any CSS/JSX)

1. **Light mode only**. No dark mode code paths. No `dark:` Tailwind variants.
2. **Grayscale first**. The palette is white, black, and 10 shades of gray. One accent color. That's it. No gradients on buttons, cards, or backgrounds. No rainbow status pills.
3. **Typography is the design**. Font weight and size create hierarchy — not color and not boxes. A good page has ONE h1, maybe 2–3 h2s, and the rest is body text sized intentionally.
4. **Whitespace over decoration**. If a section feels empty, resist the urge to fill it with an icon, illustration, or colored background. Empty space makes the content louder.
5. **Borders, not shadows**. Use 1px borders in `--color-border` to separate content. Shadows only on floating elements (dropdowns, modals, popovers). Never on cards by default.
6. **No emoji icons in UI chrome**. Use `lucide-react` line icons only. Consistent stroke width (1.5px).
7. **Flat, not glossy**. No gradients. No glows. No glassmorphism. No 3D. No animations longer than 200ms.
8. **Data-dense is fine, cluttered is not**. SaaS dashboards show a lot. That's okay — but every element must earn its pixels.

---

## Design Tokens (copy into `tailwind.config.ts` and `globals.css`)

### globals.css — CSS variables

```css
@layer base {
  :root {
    /* Neutral palette — the only grays you may use */
    --color-white: #ffffff;
    --color-gray-50:  #fafafa;
    --color-gray-100: #f5f5f5;
    --color-gray-200: #e5e5e5;
    --color-gray-300: #d4d4d4;
    --color-gray-400: #a3a3a3;
    --color-gray-500: #737373;
    --color-gray-600: #525252;
    --color-gray-700: #404040;
    --color-gray-800: #262626;
    --color-gray-900: #171717;
    --color-black:    #0a0a0a;

    /* Semantic tokens — reference these in components, not raw grays */
    --color-bg:               var(--color-white);
    --color-bg-subtle:        var(--color-gray-50);
    --color-bg-muted:         var(--color-gray-100);
    --color-bg-hover:         var(--color-gray-100);
    --color-border:           var(--color-gray-200);
    --color-border-strong:    var(--color-gray-300);
    --color-text:             var(--color-gray-900);
    --color-text-secondary:   var(--color-gray-600);
    --color-text-muted:       var(--color-gray-500);
    --color-text-disabled:    var(--color-gray-400);
    --color-text-inverse:     var(--color-white);

    /* Accent — the ONLY color in the app besides grayscale
       Indigo-600. Used for primary actions, active states, links, focus rings, and nothing else. */
    --color-accent:           #4f46e5;
    --color-accent-hover:     #4338ca;
    --color-accent-subtle:    #eef2ff;
    --color-accent-text:      #ffffff;

    /* Status colors — used ONLY in status pills, toasts, and alerts.
       Never as primary button colors or page backgrounds.
       Desaturated, not candy-colored. */
    --color-success:          #15803d;
    --color-success-subtle:   #f0fdf4;
    --color-success-border:   #bbf7d0;
    --color-warning:          #a16207;
    --color-warning-subtle:   #fefce8;
    --color-warning-border:   #fde68a;
    --color-danger:           #b91c1c;
    --color-danger-subtle:    #fef2f2;
    --color-danger-border:    #fecaca;
    --color-info:             #1d4ed8;
    --color-info-subtle:      #eff6ff;
    --color-info-border:      #bfdbfe;

    /* Radius */
    --radius-sm:  4px;
    --radius-md:  6px;
    --radius-lg:  8px;
    --radius-xl:  12px;

    /* Shadow — used sparingly, only on floating elements */
    --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.04);
    --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.06), 0 2px 4px -2px rgb(0 0 0 / 0.04);
    --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.04);

    /* Focus ring — ALWAYS visible on interactive elements */
    --ring: 0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-accent);
  }

  html {
    font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif;
    font-feature-settings: 'cv11', 'ss01', 'ss03';  /* Inter's refined variants */
    -webkit-font-smoothing: antialiased;
    color: var(--color-text);
    background: var(--color-bg);
    font-size: 14px;  /* SaaS default — not 16px. Denser is better here. */
    line-height: 1.5;
  }

  html[lang="ar"] {
    font-family: 'IBM Plex Sans Arabic', 'Inter', system-ui, sans-serif;
  }

  /* Selection color matches accent */
  ::selection {
    background: var(--color-accent-subtle);
    color: var(--color-accent);
  }

  /* Focus ring on everything interactive — accessibility non-negotiable */
  *:focus-visible {
    outline: none;
    box-shadow: var(--ring);
    border-radius: var(--radius-sm);
  }
}
```

### tailwind.config.ts — map CSS vars to Tailwind

```ts
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: 'var(--color-bg)',
          subtle: 'var(--color-bg-subtle)',
          muted: 'var(--color-bg-muted)',
          hover: 'var(--color-bg-hover)',
        },
        border: {
          DEFAULT: 'var(--color-border)',
          strong: 'var(--color-border-strong)',
        },
        fg: {
          DEFAULT: 'var(--color-text)',
          secondary: 'var(--color-text-secondary)',
          muted: 'var(--color-text-muted)',
          disabled: 'var(--color-text-disabled)',
          inverse: 'var(--color-text-inverse)',
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          hover: 'var(--color-accent-hover)',
          subtle: 'var(--color-accent-subtle)',
        },
        success: {
          DEFAULT: 'var(--color-success)',
          subtle: 'var(--color-success-subtle)',
          border: 'var(--color-success-border)',
        },
        warning: {
          DEFAULT: 'var(--color-warning)',
          subtle: 'var(--color-warning-subtle)',
          border: 'var(--color-warning-border)',
        },
        danger: {
          DEFAULT: 'var(--color-danger)',
          subtle: 'var(--color-danger-subtle)',
          border: 'var(--color-danger-border)',
        },
        info: {
          DEFAULT: 'var(--color-info)',
          subtle: 'var(--color-info-subtle)',
          border: 'var(--color-info-border)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'IBM Plex Sans Arabic', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // Overriding Tailwind defaults to match SaaS density
        xs:    ['11px', { lineHeight: '16px', letterSpacing: '0.01em' }],
        sm:    ['13px', { lineHeight: '18px' }],
        base:  ['14px', { lineHeight: '20px' }],
        md:    ['15px', { lineHeight: '22px' }],
        lg:    ['16px', { lineHeight: '24px' }],
        xl:    ['18px', { lineHeight: '26px', letterSpacing: '-0.01em' }],
        '2xl': ['22px', { lineHeight: '30px', letterSpacing: '-0.015em' }],
        '3xl': ['28px', { lineHeight: '36px', letterSpacing: '-0.02em' }],
        '4xl': ['36px', { lineHeight: '44px', letterSpacing: '-0.025em' }],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
    },
  },
  plugins: [require('tailwindcss-logical')],  // For RTL-friendly ms-/me-/ps-/pe-
};
```

### Fonts

- **Latin**: `Inter` (variable font from Google Fonts or `@fontsource-variable/inter`). Load weights 400, 500, 600, 700 only.
- **Arabic**: `IBM Plex Sans Arabic` (Google Fonts). Load weights 400, 500, 600, 700.
- Load via `next/font` with `display: 'swap'` and subset to latin + arabic.

---

## Typography Rules

Use exactly these sizes for exactly these purposes. Don't invent new sizes.

| Purpose | Tailwind class | Weight | Notes |
|---|---|---|---|
| Page title (H1) | `text-2xl font-semibold` | 600 | One per page. Never bigger on internal pages. |
| Section heading (H2) | `text-lg font-semibold` | 600 | |
| Subsection (H3) | `text-base font-semibold` | 600 | |
| Body | `text-sm` | 400 | Default for most UI text. |
| Secondary body | `text-sm text-fg-secondary` | 400 | Descriptions under headings. |
| Label / caption | `text-xs text-fg-muted font-medium uppercase tracking-wide` | 500 | Table headers, form labels above inputs, KPI labels. |
| Numeric data | `text-sm font-medium tabular-nums` | 500 | Always `tabular-nums` for aligned numbers. |
| Large numeric (KPI card) | `text-3xl font-semibold tabular-nums` | 600 | The big number on a metric card. |
| Monospace (IDs, codes) | `text-xs font-mono text-fg-secondary` | 400 | |

**Rules:**
- Never use `font-bold` (700) in body content. Use `font-semibold` (600) for emphasis.
- Never use `italic` in UI chrome. Italic is reserved for literal content (quotes, titles of works).
- Line height is set globally; don't override unless there's a specific reason.
- For marketing pages only (landing, auth), you may go up to `text-4xl font-semibold` for hero headlines.

---

## Spacing & Layout

Use a **4px grid**. Tailwind's default spacing scale aligns to this — stick to these values and don't invent:

`0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24` (= 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96 px)

**Spacing conventions:**
- Inside cards: `p-6` (24px)
- Between form fields: `space-y-4` (16px)
- Between page sections: `space-y-8` (32px) or `space-y-10` (40px)
- Inside buttons: `px-3 py-1.5` for default, `px-4 py-2` for large
- Inside table cells: `px-4 py-3` — never tighter
- Icon-to-text gap: `gap-2` (8px)
- Form label to input: `mb-1.5` (6px)

**Layout primitives:**
- App shell: left sidebar (240px fixed) + main content area. Sidebar `bg-bg-subtle`, main `bg-bg`.
- Page container: `max-w-7xl mx-auto px-6 py-8` for standard pages. `max-w-4xl` for forms and settings. `max-w-full` only for data tables that need it.
- Every page has a **page header**: `<h1>` + optional description + optional primary action button on the right. Separated from content by `border-b border-border pb-6 mb-6`.

---

## Components — How Each One Should Look

### Button
- **Primary**: `bg-accent text-white hover:bg-accent-hover px-3 py-1.5 rounded-md text-sm font-medium`. No shadow. No gradient.
- **Secondary**: `bg-white border border-border text-fg hover:bg-bg-hover px-3 py-1.5 rounded-md text-sm font-medium`
- **Ghost**: `text-fg hover:bg-bg-hover px-3 py-1.5 rounded-md text-sm font-medium` — no background, no border
- **Destructive**: `bg-white border border-danger-border text-danger hover:bg-danger-subtle` — never solid red
- **Icon-only**: `h-8 w-8 p-0 rounded-md hover:bg-bg-hover` with a 16px lucide icon inside
- Heights: default `h-8` (32px), small `h-7` (28px), large `h-9` (36px). Never taller than 36px in app chrome.
- Disabled: `opacity-50 cursor-not-allowed` — do not grayscale or hide

### Input / Select / Textarea
- `h-8 px-3 text-sm border border-border rounded-md bg-white`
- Focus: `focus:border-accent focus:ring-2 focus:ring-accent/20`
- Placeholder: `placeholder:text-fg-muted`
- Error state: `border-danger` + small danger-colored text below (`text-xs text-danger mt-1`)
- Label above: `text-xs font-medium text-fg-secondary mb-1.5 block`
- Never put labels inside inputs (no floating labels). Labels always above.

### Card
- `bg-white border border-border rounded-lg p-6`
- No shadow by default.
- Card header: `text-base font-semibold mb-1` + `text-sm text-fg-secondary mb-4`
- Cards do NOT have colored backgrounds. If you need emphasis, use `bg-bg-subtle` for the enclosing section, not the card.

### Table (critical — this app is table-heavy)
- Outer wrapper: `bg-white border border-border rounded-lg overflow-hidden`
- Header row: `bg-bg-subtle text-xs font-medium text-fg-secondary uppercase tracking-wide`
- Header cell: `px-4 py-2.5 text-start` (use `text-start` not `text-left` for RTL)
- Body row: `border-t border-border hover:bg-bg-subtle/50`
- Body cell: `px-4 py-3 text-sm`
- Numeric cells: `tabular-nums text-end` (RTL-aware)
- Sticky header when scrolling: `sticky top-0 z-10`
- Row actions: right-aligned icon buttons, revealed on hover with `opacity-0 group-hover:opacity-100`
- Empty state: full-width row with centered message + subtle illustration (see Empty State below)

### Status Pill (for attendance, approval status, stock flags, etc.)
Small, understated, never the dominant element of a row:
```tsx
<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium
  bg-success-subtle text-success border border-success-border">
  <CheckCircle2 className="h-3 w-3" /> Approved
</span>
```
Variants:
- Success (approved, checked-in, in-stock)
- Warning (late, pending, low-stock)
- Danger (absent, rejected, over-consumption)
- Info (in-progress, on-break)
- Neutral: `bg-bg-muted text-fg-secondary border-border` (draft, not-started)

### Modal / Dialog
- Overlay: `bg-black/40 backdrop-blur-sm`
- Panel: `bg-white rounded-xl shadow-lg max-w-md w-full p-6`
- Close button (X) top-right, ghost style.
- Title: `text-lg font-semibold`. Description: `text-sm text-fg-secondary mt-1`.
- Actions footer: right-aligned on LTR, left-aligned on RTL (use flex with logical properties), `gap-2`, primary action last.

### Dropdown / Popover
- `bg-white border border-border rounded-lg shadow-md py-1`
- Item: `px-3 py-1.5 text-sm hover:bg-bg-hover cursor-pointer flex items-center gap-2`
- Selected: `bg-accent-subtle text-accent`
- Destructive item: `text-danger hover:bg-danger-subtle`

### Toast / Alert
- Fixed bottom-right (LTR) or bottom-left (RTL).
- `bg-white border border-border rounded-lg shadow-md p-4 max-w-sm`
- Icon on the start (left LTR / right RTL), message, optional action link.
- Auto-dismiss default 4s. Destructive toasts don't auto-dismiss.

### Sidebar (app navigation)
- `w-60 bg-bg-subtle border-e border-border h-screen flex flex-col`
- Logo/brand at top: `p-4 border-b border-border`
- Nav section label: `text-xs font-medium text-fg-muted uppercase tracking-wide px-3 pt-4 pb-1`
- Nav item: `flex items-center gap-2.5 px-3 py-1.5 mx-2 rounded-md text-sm text-fg-secondary hover:bg-bg-hover`
- Active nav item: `bg-white text-fg font-medium shadow-sm` (this is the ONE place shadow-sm on a non-floating element is okay)
- User menu at bottom.

### Top bar (inside main content)
- `h-14 border-b border-border bg-white px-6 flex items-center justify-between`
- Breadcrumbs on start, user actions on end.

---

## Dashboard Design (Modules 7, 8 — critical)

### KPI Card
```
┌───────────────────────────────┐
│ CONVERSION RATE               │  ← text-xs uppercase tracking-wide text-fg-muted
│                               │
│ 46.6%                         │  ← text-3xl font-semibold tabular-nums
│ ↑ 2.3% vs last week           │  ← text-xs text-success with lucide TrendingUp icon
└───────────────────────────────┘
```
- `p-6 bg-white border border-border rounded-lg`
- No colorful background.
- Trend indicator: small arrow + color (success/danger) + delta in `tabular-nums`.
- If neutral/no change: `text-fg-muted` with `Minus` icon.

### Charts (use Recharts)
Color rules:
- **Primary series** is always `var(--color-accent)`.
- Secondary series: `var(--color-gray-400)`.
- Tertiary: `var(--color-gray-700)`.
- **Never** use rainbow palettes. If you have >3 series, stack them or use small multiples instead.
- Gridlines: `var(--color-border)`, thin (1px), `strokeDasharray="3 3"`.
- Axis text: `text-xs fill-fg-muted`.
- Tooltips: match Popover styling above.
- Bars/lines stroke width: 2px.
- No 3D, no shadows on chart elements.

### Layout patterns for monitoring (Module 8)
- **Overview → Drill-down** pattern: grid of KPI cards at top, then a main visualization (chart or map), then a data table below. `grid grid-cols-4 gap-4` for KPI cards on desktop, `grid-cols-2` on tablet, stack on mobile.
- Filters live in a **filter bar** above the content: `bg-bg-subtle border border-border rounded-lg p-3 flex items-center gap-2 flex-wrap`.
- Real-time indicators: small pulsing dot next to "Live" label — `h-1.5 w-1.5 rounded-full bg-success animate-pulse`.

---

## Forms (critical — Modules 1, 4, 9)

- Forms are single-column. No side-by-side fields except short related pairs (city + postal code).
- Max form width: `max-w-2xl`.
- Fields grouped with `<fieldset>` semantically; visually separated by `space-y-6` between groups, `space-y-4` within a group.
- Every field has a visible label above. Required fields show `<span className="text-danger ms-0.5">*</span>` after the label text.
- Help text below field: `text-xs text-fg-muted mt-1`.
- Validation error below field: `text-xs text-danger mt-1` with an `AlertCircle` icon.
- Submit button right-aligned (LTR) / left-aligned (RTL) at the bottom, separated by `border-t border-border pt-6 mt-6`.
- Save states: button shows loading spinner during submit; success toast after; error toast with reason.

---

## Empty States

Every list/table/dashboard section that can be empty needs a designed empty state:

```
      [subtle line-art icon, 48px, text-fg-muted]
       
      No campaigns yet
      Create your first campaign to start tracking field operations.
      
      [ + New campaign ]   ← primary button
```
- Centered, `py-12`, text-center.
- Heading `text-base font-semibold`.
- Description `text-sm text-fg-secondary max-w-sm mx-auto`.
- Primary action to resolve the emptiness.
- Illustration is a single lucide icon in `text-fg-muted`, NOT a colorful SVG.

---

## Loading States

- **Inline loading** (button, small area): `Loader2` lucide icon with `animate-spin`.
- **Page loading**: skeleton screens matching the final layout. Use `bg-bg-muted animate-pulse rounded-md` for placeholders. Match the size of the content being loaded.
- **Never** use a centered spinner for page loads — always skeletons. Perceived performance matters.
- **Never** use shimmer gradients. The pulse animation is enough.

---

## Error States

- **Inline field error**: see Forms above.
- **Section error**: `bg-danger-subtle border border-danger-border text-danger rounded-lg p-4` with `AlertTriangle` icon, message, and optional retry button.
- **Page-level error**: centered, single line-art icon, error message, action to recover (retry / go back / contact support).

---

## Icons

- **Library**: `lucide-react` only. Installed via `pnpm add lucide-react`.
- **Size**: 16px default (`h-4 w-4`), 20px for prominent actions (`h-5 w-5`), 14px in small contexts like pills (`h-3.5 w-3.5`), 48px for empty states.
- **Stroke**: default 2 is fine, but `strokeWidth={1.75}` looks more refined at 16px — use it consistently.
- **Color**: inherit from parent text color. Don't color icons independently except in status pills.
- **No emoji** in UI chrome. Ever. (Emojis are okay in user-generated content displays.)

---

## Animation & Transitions

Keep it subtle. The UI should feel calm, not bouncy.

- **Duration**: 150ms default, 200ms max. Never 300ms+.
- **Easing**: `ease-out` for appearing, `ease-in` for disappearing.
- **Allowed animations**:
  - Button/link hover: color/background change only.
  - Focus ring: instant (no transition).
  - Modal/popover open: fade + tiny scale (0.98 → 1) over 150ms.
  - Skeleton pulse (CSS default).
  - Live indicator pulse.
- **Forbidden**: bounce, rubber-band, sliding carousels, parallax, hover tilts, page transitions.

---

## Accessibility (non-negotiable)

- All interactive elements reachable by keyboard. Tab order logical.
- Focus ring visible (see CSS above). Don't remove `:focus-visible` styling.
- Color contrast: body text ≥ 4.5:1, large text ≥ 3:1. Our tokens are chosen to meet this — verify when adding new colors.
- Form fields have associated `<label>` elements (htmlFor matches id).
- Icon-only buttons have `aria-label`.
- Status pills have `aria-label` describing the status in words (in addition to the icon + text).
- Live regions for toasts: `role="status"` or `role="alert"`.
- Respect `prefers-reduced-motion`: disable all non-essential animations.

---

## Right-to-Left (Arabic) Handling

This app is bilingual. Every layout MUST work in RTL.

**Rules:**
- Use **logical properties** in Tailwind: `ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`, `text-end`, `border-s`, `border-e`. **Never** use `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right`.
- `html[dir="rtl"]` set based on locale. `tailwindcss-logical` plugin installed.
- Icons that imply direction (arrows, chevrons) flip in RTL. Either use `rtl:rotate-180` or use directional lucide icons (`ChevronEnd` pattern — pick based on logical direction).
- Numbers, codes, IDs, and data stay LTR even inside RTL layouts — wrap in `<span dir="ltr" className="tabular-nums">...</span>`.
- Charts: Recharts doesn't auto-flip. For RTL, set `reversed` on X axis where time flows. Verify each chart visually.
- Test every new page in both locales before committing.

---

## What NOT To Do (the most common AI design mistakes)

Do not do ANY of these. If you find yourself doing one, stop and re-read the rules.

❌ Purple-to-pink gradient buttons or hero sections
❌ Cards with colored left borders (red = error, green = success) — use pills instead
❌ Colorful emoji icons (🚀 💎 ✨) in UI chrome
❌ Dark sidebars with light main content (we're light-mode only; sidebar is `bg-bg-subtle`, not dark)
❌ Drop shadows on every card
❌ Rounded-full (pill-shaped) buttons — use `rounded-md`
❌ Buttons taller than 36px or with huge padding
❌ Centered navigation with a floating CTA — we use left-sidebar + top-bar layout
❌ Charts with 6+ colors — reduce series or aggregate
❌ Overusing `font-bold` — use `font-semibold` sparingly for emphasis
❌ Inventing new gray values — use the 10 defined above
❌ Stacked icons inside cards as decoration
❌ Oversized illustrations in empty states
❌ Progress bars in gradients
❌ Toast notifications with colorful backgrounds (keep them white with a status-colored icon)
❌ Animated hero sections on the login page — it's a login page, keep it still

---

## Quick Reference — Before Finishing Any Component

Run through this checklist:

1. Did I use only the defined grayscale + the single accent + status colors?
2. Did I use `text-sm` for body and only jumped sizes at defined hierarchy points?
3. Did I use logical properties (`ms-`, `me-`, etc.) so RTL works?
4. Is the focus ring visible on every interactive element?
5. Is there an empty state designed if this can be empty?
6. Is there a loading state designed?
7. Is there an error state designed?
8. Does it render correctly in both `en` and `ar` locales?
9. Does it work on mobile (375px width)?
10. Is the shadow absent unless this is a floating element?

If any answer is no, fix before committing.

---

## Reference Inspirations (for calibration, not copying)

When unsure what a component should look like, look at:
- **Stripe Dashboard** — gold standard for SaaS data UI
- **Linear** — for tables, filters, keyboard-first interactions
- **Notion settings pages** — for forms and settings layouts
- **Vercel dashboard** — for project lists and deployment tables
- **Supabase Studio** — similarly-scoped admin UI, light mode

Never imitate Salesforce, Jira (classic), or SAP. That's the old SaaS look.
