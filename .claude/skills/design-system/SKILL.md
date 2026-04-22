---
name: design-system
description: Use this skill whenever creating, modifying, or reviewing any UI component, page, layout, form, table, dashboard, chart, or visual element in this project. This is the Perception brand design system — modern SaaS with Perception's vibrant palette (Navy + Cyan + Teal), light-mode primary with dark navy inverse surfaces (sidebar, nav), strong typography hierarchy, tasteful use of brand gradients only on hero/brand moments, and a refined modern aesthetic. Trigger on ANY frontend work: new components, styling tweaks, new pages, shadcn/ui additions, Tailwind classes, Arabic RTL layouts, mobile views, loading states, empty states, error states, toasts, modals, tables, forms.
---

# Design System — Promoter Monitoring Platform (Perception Brand)

**The aesthetic**: Modern SaaS with Perception's visual identity. Clean, confident, vibrant where it matters and calm where it counts. Light-mode primary surfaces with dark navy `#0F1B2E` inverse surfaces for sidebar and key nav. Typography + color + tasteful gradients create hierarchy. Brand gradients are reserved for "hero moments" only — never decorative.

**Core principle**: A SaaS UI is a tool professionals use for hours a day. It must be readable, fast to scan, unsurprising, and never decorative at the expense of clarity. The Perception brand adds personality and warmth; the underlying structure stays ruthlessly functional.

---

## The Non-Negotiables (read before writing any CSS/JSX)

1. **Light mode primary, dark inverse surfaces allowed**. Main content area is white. Sidebar, top nav in some contexts, and dark hero sections may use `--color-bg-inverse` (Ink `#0F1B2E`). No dark-mode variant of the app — the inverse surfaces are design choices, not a theme toggle.
2. **One primary accent**. **Cyan Wave `#0ABCD4`** is the ONE interactive color — buttons, links, active states, focus rings. **Teal Flow `#2DD9B4`** is the secondary accent used for success and positive highlights. Everything else is either grayscale, status semantic, or a brand accent used sparingly.
3. **Gradients are reserved**. Brand gradients (`--gradient-brand`, `--gradient-accent`, `--gradient-strip`) appear in at most 3 places per page: logo container, a single hero section or primary CTA, and optionally a 4px accent strip at the top of the page. **Never** on data cards, table rows, KPI tiles (except one featured tile), body backgrounds, or form inputs.
4. **Typography is the design backbone**. Font weight and size create hierarchy first — then color and borders reinforce it. A good page has ONE H1, maybe 2–3 H2s, and the rest is body text.
5. **Whitespace over decoration**. If a section feels empty, resist the urge to fill it. Empty space makes content louder.
6. **Borders + subtle shadows**. 1px borders in `--color-border` separate most content. Shadows (`shadow-card`) are allowed on cards for modern depth, but they are subtle and navy-tinted — never dramatic. Shadows grow only for floating elements (dropdowns, modals).
7. **No emoji icons in UI chrome**. Use `lucide-react` line icons only. Consistent stroke width (1.5px–1.75px).
8. **Flat surfaces, vibrant accents**. No gradients on buttons/cards/inputs (except the one "hero CTA" allowance). No glows. No glassmorphism. No 3D. Animations ≤200ms.
9. **Data-dense is fine, cluttered is not**. SaaS dashboards show a lot. That's okay — but every element must earn its pixels.

---

## Perception Brand Color Reference

These are the raw brand colors. **Do not reference these directly in components** — always use the semantic tokens below. These values live in `globals.css` as CSS variables.

| Name | Hex | Role |
|---|---|---|
| Navy Deep | `#1B2A4A` | Primary dark, anchor elements |
| Cyan Wave | `#0ABCD4` | **Primary CTA, links, focus, interactive** |
| Teal Flow | `#2DD9B4` | Secondary accent, success, positive highlights |
| Mint | `#8AE8C0` | Subtle hover states, dividers |
| Lime Spark | `#E8F26A` | Accent (sparingly only) |
| Sun Accent | `#F5D033` | Warm highlights, warnings (use sparingly) |
| Ink | `#0F1B2E` | Text, dark inverse surfaces |
| Slate | `#8A96AA` | Secondary text, subtext |

