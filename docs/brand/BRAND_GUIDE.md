# Memoire Brand Guide

Memoire is a personal pipeline review and sales memory OS for individual B2B sellers. It is not a CRM. The brand should feel serious, tool-like, private, and evidence-driven.

## Identity

The primary logo is the `Memoire` wordmark in Outfit ExtraBold, with `-0.02em` tracking and the Memoire spectrum gradient. Do not invent a separate logo glyph. In quiet contexts, use a solid navy wordmark.

The favicon is the approved white `M` on the spectrum gradient.

The workspace follows the Daylight system introduced on 2026-09-14. `tailwind.config.js`, `PageFrame`, and the shared Daylight components define the implemented rules; `tokens.json` mirrors them. This guide was reconciled with those rules on 2026-10-02.

## Color

- Navy: `#1B2B3A`; light `#243447`; dark `#0F1C28`
- Brand blue: `#1976D2`; hover `#1565C0`
- Page: `#F4F7FA`
- Card: `#FFFFFF`
- Border: `#E7ECF2`
- Primary text: `#0B141C`
- Secondary text: `#4B5563`
- Muted text: `#646B75`

Spectrum gradient:

```css
linear-gradient(135deg, #43A047, #00ACC1, #1976D2, #3949AB, #7B1FA2, #C2185B, #FF5722)
```

Use the gradient sparingly: wordmark, active navigation accent, avatars, and occasional 2px card borders. Never use it as a full-page background.

Semantic meanings:

- Emerald: Defend, done, good
- Amber: Rescue, warning, needs review
- Rose: Downgrade, danger, hope-based
- Blue: information and primary action
- Gray: Monitor, draft, neutral

Marketing uses a cooler editorial register: slate-950 hero, soft cyan/indigo glows, cyan primary CTA, and blue closing band.

## Typography

- Outfit: headings, wordmark, buttons
- Inter: body and UI copy
- JetBrains Mono: IDs, code, and data values

Headings are sentence case and ink. `PageHeader` uses Outfit at weight 750, 26/30/34px across breakpoints, -0.03em tracking and 1.1 line height. Eyebrows are 11px, bold, uppercase, dark brand blue (#1565C0), with 0.22em tracking. Field labels are 12.5px bold ink; values use 14px Inter. Measures and IDs use JetBrains Mono.

## Shape And Motion

- Buttons and badges: pills, `999px`
- Cards: `12px`
- Panels: `20px`; metric tiles: `18px`
- Modals: `16px`
- Workspace panels: white, soft Daylight panel shadow; compact nested records use a line border and 12px radius
- Pressed buttons: `scale(0.98)`
- Standard easing: `cubic-bezier(0.4, 0, 0.2, 1)`
- No bouncing or looping decorative animation

## Iconography

Use Lucide icons only, generally 16-20px with `currentColor`. Do not use emoji.

## Voice

Write plainly and directly, operator to operator. Use second person and real B2B sales language: defend, rescue, downgrade, monitor, objection debt, proof gap, champion, procurement, and manager-ready.

Avoid hype. State product boundaries clearly.

## Layout

- App: fixed 220px rail (#08111A), fixed 56px mobile / 64px desktop white top bar, page canvas `#F4F7FA`
- `PageContainer`: 16/24/32px horizontal padding, 18px section gaps, maximum 1680px on large screens; reading surfaces can use a narrower measure
- Marketing: translucent white navigation, centered `max-w-7xl`, alternating white/slate/dark bands
- Blur and transparency are reserved for the marketing navigation and hero panel

## Shared components

Use `PageContainer` and `PageHeader` for workspace destinations; `Panel`, `MicroLabel`, `MicroPill`, `StatusChip`, `Segmented` and `SegmentMeter` for repeated structures. Reuse `daylightForm` or `controlClass`/`fieldLabelClass` for native form controls. Use blue primary pills for the main action, white bordered pills for secondary actions, and dark pills for quiet emphasis. Do not create page-specific control palettes. Tables use line separators, muted uppercase headings and dark blue source links; chart bars use brand blue and a neutral track.

Keep state names and evidence text beside semantic colors. Preserve keyboard focus, disabled states, reduced motion and mobile touch targets. Marketing keeps its established editorial palette; dense tables, nested records and drawers keep their purpose-specific shapes within the same font and color system.
