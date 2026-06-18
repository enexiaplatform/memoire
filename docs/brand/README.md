# Memoire Brand System

This folder is the design source of truth for Memoire.

- `BRAND_GUIDE.md`: product identity, visual rules, voice, and layout.
- `tokens.json`: machine-readable color, type, radius, shadow, and motion tokens.

Production implementation lives in:

- `tailwind.config.js`
- `src/index.css`
- `src/components/brand/BrandWordmark.tsx`
- `public/favicon.svg`

When changing UI, use the existing brand tokens rather than introducing new colors or logo marks.
