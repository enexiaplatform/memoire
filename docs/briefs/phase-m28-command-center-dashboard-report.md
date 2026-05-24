# Phase M.28: Today / This Week Command Center Dashboard Report

## Files created

- `src/features/dashboard/DashboardPage.tsx`
- `src/utils/salesCommandCenter.ts`
- `docs/briefs/phase-m28-command-center-dashboard-report.md`

## Files modified

- `src/App.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/components/layout/ProtectedRoute.tsx`

## Route added/upgraded

- Added `/app/dashboard` as the primary command center route.
- Updated `/app` index to redirect to `/app/dashboard`.
- Updated `/app/today` to redirect to `/app/dashboard` so older links still work.
- Updated sidebar first item from `Today` to `Dashboard`.
- Added `/app/dashboard` and `/app/today` to local-first route access.

## Data sources used

The dashboard loads and combines existing local/cloud stores:

- sales activities from `sales_activities` / `memoire.salesActivities.v1`
- opportunities from `opportunities` / `memoire.opportunities.v1`
- accounts from `accounts` / `memoire.accounts.v1`
- pipeline defense briefs from `pipeline_defense_briefs` / `memoire.pipelineDefenseBriefs.v1`

No new database tables or external integrations were added.

## Dashboard logic

Created `src/utils/salesCommandCenter.ts`.

Rule-based functions added:

- `buildTodayCommandCenter`
- `getTodayActions`
- `getOverdueActions`
- `getAtRiskOpportunities`
- `getAccountsNeedingTouch`
- `getRecentActivitySummary`
- `getPipelineReviewReadiness`

Dashboard sections added:

- Header
- Today Focus
- This Week Summary
- Priority Action List
- At-Risk Opportunities
- Accounts Needing Touch
- Recent Activity Feed
- Quick Actions

Priority actions combine:

- opportunity `nextAction` / `nextActionDate`
- activity `nextAction` / `dueDate`
- generated risk signals from unsupported, hope-based, rescue, downgrade, objection debt, missing context, and missing next action states

## Local/cloud behavior

- Logged-out users load localStorage data.
- Logged-in users load Supabase data through existing store services.
- If Supabase is unavailable, existing services fall back to localStorage where supported.
- Pipeline Defense brief loading falls back to localStorage if cloud load fails.

## Empty state behavior

If no real user data exists, the dashboard shows:

`Start by capturing your first sales activity or adding your first opportunity.`

CTAs:

- Capture Activity
- Add Opportunity

The default sample Pipeline Defense brief is not treated as real user dashboard data for the empty-state check.

## Navigation behavior

Dashboard cards and actions link to:

- `/app/capture`
- `/app/calendar`
- `/app/reviews`
- `/app/accounts`
- `/app/opportunities`
- `/app/pipeline-defense`

## What remains intentionally not built

- No Gmail integration.
- No Google Calendar integration.
- No Salesforce/HubSpot/external CRM sync.
- No real AI or LLM calls.
- No calendar/task integration.
- No automatic mutation of opportunities, accounts, activities, or briefs from dashboard actions.

## Build/lint status

- `npm run build` passes.
- `npm run lint` passes with the existing 5 hook dependency warnings from older modules:
  - `src/features/entities/useEntities.ts`
  - `src/features/entities/useEntityDetail.ts`
  - `src/features/history/useCaptures.ts`
  - `src/hooks/useDeals.ts`