### Semantic tokens (use THESE in components)

See full list in `app/globals.css`. Always use `bg-accent`, `text-fg-secondary`, `border-border`, etc. Never write `bg-[#0abcd4]`.

---

## Color Usage Rules

### Where each color is allowed

- **Cyan Wave (`accent`)**: Primary buttons, links, active nav item, focus rings, primary icons, "Live" indicator dot, primary chart series.
- **Teal Flow (`accent-2`)**: Success pills, positive delta indicators (↑ 12%), secondary chart series, checkmarks.
- **Ink (`bg-inverse`)**: Sidebar background, dark hero sections, "featured" KPI card background (max 1 per dashboard).
- **Sun (`warning`)**: Late/pending pills, warning alerts.
- **Mint/Lime**: Tertiary chart colors, subtle hover background accents. Avoid in primary UI surfaces.
- **Brand gradient**: Logo mark background, top 4px page strip (optional), one hero CTA per page (optional — primary button style overrides this for most actions).

### Where colors are forbidden

- No colored button variants other than the defined `primary / secondary / ghost / destructive`.
- No colored card backgrounds (except the one featured inverse KPI tile).
- No rainbow charts — max 3 series, each a defined brand color.
- No "colorful" empty states with decorative illustrations — use a single lucide icon in `text-fg-muted`.

---

## Fonts

- **Latin**: `Inter` (variable font, via `next/font/google`). Weights 400, 500, 600, 700.
- **Arabic**: `IBM Plex Sans Arabic` (via `next/font/google`). Weights 400, 500, 600, 700.
- Load through `next/font` with `display: 'swap'` and appropriate subsets.
- Fonts are wired as CSS variables (`--font-sans`, `--font-sans-ar`) in `app/[locale]/layout.tsx`.

---

## Typography Rules

Use exactly these sizes for exactly these purposes. Don't invent new sizes.

| Purpose | Tailwind class | Weight | Notes |
|---|---|---|---|
| Hero / marketing H1 | `text-4xl font-bold` or `text-5xl font-bold` | 700 | Landing, auth, splash only. |
| Page title (H1) | `text-2xl font-semibold` | 600 | One per page in the app shell. |
| Section heading (H2) | `text-lg font-semibold` | 600 | |
| Subsection (H3) | `text-base font-semibold` | 600 | |
| Body | `text-sm` | 400 | Default for most UI text. |
| Secondary body | `text-sm text-fg-secondary` | 400 | Descriptions under headings. |
| Label / caption | `text-xs text-fg-muted font-semibold uppercase tracking-wide` | 600 | Table headers, form labels, KPI labels. Semibold for readability at small size. |
| Numeric data | `text-sm font-medium tabular-nums` | 500 | Always `tabular-nums` for aligned numbers. |
| Large numeric (KPI card) | `text-3xl font-bold tabular-nums` | 700 | The big number on a metric card. Bold gives modern weight. |
| Monospace (IDs, codes) | `text-xs font-mono text-fg-secondary` | 400 | |

**Rules:**
- `font-bold` (700) is now permitted for KPI numbers and marketing headlines — it gives the modern brand feel. Keep `font-semibold` (600) for everything else.
- Never use `italic` in UI chrome. Italic is reserved for literal content.
- Line height is set globally; don't override unless there's a specific reason.

---

## Spacing & Layout

Use a **4px grid**. Stick to Tailwind's default spacing scale:

`0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24`

**Spacing conventions:**
- Inside cards: `p-6` (24px)
- Between form fields: `space-y-4` (16px)
- Between page sections: `space-y-8` (32px) or `space-y-10` (40px)
- Inside buttons: `px-4 py-2` default, `px-5 py-2.5` large
- Inside table cells: `px-4 py-3` — never tighter
- Icon-to-text gap: `gap-2` (8px)
- Form label to input: `mb-1.5` (6px)

