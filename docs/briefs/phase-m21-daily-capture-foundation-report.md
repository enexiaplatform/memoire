# Phase M.21 Daily Capture Foundation Report

## Files created

- `src/features/dailyCapture/DailyCapturePage.tsx`
- `src/services/salesActivityStore.ts`
- `src/utils/salesActivityClassifier.ts`
- `docs/database/supabase-sales-activities-schema.sql`
- `docs/briefs/phase-m21-daily-capture-foundation-report.md`

## Files modified

- `src/App.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/components/layout/TopNav.tsx`
- `src/components/layout/ProtectedRoute.tsx`

## Route and navigation

- Added `/app/capture`.
- Added `Capture` to the sidebar.
- Updated the top `+ Capture` shortcut to open `/app/capture`.
- Allowed `/app/capture` to work in local-first logged-out mode.

## Rule-based classification

Added `salesActivityClassifier` with deterministic rules for:

- Customer meeting
- Follow-up
- Demo / technical discussion
- Quote / proposal
- Tender / procurement
- Internal coordination
- Objection handling
- Admin / CRM
- Other

The classifier extracts:

- account name
- opportunity name
- activity type
- summary
- next action
- simple due date
- tags
- raw note
- activity date

## Persistence behavior

- Logged-in users with Supabase configured save to `sales_activities`.
- Logged-out users save to localStorage key `memoire.salesActivities.v1`.
- If cloud save fails, a local copy is preserved and the UI shows a warning.
- Recent activities can be loaded, deleted, and copied as plain text summary.

## Supabase schema

- Added SQL doc for `public.sales_activities`.
- RLS is enabled.
- Own-row policies exist for select, insert, update, and delete.
- `authenticated` role grants are included because recent Supabase Data API behavior may not expose new tables automatically.

## What remains intentionally not built

- Google Calendar integration.
- Gmail integration.
- CRM integration.
- Real AI/LLM extraction.
- Team workspace.
- Advanced activity editing.

## Manual test checklist

1. Open `/app/capture`.
2. Enter a note in `What happened today?`.
3. Change activity date.
4. Confirm structured preview appears.
5. Click `Save Activity`.
6. Confirm the activity appears in recent activities.
7. Copy the summary.
8. Delete the activity.
9. Log out and confirm local capture still works.
10. After running the SQL schema, log in and confirm cloud capture works.
11. Confirm Pipeline Defense still opens.

## Build/lint status

- `npm run build`: passes.
- `npm run lint`: passes with the 5 known pre-existing hook dependency warnings.
