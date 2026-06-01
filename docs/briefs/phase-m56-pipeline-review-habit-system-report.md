# Phase M.56 — Pipeline Review Habit System Report

## What was added
- Added a local weekly Pipeline Review Habit checklist.
- Added Dashboard card: **This Week's Pipeline Review**.
- Added readiness states:
  - Not started
  - In progress
  - Almost ready
  - Review ready
- Added checklist progress percentage based only on completed review steps.

## Files created
- `src/utils/pipelineReviewHabit.ts`
- `docs/briefs/phase-m56-pipeline-review-habit-system-report.md`

## Files modified
- `src/features/dashboard/DashboardPage.tsx`
- `src/features/dailyCapture/DailyCapturePage.tsx`
- `src/features/opportunities/OpportunitiesPage.tsx`
- `src/features/pipeline/PipelineReviewDefenseBriefPage.tsx`

## Storage behavior
- Uses localStorage key:
  - `memoire.pipelineReviewHabit.v1`
- The checklist resets automatically by week using the Monday start date as `currentWeekId`.
- No Supabase table was added.
- No cloud sync behavior was changed.

## Checklist steps
1. Refresh pipeline
2. Capture missing updates
3. Review weak deals
4. Check MEDDIC/proof gaps
5. Generate Defense Brief
6. Copy Manager Summary

## Triggered completions
- CSV import or refresh in Opportunities marks **Refresh pipeline**.
- Daily Capture save and quick capture save mark **Capture missing updates**.
- Opportunities page has explicit buttons for:
  - **Mark weak deals reviewed**
  - **Mark gaps checked**
- Creating a Pipeline Defense Brief from Opportunities marks **Generate Defense Brief**.
- Entering Pipeline Defense Review Mode also marks **Generate Defense Brief**.
- Copying Manager Summary or Share-ready Markdown marks **Copy Manager Summary**.

## UI behavior
- Dashboard shows:
  - weekly progress percentage
  - readiness status
  - step-by-step checklist
  - next recommended step
  - CTA to the next relevant module
- Opportunities import/refresh success includes a **Continue weekly review** link back to Dashboard.

## What remains intentionally not built
- No numeric win probability.
- No task management system.
- No calendar integration.
- No Gmail integration.
- No Salesforce/HubSpot sync.
- No new backend table.
- No automatic write-back to CRM/source systems.

## Manual QA checklist
1. Open `/app/dashboard`.
2. Confirm **This Week's Pipeline Review** appears.
3. Open `/app/opportunities`.
4. Import or refresh CSV and confirm Dashboard checklist marks **Refresh pipeline**.
5. Open `/app/capture`.
6. Save an activity and confirm Dashboard marks **Capture missing updates**.
7. Open `/app/opportunities`.
8. Click **Mark weak deals reviewed** and **Mark gaps checked**.
9. Generate a Pipeline Defense Brief.
10. Open `/app/pipeline-defense`.
11. Enter Review Mode.
12. Copy Manager Summary.
13. Confirm Dashboard status becomes **Review ready**.
14. Confirm no external CRM/Gmail/Calendar integration was added.

## Build/lint status
- `npm run build` passes.
- `npm run lint` passes with 5 known pre-existing React hook dependency warnings in legacy hooks.