**Layout primitives:**
- App shell: left sidebar (240px fixed, `bg-inverse`) + main content area (`bg-bg`).
- Top accent strip: `h-1` with `bg-gradient-strip` at the top of the app shell, below the `<html>` root. Optional but recommended for pages in the marketing/auth flow.
- Page container: `max-w-7xl mx-auto px-6 py-8` for standard pages. `max-w-4xl` for forms and settings.
- Every page has a **page header**: `<h1>` + optional description + optional primary action on the right. Separated from content by `border-b border-border pb-6 mb-6`.

---

## Components — How Each One Should Look

### Button

Four variants. No gradient unless explicitly "hero" context.

- **Primary**: `bg-accent text-white hover:bg-accent-hover active:bg-accent-active px-4 py-2 rounded-lg text-sm font-semibold shadow-sm`. Tight focus ring.
- **Secondary**: `bg-white border border-border text-fg hover:bg-bg-hover px-4 py-2 rounded-lg text-sm font-semibold`.
- **Ghost**: `bg-transparent text-fg hover:bg-bg-hover px-4 py-2 rounded-lg text-sm font-medium`.
- **Destructive**: `bg-danger text-white hover:opacity-90 px-4 py-2 rounded-lg text-sm font-semibold`.
- **Hero CTA (rare, marketing/auth only)**: `bg-gradient-accent text-white px-5 py-2.5 rounded-lg text-sm font-semibold shadow-md`. **Use once per page max.**

### Input / Select / Textarea
- `h-10 px-3 rounded-lg border border-border bg-white text-sm placeholder:text-fg-muted focus:border-accent focus:ring-2 focus:ring-accent/20`
- Error: add `border-danger ring-danger/20`.

### Card
- Default: `bg-white border border-border rounded-xl p-6 shadow-card`.
- **Featured/hero card** (max 1 per page): `bg-inverse text-fg-inverse rounded-xl p-6 shadow-md`. Use for "most important" KPI or CTA surface.
- Never add gradients to cards.

### KPI Card
```
┌────────────────────────────┐
│ ▎ACTIVE PROMOTERS          │  ← 3px accent strip on the start edge
│                            │
│ 247                        │  ← text-3xl font-bold tabular-nums
│ ↑ 12% vs last week         │  ← text-xs text-accent-2-strong font-semibold
└────────────────────────────┘
```
- `bg-white border border-border rounded-xl p-5 shadow-card relative overflow-hidden`
- Accent strip: absolutely positioned `w-1 h-full top-0 start-0` in one of: `bg-accent`, `bg-accent-2`, `bg-warning`, or `bg-brand-sun`. **Color encodes the metric category**, not decoration.
- **One** KPI card per page may use `bg-inverse` (featured tile) — the "headline number" of the page.
- Label: `text-xs text-fg-muted font-semibold uppercase tracking-wide`
- Number: `text-3xl font-bold tabular-nums text-fg` (or `text-fg-inverse` in inverse variant)
- Trend indicator: `text-xs font-semibold` in `text-accent-2-strong` (up) or `text-danger` (down), with lucide `TrendingUp`/`TrendingDown`/`Minus` icon.

### Status Pill
Small, understated:
```tsx
<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold
  bg-success-subtle text-success border border-success-border">
  <CheckCircle2 className="h-3 w-3" /> Approved
</span>
```
Variants: `success`, `warning`, `danger`, `info`, plus a neutral `bg-bg-muted text-fg-secondary border-border` for draft/inactive. Note: `rounded-full` for pills gives the modern feel.

