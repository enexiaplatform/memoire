# Memoire Phase 06.2 Pre-Validation Polish Report

Date: 2026-05-05

## 1. Files Changed

- `src/components/layout/TopNav.tsx`
- `src/components/layout/OnboardingModal.tsx`
- `src/features/onboarding/guidedWorkflow.ts`
- `src/features/v31/QuickCapturePanel.tsx`
- `src/features/v31/followUpComposer.ts`
- `docs/qa/pre-validation-polish-report.md`

## 2. + Capture Scroll/Focus Behavior Implemented

Implemented.

Behavior:

- `+ Capture` still routes to `/app/today#quick-capture`.
- If the user is already on Today, clicking `+ Capture` dispatches a focus event immediately.
- Quick Capture listens for the focus event and for `#quick-capture` after route render.
- Quick Capture scrolls smoothly into view.
- The textarea is focused.
- The Quick Capture card receives a subtle temporary highlight for roughly 1.8 seconds.

Coverage by design:

- Today
- Journey
- Accounts
- Opportunities
- Ask Memoire
- Account Memory routes, through the same TopNav link

No new capture feature was added.

## 3. Login Verification Result

Real Supabase credential login still requires Henry/manual verification.

Reason:

- No password/test credential was available in this QA pass.
- I did not attempt to infer or expose any credential.

Current login code remains protected by the Phase 06.1 fixes:

- Supabase auth calls have timeout handling.
- Sign-in loading state resets on success, failure, or timeout.
- Successful sign-in sets session/user/profile state and navigates to `/app/today`.
- Session restore has a timeout and recoverable error path.

## 4. Guided Workflow Modal Persistence Fix

Implemented.

Behavior:

- The guided workflow modal can auto-show on first app/demo entry.
- If the user starts the workflow, skips it, or closes it, the app stores a session-level dismissal marker.
- Refreshing `/app/today` in the same browser session no longer auto-shows the modal again.
- `Don't show again` still persists locally.
- `Replay guided workflow` remains available from Settings and can intentionally reopen the workflow.

Storage approach:

- Existing local preference remains for persistent completion/don't-show-again.
- New session guard uses `sessionStorage` scoped to the current user key.

## 5. Optional Fixes Implemented

Implemented Optional 1:

- Follow-up Composer grammar was rephrased to avoid the issue:
  - Old pattern: `{concerns} is an important point`
  - New pattern: `I understand your concerns around {context}. These are important points to clarify before the next step.`

Not implemented:

- Date format standardization was not changed in this pass.
- Broken Loop deduplication was not changed in this pass.

Reason:

- Both are useful but not required for the three pre-validation blockers.
- Avoided touching broader display/data behavior before external validation.

## 6. Manual Test Results

### A. + Capture

Status: Implemented and route availability checked locally.

Checked locally:

- `/app/today#quick-capture` returns 200.
- `/app/journey` returns 200.
- `/app/accounts` returns 200.
- `/app/opportunities` returns 200.
- `/app/ask` returns 200.

Code-level behavior verified:

- TopNav dispatches `memoire:focus-quick-capture` when already on Today.
- Quick Capture handles the event.
- Quick Capture handles `window.location.hash === '#quick-capture'` after render.

Browser click verification should be repeated by Henry on Vercel because this workspace does not include Playwright/Puppeteer for full DOM focus automation.

### B. Demo Modal

Status: Implemented.

Expected after this fix:

- Open `/demo`.
- Reach `/app/today`.
- Modal appears once.
- Start/skip/close it.
- Refresh `/app/today`.
- Modal should not auto-appear again in the same browser session.
- Replay from Settings still works.

### C. Login

Status: Pending Henry/manual credential verification.

Reason:

- No safe test password was available.
- Login behavior was not fake-passed.

### D. Build/Lint

Status: Pass.

## 7. Build / Lint Result

Build:

- `npm run build` passed.
- Existing Vite large chunk warning remains.

Lint:

- `npm run lint` passed with 0 errors.
- 5 existing legacy hook warnings remain:
  - `src/features/entities/useEntities.ts`
  - `src/features/entities/useEntityDetail.ts`
  - `src/features/history/useCaptures.ts`
  - `src/hooks/useDeals.ts`

Privacy scan:

- Local source/docs scan found no exposed founder/customer terms from the removed founder seed.

## 8. Remaining Risks

- Real Supabase credential login still needs Henry/manual verification.
- Full browser click/focus automation was not available in this workspace.
- Date display remains in the existing format.
- Exact duplicate Broken Loop deduplication is still a later small polish item if seen during validation.

## 9. Final Recommendation

Ready for external validation after Henry manually verifies:

- `+ Capture` scroll/focus on Vercel.
- Guided workflow modal does not repeat after refresh.
- Real Supabase login works with a real tester account.

Without real login verification, Memoire is ready for no-signup interactive demo validation but not fully verified for account-based user validation.
