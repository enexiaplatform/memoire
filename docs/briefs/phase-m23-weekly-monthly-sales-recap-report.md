# Phase M.23 Weekly / Monthly Sales Recap Report

## Files created

- `src/utils/salesActivityRecap.ts`
- `src/features/reviews/SalesReviewsPage.tsx`
- `docs/briefs/phase-m23-weekly-monthly-sales-recap-report.md`

## Files modified

- `src/App.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/components/layout/ProtectedRoute.tsx`
- `src/services/salesActivityStore.ts`

## Route added

- Added `/app/reviews`.
- Added `Reviews` to the sidebar.
- Allowed `/app/reviews` to work in local-first logged-out mode.

## Recap logic

Added deterministic utility functions for:

- weekly recap generation
- monthly recap generation
- accounts touched
- opportunities touched
- activity type breakdown
- open next actions
- objection activities
- follow-up activities
- stalled or low-activity accounts

The recap includes:

- total activities
- active days
- accounts touched
- opportunities touched
- activity type breakdown
- top accounts
- open next actions
- objections captured
- follow-ups captured
- insights
- recommended actions

## Reviews UI

The Reviews page includes:

- Weekly / Monthly toggle
- Previous period
- Today
- Next period
- Generate Weekly/Monthly Recap button
- Summary metric cards
- Recap insights
- Recommended actions
- Activity breakdown by type, account, and day
- Open Next Actions list
- Objections Captured list
- Follow-ups Captured list

## Local/cloud data behavior

- Uses `loadSalesActivities` from the existing M.21 activity store.
- Logged-in users load from Supabase `sales_activities`.
- Logged-out users load from localStorage.
- Existing fallback behavior is preserved.

## Copy behavior

- Added `Copy Recap`.
- Generates Markdown/plain text with period, summary metrics, insights, recommended actions, open next actions, objections, and follow-ups.
- If clipboard write fails, the page shows a fallback message.

## Empty state behavior

If no activities exist in the selected period:

- Shows `No activities captured for this period.`
- Provides CTA to `/app/capture`.

## What remains intentionally not built

- Real AI-generated analysis.
- Gmail integration.
- Google Calendar integration.
- CRM integration.
- Saved recap history.
- Team manager review workflow.

## Build/lint status

- `npm run build`: passes.
- `npm run lint`: passes with the 5 known pre-existing hook dependency warnings.