### Modal / Dialog
- Overlay: `bg-ink/60 backdrop-blur-sm` (ink-tinted instead of pure black)
- Panel: `bg-white rounded-2xl shadow-lg max-w-md w-full p-6`
- Close button (X) top-end, ghost style.
- Title: `text-lg font-semibold`. Description: `text-sm text-fg-secondary mt-1`.
- Actions footer: end-aligned via flex + logical properties, `gap-2`, primary action last.

### Dropdown / Popover
- `bg-white border border-border rounded-xl shadow-md py-1.5`
- Item: `px-3 py-2 text-sm hover:bg-bg-hover cursor-pointer flex items-center gap-2`
- Selected: `bg-accent-subtle text-accent-strong font-medium`
- Destructive item: `text-danger hover:bg-danger-subtle`

### Toast / Alert
- Fixed bottom-end (respects RTL).
- `bg-white border border-border rounded-xl shadow-lg p-4 max-w-sm`
- Left-edge accent bar (3px): `bg-accent-2` for success, `bg-warning` for warning, `bg-danger` for error, `bg-accent` for info.
- Auto-dismiss default 4s. Destructive toasts don't auto-dismiss.

### Sidebar (app navigation)
- `w-60 bg-inverse text-fg-inverse h-screen flex flex-col`
- Logo/brand at top: `p-4 border-b border-border-inverse` with the logo mark on a small gradient square
- Nav section label: `text-xs font-semibold text-fg-inverse-secondary uppercase tracking-wide px-3 pt-4 pb-1`
- Nav item: `flex items-center gap-2.5 px-3 py-2 mx-2 rounded-lg text-sm text-fg-inverse-secondary hover:bg-bg-inverse-hover hover:text-white`
- Active nav item: `bg-accent/12 text-accent font-semibold` — accent color shows through at 12% opacity, text is full accent
- User menu at bottom.

### Top bar (inside main content)
- `h-14 border-b border-border bg-white px-6 flex items-center justify-between`
- Breadcrumbs on start, user actions + search on end.

---

## Dashboard Design (Modules 7, 8)

### Page structure
1. (Optional) 4px gradient strip at very top via `bg-gradient-strip`
2. Page header with H1 + primary action
3. Filter bar (if applicable)
4. KPI cards row — 3–4 across on desktop, 2 on tablet, stack on mobile
5. Main chart / map / visualization area
6. Data table

### Charts (use Recharts)
Color rules — **strict**:
- **Primary series** is always `var(--color-accent)` (Cyan).
- Secondary series: `var(--color-accent-2)` (Teal).
- Tertiary series: `var(--color-mint)`.
- 4th series (rare): `var(--color-sun)`.
- **Never** use rainbow palettes. If you have >4 series, stack them or use small multiples.
- Gridlines: `var(--color-border)`, thin (1px), `strokeDasharray="3 3"`, horizontal only.
- Axis text: `text-xs fill-fg-muted`.
- Tooltips: white bg, `rounded-lg`, `shadow-md`, `text-xs`.
- Bars/lines stroke width: 2px. No 3D, no shadows on chart elements.

---

## Forms

- Single-column. No side-by-side fields except short related pairs (city + postal code).
- Max form width: `max-w-2xl`.
- Fields grouped with `<fieldset>` semantically; visual separation `space-y-6` between groups, `space-y-4` within.
- Every field has a visible label above. Required: `<span className="text-danger ms-0.5">*</span>`.
- Help text: `text-xs text-fg-muted mt-1`.
- Validation error: `text-xs text-danger mt-1` with `AlertCircle` icon.
- Submit row: end-aligned, separated by `border-t border-border pt-6 mt-6`.
- Primary button is the full Perception primary button (cyan).

---

## Empty States

Every list/table/dashboard section that can be empty needs a designed empty state.

- Centered, `py-12`, text-center.
- Icon: 48px lucide icon inside a `h-14 w-14 rounded-2xl bg-accent-subtle flex items-center justify-center` circle, icon is `text-accent`.
- Heading `text-base font-semibold`.
- Description `text-sm text-fg-secondary max-w-sm mx-auto`.
- Primary button to resolve the emptiness.
- **Never** use colorful illustrations — keep it a single lucide icon on `accent-subtle` background.

