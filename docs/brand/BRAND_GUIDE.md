# Memoire Brand Guide

Memoire is a personal pipeline review and sales memory OS for individual B2B sellers. It is not a CRM. The brand should feel serious, tool-like, private, and evidence-driven.

## Identity

The primary logo is the `Memoire` wordmark in Outfit ExtraBold, with `-0.02em` tracking and the Memoire spectrum gradient. Do not invent a separate logo glyph. In quiet contexts, use a solid navy wordmark.

The favicon is the approved white `M` on the spectrum gradient.

## Color

- Navy: `#1B2B3A`; light `#243447`; dark `#0F1C28`
- Brand blue: `#1976D2`; hover `#1565C0`
- Page: `#F8FAFC`
- Card: `#FFFFFF`
- Border: `#E5E7EB`
- Primary text: `#0F172A`
- Secondary text: `#374151`
- Muted text: `#6B7280`

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

Headings are sentence case, bold, and navy. Eyebrows are 12px, bold, uppercase, brand blue, with `0.18em` tracking.

## Shape And Motion

- Buttons and badges: pills, `999px`
- Cards: `12px`
- Panels: `8px`
- Modals: `16px`
- Cards: white, gray-200 border, subtle shadow
- Pressed buttons: `scale(0.98)`
- Standard easing: `cubic-bezier(0.4, 0, 0.2, 1)`
- No bouncing or looping decorative animation

## Iconography

Use Lucide icons only, generally 16-20px with `currentColor`. Do not use emoji.

## Voice

Write plainly and directly, operator to operator. Use second person and real B2B sales language: defend, rescue, downgrade, monitor, objection debt, proof gap, champion, procurement, and manager-ready.

Avoid hype. State product boundaries clearly.

## Layout

- App: fixed 220px navy sidebar, fixed 64px white top bar, page canvas `#F8FAFC`
- Marketing: translucent white navigation, centered `max-w-7xl`, alternating white/slate/dark bands
- Blur and transparency are reserved for the marketing navigation and hero panel
