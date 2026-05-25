# Phase M.36 Data Mode Trust Layer Checklist

## Logged Out
- Open `/app/dashboard` while signed out.
- Confirm the header shows `Local only`.
- Confirm Capture, Calendar, Reviews, Accounts, Opportunities, and Pipeline Defense also show `Local only`.
- Confirm copy says data is saved only in this browser and sign-in enables cross-device sync.

## Logged In
- Sign in with Google.
- Open all main app pages.
- Confirm the data mode label is consistently `Synced` when Supabase is configured and reachable.
- Confirm Sidebar identity uses the same display name as the header.
- Confirm the workspace subtitle says `Personal workspace`, not `Free plan`.

## Sync Error
- Temporarily remove Supabase env vars or use an invalid Supabase URL in a test environment.
- Sign in or simulate a cloud save failure.
- Confirm the UI shows `Sync issue`.
- Confirm the message reads `Cloud sync issue - your local copy is preserved.`
- Confirm raw Supabase errors are not shown in the main UI.

## Sample Data
- Clear `memoire.sampleData.loaded`.
- Open Dashboard and click `Load sample sales data`.
- Confirm the data mode label changes to `Demo local`.
- Confirm the sample note says sample data is local and should be replaced with real activities when ready.

## Phrase Cleanup
- Search main app UI text for old phrases:
  - `Cloud + local fallback dashboard`
  - `Synced Mode`
  - `Cloud capture enabled`
  - `Internal MVP - data is stored only in this browser`
  - `Cloud unavailable - saving locally`
- Confirm these phrases no longer appear in user-facing main pages.

## Regression
- Capture an activity.
- Add an opportunity.
- Add an account.
- Generate a review.
- Generate a Pipeline Defense Brief.
- Confirm existing local/cloud persistence behavior is unchanged.
