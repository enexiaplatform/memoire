# Accessibility And Failure-State Contract Coverage

Date: 2026-06-17

Roadmap slice: C6/R12 public-selling trust readiness

## Decision

Memoire now has an automated static verifier for accessibility and failure-state readiness.

This improves C6/R12 drift control, but it does not replace manual browser QA. C6 remains open until the keyboard, focus, modal, mobile, slow-load, and unavailable-service matrix passes on protected production or preview.

R12 remains open until the same evidence proves there are no keyboard traps or unreachable primary actions on the launch paths.

## What The Verifier Covers

`scripts/verify-accessibility-failure-state-contract.mjs` checks that:

- The app shell keeps a visible-on-focus skip link, stable main landmark, focus target, and Suspense loading fallback.
- Skip-link CSS keeps the link hidden until focus and visible when focused.
- Sidebar mobile navigation closes with Escape, has close controls, and prefetches on focus as well as hover.
- Top navigation keeps the mobile menu trigger, data-mode status, and sync-error surface.
- Protected routes and route-level V1 pages keep slow-loading fallbacks with retry, sign-out, and demo options.
- Settings export and delete flows keep recoverable failure messages instead of silently producing incomplete exports or clearing local data.
- Cloud JSON and Pipeline Defense cloud sync failures still report client operational events.
- Ask Memoire and Daily Capture AI Assist still fall back to local/rule-based behavior when AI endpoints fail.
- The C6 QA matrix still covers C6-01 through C6-17.

## Runtime Evidence Still Required

C6 remains open until the release gate records:

- Desktop keyboard-only pass for skip link, sidebar order, Settings, Quick Capture, Pipeline Defense, Follow-up Composer, and onboarding modal.
- Mobile navigation pass, including Escape-to-close behavior.
- Slow auth/profile load and route data load evidence.
- Supabase unavailable, cloud export unavailable, cloud sync issue, AI provider unavailable, and delete-account failure evidence.
- Accepted-risk record or fix for every failed C6-01 through C6-17 item.

R12 remains open until the same evidence confirms no launch-critical keyboard trap, unreachable action, or raw backend error exposure remains.

## Operator Command

Run before public-selling signoff and after layout, navigation, settings, cloud-sync, or AI fallback changes:

```bash
npm run verify:accessibility-failure-state
```

`npm run check` also runs this verifier so C6/R12 drift is caught with the rest of the commercial release gates.
