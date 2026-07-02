# Public-Page Load Performance: Critical-Path Slimming

Date: 2026-07-02
Strategy link: demo/landing is the primary acquisition surface (`product-strategy-gtm-2026-07-02.md` Section 5.2); anonymous first paint speed is conversion-relevant.

## Problem

An anonymous visitor landing on `/` downloaded the entire domain graph up front: `dist/index.html` emitted 58 `modulepreload` links, including opportunity/quote/playbook/pipeline-defense stores and `sampleData`. Two eager import chains caused it:

1. `src/main.tsx` imported `sanitizeLegacySampleDataset` from `utils/sampleData` statically — a legacy-migration cleanup that only matters when the demo flag is already set — pulling the whole sample/domain graph into the entry chunk.
2. `src/App.tsx` imported `AppShell` statically while every route page was lazy. AppShell drags in Sidebar, TopNav, and OnboardingModal (guided workflow -> domain stores), so the protected-workspace graph shipped to every public visitor.

## Change

- `main.tsx` now does a cheap `localStorage` flag check (`memoire.sampleData.loaded === 'true'`) and only then dynamically imports `sampleData` to run the legacy sanitizer. Behavior is preserved for demo users; anonymous visitors skip the module entirely.
- `AppShell` is now `lazy()` like every route page, so the workspace shell and its domain graph load only when a `/app/*` route is actually entered.

## Result (production build)

- `modulepreload` links in `index.html`: 58 -> 10.
- Domain chunks (opportunityStore, pipelineDefenseCenter, salesPlaybook, quoteStore, sampleData) no longer preload on public pages.
- Entry chunk: 237.9 kB -> 206.6 kB (gzip 72.9 -> 65.0 kB).
- `supabaseClient` remains preloaded by design: `AuthProvider` needs auth state on every page, including public ones.

## Verification

- `npm run check` passed (full contract suite).
- Runtime smoke: `/demo` -> Start Demo -> Load demo sandbox -> `/app/today` lazy-loads the AppShell correctly; 5+1 navigation intact; the "Deal going silent" nudge still renders; no console errors.
