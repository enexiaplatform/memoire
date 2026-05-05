# Memoire Phase 06.1 Reliability & Interactive Demo Gate Report

Date: 2026-05-05

## 1. Root Cause of Loading Deadlock

The app had multiple paths that could keep users in a permanent loading state:

- Auth bootstrap depended on Supabase session/profile requests without a timeout guard.
- Login success depended on the auth state listener and follow-up profile fetch settling before the UI could move forward.
- Protected app routes showed centered loading without a recoverable fallback.
- V1 data-heavy pages had local loading states but no watchdog if a query or bootstrap path stalled.
- Demo mode was environment-driven and did not provide a production-safe no-signup interactive workspace entry.

Result: a successful Supabase auth HTTP response could still leave the sign-in button spinning or leave `/app/*` routes waiting indefinitely.

## 2. Files Changed

- `src/App.tsx`
- `src/components/layout/ProtectedRoute.tsx`
- `src/components/layout/TopNav.tsx`
- `src/components/marketing/HeroSection.tsx`
- `src/components/marketing/MarketingNav.tsx`
- `src/features/auth/LoginPage.tsx`
- `src/features/demo/DemoEntryPage.tsx`
- `src/features/v31/RouteLoadingFallback.tsx`
- `src/features/v31/useSlowLoadingFallback.ts`
- `src/features/v31/TodayPage.tsx`
- `src/features/v31/JourneyPage.tsx`
- `src/features/v31/AccountsPage.tsx`
- `src/features/v31/AccountMemoryPage.tsx`
- `src/features/v31/OpportunitiesPage.tsx`
- `src/features/v31/AskMemoirePage.tsx`
- `src/features/v31/localStore.ts`
- `src/hooks/useAuth.ts`
- `src/lib/demoMode.ts`
- `src/pages/LandingPage.tsx`

Related existing onboarding/daily-use files remain in the working set from the prior phases.

## 3. Auth/Login Fixes

- Added timeout handling around Supabase auth operations.
- Added timeout handling around profile fetch.
- Updated sign-in to set the returned session/user/profile immediately after Supabase returns success.
- Ensured sign-in loading state resets in success, failure, and timeout paths.
- Added local error messaging on login failure.
- Added a no-signup `Open Demo Workspace` path from the login page.
- Demo sign-out now clears the interactive demo workspace marker.

## 4. Loading Watchdog / Error Fallback Implementation

Implemented a recoverable fallback for long loading states.

Fallback copy:

- Title: `Memoire is taking longer than expected.`
- Body: `We could not finish loading your sales memory. You can retry, sign out, or open the demo workspace.`
- Buttons: `Retry`, `Sign out`, `Open Demo Workspace`

Coverage:

- Protected route bootstrap
- Today
- Journey
- Accounts
- Account Memory
- Opportunities
- Ask Memoire context loading

The fallback appears after approximately 9 seconds.

## 5. Interactive Demo Workspace Implementation

Added a no-signup demo entry route:

- `/demo`

Behavior:

- Loads a deterministic local sample workspace.
- Sets demo auth locally.
- Marks workspace as `Interactive Demo Workspace`.
- Redirects to `/app/today`.
- Keeps the workspace visibly labeled as Demo Mode.

Seeded sample context includes fictional sample context only:

- Northstar Labs / Linh sales interaction
- Proposal review
- Lead time and local support blocker
- Implementation timeline next action
- Apex Pharma supporting sample memory

This is separate from any real founder/customer data and does not require signup.

## 6. CTA Changes on Landing Page

Updated primary demo-facing copy:

- Hero primary CTA: `Try Interactive Demo` -> `/demo`
- Account creation remains separate: `Create Account`
- Landing demo section CTA now opens the interactive demo instead of only pointing to a static section.
- Marketing nav exposes `Try Interactive Demo`.

## 7. Quick Capture Discoverability Changes

Added persistent app-level capture access:

- Top navigation now includes `+ Capture`.
- The button links to `/app/today#quick-capture`.

Today still owns the existing Quick Capture flow; this change only makes it easier to find.

## 8. Replay Guided Workflow Behavior

`Replay guided workflow` remains available in Settings.

Behavior:

- Resets local guided workflow completion.
- Starts the guided workflow again.
- Does not block normal app use.

## 9. Term Clarification / Tooltips Added

Lightweight helper copy was added for first-time concepts:

- Journey: the path from customer interaction to memory, action, and follow-up.
- Broken Loop: a sales memory loop missing a clear next action, recent context, or follow-up.
- Memory Health: a simple signal showing whether Memoire has enough context to help the user act.
- Synced Mode: cloud-connected workspace state via the top navigation badge tooltip.

No heavy tutorial system was added.

## 10. Test Results

### A. Landing

Status: Pass locally.

Verified:

- `http://127.0.0.1:5173/` returns HTTP 200.
- Landing CTAs route to `/demo` and `/signup` as intended in code.

### B. Interactive Demo

Status: Pass by implementation and route availability; browser execution pending external/manual click verification.

Verified:

- `http://127.0.0.1:5173/demo` returns HTTP 200.
- `/demo` route exists.
- Demo entry code intentionally loads local demo workspace and redirects to `/app/today`.

Limitation:

- The workspace did not include Playwright/Puppeteer, so full browser click execution was not automated in this QA pass.

### C. Login

Status: Code path fixed; live credential verification pending Henry manual test.

Verified:

- Login loading state now resets through `finally`.
- Supabase auth calls have timeout protection.
- Success path sets session/user/profile and allows navigation to `/app/today`.

Limitation:

- Real Supabase login was not executed because QA did not use Henry's password.

### D. App Reload / Core Routes

Status: Pass locally for route availability; fallback code added for runtime load stalls.

Verified HTTP 200 locally:

- `/app/today`
- `/app/journey`
- `/app/accounts`
- `/app/opportunities`
- `/app/ask`

Runtime fallback coverage was implemented in the route/page components listed above.

### E. Demo Workspace Core Screens

Status: Pass by seeded data integration; browser walkthrough pending manual verification.

Expected after clicking `Try Interactive Demo`:

- Today loads in Demo Mode.
- Quick Capture is visible or reachable via `+ Capture`.
- Journey, Accounts, Opportunities, and Ask Memoire use local demo memory.

### F. Timeout Fallback

Status: Implemented.

Verified by code:

- Protected route and major route loading states call the same slow-loading fallback pattern.
- User can retry, sign out, or open demo workspace.

## 11. Remaining Risks

- Full browser automation was not available in this workspace, so final live click-through on Vercel should be performed manually.
- Supabase credential login needs manual validation with a real tester account.
- Existing lint warnings remain in older hooks unrelated to this reliability gate.
- The production bundle still has a Vite large chunk warning; this is not a reliability blocker for this phase.
- Demo workspace uses local browser storage by design; it is not a Synced Mode workspace.

## 12. Build / Lint Result

Build:

- `npm run build` passed.
- Vite emitted the existing large chunk warning.

Lint:

- `npm run lint` passed with 0 errors.
- 5 existing warnings remain in legacy hooks:
  - `src/features/entities/useEntities.ts`
  - `src/features/entities/useEntityDetail.ts`
  - `src/features/history/useCaptures.ts`
  - `src/hooks/useDeals.ts`

## 13. What Needs Product Review

- Confirm landing CTA language: `Try Interactive Demo` vs `View Demo`.
- Confirm whether external testers should be routed to demo first or signup first.
- Manually verify Vercel login redirect with a real Supabase test account.
- Manually verify `/demo` on Vercel after deployment.
- Decide whether legacy hook lint warnings should be cleaned in a separate maintenance pass.
