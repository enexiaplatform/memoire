# Memoire Phase A Pre-Validation Hygiene Report

Date: 2026-05-05

## Files Changed

- `src/components/layout/TopNav.tsx`
- `src/components/layout/OnboardingModal.tsx`
- `src/features/onboarding/guidedWorkflow.ts`
- `src/features/v31/QuickCapturePanel.tsx`
- `src/features/v31/followUpComposer.ts`
- `docs/qa/pre-validation-hygiene-report.md`

## + Capture Behavior

Implemented.

- `+ Capture` routes to `/app/today#quick-capture`.
- If already on Today, TopNav dispatches a local focus event immediately.
- Quick Capture listens for both the focus event and `#quick-capture` after render.
- Quick Capture scrolls smoothly into view.
- Quick Capture textarea receives focus.
- Quick Capture card gets a subtle temporary highlight for about 1.8 seconds.

This reuses the existing Quick Capture widget and adds no new capture feature.

## Login Verification Result

Pending Henry/manual verification.

- No real Supabase test password was available.
- I did not fake-pass the login result.
- Existing Phase 06.1 auth protections remain:
  - login timeout handling
  - spinner reset on success/failure/timeout
  - session/user/profile state set after successful auth
  - session restore timeout and recoverable error state

Henry should still verify:

- sign in
- spinner stops
- redirect to `/app/today`
- reload `/app/today`
- sign out

## Guided Modal Persistence

Implemented.

- Guided workflow can show once on first demo/app entry.
- If the user starts, skips, or closes it, a `sessionStorage` marker prevents auto-show after refresh in the same browser session.
- `Don't show again` remains persisted locally.
- `Replay guided workflow` remains available from Settings.

No destructive global state was added.

## Optional Fixes

Implemented:

- Follow-up Composer grammar was rephrased to avoid singular/plural mismatch:
  - `I understand your concerns around {context}. These are important points to clarify before the next step.`

Not implemented:

- Date format standardization.
- Exact duplicate Broken Loop deduplication.

Reason:

- Both are safe later polish items, but not required for this hygiene gate.

## Build / Lint Result

Build:

- `npm run build` passed.
- Existing Vite large chunk warning remains.

Lint:

- `npm run lint` passed with 0 errors.
- 5 existing legacy hook warnings remain in older hooks.

Privacy check:

- Source/docs scan did not find the removed founder/customer terms.

## Remaining Risks

- Real Supabase credential login still needs Henry/manual verification.
- Full DOM click/focus automation was not available in this workspace.
- Date display remains as-is.
- Broken Loop exact duplicate deduplication remains a later optional polish item.

## Final Status

Ready for no-signup demo validation after these hygiene fixes.

Account-based validation should wait until Henry verifies real Supabase login with a real tester account.
