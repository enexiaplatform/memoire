# Phase M.36 Unified Data Mode / Sync Trust Layer Report

## Files Created
- `src/utils/dataMode.ts`
- `src/components/common/DataModePill.tsx`
- `src/utils/userDisplay.ts`
- `docs/qa/phase-m36-data-mode-trust-layer-checklist.md`
- `docs/briefs/phase-m36-unified-data-mode-trust-layer-report.md`

## Files Modified
- `src/components/layout/TopNav.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/components/auth/AuthButton.tsx`
- `src/components/paywall/PaywallModal.tsx`
- `src/features/dashboard/DashboardPage.tsx`
- `src/features/dailyCapture/DailyCapturePage.tsx`
- `src/features/calendar/SalesActivityCalendarPage.tsx`
- `src/features/reviews/SalesReviewsPage.tsx`
- `src/features/accounts/AccountsPage.tsx`
- `src/features/opportunities/OpportunitiesPage.tsx`
- `src/features/pipeline/PipelineReviewDefenseBriefPage.tsx`
- `src/features/v31/localStore.ts`
- `src/services/salesActivityStore.ts`
- `src/services/accountStore.ts`
- `src/services/opportunityStore.ts`

## Data Mode States
- `Synced`: saved to the signed-in account and available across devices.
- `Local only`: saved only in this browser; sign-in can enable cross-device sync.
- `Sync issue`: cloud sync is unavailable; local copy is preserved.
- `Demo local`: sample/demo data is stored only in this browser.
- `Checking sync...`: sync status is still loading.

## Components Added
- `DataModePill` now provides one reusable visual language for sync/local/demo/loading states.
- `dataMode` centralizes labels, descriptions, privacy notes, severity, and sample-data detection.
- `userDisplay` centralizes display-name and initials selection.

## Labels Replaced
- Replaced inconsistent labels such as `Cloud + local fallback dashboard`, `Synced Mode`, `Cloud capture enabled`, and module-specific local/cloud phrases.
- Pipeline Defense no longer shows the old internal MVP browser-only warning when cloud sync can be active; it now uses the unified data mode language.
- Cloud save fallback messages now use the same user-facing copy: `Cloud sync issue - your local copy is preserved.`

## Identity Display Changes
- Top navigation, auth button, and sidebar now use the same display-name priority:
  1. profile full name
  2. auth metadata full name
  3. email
  4. `User`
- Sidebar workspace label now reads `Personal workspace` instead of a plan placeholder.

## Sample / Demo Behavior
- Dashboard sample-data loading sets `memoire.sampleData.loaded=true`.
- Interactive demo workspace also sets the same flag.
- Pages using `DataModePill` can now show `Demo local` when sample data is active.

## What Remains Intentionally Not Built
- No new backend tables.
- No storage behavior changes.
- No Gmail, Google Calendar, Salesforce, HubSpot, or external CRM sync.
- No new AI behavior.
- No billing/plan system changes.

## Build / Lint Status
- `npm run build` passes.
- `npm run lint` passes with 5 known pre-existing hook dependency warnings in legacy hooks.
