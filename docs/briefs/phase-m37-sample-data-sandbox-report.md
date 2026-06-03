# Phase M.37 Sample Data Sandbox & Realistic Demo Dataset Report

## Files Created
- `src/utils/sampleData.ts`
- `docs/briefs/phase-m37-sample-data-sandbox-report.md`
- `docs/qa/phase-m37-sample-data-sandbox-checklist.md`

## Files Modified
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
- `src/utils/dataMode.ts`
- `src/utils/pipelineDefenseStorage.ts`

## Sample Dataset
The demo sandbox now creates a realistic local-only B2B sales dataset:

Accounts:
- `Apex Labs`: pharma, high potential, strong relationship.
- `Northstar Foods`: food/testing, medium potential, developing relationship.
- `Orion Pharma`: pharma, high potential, at-risk relationship.
- `Summit Diagnostics`: pharma, medium potential, dormant relationship.

Opportunities:
- `Apex Labs / Validation Expansion`: defensible, budget approved, decision maker known.
- `Apex Labs / Validated decontamination service renewal`: weak but recoverable / monitor.
- `Northstar Foods / Lab workflow`: weak but recoverable / rescue.
- `Orion Pharma / Procurement review`: hope-based / rescue.
- `Summit Diagnostics / QC workflow`: unsupported / downgrade.
- `Northstar Foods / Food safety rapid testing`: weak but recoverable / monitor.

Activities:
- 8 demo activities across multiple dates.
- Includes customer meeting, follow-up, objection handling, proposal, tender/procurement, internal coordination, competitor mention, and buying signal.
- Several activities are linked to demo opportunities.

Pipeline Defense:
- Creates one `Demo Defense Brief` from selected demo opportunities.
- Includes a mixed quality distribution instead of an all-red sample set.

## Sandbox Behavior
- Dashboard button is now `Open Demo Sandbox`.
- User sees a confirmation panel before loading demo data.
- The panel explains that demo data is stored locally in the browser and does not sync to the account.
- If workspace data already exists, the prompt warns that demo data may mix with the local workspace.
- Signed-in users are explicitly told that demo data is local-only and will not be saved to the cloud account.

## Clear Demo Behavior
- Dashboard shows a `Clear demo data` action when demo data is active.
- Clearing removes local records marked with `source: "demo"`, `isSample: true`, demo IDs, or demo tags.
- Cloud data is not deleted.
- The sample data flag is cleared.

## Local-Only Guarantee
- Demo records are written to localStorage-backed stores only.
- When the demo flag is active, Dashboard, Capture, Calendar, Reviews, Accounts, Opportunities, and Pipeline Defense read local data instead of cloud data.
- Opportunity-to-Pipeline Defense generation remains local-only while demo mode is active.

## Data Mode Integration
- `DataModePill` continues to show `Demo local` when `memoire.sampleData.loaded` is active.
- The demo banner reinforces: `Demo sandbox active - sample data is local only.`

## Known Limitations
- Demo data is scoped to browser localStorage, so clearing browser data removes it.
- Clear demo data targets local demo namespace records and does not attempt cloud cleanup by design.
- The default Pipeline Defense sample brief may still be created by legacy fallback behavior if no real or demo briefs remain.

## What Remains Intentionally Not Built
- No Gmail integration.
- No Google Calendar integration.
- No Salesforce, HubSpot, or external CRM sync.
- No AI behavior changes.
- No new Supabase tables or schema changes.
- No auto-syncing demo data to Supabase.

## Build / Lint Status
- `npm run build` passes.
- `npm run lint` passes with 5 known pre-existing hook dependency warnings.