---

## Loading States

- **Inline loading**: `Loader2` with `animate-spin` in current text color.
- **Page loading**: skeleton screens matching the final layout. `bg-bg-muted animate-pulse rounded-lg`.
- **Never** use centered spinners for page loads.
- **Never** use shimmer gradients. Pulse is enough.

---

## Error States

- **Inline field error**: see Forms above.
- **Section error**: `bg-danger-subtle border border-danger-border text-danger rounded-xl p-4` with `AlertTriangle` icon.
- **Page-level error**: centered, single line-art icon (no color fill), error message, action to recover.

---

## Icons

- **Library**: `lucide-react` only.
- **Size**: 16px default, 20px for prominent actions, 14px in pills, 48px for empty states.
- **Stroke**: `strokeWidth={1.75}` consistently (more refined than default 2).
- **Color**: inherit from parent text color. Don't color icons independently except in status pills.
- **No emoji** in UI chrome.

---

## Animation & Transitions

Keep it subtle.

- **Duration**: 150ms default, 200ms max.
- **Easing**: `ease-out` for appearing, `ease-in` for disappearing.
- **Allowed**: hover color/bg change, focus ring appearance, modal fade + tiny scale (0.98→1, 150ms), skeleton pulse, "live" pulse dot.
- **Forbidden**: bounce, rubber-band, sliding carousels, parallax, hover tilts, page transitions >200ms.

---

## Accessibility (non-negotiable)

- All interactive elements reachable by keyboard.
- `:focus-visible` ring visible on all interactive elements — don't remove.
- Color contrast: body text ≥ 4.5:1, large text ≥ 3:1. Our tokens are picked to meet this — verify new colors.
- Form fields have `<label>` with `htmlFor`.
- Icon-only buttons have `aria-label`.
- Status pills have `aria-label` describing the status in words.
- Live regions for toasts: `role="status"` or `role="alert"`.
- Respect `prefers-reduced-motion`.

---

## Right-to-Left (Arabic)

This app is bilingual. **Every layout MUST work in RTL.**

- Use **logical properties**: `ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`, `text-end`, `border-s`, `border-e`. The `tailwindcss-logical` plugin is already configured.
- Icons that convey direction (arrows, chevrons) must flip in RTL. Use `rtl:-scale-x-100` or conditional icon rendering.
- Numbers stay LTR even in Arabic context (Arabic numerals) — no special handling needed with `tabular-nums`.
- The gradient strip and gradients do not need mirroring — they're symmetric or abstract enough.

---

## Checklist Before Committing UI Work

1. Did I use only Perception brand colors + neutrals + status colors?
2. Did I use the semantic tokens (`bg-accent`, `text-fg`) and not raw hex?
3. Did I limit gradients to at most 3 places per page (logo, hero, strip)?
4. Did I use `text-sm` body + hierarchy from the typography table?
5. Did I use logical properties (`ms-`, `me-`) so RTL works?
6. Is the focus ring visible on every interactive element?
7. Is there an empty state / loading state / error state designed where needed?
8. Does it render correctly in both `en` and `ar` locales?
9. Does it work on mobile (375px width)?
10. Did I avoid shadows except `shadow-card` on cards and `shadow-md/lg` on floating elements?

---

## Reference Inspirations (for calibration, not copying)

When unsure what a component should look like, look at:
- **Linear** — for tables, filters, keyboard-first, and the dark-sidebar-light-content pattern
- **Stripe Dashboard** — for data density and clean hierarchy
- **Vercel dashboard** — for project/deployment lists with inverse surfaces
- **Supabase Studio** — similarly-scoped admin UI
- **Notion** — for form and settings layouts

Never imitate Salesforce, Jira classic, or SAP. Avoid overly-colorful dashboards that use a rainbow palette (Dribbble defaults).
